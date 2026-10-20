import {useEffect, useState} from 'react';
import {haversine} from '../logica/geo';
import {contarConferencia, type ItemEmConferencia, type MotoristaEmConferencia} from '../logica/conferencia';
import {CHAVES} from '../logica/guarda';
import {fmtKm} from '../logica/otimizacao';
import type {Dia, LinhaDoDia} from '../logica/painel';
import * as A from '../acoes';
import {origemDaPorta, porQuePrecisaDeVoce, situacaoDoLugar, triar} from '../logica/triagem';
import {guarda, loja, status, useLoja, type Marca} from '../loja';
import * as Adm from '../servicos/admin';
import {nuvem} from '../servicos/nuvem';

const CORES_MOTORISTA = ['#1d4ed8', '#db2777', '#ea580c', '#0d9488', '#7c3aed', '#65a30d'];
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
const diaExtenso = (dia: string) => new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'});

function mostrarNoMapa(pontos: Marca[]) {
  if (!pontos.length) { status('Nada com posição para mostrar.', 3000); return; }
  loja.ui.marcas = {pontos, vez: (loja.ui.marcas?.vez || 0) + 1};
  if (window.innerWidth < 900) window.scrollTo(0, 0);
  loja.mudou(false);
}

function useTrabalho() {
  const [ocupado, setOcupado] = useState('');
  async function correr<T>(nome: string, f: () => Promise<T>, ok?: string): Promise<T | undefined> {
    if (ocupado) return;
    setOcupado(nome);
    try {
      return await tentar(f, ok);
    } finally {
      setOcupado('');
    }
  }
  return {ocupado, correr, fazendo: (nome: string) => ocupado === nome};
}

async function tentar<T>(f: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await f();
    if (ok) status(ok, 3000);
    return r;
  } catch (err) {
    status('Não deu certo: ' + (err as Error).message, 6000);
  }
}

export function TelaAdmin() {
  useLoja();
  const [motoristas, setMotoristas] = useState<Adm.Motorista[] | null>(null);
  const [rotas, setRotas] = useState<Adm.RotaResumo[] | null>(null);
  const [lugares, setLugares] = useState<Adm.LugarCorrigido[] | null>(null);
  const [conferencia, setConferencia] = useState<MotoristaEmConferencia[] | {erro: string} | null>(null);
  const [dia, setDia] = useState<Dia | {erro: string} | null>(null);
  const [erro, setErro] = useState('');
  // A visita anterior, lida uma vez ao abrir: o "novo" continua na tela enquanto ele está aqui,
  // e a hora desta visita só é gravada depois que as marcações chegaram de verdade.
  const [visto] = useState(() => guarda.ler<number | null>(CHAVES.adminVisto, null));

  const [lendo, setLendo] = useState(false);
  // Cada parte entra na tela quando chega: esperar as três segurava o "Precisa de você" atrás da
  // contagem das rotas, a parte mais lenta (11/10). Uma que falha não esconde as outras.
  const carregar = async () => {
    if (lendo) return;
    setErro('');
    setLendo(true);
    const falha = (err: unknown) => setErro((err as Error).message);
    await Promise.all([
      Adm.listarMotoristas().then(setMotoristas, falha),
      // o painel do dia sai das rotas: um erro nele fica nele, e as rotas continuam na tela
      Adm.listarRotas().then(r => {
        setRotas(r);
        return Adm.resumoDeHoje(r).then(setDia, err => setDia({erro: (err as Error).message}));
      }, falha),
      Adm.listarCorrecoes().then(l => {
        setLugares(l);
        guarda.gravar(CHAVES.adminVisto, Date.now());
      }, falha),
      // sem a 022 rodada ela falha, e o resto do Admin tem de abrir mesmo assim
      Adm.listarEmConferencia().then(setConferencia, err => setConferencia({erro: (err as Error).message})),
    ]);
    setLendo(false);
  };
  useEffect(() => { carregar(); }, []);
  const nConferir = Array.isArray(conferencia) ? contarConferencia(conferencia) : 0;
  // o número da aba acompanha o que ele acabou de confirmar, aprovar ou apagar
  useEffect(() => {
    if (!lugares) return;
    loja.ui.esperandoAdmin = triar(lugares, Date.now(), null).decidir.length + nConferir;
    loja.mudou(false);
  }, [lugares, nConferir]);

  if (nuvem.perfil?.papel !== 'admin') return <div className="corpo"><div className="info">Só quem administra vê esta tela.</div></div>;
  const corDe = (id: string) => CORES_MOTORISTA[Math.max(0, (motoristas || []).findIndex(m => m.id === id)) % CORES_MOTORISTA.length];
  const t = lugares ? triar(lugares, Date.now(), visto) : null;
  const doLugar = {corDe, recarregar: carregar, novo: t ? t.novo : () => false};

  // Painel (dono, 19/10): os números do dia no alto; embaixo, o que espera decisão ao lado das rotas
  // de hoje, em duas colunas no computador e uma embaixo da outra no celular. O que os motoristas
  // mexeram vem antes de 14 dias de rotas; o que é de vez em quando (motoristas, base de ruas,
  // medição dos botões) fica fechado, a um toque.
  const esperando = t ? t.decidir.length + nConferir : null;
  return <div className="corpo">
    <h2>Administração</h2>
    <div className="linha" style={{marginTop: 0}}><button className="btn" onClick={carregar} disabled={lendo}>{lendo ? 'Buscando…' : '↻ Atualizar'}</button></div>
    {erro && <div className="aviso">Não consegui carregar: {erro}</div>}
    {(!motoristas || !rotas || !lugares) && !erro && <div className="info">Carregando…</div>}
    <NumerosDoDia dia={dia} esperando={esperando} />
    <div className="painel-colunas">
      <div>
        {t && <div className={esperando ? 'aviso laranja' : 'info'} data-resumo>
          {esperando ? <b>{esperando} esperando você.</b> : 'Nada esperando você.'}
          {visto != null && (t.novas
            ? ` 🆕 ${t.novas} marcação(ões) nova(s) desde ${dataHora(new Date(visto).toISOString())}.`
            : ` Nada novo desde ${dataHora(new Date(visto).toISOString())}.`)}
        </div>}
        {t && <Lugares titulo={`📌 Precisa de você (${t.decidir.length})`} lista={t.decidir} aberta decidir {...doLugar}
          vazio="Nenhuma marcação esperando decisão." />}
        {conferencia && <EmConferencia estado={conferencia} corDe={corDe} recarregar={carregar} />}
        {t && <Lugares titulo={`🆕 Marcadas pelos motoristas nos últimos 7 dias (${t.recentes.length})`} lista={t.recentes} aberta {...doLugar}
          vazio="Nenhuma porta marcada nos últimos 7 dias." />}
      </div>
      <div>
        <RotasDeHoje dia={dia} />
        {/* depois do que espera decisão: a busca é de quando ele já sabe o que quer arrumar */}
        <ProcurarLugar />
      </div>
    </div>
    {rotas && <Rotas lista={rotas} />}
    {t && t.outras.length > 0 && <Lugares titulo={`Marcações mais antigas (${t.outras.length})`} lista={t.outras} {...doLugar} vazio="" />}
    {motoristas && <Motoristas lista={motoristas} recarregar={carregar} />}
    <BaseDeRuas />
    <UsoDosBotoes />
  </div>;
}

const de = (a: number, b: number) => <>{a}<small> de {b}</small></>;

function NumerosDoDia({dia, esperando}: {dia: Dia | {erro: string} | null; esperando: number | null}) {
  const d = dia && !('erro' in dia) ? dia : null;
  return <>
    {dia && 'erro' in dia && <div className="aviso">Não consegui montar o painel do dia: {dia.erro}</div>}
    <div className="kpis" data-painel>
      <div className="kpi" data-kpi="rotas">
        <div className="kpi-num">{d ? d.linhas.length : '…'}</div>
        <div className="kpi-nome">Rotas hoje</div>
        <div className="kpi-sub">{d ? `${d.naRua} motorista(s) na rua agora` : ''}</div>
      </div>
      <div className="kpi" data-kpi="entregues">
        <div className="kpi-num">{d ? de(d.entregues, d.pacotes) : '…'}</div>
        <div className="kpi-nome">Entregues hoje</div>
        {d && d.pacotes > 0 && <div className="barra"><i style={{width: `${Math.round(100 * d.entregues / d.pacotes)}%`}} /></div>}
      </div>
      <div className="kpi" data-kpi="verificados">
        <div className="kpi-num">{d ? de(d.verificados, d.enderecos) : '…'}</div>
        <div className="kpi-nome">Endereços verificados</div>
        <div className="kpi-sub">nas rotas de hoje</div>
      </div>
      <div className={`kpi${esperando ? ' atencao' : ''}`} data-kpi="esperando">
        <div className="kpi-num">{esperando ?? '…'}</div>
        <div className="kpi-nome">Esperando você</div>
        <div className="kpi-sub">em Precisa de você e Em conferência</div>
      </div>
    </div>
  </>;
}

const SITUACAO: Record<LinhaDoDia['situacao'], string> = {'terminou': 'var(--ok)', 'na rua': 'var(--pri)', 'parada': 'var(--laranja)', 'não começou': '#6b7280'};
// a hora exata está na coluna Última: a etiqueta cabe estreita
const duracao = (min: number) => min < 60 ? `${min} min` : `${Math.floor(min / 60)}h`;
const textoDaSituacao = (l: LinhaDoDia) => l.situacao === 'parada' ? `Parada há ${duracao(l.parada)}`
  : l.situacao === 'na rua' ? 'Na rua' : l.situacao === 'terminou' ? 'Terminou' : 'Não começou';

function RotasDeHoje({dia}: {dia: Dia | {erro: string} | null}) {
  return <section className="cartao-painel" data-secao="Rotas de hoje">
    <h3>Rotas de hoje</h3>
    {!dia && <div className="info">Carregando…</div>}
    {dia && 'erro' in dia && <div className="info">Sem o painel do dia; as rotas estão mais abaixo.</div>}
    {dia && !('erro' in dia) && !dia.linhas.length && <div className="info">Nenhuma rota enviada hoje.</div>}
    {dia && !('erro' in dia) && dia.linhas.length > 0 && <div className="tabela-rolar"><table className="tabela-dia">
      <thead><tr><th>Motorista</th><th>Entregues</th><th>Verificados</th><th>Última</th><th>Situação</th></tr></thead>
      <tbody>{dia.linhas.map(l => <tr key={l.id} data-rota-hoje={l.id}>
        <td><b>{l.motorista}</b><div className="achado">{l.arquivo || 'sem arquivo'}</div></td>
        <td>{l.entregues}/{l.pacotes}{l.pacotes > 0 && <div className="barra"><i style={{width: `${Math.round(100 * l.entregues / l.pacotes)}%`}} /></div>}</td>
        <td>{l.verificados}/{l.enderecos}</td>
        <td>{l.ultima ? hora(l.ultima) : '—'}</td>
        <td><span className="tag" style={{background: SITUACAO[l.situacao]}} data-situacao={l.situacao}>{textoDaSituacao(l)}</span></td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}

// O motorista novo em conferência (022): o que ele marcou ou entregou e mudaria a porta para os
// outros espera aqui. Um por um o que leva a porta para onde ele marcou; as entregas no pino da
// rota, que só confirmam o pino que ele seguia, num toque só.
function EmConferencia({estado, corDe, recarregar}: {estado: MotoristaEmConferencia[] | {erro: string}; corDe: (id: string) => string; recarregar: () => void}) {
  const {ocupado, correr, fazendo} = useTrabalho();
  // Apagar de um em um era um saco com as 33 do César de 16/10 (pedido do dono): escolhe várias
  // e apaga juntas, com a mesma pergunta antes.
  const [escolhidas, setEscolhidas] = useState<Set<string>>(() => new Set());
  if (!Array.isArray(estado)) return <details data-secao="Em conferência">
    <summary>Em conferência</summary>
    <div className="aviso">Não consegui ver as marcações em conferência: {estado.erro}</div>
  </details>;
  const chaveDe = (g: MotoristaEmConferencia, i: ItemEmConferencia) => g.id + '|' + i.chave_lugar;
  const escolher = (chaves: string[], sim: boolean) => setEscolhidas(antes => {
    const s = new Set(antes);
    for (const k of chaves) if (sim) s.add(k); else s.delete(k);
    return s;
  });
  // só as que ainda estão na lista: a decidida some quando a lista volta
  const escolhidasDe = (g: MotoristaEmConferencia) => [...g.mexem, ...g.noPino].filter(i => escolhidas.has(chaveDe(g, i)));
  const decidir = async (g: MotoristaEmConferencia, itens: ItemEmConferencia[], aprovar: boolean, nome = (aprovar ? 'ok' : 'x') + g.id + itens[0].chave_lugar) => {
    const onde = itens.length === 1 ? itens[0].endereco : `${itens.length} endereços`;
    if (!aprovar && !confirm(`Apagar o que ${g.nome} marcou em ${onde}?

A entrega continua registrada, mas a posição dela não vale para ninguém.`)) return;
    const n = await correr(nome, () => Adm.decidirMarcas(g.id, itens.map(i => i.chave_lugar), aprovar));
    if (n === undefined) return;
    escolher(itens.map(i => chaveDe(g, i)), false);
    const varias = itens.length > 1 ? itens.length : 0;
    status(aprovar
      ? (varias ? `Aprovadas as ${varias}: valem para todos os motoristas.` : 'Aprovada: vale para todos os motoristas.')
      : (varias ? `Apagadas as ${varias}: não valem para ninguém.` : 'Apagada: não vale para ninguém.'), 4000);
    recarregar();
  };
  const verNoMapa = (g: MotoristaEmConferencia, i: ItemEmConferencia) => mostrarNoMapa([
    {lat: i.lat, lng: i.lng, rotulo: g.nome.slice(0, 2), texto: `${g.nome} · ${i.endereco}`, cor: corDe(g.id)},
    ...(i.pino_lat != null && i.pino_lng != null ? [{lat: i.pino_lat, lng: i.pino_lng, rotulo: 'R', texto: `Pino da rota de ${g.nome} · ${i.endereco}`, cor: '#6b7280'}] : []),
    ...(i.lat_antes != null && i.lng_antes != null ? [{lat: i.lat_antes, lng: i.lng_antes, rotulo: 'P', texto: `A porta que vale hoje · ${i.endereco}`, cor: '#16a34a'}] : []),
  ]);
  const item = (g: MotoristaEmConferencia, i: ItemEmConferencia) => <div className={escolhidas.has(chaveDe(g, i)) ? 'item escolhida' : 'item'} key={i.chave_lugar} data-conferir={i.chave_lugar}>
    <label className="escolher orig">
      <input type="checkbox" checked={escolhidas.has(chaveDe(g, i))} onChange={ev => escolher([chaveDe(g, i)], ev.target.checked)} />
      {i.endereco}
    </label>
    <div className="achado">{dataHora(i.criado_em)} · {i.texto}</div>
    <div className="linha">
      <button className="btn peq" onClick={() => verNoMapa(g, i)}>Ver no mapa</button>
      {!i.no_pino && <button className="btn peq pri" onClick={() => decidir(g, [i], true)} disabled={!!ocupado}>{fazendo('ok' + g.id + i.chave_lugar) ? 'Aprovando…' : 'Aprovar'}</button>}
      <button className="btn peq" onClick={() => decidir(g, [i], false)} disabled={!!ocupado}>{fazendo('x' + g.id + i.chave_lugar) ? 'Apagando…' : 'Apagar'}</button>
    </div>
  </div>;
  const total = contarConferencia(estado);
  // quem está em conferência aparece em Motoristas: vazia, a seção só empurrava o resto para baixo
  if (!total) return null;
  return <details open data-secao="Em conferência">
    <summary>Em conferência ({total})</summary>
    <div className="info">O que os motoristas em conferência marcaram ou entregaram e mudaria a porta para os outros. Só vale depois que você aprovar.</div>
    {estado.map(g => <div key={g.id} data-conferencia={g.nome}>
      <div className="area-cab"><span className="txt">{g.nome} · {g.mexem.length + g.noPino.length} endereço(s)</span></div>
      {g.mexem.length > 1 && <div className="linha"><button className="btn peq" data-escolher-todas onClick={() => escolher(g.mexem.map(i => chaveDe(g, i)), true)}>Escolher as {g.mexem.length}</button></div>}
      {g.mexem.map(i => item(g, i))}
      {g.noPino.length > 0 && <>
        <div className="linha"><button className="btn pri" data-aprovar-no-pino onClick={() => decidir(g, g.noPino, true)} disabled={!!ocupado}>
          {fazendo('ok' + g.id + g.noPino[0].chave_lugar) ? 'Aprovando…' : `Aprovar as ${g.noPino.length} entregues no pino da rota`}</button></div>
        <details data-no-pino>
          <summary>Ver as {g.noPino.length} entregues no pino</summary>
          {g.noPino.map(i => item(g, i))}
        </details>
      </>}
      {/* presa embaixo enquanto a lista dele passa: com 33, o botão no fim ficava fora da tela */}
      {escolhidasDe(g).length > 0 && <div className="linha lote" data-lote>
        <button className="btn apagar" onClick={() => decidir(g, escolhidasDe(g), false, 'lote' + g.id)} disabled={!!ocupado}>
          {fazendo('lote' + g.id) ? 'Apagando…' : escolhidasDe(g).length === 1 ? 'Apagar a escolhida' : `Apagar as ${escolhidasDe(g).length} escolhidas`}</button>
        <button className="btn" onClick={() => escolher(escolhidasDe(g).map(i => chaveDe(g, i)), false)}>Desmarcar</button>
      </div>}
    </div>)}
  </details>;
}

// A porta que o Pedro verificou no lugar errado (15/10) só se arrumava carregando a planilha dele.
// Aqui o endereço se acha no que a nuvem guarda, com a porta que vale hoje e de onde ela vem, e a
// certa se grava como quem administra, tocando no mapa desta tela.
function ProcurarLugar() {
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState<'parado' | 'procurando' | {erro: string} | Adm.LugarAchado[]>('parado');
  const procurar = async (texto: string) => {
    if (!texto.trim()) return;
    setEstado('procurando');
    try {
      setEstado(await Adm.procurarLugares(texto));
    } catch (err) {
      setEstado({erro: navigator.onLine ? (err as Error).message : 'sem internet'});
    }
  };
  const verPorta = (l: Adm.LugarAchado) => mostrarNoMapa(l.porta ? [{lat: l.porta.lat, lng: l.porta.lng, rotulo: 'P', texto: `A porta de hoje · ${l.endereco}`, cor: '#16a34a'}] : []);
  const marcar = (l: Adm.LugarAchado) => {
    if (l.porta) verPorta(l);
    else if (window.innerWidth < 900) window.scrollTo(0, 0);
    // depois de gravar, procura de novo: a porta nova aparece com a origem dela
    const texto = busca;
    A.marcarLugar({endereco: l.endereco, gravar: async (lat, lng) => { await Adm.confirmarPosicao(l.chave, lat, lng); procurar(texto); }});
  };
  return <details open data-secao="Procurar um endereço">
    <summary>Procurar um endereço</summary>
    <form className="linha" onSubmit={ev => { ev.preventDefault(); procurar(busca); }}>
      <input type="search" aria-label="Procurar um endereço" placeholder="Rua e número, ou CEP e número" value={busca} onChange={ev => setBusca(ev.target.value)} />
      <button className="btn" type="submit" disabled={estado === 'procurando' || !busca.trim()}>{estado === 'procurando' ? 'Procurando…' : 'Procurar'}</button>
    </form>
    <div className="info">Procura no que a nuvem guarda de todos os motoristas: planilhas, marcações e entregas.</div>
    {typeof estado === 'object' && !Array.isArray(estado) && <div className="aviso">Não consegui procurar: {estado.erro}</div>}
    {Array.isArray(estado) && !estado.length && <div className="info">Nada na nuvem com isso.</div>}
    {Array.isArray(estado) && estado.map(l => {
      const o = origemDaPorta(l.porta);
      return <div className="item" key={l.chave} data-lugar-achado={l.chave}>
        <div className="orig">{l.endereco}</div>
        {l.bairro && <div className="achado">{l.bairro}</div>}
        <span className="tag" style={{background: o.cor}}>{o.texto}</span>
        <div className="achado">{o.detalhe}</div>
        <div className="linha">
          {l.porta && <button className="btn peq" onClick={() => verPorta(l)}>Ver no mapa</button>}
          <button className="btn peq pri" onClick={() => marcar(l)}>Marcar como admin</button>
        </div>
      </div>;
    })}
  </details>;
}

// Os nomes gravados no banco ficaram os de antes da tela nova (02/10): o balão do pino virou o
// cartão de baixo, e o "Ver" da Conferir virou "Ver no mapa".
const NOME_DO_BOTAO: Record<string, string> = {ver: 'Ver no mapa', mapa: 'Marcar no mapa', aqui: 'Estou aqui', editar: 'Editar', remover: 'Remover',
  'balao-aqui': 'Entreguei aqui', 'balao-entreguei': 'Entreguei (cartão do pino)', busca: 'Busca em Todos os endereços', 'busca-antiga': 'Procurar nos dias anteriores',
  minimizar: 'Minimizar o cartão (mapa na tela toda)', 'escolher-maps': 'Escolher pinos para o Maps', circular: 'Circular grupos no mapa'};

// Para parar de decidir no chute quais botões ficam na frente do cartão. Mostra quanto cada um
// é usado e qual costuma vir depois de qual — dois botões que andam sempre juntos são, na
// prática, um fluxo só. Não há endereço nem pacote aqui: só nome de botão e contagem.
function UsoDosBotoes() {
  const [dados, setDados] = useState<{lista: Adm.UsoDoBotao[]; diasComDado: number} | null>(null);
  const {ocupado, correr, fazendo} = useTrabalho();
  const buscar = () => correr('uso', () => Adm.usoDosBotoes(), undefined).then(d => d && setDados(d));
  const maior = dados ? Math.max(1, ...dados.lista.map(b => b.total)) : 1;
  return <details>
    <summary>Uso dos botões do cartão</summary>
    <div className="info">Quantas vezes cada botão foi usado e qual veio logo depois dele. Serve para decidir com medida, não com opinião, quais ficam à mão.</div>
    <div className="linha"><button className="btn" onClick={buscar} disabled={!!ocupado}>{fazendo('uso') ? 'Buscando…' : dados ? '↻ Atualizar' : 'Ver a medição'}</button></div>
    {dados && !dados.lista.length && <div className="info">Ainda não chegou nada. Começa a contar assim que os motoristas usarem os botões com esta versão.</div>}
    {dados && dados.lista.length > 0 && <>
      <div className="info">{dados.diasComDado} dia(s) com dado, últimos 30.</div>
      {dados.lista.map(b => <div className="item" key={b.botao}>
        <div><b>{NOME_DO_BOTAO[b.botao] || b.botao}</b> · {b.total} vez(es)</div>
        <div className="barra" style={{height: 6, borderRadius: 99, background: 'var(--bd)', overflow: 'hidden', margin: '4px 0'}}>
          <i style={{display: 'block', height: '100%', width: `${Math.round(b.total * 100 / maior)}%`, background: 'var(--pri)'}} />
        </div>
        {b.depois.length > 0 && <div className="achado">Depois dele: {b.depois.map(d =>
          `${NOME_DO_BOTAO[d.botao] || d.botao} ${d.vezes}× (${Math.round(d.vezes * 100 / b.total)}%)`).join(' · ')}</div>}
      </div>)}
    </>}
  </details>;
}

function BaseDeRuas() {
  const [c, setC] = useState<Adm.Cobertura | null>(null);
  const [erro, setErro] = useState('');
  const {correr, fazendo} = useTrabalho();
  const ver = async () => {
    try { setC(await Adm.cobertura()); setErro(''); } catch (err) { setErro((err as Error).message); }
  };
  useEffect(() => { ver(); }, []);
  const nomear = async () => {
    const r = await correr('nomear', () => Adm.nomearRuas());
    if (r) status(r.trechos ? `${r.trechos} trecho(s) ganharam nome, em ${r.ruas} rua(s).` : 'Nenhum trecho novo para nomear ainda.', 6000);
  };
  const criar = async () => {
    const r = await correr('criar', () => Adm.criarRuasDasEntregas());
    if (r) status(r.gravadas
      ? `${r.gravadas} rua(s) que nenhum mapa tinha, desenhadas com ${r.pontos} entrega(s) de vocês.`
      : 'Nenhuma rua nova ainda: é preciso ter entregado em duas portas diferentes da mesma rua.', 8000);
    ver();
  };
  return <details>
    <summary>Nossa base de ruas</summary>
    {erro && <div className="aviso">Falta rodar o SQL da base de ruas: {erro}</div>}
    {c && <>
      <div className="info">🛣️ {c.ruas_com_nome} ruas com nome · {c.trechos_sem_nome} trechos ainda sem nome{c.trechos_nossos ? ` · ${c.trechos_nossos} nomeados pelas entregas de vocês` : ''}</div>
      <div className="info">📍 {c.passagens} entregas marcadas na porta, em {c.lugares} endereços · {c.lugares_confirmados} já com posição confirmada</div>
      <div className="linha">
        <button className="btn" onClick={nomear} disabled={fazendo('nomear')}>{fazendo('nomear') ? 'Nomeando…' : 'Nomear ruas com as entregas'}</button>
        <button className="btn" onClick={criar} disabled={fazendo('criar')}>{fazendo('criar') ? 'Desenhando…' : 'Criar rua que falta no mapa'}</button>
      </div>
      <div className="info">A segunda cria o trecho de uma rua que <b>não existe em mapa nenhum</b>, usando as entregas já feitas nela. Precisa de duas portas diferentes da mesma rua.</div>
      <div className="info">Para trazer (ou atualizar) as ruas de uma cidade, no computador: <code>npm run ruas -- Aracaju</code>.</div>
    </>}
  </details>;
}

function Motoristas({lista, recarregar}: {lista: Adm.Motorista[]; recarregar: () => void}) {
  const {ocupado, correr, fazendo} = useTrabalho();
  const mudar = async (m: Adm.Motorista) => {
    if (m.ativo && !confirm(`Desativar ${m.nome}? A pessoa deixa de enviar rotas e correções, e as dela deixam de valer para os outros.`)) return;
    await correr(m.id, () => Adm.mudarAtivo(m.id, !m.ativo), m.ativo ? `${m.nome} desativado(a).` : `${m.nome} ativado(a).`);
    recarregar();
  };
  const conferir = async (m: Adm.Motorista) => {
    if (!confirm(m.conferir
      ? `Encerrar a conferência de ${m.nome}?

O que a pessoa marcar ou entregar daqui em diante vale na hora para os outros. O que já está esperando continua esperando você.`
      : `Pôr ${m.nome} em conferência?

Daqui em diante, o que a pessoa marcar ou entregar só vale para os outros depois que você aprovar.`)) return;
    await correr('c' + m.id, () => Adm.mudarConferir(m.id, !m.conferir), m.conferir ? `${m.nome}: conferência encerrada.` : `${m.nome} em conferência.`);
    recarregar();
  };
  return <details>
    <summary>Motoristas ({lista.filter(m => m.papel === 'motorista').length})</summary>
    {lista.map(m => <div className="item" key={m.id} data-motorista={m.nome} style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <div className="txt"><b>{m.nome}</b>{m.papel === 'admin' ? ' · administrador' : ''}
        <div className="achado">{m.ativo ? '🟢 ativo' : '⛔ desativado'}</div>
        {m.papel === 'motorista' && m.conferir && <span className="tag" style={{background: '#ea580c'}}>em conferência</span>}</div>
      {/* sem a 022 rodada o perfil não traz o campo, e o botão não aparece */}
      {m.papel === 'motorista' && m.conferir != null && <button className="btn peq" onClick={() => conferir(m)} disabled={!!ocupado}>
        {fazendo('c' + m.id) ? 'Só um momento…' : m.conferir ? 'Encerrar conferência' : 'Pôr em conferência'}</button>}
      {m.id !== nuvem.perfil?.id && <button className="btn peq" onClick={() => mudar(m)} disabled={!!ocupado}>{fazendo(m.id) ? 'Só um momento…' : m.ativo ? 'Desativar' : 'Ativar'}</button>}
    </div>)}
    <NovaConta recarregar={recarregar} />
    <div className="info">Para trocar a senha de alguém, no computador: <code>npm run motoristas -- senha email</code>.</div>
  </details>;
}

// Colar o e-mail e sair com a senha (pedido de 03/10): a mensagem já vai pronta para o WhatsApp,
// com o endereço do app. A senha só aparece aqui, uma vez: o banco guarda só o embaralhado dela.
function NovaConta({recarregar}: {recarregar: () => void}) {
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [criada, setCriada] = useState<(Adm.ContaNova & {email: string}) | null>(null);
  const {correr, fazendo} = useTrabalho();
  const criar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { status('Cole o e-mail do motorista.', 4000); return; }
    const conta = await correr('criar', () => Adm.criarMotorista(e, nome.trim()));
    if (!conta) return;
    setCriada({...conta, email: e});
    setEmail('');
    setNome('');
    recarregar();
  };
  const copiar = async () => {
    if (!criada) return;
    const texto = `Seu acesso ao app de rota:\n${location.origin}${location.pathname}\nE-mail: ${criada.email}\nSenha: ${criada.senha}`;
    try { await navigator.clipboard.writeText(texto); status('Copiado. Cole no WhatsApp do motorista.', 3000); } catch { status('Não consegui copiar: anote a senha.', 4000); }
  };
  return <div className="item" data-nova-conta>
    <b>Criar conta de motorista</b>
    <input type="email" inputMode="email" autoComplete="off" aria-label="E-mail do motorista" placeholder="Cole o e-mail" value={email} onChange={ev => setEmail(ev.target.value)} />
    <input type="text" autoComplete="off" aria-label="Nome do motorista" placeholder="Nome (se vazio, usa o começo do e-mail)" value={nome} onChange={ev => setNome(ev.target.value)} />
    <button className="btn pri" onClick={criar} disabled={fazendo('criar')}>{fazendo('criar') ? 'Criando…' : 'Criar conta'}</button>
    {criada && <div className="aviso" data-conta-criada>
      Conta criada: <b>{criada.nome}</b> ({criada.email})<br />Senha: <b data-senha>{criada.senha}</b>
      <div className="info">Ela só aparece agora. Copie e mande para o motorista.</div>
      <div className="linha"><button className="btn peq" onClick={copiar}>Copiar para o WhatsApp</button></div>
    </div>}
  </div>;
}

function Rotas({lista}: {lista: Adm.RotaResumo[]}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [pacotes, setPacotes] = useState<Adm.PacoteAdmin[]>([]);
  const {ocupado, correr, fazendo} = useTrabalho();
  const abrir = async (r: Adm.RotaResumo) => {
    if (aberta === r.id) { setAberta(null); return; }
    const ps = await correr('abrir' + r.id, () => Adm.pacotesDaRota(r.id));
    if (ps) { setPacotes(ps); setAberta(r.id); }
  };
  const verNoMapa = async (r: Adm.RotaResumo) => {
    const ps = await correr('mapa' + r.id, () => Adm.pacotesDaRota(r.id));
    if (ps) mostrarNoMapa(ps.filter(p => p.lat != null && p.lng != null).map((p, i) => ({
      lat: p.lat!, lng: p.lng!, rotulo: p.entregue_em ? '✓' : String(p.sequencia ?? i + 1),
      texto: `${p.endereco}${p.entregue_em ? ` · entregue ${hora(p.entregue_em)}` : ''}`, cor: p.entregue_em ? '#16a34a' : '#6b7280',
    })));
  };
  const dias = [...new Set(lista.map(r => r.dia))];
  return <details open>
    <summary>Rotas dos últimos 14 dias ({lista.length})</summary>
    {!lista.length && <div className="info">Nenhuma rota enviada ainda.</div>}
    {dias.map(d => <div key={d}>
      <div className="area-cab"><span className="txt">{diaExtenso(d)}</span></div>
      {lista.filter(r => r.dia === d).map(r => <div className="item" key={r.id} data-rota={r.id}>
        <div><b>{r.motorista}</b> · {r.entregues}/{r.pacotes} entregues</div>
        <div className="achado">{r.arquivo || 'sem arquivo'} · enviada {hora(r.criado_em)}</div>
        <div className="linha">
          <button className="btn peq" onClick={() => abrir(r)} disabled={!!ocupado}>{fazendo('abrir' + r.id) ? 'Buscando…' : aberta === r.id ? 'Fechar' : 'Ver entregas'}</button>
          <button className="btn peq" onClick={() => verNoMapa(r)} disabled={!!ocupado}>{fazendo('mapa' + r.id) ? 'Buscando…' : 'Ver no mapa'}</button>
        </div>
        {aberta === r.id && <div style={{marginTop: 8}}>{pacotes.map((p, i) => <div className={`parada ${p.entregue_em ? 'feito' : ''}`} key={i}>
          <div className="txt"><div>{p.endereco}</div><div className="achado">{[p.bairro, p.spx_tn, p.entregue_em && 'entregue ' + hora(p.entregue_em)].filter(Boolean).join(' · ')}</div></div>
        </div>)}</div>}
      </div>)}
    </div>)}
  </details>;
}

interface PropsDosLugares {
  titulo: string;
  lista: Adm.LugarCorrigido[];
  vazio: string;
  aberta?: boolean;
  decidir?: boolean;
  novo: (l: Adm.LugarCorrigido) => boolean;
  corDe: (id: string) => string;
  recarregar: () => void;
}

function Lugares({titulo, lista, vazio, aberta, decidir, novo, corDe, recarregar}: PropsDosLugares) {
  const {ocupado, correr, fazendo} = useTrabalho();
  const confirmar = async (l: Adm.LugarCorrigido, m: Adm.Marcacao) => {
    await correr('ok' + l.chave + m.motorista_id, () => Adm.confirmarPosicao(l.chave, m.lat, m.lng), 'Posição confirmada: agora vale para todos os motoristas.');
    recarregar();
  };
  const apagar = async (l: Adm.LugarCorrigido, m: Adm.Marcacao) => {
    if (!confirm(`Apagar a marcação de ${m.nome} para ${l.endereco || 'este endereço'}?`)) return;
    await correr('x' + l.chave + m.motorista_id, () => Adm.apagarMarcacao(l.chave, m.motorista_id), 'Marcação apagada.');
    recarregar();
  };
  return <details open={aberta} data-secao={titulo.replace(/\s*\(\d+\)$/, '')}>
    <summary>{titulo}</summary>
    {decidir && <div className="info">Uma porta vale para todos quando dois motoristas marcam no mesmo ponto (até 30 m), quando um marca e alguém entrega ali, ou quando você confirma.</div>}
    {!lista.length && vazio && <div className="info">{vazio}</div>}
    {lista.map(l => {
      const s = situacaoDoLugar(l);
      const motivo = porQuePrecisaDeVoce(l);
      return <div className="item" key={l.chave} data-lugar={l.chave}>
        <div className="orig">{novo(l) && <span className="tag" style={{background: '#1d4ed8', marginRight: 6}}>novo</span>}{l.endereco || l.chave}</div>
        <div className="achado">{l.bairro}</div>
        <span className="tag" style={{background: s.cor}}>{s.texto}</span>
        {decidir && motivo && <div className="aviso laranja" style={{margin: '6px 0'}}>{motivo}</div>}
        {l.marcacoes.map(m => {
          const escolhida = l.escolhida && haversine(l.escolhida, m) < 1;
          const longe = l.escolhida && !escolhida ? haversine(l.escolhida, m) : 0;
          return <div className="parada" key={m.motorista_id} data-marcacao={m.nome}>
            <div className="dot" style={{'--c': corDe(m.motorista_id)} as any} />
            <div className="txt">
              <div><b>{m.nome}</b>{m.papel === 'admin' ? ' (você)' : ''}{escolhida ? ' · ✓ a que vale' : ''}</div>
              <div className="achado">{dataHora(m.criado_em)}{m.vezes > 1 ? ` · corrigiu ${m.vezes}x` : ''}{longe ? ` · a ${fmtKm(longe)} da que vale` : ''}</div>
            </div>
            {!(escolhida && l.situacao === 'confirmado') && <button className="btn peq pri" onClick={() => confirmar(l, m)} disabled={!!ocupado}>{fazendo('ok' + l.chave + m.motorista_id) ? 'Confirmando…' : 'Confirmar'}</button>}
            <button className="btn peq" onClick={() => apagar(l, m)} disabled={!!ocupado}>{fazendo('x' + l.chave + m.motorista_id) ? 'Apagando…' : 'Apagar'}</button>
          </div>;
        })}
        <div className="linha"><button className="btn peq" onClick={() => mostrarNoMapa(l.marcacoes.map(m => ({
          lat: m.lat, lng: m.lng, rotulo: m.nome.slice(0, 2), texto: `${m.nome} · ${l.endereco || l.chave}`, cor: corDe(m.motorista_id),
        })))}>Ver no mapa</button></div>
      </div>;
    })}
  </details>;
}

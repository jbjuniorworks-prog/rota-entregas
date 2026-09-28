import {useEffect, useState} from 'react';
import {haversine} from '../logica/geo';
import {CHAVES} from '../logica/guarda';
import {fmtKm} from '../logica/otimizacao';
import {porQuePrecisaDeVoce, situacaoDoLugar, triar} from '../logica/triagem';
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
  const [erro, setErro] = useState('');
  // A visita anterior, lida uma vez ao abrir: o "novo" continua na tela enquanto ele está aqui,
  // e a hora desta visita só é gravada depois que as marcações chegaram de verdade.
  const [visto] = useState(() => guarda.ler<number | null>(CHAVES.adminVisto, null));

  const [lendo, setLendo] = useState(false);
  const carregar = async () => {
    if (lendo) return;
    setErro('');
    setLendo(true);
    try {
      const [m, r, l] = await Promise.all([Adm.listarMotoristas(), Adm.listarRotas(), Adm.listarCorrecoes()]);
      setMotoristas(m); setRotas(r); setLugares(l);
      guarda.gravar(CHAVES.adminVisto, Date.now());
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setLendo(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  if (nuvem.perfil?.papel !== 'admin') return <div className="info">Só quem administra vê esta tela.</div>;
  const corDe = (id: string) => CORES_MOTORISTA[Math.max(0, (motoristas || []).findIndex(m => m.id === id)) % CORES_MOTORISTA.length];
  const t = lugares ? triar(lugares, Date.now(), visto) : null;
  const doLugar = {corDe, recarregar: carregar, novo: t ? t.novo : () => false};

  // O que os motoristas mexeram vem primeiro: ficava no fim da página, depois de 14 dias de
  // rotas, e o que esperava decisão dele tinha de ser procurado. O que é de vez em quando
  // (motoristas, base de ruas, medição dos botões) fica fechado, a um toque.
  return <>
    <h2>Administração</h2>
    <div className="linha" style={{marginTop: 0}}><button className="btn" onClick={carregar} disabled={lendo}>{lendo ? 'Buscando…' : '↻ Atualizar'}</button></div>
    {erro && <div className="aviso">Não consegui carregar: {erro}</div>}
    {!motoristas && !erro && <div className="info">Carregando…</div>}
    {t && <div className={t.decidir.length ? 'aviso laranja' : 'info'} data-resumo>
      {t.decidir.length ? <b>📌 {t.decidir.length} esperando você.</b> : '✓ Nada esperando você.'}
      {visto != null && (t.novas
        ? ` 🆕 ${t.novas} marcação(ões) nova(s) desde ${dataHora(new Date(visto).toISOString())}.`
        : ` Nada novo desde ${dataHora(new Date(visto).toISOString())}.`)}
    </div>}
    {t && <Lugares titulo={`📌 Precisa de você (${t.decidir.length})`} lista={t.decidir} aberta decidir {...doLugar}
      vazio="Nenhuma marcação esperando decisão." />}
    {t && <Lugares titulo={`🆕 Marcadas pelos motoristas nos últimos 7 dias (${t.recentes.length})`} lista={t.recentes} aberta {...doLugar}
      vazio="Nenhuma porta marcada nos últimos 7 dias." />}
    {rotas && <Rotas lista={rotas} />}
    {t && t.outras.length > 0 && <Lugares titulo={`Marcações mais antigas (${t.outras.length})`} lista={t.outras} {...doLugar} vazio="" />}
    {motoristas && <Motoristas lista={motoristas} recarregar={carregar} />}
    <BaseDeRuas />
    <UsoDosBotoes />
  </>;
}

const NOME_DO_BOTAO: Record<string, string> = {ver: 'Ver', mapa: 'Marcar no mapa', aqui: '📍 Estou aqui', editar: 'Editar', remover: 'Remover',
  'balao-aqui': '📍 Entreguei aqui (balão do pino)', 'balao-entreguei': '✓ Entreguei (balão do pino)'};

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
  return <details>
    <summary>Motoristas ({lista.filter(m => m.papel === 'motorista').length})</summary>
    {lista.map(m => <div className="item" key={m.id} data-motorista={m.nome} style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <div className="txt"><b>{m.nome}</b>{m.papel === 'admin' ? ' · administrador' : ''}
        <div className="achado">{m.ativo ? '🟢 ativo' : '⛔ desativado'}</div></div>
      {m.id !== nuvem.perfil?.id && <button className="btn peq" onClick={() => mudar(m)} disabled={!!ocupado}>{fazendo(m.id) ? 'Só um momento…' : m.ativo ? 'Desativar' : 'Ativar'}</button>}
    </div>)}
    <div className="info">Para criar conta ou trocar senha, no computador: <code>npm run motoristas -- criar email Nome</code> ou <code>-- senha email</code>.</div>
  </details>;
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

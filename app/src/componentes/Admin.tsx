import {useEffect, useState} from 'react';
import {haversine} from '../logica/geo';
import {fmtKm} from '../logica/otimizacao';
import {loja, status, useLoja, type Marca} from '../loja';
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

  const [lendo, setLendo] = useState(false);
  const carregar = async () => {
    if (lendo) return;
    setErro('');
    setLendo(true);
    try {
      const [m, r, l] = await Promise.all([Adm.listarMotoristas(), Adm.listarRotas(), Adm.listarCorrecoes()]);
      setMotoristas(m); setRotas(r); setLugares(l);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setLendo(false);
    }
  };
  useEffect(() => { carregar(); }, []);

  if (nuvem.perfil?.papel !== 'admin') return <div className="info">Só quem administra vê esta tela.</div>;
  const corDe = (id: string) => CORES_MOTORISTA[Math.max(0, (motoristas || []).findIndex(m => m.id === id)) % CORES_MOTORISTA.length];

  return <>
    <h2>Administração</h2>
    <div className="linha" style={{marginTop: 0}}><button className="btn" onClick={carregar} disabled={lendo}>{lendo ? 'Buscando…' : '↻ Atualizar'}</button></div>
    {erro && <div className="aviso">Não consegui carregar: {erro}</div>}
    {!motoristas && !erro && <div className="info">Carregando…</div>}
    {motoristas && <Motoristas lista={motoristas} recarregar={carregar} />}
    <BaseDeRuas />
    {rotas && <Rotas lista={rotas} />}
    {lugares && <Correcoes lista={lugares} corDe={corDe} recarregar={carregar} />}
  </>;
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
    ver();
  };
  return <details open>
    <summary>Nossa base de ruas</summary>
    {erro && <div className="aviso">Falta rodar o SQL da base de ruas: {erro}</div>}
    {c && <>
      <div className="info">🛣️ {c.ruas_com_nome} ruas com nome · {c.trechos_sem_nome} trechos ainda sem nome{c.trechos_nossos ? ` · ${c.trechos_nossos} nomeados pelas entregas de vocês` : ''}</div>
      <div className="info">📍 {c.passagens} entregas marcadas na porta, em {c.lugares} endereços · {c.lugares_confirmados} já com posição confirmada</div>
      <div className="linha"><button className="btn" onClick={nomear} disabled={fazendo('nomear')}>{fazendo('nomear') ? 'Nomeando…' : 'Nomear ruas com as entregas'}</button></div>
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
  return <details open>
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

function Correcoes({lista, corDe, recarregar}: {lista: Adm.LugarCorrigido[]; corDe: (id: string) => string; recarregar: () => void}) {
  const [soSugestoes, setSoSugestoes] = useState(false);
  const mostrados = soSugestoes ? lista.filter(l => l.situacao !== 'confirmado') : lista;
  const sugestoes = lista.filter(l => l.situacao !== 'confirmado').length;
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
  return <details open>
    <summary>Pinos corrigidos pelos motoristas ({lista.length})</summary>
    <div className="info">Com 2 motoristas no mesmo ponto (até 30 m), ou com a sua confirmação, a posição vale para todos. Com 1 só, aparece como sugestão.</div>
    <div className="linha"><button className="btn peq" onClick={() => setSoSugestoes(!soSugestoes)}>{soSugestoes ? 'Mostrar todos' : `Só as sugestões (${sugestoes})`}</button></div>
    {mostrados.map(l => <div className="item" key={l.chave} data-lugar={l.chave}>
      <div className="orig">{l.endereco || l.chave}</div>
      <div className="achado">{l.bairro}</div>
      <span className="tag" style={{background: l.situacao === 'confirmado' ? '#16a34a' : '#d97706'}}>{l.situacao === 'confirmado' ? 'Confirmada' : 'Sugestão'}</span>
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
    </div>)}
  </details>;
}

import {useState} from 'react';
import * as A from '../acoes';
import {acharNaParada, type Achado} from '../logica/busca';
import {DUVIDA, ROTULO} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {loja, useLoja} from '../loja';
import {rotuloDe} from '../logica/rotulo';
import {buscarNosDiasAnteriores, type EntregaAntiga} from '../servicos/historico';
import {nuvem} from '../servicos/nuvem';
import {AvisoXarope, Cabecalho, hhmm, MarcarXarope, Meta, Sugestao, Tag} from './comuns';

const precisaConferir = (p: Parada) => DUVIDA.has(p.precisao) || p.precisao === 'pendente' || !!p.sugestao;

export function TelaConferir() {
  const {e, ui} = useLoja();
  const abertas = e.paradas.filter(p => !p.entregue);
  const aConferir = abertas.filter(precisaConferir);
  const pend = e.paradas.filter(p => p.precisao === 'pendente').length;
  const [busca, setBusca] = useState('');
  const buscando = !ui.soDuvidas && busca.trim() !== '';
  const achados = new Map<string, Achado>();
  if (buscando) for (const p of e.paradas) { const a = acharNaParada(p, busca); if (a) achados.set(p.id, a); }
  const mostrar = ui.soDuvidas ? aConferir : buscando ? e.paradas.filter(p => achados.has(p.id)) : e.paradas;
  const semRota = !e.paradas.length;
  return <>
    <Cabecalho titulo={ui.soDuvidas ? `${aConferir.length} para conferir` : semRota ? 'Procurar uma entrega' : 'Todos os endereços'}
      sub={ui.soDuvidas ? 'O pino pode estar fora do lugar' : semRota ? 'Sem rota hoje neste celular'
        : buscando ? `${mostrar.length} de ${e.paradas.length} entrega(s)` : `${e.paradas.length} entrega(s) · ${aConferir.length} para conferir`} />
    <div className="corpo">
      {!semRota && <div className="linha">
        {pend > 0 && <button className="btn pri" onClick={() => A.buscarPendentes()}>Buscar {pend} sem posição</button>}
        <button className="btn" onClick={() => A.mudar(() => { ui.soDuvidas = !ui.soDuvidas; })}>{ui.soDuvidas ? 'Ver todos' : 'Só os para conferir'}</button>
      </div>}
      {/* para o B.O. (pedido de 02/10): achar logo qual foi, pelo código da etiqueta ou pela rua */}
      {!ui.soDuvidas && <div className="busca">
        <input type="search" aria-label="Buscar" placeholder="Rua e número, bairro ou código do pacote" value={busca}
          onChange={ev => { if (!busca && ev.target.value) A.contar('busca'); setBusca(ev.target.value); }} />
        <div className="info">Procura na rota de hoje deste celular, entregues também.</div>
      </div>}
      {!mostrar.length && !(semRota && buscando) && <div className="info vazio">{semRota
        ? 'Digite o código do pacote ou a rua para procurar nos dias anteriores.'
        : buscando ? 'Nenhuma entrega da rota de hoje com isso.' : 'Nada para conferir agora.'}</div>}
      {ui.soDuvidas || buscando ? <PorArea ps={mostrar} achados={achados} /> : <Agrupadas />}
      {/* a chave refaz o bloco a cada letra: resultado de outra busca não fica na tela */}
      {buscando && <DiasAnteriores key={busca} busca={busca} />}
    </div>
  </>;
}

function PorArea({ps, achados}: {ps: Parada[]; achados?: Map<string, Achado>}) {
  const {e} = useLoja();
  return <>{e.areas.map(a => {
    const daArea = ps.filter(p => p.area === a.id);
    if (!daArea.length) return null;
    return <div key={a.id} className="itens">
      {e.areas.length > 1 && <div className="area-cab" style={{'--c': a.cor} as any}><span className="dot" /><span className="txt">{a.nome}</span><span className="info">{daArea.length}</span></div>}
      {daArea.map(p => <ItemConferir key={p.id} p={p} pacotes={achados?.get(p.id)?.pacotes} />)}
    </div>;
  })}</>;
}

// Todos, sem busca: o que precisa dele primeiro, o que não precisa recolhido no fim. Numa rota de
// 67, achar os problemas rolando por entregues e verificados atrapalhava (pedido de 07/10).
function Agrupadas() {
  const {e} = useLoja();
  const abertas = e.paradas.filter(p => !p.entregue);
  const conferir = abertas.filter(precisaConferir);
  const verificadas = abertas.filter(p => !precisaConferir(p) && p.precisao === 'confirmado');
  const faltam = abertas.filter(p => !precisaConferir(p) && p.precisao !== 'confirmado');
  const entregues = e.paradas.filter(p => p.entregue);
  return <>
    {conferir.length > 0 && <div className="itens" data-grupo="conferir"><h2>Para conferir ({conferir.length})</h2><PorArea ps={conferir} /></div>}
    {faltam.length > 0 && <div className="itens" data-grupo="faltam"><h2>Falta entregar ({faltam.length})</h2><PorArea ps={faltam} /></div>}
    {verificadas.length > 0 && <details className="feitas" data-grupo="verificadas"><summary>{verificadas.length} com endereço verificado</summary>
      <div className="itens"><PorArea ps={verificadas} /></div></details>}
    {entregues.length > 0 && <details className="feitas" data-grupo="entregues"><summary>{entregues.length} entregue(s)</summary>
      <div className="itens"><PorArea ps={entregues} /></div></details>}
  </>;
}

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const quando = (t: string) => `${new Date(t).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})} às ${hhmm(Date.parse(t))}`;

// B.O. que chega depois do resetar (pedido de 02/10): só a nuvem lembra. Vai lá só quando ele
// pede, porque precisa de internet e quase nunca é usado.
function DiasAnteriores({busca}: {busca: string}) {
  const {e} = useLoja();
  const [estado, setEstado] = useState<'parado' | 'procurando' | {erro: string} | EntregaAntiga[]>('parado');
  const admin = nuvem.perfil?.papel === 'admin';
  if (!nuvem.sessao) return <div className="info">Entre na conta para procurar nos dias anteriores.</div>;
  const procurar = async () => {
    A.contar('busca-antiga');
    setEstado('procurando');
    try {
      setEstado(await buscarNosDiasAnteriores(busca, new Set(e.paradas.flatMap(p => p.pacotes || []))));
    } catch (err) {
      setEstado({erro: navigator.onLine ? (err as Error).message : 'sem internet'});
    }
  };
  if (estado === 'parado') return <button className="btn" data-dias-anteriores onClick={procurar}>Procurar nos dias anteriores</button>;
  if (estado === 'procurando') return <div className="info">Procurando nos dias anteriores…</div>;
  if (!Array.isArray(estado)) return <div className="aviso" data-antigas-erro>Não consegui procurar nos dias anteriores ({estado.erro}). Precisa de internet.{' '}
    <button className="link" onClick={procurar}>Tentar de novo</button></div>;
  if (!estado.length) return <div className="info" data-antigas-vazio>Nada com isso nos dias anteriores{admin ? '' : ', nas suas rotas'}.</div>;
  return <div className="antigas">
    <div className="area-cab"><span className="txt">Dias anteriores</span><span className="info">{estado.length}</span></div>
    {estado.map((x, i) => <div className="item" key={i} data-antiga>
      <span className="orig">{x.endereco}{x.bairro ? `, ${x.bairro}` : ''}</span>
      {x.codigo && <span className="achado">Pacote {x.codigo}</span>}
      {x.entregueEm
        ? <span className="feita" data-entregue>Entregue em {quando(x.entregueEm)}</span>
        : <span className="achado">Rota de {diaCurto(x.dia)}, não marcada como entregue</span>}
      {admin && x.motorista && <span className="achado" data-motorista>Motorista: {x.motorista}</span>}
      {x.ponto && <a className="btn peq" href={`https://www.google.com/maps/search/?api=1&query=${x.ponto.lat},${x.ponto.lng}`} target="_blank" rel="noopener">
        {x.ponto.daEntrega ? 'Ver onde marcou a entrega' : 'Ver a posição da planilha'}</a>}
    </div>)}
  </div>;
}

function ItemConferir({p, pacotes}: {p: Parada; pacotes?: string[]}) {
  const {e, ui} = useLoja();
  const sel = ui.selecionada === p.id;
  const a = loja.area(p.area);
  return <div className={`item ${sel ? 'sel' : ''}`} data-item={p.id}>
    <button className="topo" aria-expanded={sel} onClick={() => A.mudar(() => { ui.selecionada = sel ? null : p.id; })}>
      <span className="badge" style={{background: a.cor}}>{rotuloDe(p)}</span>
      <span className="txt">
        <span className="orig">{p.texto}</span><Meta p={p} />
        {/* a etiqueta colorida já diz isto; repetir a mesma frase logo acima é ruído em cada um dos 83 cartões */}
        {p.exibido && p.exibido !== ROTULO[p.precisao] && <span className="achado">{p.exibido}</span>}
        <Tag p={p} />
        {p.entregue && <span className="feita" data-entregue>{p.entregueEm ? `Entregue às ${hhmm(p.entregueEm)}` : 'Entregue'}</span>}
        {pacotes?.map(c => <span key={c} className="achado" data-pacote>Pacote {c}</span>)}
      </span>
    </button>
    <AvisoXarope p={p} />
    <Sugestao p={p} />
    <div className="linha">
      {p.lat != null && <button className="btn peq" onClick={() => { A.contar('ver'); A.focar(p.id); }}>Ver no mapa</button>}
      <button className="btn peq" onClick={() => { A.contar('aqui'); A.estouAqui(p); }}>Estou aqui</button>
      <button className="btn peq" onClick={() => { A.contar('mapa'); A.posicionar(p.id); }}>Marcar no mapa</button>
      <button className="btn peq" onClick={() => { A.contar('editar'); A.editar(p); }}>Editar</button>
    </div>
    {sel && <>{e.areas.length > 1 && <><label>Área</label>
      <select value={p.area} onChange={ev => A.mudar(() => { p.area = ev.target.value; }, true)}>
        {e.areas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select></>}
      {/* Longe dos botões de todo dia: um toque errado numa rota de 83 apaga uma parada, e
          ninguém percebe até ela não aparecer. Aqui só chega quem abriu o cartão de propósito. */}
      <MarcarXarope p={p} />
      {p.candidatos && p.candidatos.length > 1 && <div className="cands"><div className="info">Outras posições encontradas:</div>
        {p.candidatos.map((c, k) => <button key={k} onClick={() => A.escolherCandidato(p, k)}><Tag p={c} /><br />{c.exibido}</button>)}
      </div>}
      <div className="linha"><button className="btn peq apagar" onClick={() => { A.contar('remover'); A.remover(p); }}>Remover esta parada</button></div></>}
  </div>;
}

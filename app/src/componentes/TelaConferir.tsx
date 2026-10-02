import * as A from '../acoes';
import {DUVIDA, ROTULO} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {loja, useLoja} from '../loja';
import {rotuloDe} from '../logica/rotulo';
import {AvisoXarope, Cabecalho, MarcarXarope, Meta, Sugestao, Tag} from './comuns';

const precisaConferir = (p: Parada) => DUVIDA.has(p.precisao) || p.precisao === 'pendente' || !!p.sugestao;

export function TelaConferir() {
  const {e, ui} = useLoja();
  const abertas = e.paradas.filter(p => !p.entregue);
  const aConferir = abertas.filter(precisaConferir);
  const pend = e.paradas.filter(p => p.precisao === 'pendente').length;
  const mostrar = ui.soDuvidas ? aConferir : e.paradas;
  return <>
    <Cabecalho titulo={ui.soDuvidas ? `${aConferir.length} para conferir` : 'Todos os endereços'}
      sub={ui.soDuvidas ? 'O pino pode estar fora do lugar' : `${e.paradas.length} entrega(s) · ${aConferir.length} para conferir`} />
    <div className="corpo">
      <div className="linha">
        {pend > 0 && <button className="btn pri" onClick={() => A.buscarPendentes()}>Buscar {pend} sem posição</button>}
        <button className="btn" onClick={() => A.mudar(() => { ui.soDuvidas = !ui.soDuvidas; })}>{ui.soDuvidas ? 'Ver todos' : 'Só os para conferir'}</button>
      </div>
      {!mostrar.length && <div className="info vazio">Nada para conferir agora.</div>}
      {e.areas.map(a => {
        const ps = mostrar.filter(p => p.area === a.id);
        if (!ps.length) return null;
        return <div key={a.id}>
          {e.areas.length > 1 && <div className="area-cab" style={{'--c': a.cor} as any}><span className="dot" /><span className="txt">{a.nome}</span><span className="info">{ps.length}</span></div>}
          {ps.map(p => <ItemConferir key={p.id} p={p} />)}
        </div>;
      })}
    </div>
  </>;
}

function ItemConferir({p}: {p: Parada}) {
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

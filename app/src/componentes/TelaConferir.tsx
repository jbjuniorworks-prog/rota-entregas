import * as A from '../acoes';
import {DUVIDA, NO_NUMERO} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {loja, useLoja} from '../loja';
import {rotuloDe} from '../logica/rotulo';
import {Meta, Sugestao, Tag} from './comuns';

export function TelaConferir() {
  const {e, ui} = useLoja();
  if (!e.paradas.length) return <div className="info">Nenhum endereço ainda. Vá em <b>1. Endereços</b>.</div>;
  const conta = (ks: readonly string[]) => e.paradas.filter(p => ks.includes(p.precisao)).length;
  const duvidas = conta([...DUVIDA]), pend = conta(['pendente']), sugeridas = e.paradas.filter(p => p.sugestao && !p.entregue).length;
  return <>
    <h2>Conferir locais</h2>
    <div className="info">✅ {conta(NO_NUMERO)} no número · 🟠 {conta(['rua'])} só na rua · ❗ {duvidas} para conferir{sugeridas ? ` · 💡 ${sugeridas} com sugestão` : ''}{pend ? ` · ⏳ ${pend} sem buscar` : ''}</div>
    {conta(['rua']) > 0 && <div className="aviso laranja">Os <b>laranja</b> são o mais perto que conseguimos: a rua está certa, mas o número é aproximado. Pode dar alguns metros de diferença.</div>}
    {duvidas > 0 && <div className="aviso">Os de borda vermelha podem estar longe do lugar. Toque em <b>Ver</b> para olhar no mapa e use <b>Marcar no mapa</b> para corrigir (olhando a posição no app de entregas).</div>}
    <div className="linha">
      {pend > 0 && <button className="btn pri" onClick={() => A.buscarPendentes()}>Buscar {pend} pendente(s)</button>}
      <button className="btn" onClick={() => A.mudar(() => { ui.soDuvidas = !ui.soDuvidas; })}>{ui.soDuvidas ? 'Mostrar todos' : 'Só os duvidosos'}</button>
      <button className={`btn ${pend ? '' : 'pri'}`} onClick={() => A.irPara('rota')}>Ir para a rota →</button>
    </div>
    {e.areas.map(a => {
      const ps = e.paradas.filter(p => p.area === a.id && (!ui.soDuvidas || DUVIDA.has(p.precisao) || p.precisao === 'pendente'));
      if (!ps.length) return null;
      return <div key={a.id}>
        <div className="area-cab" style={{'--c': a.cor} as any}><span className="dot" /><span className="txt">{a.nome}</span><span className="info">{ps.length}</span></div>
        {ps.map(p => <ItemConferir key={p.id} p={p} />)}
      </div>;
    })}
  </>;
}

function ItemConferir({p}: {p: Parada}) {
  const {e, ui} = useLoja();
  const sel = ui.selecionada === p.id;
  const a = loja.area(p.area);
  return <div className={`item ${sel ? 'sel' : ''}`} data-item={p.id}>
    <div className="topo">
      <div className="badge" style={{background: a.cor}}>{rotuloDe(p)}</div>
      <div className="txt">
        <div className="orig">{p.texto}</div><Meta p={p} />
        {p.exibido && <div className="achado">📍 {p.exibido}</div>}
        <Tag p={p} />
      </div>
    </div>
    <Sugestao p={p} />
    <div className="linha">
      {p.lat != null && <button className="btn peq" onClick={() => A.focar(p.id)}>Ver</button>}
      <button className="btn peq" onClick={() => A.posicionar(p.id)}>{ui.posicionando === p.id ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      <button className="btn peq" onClick={() => A.estouAqui(p)}>📍 Estou aqui</button>
      <button className="btn peq" onClick={() => A.editar(p)}>Editar</button>
      <button className="btn peq" onClick={() => A.remover(p)}>Remover</button>
    </div>
    {sel && <><label>Área</label>
      <select value={p.area} onChange={ev => A.mudar(() => { p.area = ev.target.value; }, true)}>
        {e.areas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select></>}
    {sel && p.candidatos && p.candidatos.length > 1 && <div className="cands"><div className="info" style={{marginTop: 8}}>Outras opções encontradas:</div>
      {p.candidatos.map((c, k) => <button key={k} onClick={() => A.escolherCandidato(p, k)}><Tag p={c} /><br />{c.exibido}</button>)}
    </div>}
  </div>;
}

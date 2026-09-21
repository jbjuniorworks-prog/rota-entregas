import type {ReactNode} from 'react';
import * as A from '../acoes';
import {agruparPorEndereco, blocos, fmtKm, fmtMin, gruposNoMapa, linkMaps, linkMapsVarios, linkWaze, porPerto, trechos} from '../logica/otimizacao';
import {previsoes} from '../logica/previsao';
import {DUVIDA, QUASE} from '../logica/rotulos';
import {mesmoEndereco} from '../logica/texto';
import type {Area, Parada, Ponto, RotaArea} from '../logica/tipos';
import {loja, useLoja} from '../loja';
import {rotuloDe} from '../logica/rotulo';
import {BotaoResetar, hhmm, Meta, Tag} from './comuns';

function ConfigInicio() {
  const {e, ui} = useLoja();
  return <>
    <h2>Ponto de saída</h2>
    <div className="info">{e.inicio && e.inicio.texto
      ? `📍 ${e.inicio.exibido}. Saindo deste endereço, não do GPS.`
      : `📡 Sua localização. É pega na hora de montar a rota${e.inicio ? ` (última: ${e.inicio.exibido})` : ''}.`}</div>
    <div className="linha">
      <button className="btn" onClick={() => A.gps().catch(() => {})}>📡 Onde estou agora</button>
      <button className="btn" onClick={A.saidaPorEndereco}>Sair de outro endereço</button>
      {e.inicio && e.inicio.texto && <button className="btn" onClick={() => A.mudar(() => { e.inicio = null; }, true)}>Usar o GPS</button>}
    </div>
    <label style={{display: 'flex', gap: 8, alignItems: 'center', color: 'var(--tx)'}}>
      <input type="checkbox" id="voltar" checked={!!(e.voltar && !e.fim)} disabled={!!e.fim} style={{width: 20, height: 20}} onChange={ev => A.mudar(() => { e.voltar = ev.target.checked; }, true)} />
      Voltar ao ponto de saída no final
    </label>
    <label style={{display: 'flex', gap: 8, alignItems: 'center', color: 'var(--tx)'}}>
      <input type="checkbox" id="ordemDoApp" checked={!!e.ordemDoApp} style={{width: 20, height: 20}} onChange={ev => A.mudar(() => { e.ordemDoApp = ev.target.checked; }, true)} />
      Seguir a ordem do app de entrega (parada 1, 2, 3…)
    </label>
    <h2>Terminar perto de</h2>
    <div className="info">{e.fim ? `🏁 ${e.fim.exibido}. A última entrega fica o mais perto possível daqui.` : 'Sem ponto final: a rota termina onde for mais curto.'}</div>
    <div className="linha">
      <button className="btn" onClick={A.fimPorEndereco}>Digitar lugar</button>
      <button className="btn" onClick={() => A.posicionar('fim')}>{ui.posicionando === 'fim' ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      {e.fim && <button className="btn" onClick={() => A.mudar(() => { e.fim = null; }, true)}>Tirar</button>}
    </div>
    <label htmlFor="tamTrecho">Paradas por trecho no Google Maps</label>
    <input type="text" inputMode="numeric" id="tamTrecho" defaultValue={e.tamTrecho} style={{maxWidth: 90}}
      onBlur={ev => A.mudar(() => { e.tamTrecho = Math.min(25, Math.max(1, parseInt(ev.target.value, 10) || 9)); })} />
    <div className="info">Se o Maps cortar pontos, diminua este número. Entregas bem próximas contam como 1 ponto.</div>
    <div className="info" style={{marginTop: 8}}>As áreas com horário (“entregar até”) vão primeiro; entre elas, a mais perto.</div>
    <div className="linha"><button className="btn pri" onClick={A.montarRota}>🧭 Montar melhor sequência</button></div>
  </>;
}

function LinhaParada({p, comWaze}: {p: Parada; comWaze: boolean}) {
  const a = loja.area(p.area);
  return <div className={`parada ${p.entregue ? 'feito' : ''}`} data-item={p.id}>
    <div className="badge" style={{background: a.cor}}>{rotuloDe(p)}</div>
    <div className="txt" onClick={() => A.focar(p.id)}>
      <div>{p.texto}</div><Meta p={p} />
      {(DUVIDA.has(p.precisao) || QUASE.has(p.precisao)) && <Tag p={p} />}
      {p.sugestao && !p.entregue && <div className="achado">💡 Outro motorista sugere outro lugar: veja em 2. Conferir</div>}
    </div>
    {comWaze && !p.entregue && <a className="btn peq waze" href={linkWaze(p as Ponto)} target="_blank" rel="noopener" aria-label="Waze">🧭</a>}
    {!p.entregue && !p.adiada && loja.e.rota && <button className="btn peq" aria-label="Deixar para depois" title="Deixar para depois" onClick={() => A.deixarParaDepois(p)}>⏸</button>}
    {p.entregue
      ? <button className="btn peq" aria-label="Desfazer" onClick={() => A.marcarEntregue(p, false)}>↺</button>
      : <button className="btn peq ok" aria-label="Entregue" onClick={() => A.marcarEntregue(p, true)}>✓</button>}
  </div>;
}


function Adiadas() {
  const {e, ui} = useLoja();
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue);
  if (!adiadas.length) return null;
  return <>
    <div className="area-cab"><span className="txt">⏸ Deixadas para depois ({adiadas.length})</span></div>
    <div className="info">Fora da sequência. Arrume a localização com "Marcar no mapa" (a rota de hoje não muda) e toque em "Voltar para a rota" quando quiser.</div>
    {adiadas.map(p => <div className="item" key={p.id} data-item={p.id}>
      <LinhaParada p={p} comWaze />
      <div className="linha">
        <button className="btn peq" onClick={() => A.posicionar(p.id)}>{ui.posicionando === p.id ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      <button className="btn peq" onClick={() => A.estouAqui(p)}>📍 Estou aqui</button>
        <button className="btn peq pri" onClick={() => A.voltarParaARota(p)}>Voltar para a rota</button>
      </div>
    </div>)}
  </>;
}

export function TelaRota() {
  const {e} = useLoja();
  if (!e.rota) {
    const semLocal = e.paradas.filter(p => p.lat == null && !p.entregue).length;
    return <><ConfigInicio />{semLocal > 0 && <div className="aviso">{semLocal} parada(s) sem local ficarão fora da rota. Corrija em <b>2. Conferir</b>.</div>}<Adiadas /><BotaoResetar /></>;
  }
  const R = e.rota;
  const naRota = new Set(R.areas.flatMap(a => a.ordem));
  const foraDaRota = e.paradas.filter(p => !p.entregue && !p.adiada && p.lat != null && !naRota.has(p.id)).length;
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue);
  const semLocal = e.paradas.filter(p => !p.entregue && p.lat == null).length;
  const prev = previsoes(e);
  const ultima = R.areas[R.areas.length - 1];
  const trechosDe = (ra: RotaArea) => trechos(ra.ordem, loja.parada, e.tamTrecho, ra === ultima ? e.fim : null);

  let agora: {ra: RotaArea; b: string[]} | null = null;
  for (const ra of R.areas) {
    for (const b of blocos(ra.ordem, loja.parada)) if (b.some(id => !loja.parada(id)!.entregue)) { agora = {ra, b}; break; }
    if (agora) break;
  }

  const avisoPrazo = (a: Area) => {
    const pa = prev && prev.porArea[a.id];
    if (!pa) return null;
    const ritmo = `${Math.round(prev!.ritmo.segundos / 60)} min por parada, ${prev!.ritmo.medido ? 'seu ritmo de hoje' : 'estimado'}`;
    if (pa.estoura) return <div className="aviso" style={{background: '#fee2e2', borderColor: '#fca5a5'}}><b>⚠ Você não fecha esta área no prazo.</b><br />
      Previsão de terminar: <b>{hhmm(pa.fim)}</b>, e o prazo é <b>{a.prazo}</b>. ({ritmo})</div>;
    return <div className="info">Previsão de terminar a área: <b>{hhmm(pa.fim)}</b>{a.prazo ? ` · prazo ${a.prazo} ✓` : ''} ({ritmo})</div>;
  };

  let proxima: ReactNode;
  if (agora) {
    const a = loja.area(agora.ra.id);
    const todasArea = agora.ra.ordem.map(loja.parada).filter((p): p is Parada => !!p);
    const pend = agora.b.map(loja.parada).filter((p): p is Parada => !!p && !p.entregue);
    const alvo = pend[0];
    const trechoAtual = trechosDe(agora.ra)[0] || [];
    const vizinhas = porPerto(e.paradas, alvo as Ponto, agora.b);
    const grupoAqui = gruposNoMapa(pend)[0];
    const pacotesAqui = grupoAqui ? grupoAqui.pacotes : 0;
    const enderecosAqui = grupoAqui ? grupoAqui.enderecos : 0;
    const entregasTrecho = trechoAtual.reduce((n, x) => n + x.ids.filter(i => !loja.parada(i)!.entregue).length, 0);
    proxima = <div className="proxima" style={{borderColor: a.cor}}>
      <div className="info" style={{display: 'flex', gap: 6, alignItems: 'center', '--c': a.cor} as any}><span className="dot" />
        Área <b>{a.nome}</b>{a.prazo ? ' · até ' + a.prazo : ''} · {todasArea.filter(p => p.entregue).length}/{todasArea.length} entregues</div>
      {avisoPrazo(a)}
      <div className="grande">{pend.length > 1 ? `${pend.length} entregas ${mesmoEndereco(agora.b.map(id => loja.parada(id)!.texto)) ? 'no mesmo endereço' : 'aqui perto'}` : 'Próxima entrega'}</div>
      {pacotesAqui > 1 && <div className="aviso" style={{margin: '4px 0'}}>📦 <b>{pacotesAqui} pacotes</b> para deixar nesta parada{enderecosAqui > 1 ? `, em ${enderecosAqui} endereços diferentes` : ''}. Confira se pegou todos.</div>}
      <div className="achado">📍 {alvo.exibido || alvo.texto}</div>
      {QUASE.has(alvo.precisao) && <div className="aviso laranja">🟠 Este é o ponto mais perto que achamos: a rua está certa, o número é aproximado. Confira o número na porta.</div>}
      <div className="info" style={{marginTop: 4}}>Chegou e o pino está errado? <button className="btn peq" onClick={() => A.estouAqui(alvo)}>📍 Estou aqui</button></div>
      {vizinhas.length > 0 && <div className="aviso" style={{margin: '4px 0'}}>🚶 Aqui perto, fora desta parada: {vizinhas.slice(0, 3).map(v =>
        <span key={v.p.id}> <b onClick={() => A.focar(v.p.id)}>{v.p.ml ? `#${v.p.ml} ` : ''}{v.p.texto.split(',').slice(0, 2).join(',')}</b> (~{Math.round(v.distancia)} m){v.p.unidades ? ` · ${v.p.unidades} pacotes` : ''};</span>)}
        {vizinhas.length > 3 ? ` e mais ${vizinhas.length - 3}.` : ''}</div>}
      <div className="linha">
        <a className="btn waze" href={linkWaze(alvo as Ponto)} target="_blank" rel="noopener">Waze</a>
        <a className="btn pri" href={linkMaps(alvo as Ponto)} target="_blank" rel="noopener">Google Maps</a>
      </div>
      {trechoAtual.length > 1 && <div className="linha"><a className="btn pri" href={linkMapsVarios(trechoAtual.map(x => x.alvo))} target="_blank" rel="noopener">
        🗺️ Maps com os próximos {trechoAtual.filter(x => x.ids.length).length} pontos ({entregasTrecho} entregas){trechoAtual.some(x => !x.ids.length) ? ' + 🏁' : ''}</a></div>}
      <div style={{marginTop: 8}}>{agruparPorEndereco(agora.b.map(loja.parada).filter((p): p is Parada => !!p)).map((g, i, todos) => <div key={g.chave}>
        {todos.length > 1 && <div className="info" style={{marginTop: i ? 10 : 0, fontWeight: 600}}>📍 {g.titulo} · {g.pacotes} pacote(s) aqui</div>}
        {g.ps.map(p => <LinhaParada key={p.id} p={p} comWaze={pend.length > 1} />)}
      </div>)}</div>
      {pend.length > 1 && <div className="linha"><button className="btn ok" onClick={() => A.entregarTodas(pend)}>✓ Entreguei as {pend.length} daqui</button></div>}
      {pend.length > 1 && <div className="info" style={{marginTop: 6}}>Chegando, use o mapa do app de entregas para achar a porta de cada uma.</div>}
    </div>;
  } else {
    proxima = <div className="proxima"><div className="grande">{adiadas.length
      ? `✓ Sequência concluída. Falta(m) ${adiadas.length} deixada(s) para depois, no fim da tela.`
      : '🎉 Todas as entregas da rota foram feitas!'}</div></div>;
  }

  const economia = R.mlDist - R.dist;
  return <>
    {proxima}
    <div className="info">Total estimado: <b>{fmtKm(R.dist)}</b>, cerca de <b>{fmtMin(R.dur)}</b> dirigindo (sem contar as paradas){R.porRuas ? '' : ', aproximado'}.</div>
    {R.ordemDoApp
      ? <div className="info" style={{marginTop: 4}}>Você pediu a ordem do app (parada 1, 2, 3…).{R.melhorDist != null && R.dist - R.melhorDist > 200
        ? <> A melhor sequência faria <b>{fmtKm(R.melhorDist)}</b>, {fmtMin(R.melhorDur!)} — <b>{fmtKm(R.dist - R.melhorDist)}</b> a menos. Desmarque a opção para usá-la.</>
        : ' A melhor sequência não faria diferença hoje.'}</div>
      : R.mlDist > 0 && <div className="info" style={{marginTop: 4}}>Na ordem da lista do app: {fmtKm(R.mlDist)}, {fmtMin(R.mlDur)}. {economia > 200
        ? <b style={{color: 'var(--ok)'}}>Esta rota economiza {fmtKm(economia)}.</b> : 'A ordem do app já estava boa.'}</div>}
    {semLocal > 0 && <div className="aviso">{semLocal} parada(s) não encontrada(s) ficaram fora da rota. Corrija em <b>2. Conferir</b>.</div>}
    {foraDaRota > 0 && <div className="aviso">{foraDaRota} parada(s) nova(s) ou corrigida(s) fora da rota. <button className="btn peq pri" onClick={A.montarRota}>Refazer rota</button></div>}
    <div className="linha"><button className="btn" onClick={A.copiarRota}>📋 Copiar rota (WhatsApp)</button>
      {e.areasManual && <button className="btn" onClick={() => { e.areasManual = false; A.montarRota(); }}>Ordem automática das áreas</button>}</div>
    {R.areas.map((ra, i) => {
      const a = loja.area(ra.id);
      const ps = ra.ordem.map(loja.parada).filter((p): p is Parada => !!p);
      const feitas = ps.filter(p => p.entregue).length;
      const pa = prev && prev.porArea[a.id];
      let n = 0;
      return <div key={ra.id}>
        <div className="area-cab" style={{'--c': a.cor} as any}>
          <span className="dot" />
          <span className="txt">{i + 1}. {a.nome}{a.prazo ? ' · até ' + a.prazo : ''}</span>
          <span className="info">{feitas}/{ps.length}</span>
          {pa && <span className="info" style={{color: pa.estoura ? 'var(--bad)' : 'var(--mut)'}}>{pa.estoura ? '⚠ ' : '~'}{hhmm(pa.fim)}</span>}
          <button className="btn peq" disabled={i === 0} aria-label="Subir área" onClick={() => A.moverArea(a.id, -1)}>▲</button>
          <button className="btn peq" disabled={i === R.areas.length - 1} aria-label="Descer área" onClick={() => A.moverArea(a.id, 1)}>▼</button>
        </div>
        {feitas === ps.length ? <div className="info">✓ Área concluída.</div> : <>
          <div className="info">{fmtKm(ra.dist)} · {fmtMin(ra.dur)}</div>
          <div className="linha">{trechosDe(ra).map((t, k) => {
            const ini = n + 1;
            n += t.filter(x => x.ids.length).length;
            return <a key={k} className="btn peq pri" href={linkMapsVarios(t.map(x => x.alvo))} target="_blank" rel="noopener">Maps trecho {k + 1} (pontos {ini}–{n})</a>;
          })}</div>
          {blocos(ra.ordem, loja.parada).map((b, k) => {
            const bp = b.map(loja.parada).filter((p): p is Parada => !!p);
            const pend = bp.filter(p => !p.entregue);
            const perna = e.pernas[b[0]];
            return <div className="item" key={b[0]}>
              <div className="bloco-cab">
                <span style={{flex: 1}}>Parada {k + 1}{b.length > 1 ? ` · ${b.length} entregas ${mesmoEndereco(bp.map(p => p.texto)) ? 'no mesmo endereço' : 'perto'}` : ''}{perna && perna.dur ? ` · 🚗 ${fmtMin(perna.dur)}` : ''}</span>
                {pend.length ? <>
                  {pend.length > 1 && <button className="btn peq ok" onClick={() => A.entregarTodas(pend)}>✓ todas</button>}
                  <a className="btn peq waze" href={linkWaze(pend[0] as Ponto)} target="_blank" rel="noopener">Waze</a>
                </> : '✓'}
              </div>
              {agruparPorEndereco(bp).map((g, i, todos) => <div key={g.chave}>
                {todos.length > 1 && <div className="info" style={{marginTop: i ? 8 : 4, fontWeight: 600}}>📍 {g.titulo} · {g.pacotes} pacote(s)</div>}
                {g.ps.map(p => <LinhaParada key={p.id} p={p} comWaze={false} />)}
              </div>)}
            </div>;
          })}
        </>}
      </div>;
    })}
    <Adiadas />
    <details><summary>Ponto de saída / refazer rota</summary><ConfigInicio /></details>
    <BotaoResetar />
  </>;
}

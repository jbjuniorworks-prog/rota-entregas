import * as A from '../acoes';
import {CORES} from '../logica/rotulos';
import {loja, useLoja} from '../loja';
import {Cabecalho} from './comuns';

// O que se ajusta uma vez e se esquece: ficava no meio da aba Rota, entre o cartão e a lista.
export function TelaSaida() {
  const {e} = useLoja();
  return <>
    <Cabecalho titulo="Ponto de saída e de chegada" />
    <div className="corpo">
      <h2>Saindo de</h2>
      <div className="info">{e.inicio && e.inicio.texto
        ? `${e.inicio.exibido}. Saindo deste endereço, não do GPS.`
        : `Sua localização, pega na hora de montar a rota${e.inicio ? ` (última: ${e.inicio.exibido})` : ''}.`}</div>
      <div className="linha">
        <button className="btn" onClick={() => A.gps().catch(() => {})}>Onde estou agora</button>
        <button className="btn" onClick={A.saidaPorEndereco}>Sair de outro endereço</button>
        {e.inicio && e.inicio.texto && <button className="btn" onClick={() => A.mudar(() => { e.inicio = null; }, true)}>Usar o GPS</button>}
      </div>
      <label className="marcar">
        <input type="checkbox" id="voltar" checked={!!(e.voltar && !e.fim)} disabled={!!e.fim} onChange={ev => A.mudar(() => { e.voltar = ev.target.checked; }, true)} />
        Voltar ao ponto de saída no final
      </label>
      <label className="marcar">
        <input type="checkbox" id="ordemDoApp" checked={!!e.ordemDoApp} onChange={ev => A.mudar(() => { e.ordemDoApp = ev.target.checked; }, true)} />
        Seguir a ordem do app de entrega (parada 1, 2, 3…)
      </label>
      <h2>Terminar perto de</h2>
      <div className="info">{e.fim ? `${e.fim.exibido}. A última entrega fica o mais perto possível daqui.` : 'Sem ponto final: a rota termina onde for mais curto.'}</div>
      <div className="linha">
        <button className="btn" onClick={A.fimPorEndereco}>Digitar lugar</button>
        <button className="btn" onClick={() => A.posicionar('fim')}>Marcar no mapa</button>
        {e.fim && <button className="btn" onClick={() => A.mudar(() => { e.fim = null; }, true)}>Tirar</button>}
      </div>
      <label htmlFor="tamTrecho">Paradas por trecho no Google Maps</label>
      <input type="text" inputMode="numeric" id="tamTrecho" defaultValue={e.tamTrecho} style={{maxWidth: 90}}
        onBlur={ev => A.mudar(() => { e.tamTrecho = Math.min(25, Math.max(1, parseInt(ev.target.value, 10) || 9)); })} />
      <div className="info">Se o Maps cortar pontos, diminua este número.</div>
      {e.paradas.length > 0 && <div className="linha"><button className="btn pri" onClick={A.montarRota}>{e.rota ? 'Refazer a rota' : 'Montar a rota'}</button></div>}
    </div>
  </>;
}

export function TelaAreas() {
  const {e} = useLoja();
  const a = loja.area(e.areaAtual);
  return <>
    <Cabecalho titulo="Áreas e horários" sub="Uma cor por área, como no app de entregas" />
    <div className="corpo">
      <label htmlFor="cidadeAreas">Cidade padrão</label>
      <input type="text" id="cidadeAreas" placeholder="Ex.: Aracaju, SE" defaultValue={e.cidade} onChange={ev => A.mudar(() => { e.cidade = ev.target.value.trim(); e.regiao = null; })} />
      <label>Área dos próximos endereços</label>
      <div className="chips">
        {e.areas.map(x => <button key={x.id} className={`chip ${x.id === a.id ? 'on' : ''}`} style={{'--c': x.cor} as any} onClick={() => A.mudar(() => { e.areaAtual = x.id; })}>
          <span className="dot" />{x.nome}{x.prazo ? ' · até ' + x.prazo : ''} <small>({e.paradas.filter(p => p.area === x.id).length})</small>
        </button>)}
        <button className="chip" onClick={A.novaArea}>+ Nova área</button>
      </div>
      <div className="item">
        <div className="linha">
          {CORES.map(([nome, cor]) => <button key={cor} className={`cor ${a.cor === cor ? 'on' : ''}`} style={{'--c': cor} as any} aria-label={nome} onClick={() => A.corDaArea(cor, nome)} />)}
        </div>
        <div className="dois">
          <div><label htmlFor="aNome">Nome</label><input type="text" id="aNome" key={a.id + 'n'} defaultValue={a.nome} onBlur={ev => A.mudar(() => { a.nome = ev.target.value.trim() || 'Área'; })} /></div>
          <div><label htmlFor="aPrazo">Entregar até</label><input type="time" id="aPrazo" key={a.id + 'p'} defaultValue={a.prazo} onChange={ev => A.mudar(() => { a.prazo = ev.target.value; }, true)} /></div>
        </div>
        {e.areas.length > 1 && <div className="linha"><button className="btn peq apagar" onClick={A.removerArea}>Apagar esta área</button></div>}
      </div>
      <div className="info">As áreas com horário vão primeiro; entre elas, a mais perto.</div>
      {e.areasManual && e.rota && <div className="linha"><button className="btn" onClick={() => { e.areasManual = false; A.montarRota(); }}>Voltar à ordem automática das áreas</button></div>}
    </div>
  </>;
}

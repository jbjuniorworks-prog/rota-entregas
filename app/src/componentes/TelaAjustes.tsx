import * as A from '../acoes';
import {MAPS_MAX} from '../logica/otimizacao';
import {CORES} from '../logica/rotulos';
import {loja, useLoja} from '../loja';
import {Cabecalho} from './comuns';

// O que se ajusta uma vez e se esquece: ficava no meio da aba Rota, entre o cartão e a lista. A
// saída saiu daqui em 16/10: é sempre onde ele está, e a sequência das entregas foi para o cartão
// de montar a rota e para a lista, onde ele escolhe.
export function TelaSaida() {
  const {e} = useLoja();
  return <>
    <Cabecalho titulo="Ponto de chegada" />
    <div className="corpo">
      <div className="info">A rota sai de onde você está na hora de montar.</div>
      <label className="marcar">
        <input type="checkbox" id="voltar" checked={!!(e.voltar && !e.fim)} disabled={!!e.fim} onChange={ev => A.mudar(() => { e.voltar = ev.target.checked; }, true)} />
        Voltar ao ponto de saída no final
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
        onBlur={ev => A.mudar(() => { e.tamTrecho = Math.min(MAPS_MAX, Math.max(1, parseInt(ev.target.value, 10) || MAPS_MAX)); })} />
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

// O que liga e desliga só neste celular (dono, 28/11: "é bom organizar esse Mais, cheio de coisa").
// Moravam no Mais como "Desligar o som...", "Esconder o guia...": o texto do item trocava a cada
// toque e não dizia como estava. Aqui cada um é uma chave que mostra se está ligado.
export function TelaCelular() {
  useLoja();
  const chave = (dado: string, rotulo: string, sub: string, ligado: boolean, trocar: () => void) =>
    <button className="chave" role="switch" aria-checked={ligado} data-chave={dado} onClick={trocar}>
      <span className="txt"><b>{rotulo}</b><span className="sub">{sub}</span></span>
      <span className="botao-chave" aria-hidden />
    </button>;
  return <>
    <Cabecalho titulo="Ajustes deste celular" sub="Valem só para este celular." />
    <div className="corpo">
      {chave('som', 'Som perto do pino', 'Um toque ao chegar perto de uma entrega.', A.somLigado(), A.trocarSom)}
      {chave('guia', 'Guia das curvas', 'A faixa com a próxima curva, em cima do mapa.', A.guiaLigado(), A.trocarGuia)}
      {chave('giro', 'Mapa gira com o caminho', 'Andando, o caminho fica sempre para cima. Parado ou tocando no mapa, volta o norte.', A.mapaGira(), A.trocarGiro)}
      <button className="item-menu" onClick={() => A.abrir({tela: 'caminho'})}>
        {A.gravandoCaminho() ? 'Teste do caminho (gravando)' : 'Teste do caminho'}</button>
    </div>
  </>;
}

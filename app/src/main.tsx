import {createRoot} from 'react-dom/client';
import {Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode} from 'react';
import './estilo.css';
import * as A from './acoes';
import {TelaConferir} from './componentes/TelaConferir';
import {TelaEnderecos} from './componentes/TelaEnderecos';
import {TelaEntrar} from './componentes/Conta';
import {TelaRota} from './componentes/TelaRota';
import {useLoja, type Aba} from './loja';
import {nuvem} from './servicos/nuvem';

const Mapa = lazy(() => import('./componentes/Mapa'));

// Na Rota o mapa fica embaixo do cartão, e 28% da tela é pouco para se achar. A barra puxa ele
// para cima até onde ele quiser, e a altura fica guardada nessa aba. O botão ⤢ continua para
// quem só quer os três tamanhos.
function BarraDoMapa() {
  const arrastando = useRef(0);
  const comeco = useRef({y: 0, vh: 0});
  const daTela = (px: number) => px / window.innerHeight * 100;
  return <div id="pegaMapa" role="separator" aria-label="Arraste para mudar o tamanho do mapa"
    onPointerDown={ev => {
      arrastando.current = ev.pointerId;
      comeco.current = {y: ev.clientY, vh: A.alturaDoMapa() ?? daTela(document.getElementById('map')?.getBoundingClientRect().height || 0)};
      (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    }}
    onPointerMove={ev => {
      if (arrastando.current !== ev.pointerId) return;
      // o mapa está embaixo: puxar a barra para cima aumenta ele
      A.arrastarMapa(comeco.current.vh + daTela(comeco.current.y - ev.clientY));
    }}
    onPointerUp={ev => { arrastando.current = 0; (ev.target as HTMLElement).releasePointerCapture(ev.pointerId); }}
  ><i /></div>;
}
const TelaAdmin = lazy(() => import('./componentes/Admin').then(m => ({default: m.TelaAdmin})));

class EscudoDoMapa extends Component<{children: ReactNode}, {caiu: boolean}> {
  state = {caiu: false};
  static getDerivedStateFromError() { return {caiu: true}; }
  render() {
    if (!this.state.caiu) return this.props.children;
    return <div className="semmapa">
      <div>Não consegui carregar o mapa. O resto do app funciona: dá para conferir, marcar entregue e abrir no Maps.</div>
      <button className="btn peq" onClick={() => location.reload()}>Tentar de novo</button>
    </div>;
  }
}

function depoisDeAparecer(fazer: () => void) {
  const ocioso = (window as unknown as {requestIdleCallback?: (f: () => void, o?: {timeout: number}) => void}).requestIdleCallback;
  if (ocioso) ocioso(fazer, {timeout: 3000});
  else setTimeout(fazer, 300);
}

const ABAS: [Aba, string][] = [['enderecos', '1. Endereços'], ['conferir', '2. Conferir'], ['rota', '3. Rota']];

function App() {
  const {ui} = useLoja();
  const conteudo = useRef<HTMLDivElement>(null);
  const rolagem = useRef<Record<string, number>>({});
  const abaAnterior = useRef(ui.aba);
  const [comMapa, setComMapa] = useState(false);
  // Em tela larga o mapa fica ao lado do painel e não custa altura nenhuma — e lá o botão ⤢ Mapa
  // nem existe. Recolher só faz sentido no celular; no computador ele fica sempre.
  const [largo, setLargo] = useState(() => matchMedia('(min-width:900px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width:900px)'), ouvir = () => setLargo(mq.matches);
    mq.addEventListener('change', ouvir);
    return () => mq.removeEventListener('change', ouvir);
  }, []);
  useEffect(() => { A.iniciar(); }, []);
  useEffect(() => {
    depoisDeAparecer(() => setComMapa(true));
    depoisDeAparecer(() => { import('xlsx').catch(() => {}); });
  }, []);
  useEffect(() => {
    const c = conteudo.current;
    if (!c) return;
    if (abaAnterior.current !== ui.aba) {
      c.scrollTop = rolagem.current[ui.aba] || 0;
      abaAnterior.current = ui.aba;
    }
  }, [ui.aba]);
  const pf = nuvem.perfil;
  if ((!nuvem.sessao && !nuvem.lembrada) || (nuvem.sessao && pf && !pf.ativo)) return <>
    <TelaEntrar />
    <div id="status" className={'flutua' + (ui.aviso ? ' on' : '')}>{ui.aviso}</div>
  </>;
  const abas: [Aba, string][] = pf?.papel === 'admin' ? [...ABAS, ['admin', '⚙️ Admin']] : ABAS;
  const escolhido = A.tamanhoDoMapa();
  const tamanhoMapa = largo && escolhido === 'fechado' ? 'normal' : escolhido;
  const altura = largo ? null : A.alturaDoMapa();
  const comBarra = !largo && ui.aba === 'rota' && tamanhoMapa !== 'fechado';
  return <>
    <div id="app" className={`mapa-${tamanhoMapa}${ui.aba === 'rota' ? ' mapa-embaixo' : ''}`}
      style={altura ? ({'--mapa-h': altura + 'vh'} as React.CSSProperties) : undefined}>
      <div className="mapwrap">
        {comBarra && <BarraDoMapa />}
        {/* fechado é não desenhar, não desenhar com altura zero: senão o mapa e o aviso de falha
            ficam no DOM meio visíveis, e o Leaflet trabalha à toa numa aba que não o usa */}
        {tamanhoMapa !== 'fechado'
          && <EscudoDoMapa><Suspense fallback={null}>{comMapa && <Mapa />}</Suspense></EscudoDoMapa>}
        <button id="btnMapa" className="btn peq" onClick={A.alternarMapa}
          title="Toque para fechar, voltar ao normal ou ampliar o mapa desta aba">⤢ Mapa</button>
        {ui.aba === 'rota' && tamanhoMapa !== 'fechado'
          && <button id="btnEu" className="btn peq" onClick={A.centralizarEmMim} title="Centralizar onde você está">◎</button>}
      </div>
      <div id="painel">
        <nav>{abas.map(([id, nome]) => <button key={id} className={ui.aba === id ? 'on' : ''} onClick={() => A.irPara(id)}>{nome}</button>)}</nav>
        <div id="status" className={ui.aviso ? 'on' : ''}>{ui.aviso}
          {ui.desfazer && <> <button className="btn peq" style={{marginLeft: 8}} onClick={ui.desfazer}>↺ Desfazer</button></>}</div>
        <div id="conteudo" ref={conteudo} onScroll={ev => { rolagem.current[ui.aba] = (ev.target as HTMLDivElement).scrollTop; }}>
          {ui.aba === 'enderecos' && <TelaEnderecos />}
          {ui.aba === 'conferir' && <TelaConferir />}
          {ui.aba === 'rota' && <TelaRota />}
          {ui.aba === 'admin' && <Suspense fallback={<div className="info">Abrindo…</div>}><TelaAdmin /></Suspense>}
        </div>
      </div>
    </div>
  </>;
}

createRoot(document.getElementById('raiz')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});

import {createRoot} from 'react-dom/client';
import {lazy, Suspense, useEffect, useRef, useState} from 'react';
import './estilo.css';
import * as A from './acoes';
import {TelaAdmin} from './componentes/Admin';
import {TelaConferir} from './componentes/TelaConferir';
import {TelaEnderecos} from './componentes/TelaEnderecos';
import {TelaEntrar} from './componentes/Conta';
import {TelaRota} from './componentes/TelaRota';
import {useLoja, type Aba} from './loja';
import {nuvem} from './servicos/nuvem';

const Mapa = lazy(() => import('./componentes/Mapa'));

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
    <div id="status" className={ui.aviso ? 'on' : ''}>{ui.aviso}</div>
  </>;
  const abas: [Aba, string][] = pf?.papel === 'admin' ? [...ABAS, ['admin', '⚙️ Admin']] : ABAS;
  return <>
    <div id="app" className={ui.mapaGrande ? 'mapa-grande' : ''}>
      <div className="mapwrap">
        <Suspense fallback={null}>{comMapa && <Mapa />}</Suspense>
        <button id="btnMapa" className="btn peq" onClick={() => A.mudar(() => { ui.mapaGrande = !ui.mapaGrande; })}>⤢ Mapa</button>
      </div>
      <div id="painel">
        <nav>{abas.map(([id, nome]) => <button key={id} className={ui.aba === id ? 'on' : ''} onClick={() => A.irPara(id)}>{nome}</button>)}</nav>
        <div id="conteudo" ref={conteudo} onScroll={ev => { rolagem.current[ui.aba] = (ev.target as HTMLDivElement).scrollTop; }}>
          {ui.aba === 'enderecos' && <TelaEnderecos />}
          {ui.aba === 'conferir' && <TelaConferir />}
          {ui.aba === 'rota' && <TelaRota />}
          {ui.aba === 'admin' && <TelaAdmin />}
        </div>
      </div>
    </div>
    <div id="status" className={ui.aviso ? 'on' : ''}>{ui.aviso}
      {ui.desfazer && <> <button className="btn peq" style={{marginLeft: 8}} onClick={ui.desfazer}>↺ Desfazer</button></>}</div>
  </>;
}

createRoot(document.getElementById('raiz')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});

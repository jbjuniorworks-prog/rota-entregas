import {createRoot} from 'react-dom/client';
import {useEffect, useRef} from 'react';
import './estilo.css';
import * as A from './acoes';
import {Mapa} from './componentes/Mapa';
import {TelaConferir, TelaEnderecos, TelaRota} from './componentes/Telas';
import {useLoja, type Aba} from './loja';

const ABAS: [Aba, string][] = [['enderecos', '1. Endereços'], ['conferir', '2. Conferir'], ['rota', '3. Rota']];

function App() {
  const {ui} = useLoja();
  const conteudo = useRef<HTMLDivElement>(null);
  const rolagem = useRef<Record<string, number>>({});
  const abaAnterior = useRef(ui.aba);
  useEffect(() => { A.iniciar(); }, []);
  useEffect(() => {
    const c = conteudo.current!;
    if (abaAnterior.current !== ui.aba) {
      c.scrollTop = rolagem.current[ui.aba] || 0;
      abaAnterior.current = ui.aba;
    }
  }, [ui.aba]);
  return <>
    <div id="app" className={ui.mapaGrande ? 'mapa-grande' : ''}>
      <div className="mapwrap">
        <Mapa />
        <button id="btnMapa" className="btn peq" onClick={() => A.mudar(() => { ui.mapaGrande = !ui.mapaGrande; })}>⤢ Mapa</button>
      </div>
      <div id="painel">
        <nav>{ABAS.map(([id, nome]) => <button key={id} className={ui.aba === id ? 'on' : ''} onClick={() => A.irPara(id)}>{nome}</button>)}</nav>
        <div id="conteudo" ref={conteudo} onScroll={ev => { rolagem.current[ui.aba] = (ev.target as HTMLDivElement).scrollTop; }}>
          {ui.aba === 'enderecos' && <TelaEnderecos />}
          {ui.aba === 'conferir' && <TelaConferir />}
          {ui.aba === 'rota' && <TelaRota />}
        </div>
      </div>
    </div>
    <div id="status" className={ui.aviso ? 'on' : ''}>{ui.aviso}
      {ui.desfazer && <> <button className="btn peq" style={{marginLeft: 8}} onClick={ui.desfazer}>↺ Desfazer</button></>}</div>
  </>;
}

createRoot(document.getElementById('raiz')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});

import {createRoot} from 'react-dom/client';
import {Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode} from 'react';
import './estilo.css';
import * as A from './acoes';
import {Cabecalho} from './componentes/comuns';
import {TelaEntrar} from './componentes/Conta';
import {MenuMais} from './componentes/MenuMais';
import {TelaAreas, TelaSaida} from './componentes/TelaAjustes';
import {TelaConferir} from './componentes/TelaConferir';
import {TelaInicio} from './componentes/TelaInicio';
import {FolhaRota, SobreOMapa, TopoRota} from './componentes/TelaRota';
import {loja, useLoja} from './loja';
import {rotuloDe} from './logica/rotulo';
import {nuvem} from './servicos/nuvem';

const Mapa = lazy(() => import('./componentes/Mapa'));
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

// Diz qual pino o próximo toque no mapa vai mudar, até ele tocar ou cancelar.
function Armado({alvo}: {alvo: string}) {
  const p = alvo === 'fim' ? null : loja.parada(alvo);
  return <div className="armado" data-armado>
    <span>{p ? `Toque no mapa, no local da entrega ${rotuloDe(p)} · ${p.texto.split(',').slice(0, 2).join(',')}.` : 'Toque no mapa, onde você quer terminar.'}</span>
    <button className="btn peq" onClick={A.pararDePosicionar}>Cancelar</button>
  </div>;
}

function Status() {
  const {ui} = useLoja();
  return <div id="status" className={ui.aviso || ui.posicionando || ui.versaoNova || ui.podeInstalar ? 'on' : ''}>
    {ui.podeInstalar && <div className="instalar" data-instalar>
      <span>Instale o app: fica com ícone na tela inicial, abre em tela cheia, e o Compartilhar do WhatsApp manda os prints direto para cá.</span>
      <span className="botoes"><button className="btn peq pri" onClick={A.instalarApp}>Instalar</button><button className="btn peq" onClick={A.instalarDepois}>Agora não</button></span>
    </div>}
    {ui.versaoNova && <div className="versao-nova" data-versao-nova>
      <span>Versão nova do app, de {ui.versaoNova.quando}. A rota continua como está.</span>
      <button className="btn peq" onClick={() => A.atualizarApp(ui.versaoNova!.id)}>Atualizar</button>
    </div>}
    {ui.posicionando && <Armado alvo={ui.posicionando} />}{ui.aviso}
    {ui.desfazer && <> <button className="btn peq" style={{marginLeft: 8}} onClick={ui.desfazer}>Desfazer</button></>}
  </div>;
}

function App() {
  const {ui} = useLoja();
  const [carregaMapa, setCarregaMapa] = useState(false);
  // Aberto uma vez, o mapa fica montado e só se esconde: desmontando a cada ida à Conferir, ele
  // voltava baixando o mapa de novo, refazendo os 80 pinos e perdendo o zoom que ele tinha dado.
  // E não é baixado antes de alguém precisar dele — o começo do dia, sem rota, não tem mapa.
  const jaTeveMapa = useRef(false);
  useEffect(() => { A.iniciar(); }, []);
  // o mapa vem depois da primeira pintura: abrir o app não espera o Leaflet
  useEffect(() => { depoisDeAparecer(() => setCarregaMapa(true)); }, []);
  const pf = nuvem.perfil;
  if ((!nuvem.sessao && !nuvem.lembrada) || (nuvem.sessao && pf && !pf.ativo)) return <>
    <TelaEntrar />
    <div id="status" className={'flutua' + (ui.aviso ? ' on' : '')}>{ui.aviso}</div>
  </>;
  const comMapa = ui.tela === 'rota' || ui.tela === 'admin';
  if (comMapa) jaTeveMapa.current = true;
  const folha = ui.tela === 'rota' ? ` folha-${ui.pino ? 'pino' : ui.folha}` : '';
  return <div id="app" className={`tela-${ui.tela}${folha}`}>
    <div className="cima">
      {ui.tela === 'rota' && <TopoRota />}
      {ui.tela === 'admin' && <Cabecalho titulo="Admin" />}
      <Status />
    </div>
    {jaTeveMapa.current && <div className="mapwrap" hidden={!comMapa}>
      <EscudoDoMapa><Suspense fallback={null}>{carregaMapa && <Mapa />}</Suspense></EscudoDoMapa>
      {ui.tela === 'rota' && <SobreOMapa />}
    </div>}
    <div id="painel">
      {ui.tela === 'rota' && <FolhaRota />}
      {ui.tela === 'inicio' && <TelaInicio />}
      {ui.tela === 'conferir' && <TelaConferir />}
      {ui.tela === 'saida' && <TelaSaida />}
      {ui.tela === 'areas' && <TelaAreas />}
      {ui.tela === 'admin' && <Suspense fallback={<div className="info">Abrindo…</div>}><TelaAdmin /></Suspense>}
    </div>
    {ui.menu && <MenuMais />}
  </div>;
}

// antes de desenhar: o Chrome pode avisar que dá para instalar logo que a página carrega
A.ouvirInstalacao();
createRoot(document.getElementById('raiz')!).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});

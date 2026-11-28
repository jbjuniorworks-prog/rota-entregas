import {devoRefazer, ENTRE_PEDIDOS_MS, GPS_BOM_M, vigiaNova} from '../logica/desvio';
import {caminhoDaProxima, proximaDaRota} from '../logica/linhaQueFalta';
import {manobraDaVez} from '../logica/manobras';
import {CHAVES} from '../logica/guarda';
import {guarda, loja, ouvirMudancas, status} from '../loja';
import {caminhoComManobras} from '../servicos/ruas';
import {contar, e, ui} from './base';

// O caminho até a próxima, de onde ele está, com as curvas (logica/desvio.ts, logica/manobras.ts).
// Pedido uma vez por parada, quando ela vira a próxima, e de novo quando ele sai da linha. Vale até a
// próxima mudar: entregue ela, o seguinte é pedido.
// O guia das curvas, em cima do mapa (FaixaDaCurva), liga e desliga no Mais, para este celular
// (Pedro, pelo dono, 28/11: "gostaria que desse para ativar e desativar aquele guia por cima do
// mapa"). Desligado, só a faixa some: o caminho até a próxima continua sendo pedido, porque é a
// linha desenhada.
export const guiaLigado = () => guarda.ler<boolean>(CHAVES.guiaDasCurvas, true) !== false;

export function trocarGuia() {
  const ligar = !guiaLigado();
  guarda.gravar(CHAVES.guiaDasCurvas, ligar);
  contar(ligar ? 'guia-ligar' : 'guia-desligar');
  status(ligar ? 'Guia das curvas ligado.' : 'Guia das curvas desligado. Para ligar de novo: Mais.', 4000);
  loja.mudou(false);
}

// O mapa girando com o caminho (Mapa.tsx), também nos Ajustes deste celular, ligado de começo.
export const mapaGira = () => guarda.ler<boolean>(CHAVES.mapaGira, true) !== false;

export function trocarGiro() {
  const ligar = !mapaGira();
  guarda.gravar(CHAVES.mapaGira, ligar);
  contar(ligar ? 'giro-ligar' : 'giro-desligar');
  status(ligar ? 'O mapa gira com o caminho.' : 'O mapa fica com o norte para cima.', 4000);
  loja.mudou(false);
}

let vigia = vigiaNova();
let pedindo = false;
const tentouEm = new Map<string, number>();

function pedir(para: string, de: {lat: number; lng: number}, ate: {lat: number; lng: number}, refeito: boolean) {
  pedindo = true;
  tentouEm.set(para, Date.now());
  void caminhoComManobras([de, ate]).then(r => {
    // sem resposta: pede de novo daqui a 20 s
    if (!r || r.linha.length < 2) return;
    // entregou enquanto esperava: o caminho é para uma que já não é a próxima
    if (caminhoDaProxima(e().rota!, loja.parada)?.id !== para) return;
    ui.desvio = {para, linha: r.linha};
    ui.manobras = {para, lista: r.manobras, passadas: 0};
    vigia = {...vigia, foraDesde: null};
    if (refeito) contar('caminho-refeito');
    loja.mudou(false);
  }).finally(() => {
    pedindo = false;
    // a próxima mudou enquanto esperava: o pedido dela não saiu, porque este estava no meio
    const R = e().rota;
    if (R && proximaDaRota(R, loja.parada) !== para) queueMicrotask(vigiarCaminho);
  });
}

// A próxima mudou (entregou, deixou para depois, a ordem se refez): o caminho com as curvas sai na
// hora. Esperar a próxima leitura do GPS deixava a faixa vazia na porta: parado, o celular pode
// ficar sem mandar leitura nova.
let proximaVista: string | null = null;
export function vigiarAProxima() {
  return ouvirMudancas(() => {
    const id = e().rota ? proximaDaRota(e().rota!, loja.parada) : null;
    if (id === proximaVista) return;
    proximaVista = id;
    queueMicrotask(vigiarCaminho);
  });
}

// Cada leitura do GPS passa por aqui. Só com a Rota na frente: o Admin aberto no computador, longe de
// tudo, pedia um caminho a cada 20 s o dia inteiro.
export function vigiarCaminho() {
  const eu = ui.euAqui, R = e().rota;
  if (!eu || !R || ui.tela !== 'rota' || document.visibilityState !== 'visible') return;
  const c = caminhoDaProxima(R, loja.parada);
  if (ui.desvio && ui.desvio.para !== c?.id) ui.desvio = null;
  if (ui.manobras && ui.manobras.para !== c?.id) ui.manobras = null;
  if (!c) return;
  if (ui.manobras) {
    const v = manobraDaVez(ui.manobras.lista, ui.manobras.passadas, eu);
    if (v && v.passadas !== ui.manobras.passadas) ui.manobras = {...ui.manobras, passadas: v.passadas};
  }
  if (pedindo) return;
  const destino = loja.parada(c.id)!, ate = {lat: destino.lat!, lng: destino.lng!};
  // a próxima mudou: o caminho com as curvas, de onde ele está
  if (!ui.desvio && eu.precisao <= GPS_BOM_M && Date.now() - (tentouEm.get(c.id) ?? -Infinity) >= ENTRE_PEDIDOS_MS) {
    pedir(c.id, eu, ate, false);
    return;
  }
  const r = devoRefazer(ui.desvio ? ui.desvio.linha : c.trecho, eu, ate, vigia);
  vigia = r.vigia;
  if (r.pedir) pedir(c.id, eu, ate, true);
}

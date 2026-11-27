import {devoRefazer, vigiaNova} from '../logica/desvio';
import {caminhoDaProxima} from '../logica/linhaQueFalta';
import {loja} from '../loja';
import {linhaDaRota} from '../servicos/ruas';
import {contar, e, ui} from './base';

// O caminho até a próxima refeito de onde ele está, quando saiu da linha (logica/desvio.ts). Vale até
// a próxima mudar: entregue ela, volta a linha da rota.
let vigia = vigiaNova();
let pedindo = false;

// Cada leitura do GPS passa por aqui. Só com a Rota na frente: o Admin aberto no computador, longe de
// tudo, pedia um caminho a cada 20 s o dia inteiro.
export function vigiarCaminho() {
  const eu = ui.euAqui, R = e().rota;
  if (!eu || !R || ui.tela !== 'rota' || document.visibilityState !== 'visible') return;
  const c = caminhoDaProxima(R, loja.parada);
  if (ui.desvio && ui.desvio.para !== c?.id) ui.desvio = null;
  if (!c || pedindo) return;
  const destino = loja.parada(c.id)!;
  const r = devoRefazer(ui.desvio ? ui.desvio.linha : c.trecho, eu, {lat: destino.lat!, lng: destino.lng!}, vigia);
  vigia = r.vigia;
  if (!r.pedir) return;
  pedindo = true;
  void linhaDaRota([{lat: eu.lat, lng: eu.lng}, {lat: destino.lat!, lng: destino.lng!}]).then(linha => {
    // sem resposta: a vigia pede de novo daqui a 20 s, se ele continuar fora
    if (!linha || linha.length < 2) return;
    // entregou enquanto esperava: o caminho é para uma que já não é a próxima
    if (caminhoDaProxima(e().rota!, loja.parada)?.id !== c.id) return;
    ui.desvio = {para: c.id, linha};
    vigia = {...vigia, foraDesde: null};
    contar('caminho-refeito');
    loja.mudou(false);
  }).finally(() => { pedindo = false; });
}

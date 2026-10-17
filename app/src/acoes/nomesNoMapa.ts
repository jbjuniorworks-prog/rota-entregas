import {nomesNoMapa, ruasDoDia} from '../logica/nomesNoMapa';
import {loja} from '../loja';
import {trechosNoMapa} from '../servicos/base';
import {e, ui} from './base';

let pedido = '';

// O nome da rua no mapa (17/10): uma busca por planilha, não por entrega. Sem rede, ou sem a 023
// rodada, o mapa fica como sempre foi: é um acréscimo, e não vale um aviso.
export async function buscarNomesDasRuas() {
  const chaves = [...ruasDoDia(e().paradas).keys()].sort();
  const assinatura = chaves.join('|');
  if (assinatura === pedido) return;
  if (!chaves.length) { pedido = ''; ui.nomesNoMapa = []; loja.mudou(false); return; }
  if (!navigator.onLine) return;
  pedido = assinatura;
  try {
    const trechos = await trechosNoMapa(chaves);
    // a planilha mudou enquanto a resposta vinha: vale a próxima busca
    if (pedido !== assinatura) return;
    ui.nomesNoMapa = nomesNoMapa(ruasDoDia(e().paradas), trechos);
    loja.mudou(false);
  } catch {
    pedido = '';
  }
}

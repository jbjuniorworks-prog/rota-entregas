import {criarFila} from '../logica/fila';
import {marcarIsoladas} from '../logica/geo';
import {criarMemoria} from '../logica/memoria';
import {guarda, loja} from '../loja';
import {clienteNuvem} from '../servicos/nuvem';

export const e = () => loja.e;
export const ui = loja.ui;

export const fila = criarFila(guarda);
export const memoria = criarMemoria(guarda, () => e().cidade, (chave, lat, lng) => {
  fila.enfileirar({tipo: 'correcao', chave, lat, lng});
  enviarFila();
});

export async function enviarFila() {
  await fila.enviar(clienteNuvem());
  loja.mudou(false);
}

export function invalidarRota() {
  marcarIsoladas(e().paradas);
  e().rota = null;
  e().pernas = {};
}

export function irPara(aba: typeof ui.aba) {
  ui.aba = aba;
  ui.posicionando = null;
  loja.mudou(false);
}

export function mudar(f: () => void, refazer = false) {
  f();
  if (refazer) invalidarRota();
  loja.mudou();
}

import {pinosPerto} from '../logica/aviso';
import {CHAVES} from '../logica/guarda';
import {guarda, loja, status} from '../loja';
import {tocarAviso} from '../servicos/som';
import {e} from './base';

// Ligado de começo; quem não quiser desliga no Mais, e vale para este celular.
export const somLigado = () => guarda.ler<boolean>(CHAVES.somPerto, true) !== false;

export function trocarSom() {
  const ligar = !somLigado();
  guarda.gravar(CHAVES.somPerto, ligar);
  status(ligar ? 'Som perto do pino ligado.' : 'Som perto do pino desligado.', 4000);
  loja.mudou(false);
}

// Uma leitura do GPS: se ela deixou alguma parada por entregar perto, um toque só, por mais que
// sejam. O navegador só manda posição com o app na tela (especificação da localização): com a
// tela apagada ou outro app por cima, não toca.
export function avisarPerto(eu: {lat: number; lng: number; precisao: number}, avisadas: Set<string>) {
  if (!somLigado()) return;
  if (pinosPerto(e().paradas, eu, avisadas).length) tocarAviso();
}

import {pinosPerto} from '../logica/aviso';
import {tocarAviso} from '../servicos/som';
import {e} from './base';

// Uma leitura do GPS: se ela deixou alguma parada por entregar perto, um toque só, por mais que
// sejam. O navegador só manda posição com o app na tela (especificação da localização): com a
// tela apagada ou outro app por cima, não toca.
export function avisarPerto(eu: {lat: number; lng: number; precisao: number}, avisadas: Set<string>) {
  if (pinosPerto(e().paradas, eu, avisadas).length) tocarAviso();
}

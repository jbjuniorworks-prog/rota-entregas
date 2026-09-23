import {criarFila} from '../logica/fila';
import {marcarIsoladas} from '../logica/geo';
import {criarMemoria} from '../logica/memoria';
import {CHAVES} from '../logica/guarda';
import {guarda, loja, type Aba, type TamanhoDoMapa} from '../loja';
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

// Padrão por aba, não um número só para todas. Em Endereços o mapa fica fechado enquanto não
// há o que mostrar, e abre sozinho quando as paradas ganham posição — que é quando ele começa a
// servir, denunciando o endereço que foi parar em outro bairro.
const PADRAO: Record<string, TamanhoDoMapa> = {enderecos: 'fechado', conferir: 'grande', rota: 'normal', admin: 'fechado'};
const VOLTA: TamanhoDoMapa[] = ['fechado', 'normal', 'grande'];

export function tamanhoDoMapa(aba: Aba = ui.aba): TamanhoDoMapa {
  const escolhido = ui.mapa[aba];
  if (escolhido) return escolhido;
  if (aba === 'enderecos' && e().paradas.some(p => p.lat != null)) return 'normal';
  return PADRAO[aba] || 'normal';
}

export function alternarMapa() {
  const agora = tamanhoDoMapa();
  ui.mapa = {...ui.mapa, [ui.aba]: VOLTA[(VOLTA.indexOf(agora) + 1) % VOLTA.length]};
  guarda.gravar(CHAVES.mapa, ui.mapa);
  loja.mudou(false);
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

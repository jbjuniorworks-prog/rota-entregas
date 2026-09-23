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

// Duas coisas diferentes, que viviam na mesma função e custavam a rota do dia ao motorista.
// Mudar a posição de uma parada não tira ela do lugar na sequência: envelhece as estimativas.
// Apagar obriga a refazer, refazer precisa de rede, e sem rede a rota volta em linha reta —
// numa zona morta, arrumar um pino custava a rota boa que ele já tinha na mão.
export function desatualizarRota(mudouMuito = false) {
  marcarIsoladas(e().paradas);
  const r = e().rota;
  if (!r) return;
  r.desatualizada = true;
  if (mudouMuito) r.mudouMuito = true;
}

// Só quando a rota deixa de descrever o dia: parada removida, área apagada, planilha nova, reset.
// (Com um id que não existe mais em `ordem`, a aba Rota não só mente: ela quebra.)
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
  if (refazer) desatualizarRota();
  loja.mudou();
}

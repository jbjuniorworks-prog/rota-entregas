import {criarFila} from '../logica/fila';
import {marcarIsoladas} from '../logica/geo';
import {criarMemoria} from '../logica/memoria';
import {criarUso} from '../logica/uso';
import {guarda, loja} from '../loja';
import {clienteNuvem} from '../servicos/nuvem';

export const e = () => loja.e;
export const ui = loja.ui;

export const fila = criarFila(guarda);
export const memoria = criarMemoria(guarda, () => e().cidade, (chave, lat, lng) => {
  fila.enfileirar({tipo: 'correcao', chave, lat, lng});
  enviarFila();
});

// Quanto a porta de uma entrega espera antes de ir para a nuvem. O toque errado costuma ser notado
// na parada seguinte, e desfeito pela lista: o aviso de 10 s não basta. Esperar não custa nada aos
// outros, que só leem as portas ao carregar a rota ou entrar na conta.
export const ESPERA_DA_PORTA = 10 * 60_000;
let liberacao: ReturnType<typeof setTimeout> | undefined;

export async function enviarFila() {
  const proxima = fila.liberar(Date.now());
  clearTimeout(liberacao);
  if (proxima != null) liberacao = setTimeout(enviarFila, Math.max(0, proxima - Date.now()) + 100);
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
export const uso = criarUso(guarda);

// Quais botões do cartão o motorista usa, e qual vem depois de qual. Vai na mesma fila offline,
// sem forçar envio: é medição nossa, não trabalho dele — pode esperar o próximo envio.
export function contar(botao: string) {
  const r = uso.registrar(botao);
  fila.contarUso(r.dia, r.linhas);
}

export function invalidarRota() {
  marcarIsoladas(e().paradas);
  e().rota = null;
  e().pernas = {};
}

export function mudar(f: () => void, refazer = false) {
  f();
  if (refazer) desatualizarRota();
  loja.mudou();
}

import {loja} from '../loja';
import {contar, ui} from './base';

// O app já podia ser instalado (manifesto, ícone, funciona sem sinal), mas eles abriam numa aba do
// Chrome: com a barra do navegador, sem ícone, e sem o Compartilhar do celular, que só manda
// arquivo para app instalado. O Chrome avisa por este evento que dá para instalar; o botão é nosso.
type PedidoDeInstalar = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: string}>};

const ADIADO = 'rota-entregas-instalar-adiado';
const UMA_SEMANA = 7 * 86400000;
let pedido: PedidoDeInstalar | null = null;

export function ouvirInstalacao() {
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    pedido = ev as PedidoDeInstalar;
    let adiado = 0;
    try { adiado = +(localStorage.getItem(ADIADO) || 0); } catch {}
    ui.podeInstalar = Date.now() - adiado > UMA_SEMANA;
    loja.mudou(false);
  });
  // quem instala aparece no Admin, em Uso dos botões
  window.addEventListener('appinstalled', () => {
    pedido = null;
    ui.podeInstalar = false;
    contar('instalado');
    loja.mudou(false);
  });
}

export async function instalarApp() {
  if (!pedido) return;
  const p = pedido;
  pedido = null;
  contar('instalar');
  ui.podeInstalar = false;
  loja.mudou(false);
  try { await p.prompt(); await p.userChoice; } catch {}
}

export function instalarDepois() {
  try { localStorage.setItem(ADIADO, String(Date.now())); } catch {}
  ui.podeInstalar = false;
  loja.mudou(false);
}

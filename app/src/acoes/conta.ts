import {loja, status} from '../loja';
import {usarRegiao} from '../servicos/geocodificacao';
import {entrar as entrarNaNuvem, iniciarNuvem, nuvem, sair as sairDaNuvem} from '../servicos/nuvem';
import {e, enviarFila, ui} from './base';
import {processarCompartilhado} from './enderecos';
import {avisoCompartilhadas, consultarCompartilhadas} from './posicoes';

// Pedido de 28/09: um motorista mexendo numa porta confirmada tem de chegar no dono sem ele ir
// procurar. Sem servidor de notificação, o aviso é o número na aba ⚙️ Admin, conferido quando o
// app abre e quando ele volta para o app. Só roda para quem administra, e o código do Admin só
// é baixado por ele — o celular dos motoristas não carrega nada disto.
const DE_NOVO = 120000;
let consultado = 0;

export async function verPendenciasDoAdmin(forcar = false) {
  if (nuvem.perfil?.papel !== 'admin' || !navigator.onLine) return;
  if (!forcar && Date.now() - consultado < DE_NOVO) return;
  consultado = Date.now();
  try {
    const [{listarCorrecoes}, {triar}] = await Promise.all([import('../servicos/admin'), import('../logica/triagem')]);
    ui.esperandoAdmin = triar(await listarCorrecoes(), Date.now(), null).decidir.length;
    loja.mudou(false);
  } catch {
    // sem rede ou sem resposta: o número fica como estava, e a próxima volta ao app tenta de novo
    consultado = 0;
  }
}

export async function iniciar() {
  usarRegiao(e().regiao || null);
  await iniciarNuvem();
  loja.mudou(false);
  enviarFila();
  window.addEventListener('online', enviarFila);
  setInterval(enviarFila, 60000);
  if (new URLSearchParams(location.search).has('compartilhado')) processarCompartilhado();
  verPendenciasDoAdmin(true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verPendenciasDoAdmin(); });
}

export async function entrar(email: string, senha: string) {
  status('Entrando…');
  const msg = await entrarNaNuvem(email, senha);
  loja.mudou(false);
  status(msg + avisoCompartilhadas(await consultarCompartilhadas()), 8000);
  enviarFila();
  verPendenciasDoAdmin(true);
}

export async function sair() {
  if (!confirm('Sair da conta? Para usar o app de novo, vai precisar do e-mail e da senha. O que ainda não foi enviado fica guardado neste celular.')) return;
  await sairDaNuvem();
  if (ui.aba === 'admin') ui.aba = 'enderecos';
  loja.mudou(false);
}

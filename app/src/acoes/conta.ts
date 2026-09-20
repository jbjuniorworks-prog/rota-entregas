import {loja, status} from '../loja';
import {usarRegiao} from '../servicos/geocodificacao';
import {entrar as entrarNaNuvem, iniciarNuvem, sair as sairDaNuvem} from '../servicos/nuvem';
import {e, enviarFila, ui} from './base';
import {processarCompartilhado} from './enderecos';
import {avisoCompartilhadas, consultarCompartilhadas} from './posicoes';

export async function iniciar() {
  usarRegiao(e().regiao || null);
  await iniciarNuvem();
  loja.mudou(false);
  enviarFila();
  window.addEventListener('online', enviarFila);
  setInterval(enviarFila, 60000);
  if (new URLSearchParams(location.search).has('compartilhado')) processarCompartilhado();
}

export async function entrar(email: string, senha: string) {
  status('Entrando…');
  const msg = await entrarNaNuvem(email, senha);
  loja.mudou(false);
  status(msg + avisoCompartilhadas(await consultarCompartilhadas()), 8000);
  enviarFila();
}

export async function sair() {
  if (!confirm('Sair da conta? Para usar o app de novo, vai precisar do e-mail e da senha. O que ainda não foi enviado fica guardado neste celular.')) return;
  await sairDaNuvem();
  if (ui.aba === 'admin') ui.aba = 'enderecos';
  loja.mudou(false);
}

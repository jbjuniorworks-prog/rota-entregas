import {carregarEstado, trocarDeConta} from '../logica/guarda';
import {guarda, loja, status} from '../loja';
import {usarRegiao} from '../servicos/geocodificacao';
import {entrar as entrarNaNuvem, iniciarNuvem, nuvem, sair as sairDaNuvem} from '../servicos/nuvem';
import {e, enviarFila, fila, ui} from './base';
import {iniciarNavegacao, irPara, telaBase} from './navegacao';
import {buscarDeNovoOsNomesTortos, conferirComOCensoAoAbrir, processarCompartilhado} from './enderecos';
import {avisoCompartilhadas, consultarCompartilhadas, verPinosNovos} from './posicoes';
import {saiuDaTela, verVersao} from './versao';

// Pedido de 28/09: um motorista mexendo numa porta confirmada tem de chegar no dono sem ele ir
// procurar. Sem servidor de notificação, o aviso é o número no botão Mais e no Admin, conferido
// quando o app abre e quando ele volta para o app. Só roda para quem administra, e o código do Admin só
// é baixado por ele — o celular dos motoristas não carrega nada disto.
const DE_NOVO = 120000;
let consultado = 0;

export async function verPendenciasDoAdmin(forcar = false) {
  if (nuvem.perfil?.papel !== 'admin' || !navigator.onLine) return;
  if (!forcar && Date.now() - consultado < DE_NOVO) return;
  consultado = Date.now();
  try {
    const [{listarCorrecoes, listarEmConferencia}, {triar}, {contarConferencia}] =
      await Promise.all([import('../servicos/admin'), import('../logica/triagem'), import('../logica/conferencia')]);
    // sem a 022 rodada a conferência falha, e o número fica só com o resto
    const [lugares, conferencia] = await Promise.all([listarCorrecoes(), listarEmConferencia().catch(() => [])]);
    ui.esperandoAdmin = triar(lugares, Date.now(), null).decidir.length + contarConferencia(conferencia);
    loja.mudou(false);
  } catch {
    // sem rede ou sem resposta: o número fica como estava, e a próxima volta ao app tenta de novo
    consultado = 0;
  }
}

// O dia guardado no aparelho passa a ser de quem está na sessão: o de outra conta vai para o lado e
// o desta volta (logica/guarda.ts, trocarDeConta). Se a memória do aparelho encher no meio da troca,
// ninguém entra pela metade: a sessão nova sai, e o dia de quem estava continua guardado.
async function assumirODia(): Promise<boolean> {
  const conta = nuvem.sessao?.user.id;
  if (!conta) return true;
  try {
    if (trocarDeConta(localStorage, conta) === 'trocada') {
      ui.posicionando = null;
      ui.selecionada = null;
      loja.trocarEstado(carregarEstado(guarda));
      irPara(telaBase());
    }
    return true;
  } catch {
    await sairDaNuvem();
    status('Não deu para entrar neste celular: a memória dele está cheia. O dia de quem usava antes continua guardado.', 12000);
    loja.mudou(false);
    return false;
  }
}

export async function iniciar() {
  iniciarNavegacao();
  usarRegiao(e().regiao || null);
  await iniciarNuvem();
  await assumirODia();
  loja.mudou(false);
  enviarFila();
  window.addEventListener('online', enviarFila);
  setInterval(enviarFila, 60000);
  if (new URLSearchParams(location.search).has('compartilhado')) processarCompartilhado();
  verPendenciasDoAdmin(true);
  verVersao(true);
  conferirComOCensoAoAbrir().finally(buscarDeNovoOsNomesTortos).finally(verPinosNovos);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { saiuDaTela(); return; }
    verPendenciasDoAdmin();
    verVersao(false);
    verPinosNovos();
  });
}

export async function entrar(email: string, senha: string) {
  status('Entrando…');
  const msg = await entrarNaNuvem(email, senha);
  if (!(await assumirODia())) return;
  loja.mudou(false);
  status(msg + avisoCompartilhadas(await consultarCompartilhadas()), 8000);
  enviarFila();
  verPendenciasDoAdmin(true);
}

export async function sair() {
  const faltam = fila.pendentes() + fila.aguardando();
  if (!confirm('Sair da conta? Para usar o app de novo, vai precisar do e-mail e da senha.' + (faltam
    ? `\n\nAinda há ${faltam} envio(s) para a nuvem. Eles ficam guardados neste celular e saem quando você entrar de novo.`
    : ''))) return;
  await sairDaNuvem();
  if (ui.tela === 'admin') irPara(telaBase());
  loja.mudou(false);
}

import {loja, status, type Tela} from '../loja';
import {e, ui} from './base';

// O botão voltar do celular. Até 02/10 as abas não entravam no histórico, e voltar saía do app
// de qualquer tela. Agora cada tela e cada painel aberto é um passo: voltar fecha o que abriu.
// Na tela de base, o primeiro voltar avisa e o segundo sai (pedido de 02/10).
interface Passo {tela: Tela; folha: 'proxima' | 'lista'; pino: string[] | null; menu: boolean}
// No history.state vai também a altura do passo (quantos acima da tela de base) e de qual
// abertura do app ele é: recarregando a página, os passos de antes continuam no histórico.
interface Marca {passo: Passo; altura: number; sessao: number}

const SAIR_EM = 3000;
const SESSAO = Date.now();
let altura = 0;
// Parado na primeira entrada do histórico, depois do aviso de sair: o próximo voltar é do
// próprio celular, que fecha o app. Daqui o app não consegue voltar mais — history.back() na
// primeira entrada não faz nada, e o app instalado ficava avisando sem nunca sair.
let naRaiz = false;
let avisouSair = 0;
let fimDoAviso: ReturnType<typeof setTimeout> | undefined;
let depoisDeVoltar: (() => void) | null = null;
let ficarEm: Passo | null = null;

const agora = (): Passo => ({tela: ui.tela, folha: ui.folha, pino: ui.pino, menu: ui.menu});
export const telaBase = (): Tela => e().paradas.length ? 'rota' : 'inicio';
const base = (): Passo => ({tela: telaBase(), folha: 'proxima', pino: null, menu: false});

function aplicar(p: Passo) {
  // sair do mapa (ou cobri-lo com a lista) desarma o "toque no mapa"; ir para ele é justamente
  // como se arruma um pino
  if (p.tela !== 'rota' || p.folha === 'lista') ui.posicionando = null;
  ui.tela = p.tela;
  ui.folha = p.folha;
  ui.pino = p.pino;
  ui.menu = p.menu;
  loja.mudou(false);
}

function marcar(p: Passo, novo: boolean) {
  const m: Marca = {passo: p, altura, sessao: SESSAO};
  try { if (novo) history.pushState(m, ''); else history.replaceState(m, ''); } catch {}
}

// Saindo da raiz por qualquer toque, a tela de base volta a ser um passo. Empilhando direto na
// raiz, fechar o menu voltava para ela: o app avisava de sair e não fazia o que ele escolheu.
function sairDaRaiz() {
  if (!naRaiz) return;
  naRaiz = false;
  altura = 0;
  marcar(agora(), true);
}

// Um passo à frente, que o voltar desfaz.
export function abrir(muda: Partial<Passo>) {
  sairDaRaiz();
  const p = {...agora(), menu: false, ...muda};
  aplicar(p);
  altura++;
  marcar(p, true);
}

// Vai para a tela de base largando os passos de cima: ler a planilha leva à Rota, montar a rota
// pela tela de Ponto de saída também, resetar volta ao começo. Trocando só o passo de cima,
// ficavam dois passos de Rota, e o primeiro voltar parecia não fazer nada.
export function irPara(tela: Tela) {
  const p: Passo = {tela, folha: 'proxima', pino: null, menu: false};
  sairDaRaiz();
  aplicar(p);
  if (altura > 0) { ficarEm = p; history.go(-altura); return; }
  marcar(p, false);
}

// Outro pino tocado com o cartão de um aberto: troca o cartão, sem empilhar um voltar por pino.
export function trocar(muda: Partial<Passo>) {
  if (naRaiz) { abrir(muda); return; }
  const p = {...agora(), ...muda};
  aplicar(p);
  marcar(p, false);
}

export const alturaAgora = () => altura;

export function voltar() {
  history.back();
}

// O menu fecha voltando um passo, e o que foi escolhido nele acontece depois, já na tela de
// baixo: abrindo uma tela por cima do menu, o voltar dela reabria o menu.
export function fecharMenuE(acao: () => void) {
  if (!ui.menu) { acao(); return; }
  depoisDeVoltar = acao;
  history.back();
}

export function iniciarNavegacao() {
  try {
    history.replaceState({raiz: true}, '');
  } catch {
    return;
  }
  marcar(agora(), true);
  window.addEventListener('popstate', ev => {
    const m = ev.state as Marca | null;
    if (m && m.passo && m.sessao === SESSAO) {
      altura = m.altura;
      naRaiz = false;
      if (ficarEm) {
        // chegou à base pelo irPara: vale a tela que ele pediu, não a que estava guardada
        const p = ficarEm;
        ficarEm = null;
        aplicar(p);
        marcar(p, false);
        return;
      }
      aplicar(m.passo);
      const f = depoisDeVoltar;
      depoisDeVoltar = null;
      if (f) f();
      return;
    }
    // passos de antes de recarregar a página: quem já pediu para sair segue saindo
    if (m && m.passo && Date.now() - avisouSair < SAIR_EM) { history.back(); return; }
    // voltou da tela de base: avisa e fica aqui; o próximo voltar sai
    avisouSair = Date.now();
    naRaiz = true;
    altura = 0;
    aplicar(base());
    status('Toque de novo em voltar para sair', SAIR_EM);
    // passado o aviso, a tela de base volta a ser um passo, e sair pede dois voltar de novo
    clearTimeout(fimDoAviso);
    fimDoAviso = setTimeout(sairDaRaiz, SAIR_EM);
  });
}

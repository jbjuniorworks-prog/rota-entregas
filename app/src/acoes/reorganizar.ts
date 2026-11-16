import {montarRota as calcularRota} from '../logica/montagem';
import {andouDemais, pontoDePartida, reorganizarDaqui} from '../logica/reorganizar';
import type {Parada, Perna, Ponto, Rota} from '../logica/tipos';
import {loja, status} from '../loja';
import {linhaDaRota, matriz} from '../servicos/ruas';
import {e, enviarFila, quandoAPosicaoMudar, ui} from './base';
import {registrarComoFicou} from './registro';

export const SEGUE_DAQUI = 'Fora da ordem: a sequência agora segue daqui.';

const ordemDe = (r: Rota) => r.areas.map(a => a.ordem.join(',')).join('|');

// A última ordem refeita no caminho. Desfazer a entrega que a causou devolve a de antes: o toque
// no pino errado não pode deixar a rota saindo de um lugar onde ele nunca esteve.
let ultima: {por: string; area: string; rota: Rota; ordem: string; antes: {rota: Rota; pernas: Record<string, Perna>}} | null = null;

// A linha verde é desenhada pelo serviço de ruas, com rede. Sem rede, a ordem muda na hora e a
// linha da área fica para depois: o desenho da ordem velha mentiria sobre o caminho.
const semLinha = new Map<string, {rota: Rota; pontos: Ponto[]}>();

// Chamada antes de marcar a entrega. Diz se a ordem mudou.
export function seguirDaqui(p: Parada): boolean {
  const r = reorganizarDaqui(e(), p);
  if (!r) return false;
  ultima = {por: p.id, area: r.area, rota: r.rota, ordem: ordemDe(r.rota), antes: {rota: e().rota!, pernas: e().pernas}};
  e().rota = r.rota;
  e().pernas = {...e().pernas, ...r.pernas};
  // rota em linha reta não tinha linha, e continua sem
  if (r.rota.porRuas) semLinha.set(r.area, {rota: r.rota, pontos: r.pontos});
  void pedirLinhas();
  return true;
}

// Desfeita a entrega que mudou a ordem, a ordem de antes volta, se nada mais mexeu nela depois.
export function voltarOrdem(p: Parada): boolean {
  const u = ultima;
  if (!u || u.por !== p.id) return false;
  ultima = null;
  semLinha.delete(u.area);
  const atual = e().rota;
  if (!atual || atual !== u.rota || ordemDe(atual) !== u.ordem) return false;
  e().rota = {...u.antes.rota, desatualizada: atual.desatualizada, mudouMuito: atual.mudouMuito};
  e().pernas = u.antes.pernas;
  return true;
}

let pedindo = false;

// Pede as linhas que ficaram para depois. Roda a cada entrega e quando a rede volta.
export async function pedirLinhas() {
  if (pedindo) return;
  pedindo = true;
  try {
    for (;;) {
      const [area, f] = semLinha.entries().next().value ?? [];
      if (!area || !f) return;
      if (e().rota !== f.rota) { semLinha.delete(area); continue; }
      const linha = await linhaDaRota(f.pontos);
      // sem rede: fica para a próxima entrega, ou para quando a rede voltar
      if (!linha) return;
      // a ordem mudou de novo enquanto esperava: a volta seguinte pede a nova
      if (semLinha.get(area) !== f || e().rota !== f.rota) continue;
      const ra = f.rota.areas.find(a => a.id === area);
      if (ra) ra.linha = linha;
      semLinha.delete(area);
      loja.mudou();
    }
  } finally {
    pedindo = false;
  }
}

// Um pino do que falta andou demais (andouDemais, em logica/reorganizar.ts): com rede, a rota se
// refaz sozinha, sem ele tocar em nada (dono, 15/11: "quando mudamos pinos, ela reage?"). Espera
// ele parar de mexer nos pinos: arrumando vários em Conferir, refaz uma vez só, e o serviço de
// ruas, que é de graça e pede no máximo um pedido por segundo, não leva um pedido por pino.
export const QUIETO = 10_000;
let espera: ReturnType<typeof setTimeout> | undefined;
// a que ele desfez: não volta a ser refeita sozinha na mudança seguinte
let recusada: Rota | null = null;

export function agendarRefazer() {
  clearTimeout(espera);
  if (e().rota && e().rota !== recusada && andouDemais(e())) espera = setTimeout(() => void refazerSozinha(), QUIETO);
}
quandoAPosicaoMudar(agendarRefazer);

export async function refazerSozinha() {
  // sem rede fica o aviso de sempre, com o "Refazer a rota"; a rede voltando, main.tsx agenda de novo
  if (ui.ocupado || !navigator.onLine || !e().rota || e().rota === recusada || !andouDemais(e())) return;
  const {rota: velha, pernas, inicio, areas} = e();
  const voltar = () => Object.assign(e(), {rota: velha, pernas, inicio, areas});
  ui.ocupado = true;
  try {
    const partida = pontoDePartida(e(), ui.euAqui, Date.now());
    if (partida) e().inicio = partida;
    const nova = await calcularRota(e(), {matriz, linha: linhaDaRota});
    // sem acesso às ruas, a de antes, feita pelas ruas, é melhor: fica ela, com o aviso
    if (!nova.porRuas && velha!.porRuas) { voltar(); return; }
    registrarComoFicou(nova.porRuas ? null : nova.motivoSemRuas || 'sem motivo anotado');
    enviarFila();
    status('Um pino mudou de lugar, e a rota foi refeita.', 8000, () => {
      if (e().rota !== nova) return;
      voltar();
      recusada = velha;
      loja.mudou();
      status('A rota de antes voltou.', 3000);
    });
  } catch {
    voltar();
  } finally {
    ui.ocupado = false;
    loja.mudou();
  }
}

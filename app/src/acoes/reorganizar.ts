import {reorganizarDaqui} from '../logica/reorganizar';
import type {Parada, Perna, Ponto, Rota} from '../logica/tipos';
import {loja} from '../loja';
import {linhaDaRota} from '../servicos/ruas';
import {e} from './base';

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

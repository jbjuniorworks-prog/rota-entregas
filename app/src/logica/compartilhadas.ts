import {haversine} from './geo';
import type {Parada} from './tipos';

export interface PosicaoCompartilhada {
  chave_lugar: string;
  lat: number;
  lng: number;
  situacao: 'confirmado' | 'sugestao';
  motoristas: number;
  entregas?: number;
  fonte?: 'admin' | 'correcao' | 'entrega';
  minha: boolean;
}

export function comoFoiConfirmada(r: PosicaoCompartilhada): string {
  if (r.minha) return 'Posição que você mesmo arrumou aqui';
  if (r.fonte === 'entrega') return `Posição confirmada por ${r.entregas} entrega(s) feitas aqui`;
  if (r.fonte === 'admin' || (!r.fonte && r.motoristas <= 1)) return 'Posição confirmada por quem administra';
  return `Posição confirmada por ${r.motoristas} motoristas`;
}

// 'manual' é o motorista arrastando o pino agora, neste aparelho: ninguém passa na frente disso.
// 'lembrado' é só o eco do que este navegador guardou — e pode ter vindo de um toque numa opção
// da lista, que é palpite e não sai deste aparelho. Palpite antigo não pode vencer quem foi lá.
const ESCOLHA_DO_MOTORISTA = new Set(['manual']);

export function aplicarCompartilhadas(
  paradas: Parada[], resultados: PosicaoCompartilhada[], chaveDe: (p: Parada) => string | null,
): {confirmadas: number; sugestoes: number; minhas: number} {
  const porChave = new Map(resultados.map(r => [r.chave_lugar, r]));
  let confirmadas = 0, sugestoes = 0, minhas = 0;
  for (const p of paradas) {
    if (p.entregue || ESCOLHA_DO_MOTORISTA.has(p.precisao)) continue;
    const k = chaveDe(p), r = k ? porChave.get(k) : undefined;
    if (!r) continue;
    const perto = p.lat != null && p.lng != null && haversine(p as {lat: number; lng: number}, r) < 30;
    // O que o próprio motorista arrumou volta para ele em qualquer aparelho, mesmo sem
    // ninguém mais ter confirmado: arrumar uma entrega só faz sentido se fica arrumada.
    if (r.situacao === 'confirmado' || r.minha) {
      if (perto && p.precisao === 'confirmado') continue;
      if (p.lat != null && p.lng != null) p.candidatos = [{lat: p.lat, lng: p.lng, exibido: 'Posição de antes (planilha ou busca)', precisao: p.precisao, fonte: 'original'}, ...p.candidatos.filter(c => c.fonte !== 'original')];
      Object.assign(p, {lat: r.lat, lng: r.lng, precisao: 'confirmado', exibido: comoFoiConfirmada(r),
        fonte: r.minha ? 'minha correcao' : 'outro motorista'});
      delete p.sugestao;
      if (r.minha) minhas++; else confirmadas++;
    } else if (!perto) {
      p.sugestao = {lat: r.lat, lng: r.lng, distancia: p.lat != null && p.lng != null ? Math.round(haversine(p as {lat: number; lng: number}, r)) : null};
      sugestoes++;
    }
  }
  return {confirmadas, sugestoes, minhas};
}

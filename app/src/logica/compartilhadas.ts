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

// "Endereço verificado" é o nome que eles já conhecem do Mercado Livre (pedido de 28/09): alguém
// entregou ali, dá para ir com certeza.
export function comoFoiConfirmada(r: PosicaoCompartilhada): string {
  if (r.minha) return r.situacao === 'confirmado' ? 'Endereço verificado (marcado por você)' : 'Posição que você mesmo arrumou aqui';
  if (r.fonte === 'entrega') return (r.entregas || 0) > 1 ? `Endereço verificado: ${r.entregas} entregas feitas aqui` : 'Endereço verificado: já entregaram aqui';
  if (r.fonte === 'admin' || (!r.fonte && r.motoristas <= 1)) return 'Endereço verificado por quem administra';
  // uma correção só não chega aqui como confirmada: precisa de uma entrega feita no mesmo ponto
  if (r.motoristas <= 1) return 'Endereço verificado por outro motorista, na porta';
  return `Endereço verificado por ${r.motoristas} motoristas`;
}

// 'manual' é o motorista arrastando o pino agora, neste aparelho: ninguém passa na frente disso.
// 'lembrado' é só o eco do que este navegador guardou — e pode ter vindo de um toque numa opção
// da lista, que é palpite e não sai deste aparelho. Palpite antigo não pode vencer quem foi lá.
const ESCOLHA_DO_MOTORISTA = new Set(['manual']);

export function aplicarCompartilhadas(
  paradas: Parada[], resultados: PosicaoCompartilhada[], chaveDe: (p: Parada) => string | null,
): {confirmadas: number; sugestoes: number; minhas: number; lembradasVerificadas: number} {
  const porChave = new Map(resultados.map(r => [r.chave_lugar, r]));
  let confirmadas = 0, sugestoes = 0, minhas = 0, lembradasVerificadas = 0;
  for (const p of paradas) {
    if (p.entregue || ESCOLHA_DO_MOTORISTA.has(p.precisao)) continue;
    const k = chaveDe(p), r = k ? porChave.get(k) : undefined;
    if (!r) continue;
    const perto = p.lat != null && p.lng != null && haversine(p as {lat: number; lng: number}, r) < 30;
    // O que o próprio motorista arrumou volta para ele em qualquer aparelho, mesmo sem
    // ninguém mais ter confirmado: arrumar uma entrega só faz sentido se fica arrumada.
    if (r.situacao === 'confirmado' || r.minha) {
      // Só o que alguém entregou ali é verificado. A correção dele que ninguém confirmou volta
      // como "corrigida por você antes", igual à memória do aparelho: chamar de verificada
      // travava os botões de arrumar na Rota por uma posição que ninguém entregou.
      const precisao = r.situacao === 'confirmado' ? 'confirmado' : 'lembrado';
      if (perto && p.precisao === precisao) continue;
      // a que a memória do aparelho trouxe e a nuvem verificou: o aviso a conta uma vez só
      if (p.precisao === 'lembrado' && precisao === 'confirmado') lembradasVerificadas++;
      if (p.lat != null && p.lng != null) p.candidatos = [{lat: p.lat, lng: p.lng, exibido: 'Posição de antes (planilha ou busca)', precisao: p.precisao, fonte: 'original'}, ...p.candidatos.filter(c => c.fonte !== 'original')];
      Object.assign(p, {lat: r.lat, lng: r.lng, precisao, exibido: comoFoiConfirmada(r),
        fonte: r.minha ? 'minha correcao' : 'outro motorista'});
      delete p.sugestao;
      // Verificada é verificada, com as entregas dele ou de outro. A dele contava como "a posição
      // que você mesmo já arrumou", e o Pedro (10/10) carregou 13 endereços verificados pelas
      // entregas dele sem ler "verificado" em aviso nenhum.
      if (precisao === 'confirmado') confirmadas++; else minhas++;
    } else if (!perto) {
      p.sugestao = {lat: r.lat, lng: r.lng, distancia: p.lat != null && p.lng != null ? Math.round(haversine(p as {lat: number; lng: number}, r)) : null};
      sugestoes++;
    }
  }
  return {confirmadas, sugestoes, minhas, lembradasVerificadas};
}

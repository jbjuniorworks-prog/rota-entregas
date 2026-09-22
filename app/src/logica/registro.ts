// Monta o registro do que o app decidiu para cada pacote: de onde saiu a posição e quão boa ela é.
// Puro de propósito — sem loja, sem nuvem — para poder ser testado sozinho.
import type {ItemRegistro} from './fila';
import type {Parada} from './tipos';

export function itensDaRota(paradas: Parada[], rota: string): ItemRegistro[] {
  const itens: ItemRegistro[] = [];
  for (const p of paradas) {
    if (p.rota !== rota) continue;
    for (const tn of p.pacotes || []) {
      itens.push({tn, lat: p.lat, lng: p.lng, fonte: p.fonte || '(sem origem)', precisao: p.precisao});
    }
  }
  return itens;
}

export const rotasDe = (paradas: Parada[]): string[] =>
  [...new Set(paradas.map(p => p.rota).filter((r): r is string => !!r))];

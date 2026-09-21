import {loja} from '../loja';
import type {Parada} from './tipos';

let posicoesNaRota: {rota: unknown; quantas: number; onde: Map<string, number>} | null = null;

export function ondeNaRota(id: string): number | undefined {
  const {rota} = loja.e;
  if (!rota) return undefined;
  const quantas = rota.areas.reduce((n, a) => n + a.ordem.length, 0);
  if (!posicoesNaRota || posicoesNaRota.rota !== rota || posicoesNaRota.quantas !== quantas) {
    const onde = new Map<string, number>();
    let i = 0;
    for (const a of rota.areas) for (const x of a.ordem) onde.set(x, ++i);
    posicoesNaRota = {rota, quantas, onde};
  }
  return posicoesNaRota.onde.get(id);
}

export function rotuloDe(p: Parada): string {
  const i = ondeNaRota(p.id);
  if (i) return String(i);
  if (p.ml) return '#' + p.ml;
  return String(loja.e.paradas.indexOf(p) + 1);
}

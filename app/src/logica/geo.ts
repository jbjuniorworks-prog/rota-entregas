import type {Parada, Ponto} from './tipos';

export const RAIO_BLOCO = 10;
export const PERTO_A_PE = 300;
export const ISOLADA_MIN = 7000;
export const ISOLADA_FATOR = 4;

export function haversine(a: Ponto, b: Ponto): number {
  const R = 6371000, r = (x: number) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const comPosicao = (p: Parada): p is Parada & Ponto => p.lat != null && p.lng != null;

export function marcarIsoladas(paradas: Parada[]): number {
  for (const p of paradas) if (p.precisao === 'longe') p.precisao = p.precisaoAntes || 'planilha';
  const com = paradas.filter(p => comPosicao(p) && !p.entregue) as (Parada & Ponto)[];
  if (com.length < 4) return 0;
  const centro = {lat: mediana(com.map(p => p.lat)), lng: mediana(com.map(p => p.lng))};
  const ds = com.map(p => haversine(p, centro));
  const limite = Math.max(ISOLADA_MIN, ISOLADA_FATOR * mediana(ds));
  let n = 0;
  com.forEach((p, i) => {
    if (p.precisao === 'manual' || ds[i] <= limite) return;
    p.precisaoAntes = p.precisao;
    p.precisao = 'longe';
    n++;
  });
  return n;
}

export function proximaAPe(feita: Parada, proxima: Parada | undefined): number | null {
  if (!proxima || !comPosicao(feita) || !comPosicao(proxima)) return null;
  const d = haversine(feita, proxima);
  return d <= RAIO_BLOCO || d > PERTO_A_PE ? null : Math.round(d / 10) * 10 || 10;
}

import {DA_PLANILHA} from './rotulos';
import {decompor, normal} from './texto';
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

export function moverParaOBairro(p: Parada, ponto: Ponto, bairro: string) {
  const original = {lat: p.lat!, lng: p.lng!, exibido: 'Posição que veio na planilha (longe das outras entregas)', precisao: 'longe' as const, fonte: 'planilha'};
  p.candidatos = [{lat: ponto.lat, lng: ponto.lng, exibido: `Pelo bairro ${bairro}`, precisao: 'bairro', fonte: 'bairro'}, original];
  Object.assign(p, {lat: ponto.lat, lng: ponto.lng, precisao: 'bairro', exibido: `Posição pelo bairro ${bairro}: a planilha mandava para longe. Confira no local.`});
}

export function moverPeloBairro(paradas: Parada[]): Parada[] {
  const movidas: Parada[] = [];
  for (const p of paradas) {
    if (p.precisao !== 'longe' || !p.bairro || !DA_PLANILHA.has(p.precisaoAntes!)) continue;
    const vizinhos = paradas.filter(q => q !== p && comPosicao(q) && q.precisao !== 'longe' && normal(q.bairro) === normal(p.bairro)) as (Parada & Ponto)[];
    if (!vizinhos.length) continue;
    moverParaOBairro(p, {lat: mediana(vizinhos.map(q => q.lat)), lng: mediana(vizinhos.map(q => q.lng))}, p.bairro);
    movidas.push(p);
  }
  return movidas;
}

export function marcarNumerosIncoerentes(paradas: Parada[]): number {
  const porRua = new Map<string, {p: Parada & Ponto; n: number}[]>();
  for (const p of paradas) {
    if (p.precisao !== 'planilha' || !comPosicao(p)) continue;
    const d = decompor(p.texto);
    if (!d.numero) continue;
    const rua = normal(d.rua);
    if (!porRua.has(rua)) porRua.set(rua, []);
    porRua.get(rua)!.push({p, n: +d.numero});
  }
  const marcadas = new Set<Parada>();
  for (const lista of porRua.values()) for (const a of lista) for (const b of lista) {
    if (Math.abs(a.n - b.n) >= 300 && haversine(a.p, b.p) < 30) { marcadas.add(a.p); marcadas.add(b.p); }
  }
  marcadas.forEach(p => { p.precisao = 'numero'; });
  return marcadas.size;
}

export function proximaAPe(feita: Parada, proxima: Parada | undefined): number | null {
  if (!proxima || !comPosicao(feita) || !comPosicao(proxima)) return null;
  const d = haversine(feita, proxima);
  return d <= RAIO_BLOCO || d > PERTO_A_PE ? null : Math.round(d / 10) * 10 || 10;
}

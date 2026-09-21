import {haversine, RAIO_BLOCO} from './geo';
import {chaveEndereco} from './texto';
import type {Local, Parada, Ponto} from './tipos';

export type Matriz = number[][];

export function custo(p: number[], D: Matriz): number {
  let c = 0;
  for (let i = 1; i < p.length; i++) c += D[p[i - 1]][p[i]];
  return c;
}

export function matrizAproximada(pts: Ponto[]): {dur: Matriz; dist: Matriz} {
  const dist = pts.map(a => pts.map(b => haversine(a, b) * 1.35));
  return {dur: dist.map(l => l.map(m => m / 7)), dist};
}

export function otimizar(n: number, D: Matriz, fixo: boolean, fimFixo = false, tempoMs = 3000): number[] {
  const ult = fimFixo ? n - 1 : -1, livres = fimFixo ? n - 1 : n;
  const inicios = fixo ? [0] : [...Array(livres).keys()];
  let p: number[] = [], c = Infinity;
  for (const s of inicios) {
    const q = [s], usado = new Set([s, ult]);
    while (q.length < livres) {
      const u = q[q.length - 1];
      let b = -1, bd = Infinity;
      for (let v = 0; v < n; v++) if (!usado.has(v) && D[u][v] < bd) { bd = D[u][v]; b = v; }
      q.push(b); usado.add(b);
    }
    if (fimFixo) q.push(ult);
    const cq = custo(q, D);
    if (cq < c) { c = cq; p = q; }
  }
  const ini = fixo ? 1 : 0, limite = Date.now() + tempoMs;
  let melhorou = true;
  while (melhorou && Date.now() < limite) {
    melhorou = false;
    for (let i = ini; i < livres - 1 && Date.now() < limite; i++) for (let k = i + 1; k < livres; k++) {
      const q = p.slice(0, i).concat(p.slice(i, k + 1).reverse(), p.slice(k + 1));
      const cq = custo(q, D);
      if (cq < c - 1e-6) { p = q; c = cq; melhorou = true; }
    }
    for (let i = ini; i < livres && Date.now() < limite; i++) for (let j = ini; j < livres; j++) {
      if (i === j) continue;
      const q = p.slice();
      const [x] = q.splice(i, 1);
      q.splice(j, 0, x);
      const cq = custo(q, D);
      if (cq < c - 1e-6) { p = q; c = cq; melhorou = true; }
    }
  }
  return p;
}

export interface GrupoNoMapa {
  ids: string[];
  pacotes: number;
  enderecos: number;
  stops: string[];
  adicionais: number;
  lat: number;
  lng: number;
}

export function gruposNoMapa(paradas: Parada[], raio = RAIO_BLOCO): GrupoNoMapa[] {
  const grupos: {ps: Parada[]; lat: number; lng: number}[] = [];
  for (const p of paradas) {
    if (p.lat == null || p.lng == null || p.entregue) continue;
    const g = grupos.find(x => haversine(x as Ponto, p as Ponto) <= raio);
    if (g) g.ps.push(p);
    else grupos.push({ps: [p], lat: p.lat, lng: p.lng});
  }
  return grupos.map(g => ({
    ids: g.ps.map(p => p.id),
    pacotes: g.ps.reduce((n, p) => n + (p.unidades || 1), 0),
    enderecos: new Set(g.ps.map(p => chaveEndereco(p.texto).split('|').slice(0, 2).join('|'))).size,
    stops: [...new Set(g.ps.map(p => p.stop).filter(Boolean) as string[])].sort((a, b) => +a - +b),
    adicionais: g.ps.filter(p => p.adicional).reduce((n, p) => n + (p.unidades || 1), 0),
    lat: g.lat, lng: g.lng,
  }));
}

export interface PertoDali {
  p: Parada;
  distancia: number;
}

export function porPerto(paradas: Parada[], alvo: Ponto, semEstes: string[], ateMetros = 200): PertoDali[] {
  const fora = new Set(semEstes);
  return paradas
    .filter(p => !p.entregue && !fora.has(p.id) && p.lat != null && p.lng != null)
    .map(p => ({p, distancia: haversine(alvo, p as Ponto)}))
    .filter(x => x.distancia > RAIO_BLOCO && x.distancia <= ateMetros)
    .sort((a, b) => a.distancia - b.distancia);
}

export interface PorEndereco {
  chave: string;
  titulo: string;
  ps: Parada[];
  pacotes: number;
}

export function agruparPorEndereco(paradas: Parada[]): PorEndereco[] {
  const out: PorEndereco[] = [];
  for (const p of paradas) {
    const chave = chaveEndereco(p.texto).split('|').slice(0, 2).join('|');
    const g = out.find(x => x.chave === chave);
    const pacotes = p.unidades || 1;
    if (g) { g.ps.push(p); g.pacotes += pacotes; continue; }
    out.push({chave, titulo: p.texto.split(',').slice(0, 2).join(',').trim(), ps: [p], pacotes});
  }
  return out;
}

export function blocos(ordem: string[], parada: (id: string) => Parada | undefined, raio = RAIO_BLOCO): string[][] {
  const out: string[][] = [];
  for (const id of ordem) {
    const p = parada(id);
    if (!p || p.lat == null || p.lng == null) continue;
    const b = out[out.length - 1];
    const primeiro = b && parada(b[0]);
    if (b && primeiro && haversine(primeiro as Ponto, p as Ponto) <= raio) b.push(id);
    else out.push([id]);
  }
  return out;
}

export interface PontoDoTrecho {
  ids: string[];
  alvo: Ponto;
}

export function trechos(ordem: string[], parada: (id: string) => Parada | undefined, tamanho: number, fim: Local | null | undefined): PontoDoTrecho[][] {
  const tam = Math.max(1, +tamanho || 9);
  const pontos = blocos(ordem, parada)
    .map(b => ({ids: b, alvo: b.map(parada).find(p => p && !p.entregue) as (Ponto | undefined)}))
    .filter((x): x is PontoDoTrecho => !!x.alvo);
  const out: PontoDoTrecho[][] = [];
  for (let i = 0; i < pontos.length; i += tam) out.push(pontos.slice(i, i + tam));
  const ultimo = out[out.length - 1];
  if (fim && ultimo && ultimo.length < tam) ultimo.push({ids: [], alvo: fim});
  return out;
}

export const linkWaze = (p: Ponto) => `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
export const linkMaps = (p: Ponto) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
export function linkMapsVarios(ps: Ponto[]): string {
  const destino = ps[ps.length - 1];
  const meio = ps.slice(0, -1).map(p => `${p.lat},${p.lng}`).join('|');
  return `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}${meio ? '&waypoints=' + encodeURIComponent(meio) : ''}&travelmode=driving`;
}

export const fmtMin = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.round(s % 3600 / 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(s / 60))} min`;
export const fmtKm = (m: number) => m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m) + ' m';

import {haversine} from './geo';
import {custo, otimizar, type Matriz} from './otimizacao';
import type {Area, Estado, Local, Parada, Ponto, Rota} from './tipos';

export interface ServicosDeRota {
  matriz(pts: Ponto[]): Promise<{dur: Matriz; dist: Matriz; porRuas: boolean}>;
  linha(seq: Ponto[]): Promise<[number, number][] | null>;
}

type ComPosicao = Parada & Ponto;

export const pendentesDa = (e: Estado, areaId: string) =>
  e.paradas.filter(p => p.area === areaId && !p.entregue && !p.adiada && p.lat != null && p.lng != null) as ComPosicao[];

function centro(e: Estado, areaId: string): Ponto {
  const ps = pendentesDa(e, areaId);
  return {lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length, lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length};
}

export function ordenarAreas(e: Estado, pos: Ponto | null): Area[] {
  const comPend = e.areas.filter(a => pendentesDa(e, a.id).length);
  if (e.areasManual) return comPend;
  const resto = [...comPend], out: Area[] = [];
  let aqui = pos;
  while (resto.length) {
    const prazos = resto.map(a => a.prazo).filter(Boolean).sort();
    const cands = prazos.length ? resto.filter(a => a.prazo === prazos[0]) : resto;
    let escolhida = cands[0];
    if (aqui) for (const a of cands) if (haversine(aqui, centro(e, a.id)) < haversine(aqui, centro(e, escolhida.id))) escolhida = a;
    out.push(escolhida);
    resto.splice(resto.indexOf(escolhida), 1);
    aqui = centro(e, escolhida.id);
  }
  e.areas = out.concat(e.areas.filter(a => !out.includes(a)));
  return out;
}

export async function montarRota(e: Estado, s: ServicosDeRota, aviso: (m: string) => void = () => {}): Promise<Rota> {
  let pos: Ponto | null = e.inicio;
  const rota: Rota = {areas: [], dur: 0, dist: 0, mlDur: 0, mlDist: 0, porRuas: true, quando: Date.now()};
  e.pernas = {};
  const areas = ordenarAreas(e, e.inicio);
  for (const a of areas) {
    aviso(`Calculando área ${a.nome}…`);
    const alvos = pendentesDa(e, a.id);
    const fim: Local | null = a === areas[areas.length - 1] && e.fim ? e.fim : null;
    const pts: (Ponto & {id?: string; ml?: string | null; stop?: string | null})[] = [...(pos ? [pos] : []), ...alvos, ...(fim ? [fim] : [])];
    const M = await s.matriz(pts);
    if (!M.porRuas) rota.porRuas = false;
    const melhor = pts.length === 1 ? [0] : otimizar(pts.length, M.dur, !!pos, !!fim);

    const off = pos ? 1 : 0;
    const SEM_NUMERO = 9e6;
    const chave = (i: number) => {
      const x = pts[i] as Parada;
      const parada = x.stop ? +x.stop : SEM_NUMERO;
      const pacote = x.ml ? +x.ml : SEM_NUMERO;
      return [parada, pacote, e.paradas.indexOf(x)];
    };
    const seqML = alvos.map((_, i) => i + off).sort((i, j) => {
      const a = chave(i), b = chave(j);
      return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    });
    if (pos) seqML.unshift(0);
    if (fim) seqML.push(pts.length - 1);
    rota.mlDur += custo(seqML, M.dur);
    rota.mlDist += custo(seqML, M.dist);

    const p = e.ordemDoApp ? seqML : melhor;
    if (e.ordemDoApp) {
      rota.ordemDoApp = true;
      rota.melhorDur = (rota.melhorDur || 0) + custo(melhor, M.dur);
      rota.melhorDist = (rota.melhorDist || 0) + custo(melhor, M.dist);
    }
    const ordem = p.filter(i => !(pos && i === 0) && !(fim && i === pts.length - 1)).map(i => pts[i].id!);
    let dur = 0, dist = 0;
    for (let k = 1; k < p.length; k++) {
      const perna = {dur: M.dur[p[k - 1]][p[k]], dist: M.dist[p[k - 1]][p[k]]};
      if (fim && p[k] === pts.length - 1) { rota.dur += perna.dur; rota.dist += perna.dist; rota.fim = perna; continue; }
      e.pernas[pts[p[k]].id!] = perna;
      dur += perna.dur;
      dist += perna.dist;
    }
    const seq = p.map(i => pts[i]);
    const linha = M.porRuas && seq.length >= 2 ? await s.linha(seq) : null;
    rota.areas.push({id: a.id, ordem, dur, dist, linha});
    rota.dur += dur;
    rota.dist += dist;
    pos = e.paradas.find(x => x.id === ordem[ordem.length - 1]) as ComPosicao;
  }
  if (!e.fim && e.voltar && e.inicio && pos && pos !== e.inicio) {
    const M = await s.matriz([pos, e.inicio]);
    rota.dur += M.dur[0][1];
    rota.dist += M.dist[0][1];
  }
  e.rota = rota;
  return rota;
}

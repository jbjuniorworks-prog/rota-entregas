import {matrizAproximada, type Matriz} from '../logica/otimizacao';
import type {Ponto} from '../logica/tipos';
import {buscarJson, espacado} from './rede';

const PRAZO_OSRM = 12000;

async function osrm(caminho: string) {
  await espacado('osrm', 1100);
  return buscarJson('https://router.project-osrm.org/' + caminho, PRAZO_OSRM);
}

const coordStr = (pts: Ponto[]) => pts.map(p => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');

export interface MatrizDeRuas {
  dur: Matriz;
  dist: Matriz;
  porRuas: boolean;
  motivo?: string;
}

const TENTATIVAS = 2;

export async function matriz(pts: Ponto[]): Promise<MatrizDeRuas> {
  let motivo = '';
  if (pts.length > 100) motivo = `${pts.length} pontos, mais do que o serviço aceita de uma vez`;
  else if (pts.length > 1) {
    for (let n = 0; n < TENTATIVAS; n++) {
      try {
        const j = await osrm(`table/v1/driving/${coordStr(pts)}?annotations=duration,distance`);
        if (j.code === 'Ok') {
          const fix = (m: (number | null)[][]) => m.map(l => l.map(v => v == null ? 1e9 : v));
          return {dur: fix(j.durations), dist: fix(j.distances), porRuas: true};
        }
        motivo = 'o serviço respondeu ' + j.code;
      } catch (err) {
        motivo = (err as Error).message;
      }
    }
  }
  return {...matrizAproximada(pts), porRuas: pts.length <= 1, motivo};
}

export async function linhaDaRota(seq: Ponto[]): Promise<[number, number][] | null> {
  try {
    const j = await osrm(`route/v1/driving/${coordStr(seq)}?overview=simplified&geometries=geojson`);
    if (j.code === 'Ok') return j.routes[0].geometry.coordinates.map(([lng, lat]: [number, number]) => [+lat.toFixed(5), +lng.toFixed(5)]);
  } catch {}
  return null;
}

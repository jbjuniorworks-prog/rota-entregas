import {haversine, MESMO_LUGAR} from './geo';
import {mesmoEndereco, mesmoLugarNomeado} from './texto';
import type {Parada, Ponto} from './tipos';

export const PIXELS_JUNTOS = 38;

export interface Pilha {
  ps: Parada[];
  x: number;
  y: number;
  estado: string;
}

const estadoDe = (p: Parada) => p.entregue ? 'e' : p.adiada ? 'a' : 'p';

export function empilhar(ps: Parada[], projetar: (p: Ponto) => {x: number; y: number}, ordem: (p: Parada) => number = () => 0): Pilha[] {
  const out: Pilha[] = [];
  for (const p of ps) {
    if (p.lat == null || p.lng == null) continue;
    const pt = projetar(p as Ponto);
    const estado = estadoDe(p);
    const mesmoLugar = out.find(x => x.estado === estado
      && haversine(x.ps[0] as Ponto, p as Ponto) <= MESMO_LUGAR
      && (mesmoEndereco([x.ps[0].texto, p.texto]) || mesmoLugarNomeado(x.ps[0], p)));
    const g = mesmoLugar || out.find(x => x.estado === estado
      && Math.abs(x.x - pt.x) < PIXELS_JUNTOS && Math.abs(x.y - pt.y) < PIXELS_JUNTOS);
    if (g) g.ps.push(p);
    else out.push({ps: [p], x: pt.x, y: pt.y, estado});
  }
  for (const g of out) g.ps.sort((a, b) => ordem(a) - ordem(b));
  return out;
}

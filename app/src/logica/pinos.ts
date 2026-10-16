import {haversine, MESMO_LUGAR} from './geo';
import {mesmaPortaPeloNome, mesmoEndereco} from './texto';
import type {Parada, Ponto} from './tipos';

export const PIXELS_JUNTOS = 38;

export interface Pilha {
  ps: Parada[];
  x: number;
  y: number;
  estado: string;
}

const estadoDe = (p: Parada) => p.entregue ? 'e' : p.adiada ? 'a' : 'p';

// O pino de uma pilha é desenhado na primeira dela pela ordem da rota, e é com essa que as outras
// se medem: o grupo nasce dela. Nascendo da primeira da planilha, a pilha decidia por um ponto e
// aparecia em outro. Em 16/10 o Luan entregou "aqui" os dois do 1630, ao lado de uma ADS do 1623
// que a planilha punha na porta do Mercure: entregues, eles entraram na pilha dos entregues do
// 1623, e o pino foi desenhado 40 m acima. Desfazendo, voltava; entregando de novo, sumia.
export function empilhar(ps: Parada[], projetar: (p: Ponto) => {x: number; y: number}, ordem: (p: Parada) => number = () => 0): Pilha[] {
  const out: Pilha[] = [];
  for (const p of [...ps].sort((a, b) => ordem(a) - ordem(b))) {
    if (p.lat == null || p.lng == null) continue;
    const pt = projetar(p as Ponto);
    const estado = estadoDe(p);
    const mesmoLugar = out.find(x => x.estado === estado
      && haversine(x.ps[0] as Ponto, p as Ponto) <= MESMO_LUGAR
      && (mesmoEndereco([x.ps[0].texto, p.texto]) || mesmaPortaPeloNome(x.ps[0], p)));
    const g = mesmoLugar || out.find(x => x.estado === estado
      && Math.abs(x.x - pt.x) < PIXELS_JUNTOS && Math.abs(x.y - pt.y) < PIXELS_JUNTOS);
    if (g) g.ps.push(p);
    else out.push({ps: [p], x: pt.x, y: pt.y, estado});
  }
  return out;
}

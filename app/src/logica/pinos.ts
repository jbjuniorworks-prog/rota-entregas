import {haversine, MESMO_LUGAR} from './geo';
import {mesmaPortaPeloNome, mesmoEndereco} from './texto';
import type {Parada, Ponto} from './tipos';

export const PIXELS_JUNTOS = 38;

export interface Pilha {
  ps: Parada[];
  x: number;
  y: number;
  estado: string;
  // deslocamento do desenho, em pixels, quando várias separadas dividem o mesmo ponto (`emLeque`)
  dx?: number;
  dy?: number;
}

const estadoDe = (p: Parada) => p.entregue ? 'e' : p.adiada ? 'a' : 'p';
// Separada pelo motorista para ter o seu pino (26/10): não entra na pilha de ninguém, nem recebe.
const sozinha = (p: Parada) => !!p.separada && !p.entregue;

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
    if (sozinha(p)) { out.push({ps: [p], x: pt.x, y: pt.y, estado}); continue; }
    const mesmoLugar = out.find(x => x.estado === estado && !sozinha(x.ps[0])
      && haversine(x.ps[0] as Ponto, p as Ponto) <= MESMO_LUGAR
      && (mesmoEndereco([x.ps[0].texto, p.texto]) || mesmaPortaPeloNome(x.ps[0], p)));
    const g = mesmoLugar || out.find(x => x.estado === estado && !sozinha(x.ps[0])
      && Math.abs(x.x - pt.x) < PIXELS_JUNTOS && Math.abs(x.y - pt.y) < PIXELS_JUNTOS);
    if (g) g.ps.push(p);
    else out.push({ps: [p], x: pt.x, y: pt.y, estado});
  }
  return out;
}

// As separadas que ainda estão no mesmo ponto (acabaram de ser separadas, ninguém arrumou)
// abrem em leque em volta dele, cada uma no seu pino, para ele tocar e arrumar uma por uma
// (dono, 26/10). Só o desenho anda: a posição gravada continua a do ponto, e o mapa liga cada
// pino a ele com um traço.
export const RAIO_LEQUE = 30;
export function emLeque(pilhas: Pilha[], raio = RAIO_LEQUE): Pilha[] {
  const soltas = pilhas.filter(g => g.ps.length === 1 && sozinha(g.ps[0]));
  const feitas = new Set<Pilha>();
  for (const g of soltas) {
    if (feitas.has(g)) continue;
    const juntas = soltas.filter(x => !feitas.has(x) && Math.abs(x.x - g.x) < 2 && Math.abs(x.y - g.y) < 2);
    juntas.forEach(x => feitas.add(x));
    if (juntas.length < 2) continue;
    // um pino tem uns 30 px: com muitos, o círculo cresce para eles não se cobrirem
    const r = Math.max(raio, juntas.length * 34 / (2 * Math.PI));
    juntas.forEach((x, k) => {
      const a = -Math.PI / 2 + 2 * Math.PI * k / juntas.length;
      x.dx = Math.round(r * Math.cos(a));
      x.dy = Math.round(r * Math.sin(a));
    });
  }
  return pilhas;
}

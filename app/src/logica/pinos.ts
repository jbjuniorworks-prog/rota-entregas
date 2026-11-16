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
//
// No zoom máximo (`soMesmoLugar`), juntar pelo desenho já não tira bagunça da tela: esconde casa.
// Os 38 px dão uns 11 m ali, e duas casas uma em frente à outra, a 8 m, viravam um pino que nenhum
// zoom separava (dono, 15/11: "pra arrumar é um saco"). No histórico, 11,5% dos endereços ficavam
// presos num pino dividido. Ali só junta o mesmo endereço, e as que se cobrem abrem em leque.
export function empilhar(ps: Parada[], projetar: (p: Ponto) => {x: number; y: number}, ordem: (p: Parada) => number = () => 0, soMesmoLugar = false): Pilha[] {
  const out: Pilha[] = [];
  for (const p of [...ps].sort((a, b) => ordem(a) - ordem(b))) {
    if (p.lat == null || p.lng == null) continue;
    const pt = projetar(p as Ponto);
    const estado = estadoDe(p);
    if (sozinha(p)) { out.push({ps: [p], x: pt.x, y: pt.y, estado}); continue; }
    const mesmoLugar = out.find(x => x.estado === estado && !sozinha(x.ps[0])
      && haversine(x.ps[0] as Ponto, p as Ponto) <= MESMO_LUGAR
      && (mesmoEndereco([x.ps[0].texto, p.texto]) || mesmaPortaPeloNome(x.ps[0], p)));
    const g = mesmoLugar || !soMesmoLugar && out.find(x => x.estado === estado && !sozinha(x.ps[0])
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

// No zoom máximo, os pinos de endereços diferentes que ainda se cobrem (o pino tem 30 px; mais
// perto que isto, o dedo acerta o de cima) abrem em leque em volta do meio deles. Cada um vai para
// o lado onde está de verdade, ligado ao seu ponto por um traço, como o leque das separadas. Só
// os que faltam: é neles que ele toca para entregar e arrumar.
export const SE_COBREM = 24;
export function abrirAsQueSeCobrem(pilhas: Pilha[], raio = RAIO_LEQUE): Pilha[] {
  const livres = pilhas.filter(g => g.estado !== 'e' && g.dx == null);
  const feitas = new Set<Pilha>();
  for (const g of livres) {
    if (feitas.has(g)) continue;
    const juntas = livres.filter(x => !feitas.has(x) && Math.abs(x.x - g.x) < SE_COBREM && Math.abs(x.y - g.y) < SE_COBREM);
    juntas.forEach(x => feitas.add(x));
    if (juntas.length < 2) continue;
    const cx = juntas.reduce((s, x) => s + x.x, 0) / juntas.length;
    const cy = juntas.reduce((s, x) => s + x.y, 0) / juntas.length;
    const r = Math.max(raio, juntas.length * 34 / (2 * Math.PI));
    // no mesmo ponto não há lado: vão para a volta, a partir de cima
    const lado = (x: Pilha) => Math.hypot(x.x - cx, x.y - cy) >= 1 ? Math.atan2(x.y - cy, x.x - cx) : null;
    const emVolta = [...juntas].sort((a, b) => (lado(a) ?? 9) - (lado(b) ?? 9));
    const inicio = lado(emVolta[0]) ?? -Math.PI / 2;
    emVolta.forEach((x, k) => {
      const a = inicio + 2 * Math.PI * k / emVolta.length;
      x.dx = Math.round(cx + r * Math.cos(a) - x.x);
      x.dy = Math.round(cy + r * Math.sin(a) - x.y);
    });
  }
  return pilhas;
}

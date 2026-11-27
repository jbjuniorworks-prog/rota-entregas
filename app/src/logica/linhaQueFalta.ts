import {haversine} from './geo';
import type {Ponto} from './tipos';

// Dono, 26/11, com a foto do mapa na rua: "pinos que foram feitos não precisam mais estar com
// caminhos, sempre ao próximo". A linha de uma área é um traço só, do começo ao fim, sem dizer onde
// acaba cada trecho. Aqui ela é cortada no ponto mais perto de cada parada, na ordem da rota, e fica
// só o trecho que chega a uma parada que ainda falta.

export interface ParadaDaLinha extends Ponto {
  // entregue, ou deixada para depois: a linha não precisa levar até ela
  feita: boolean;
}

// O serviço de ruas encosta a parada na rua: o corte cai a poucos metros dela. Uma rua de ida e
// volta passa duas vezes perto do mesmo ponto; vale a primeira passagem depois do corte de antes.
const PERTO_M = 30;

function corte(linha: [number, number][], p: Ponto, de: number): number {
  let melhor = de, menor = Infinity;
  for (let i = de; i < linha.length; i++) {
    const d = haversine({lat: linha[i][0], lng: linha[i][1]}, p);
    if (d < menor) { menor = d; melhor = i; }
    // já passou perto e está se afastando: é esta a passagem
    else if (menor <= PERTO_M && d > 2 * PERTO_M) break;
  }
  return melhor;
}

// Os pedaços da linha a desenhar. `paradas` na ordem da rota; `comFim` quando o traço segue até o
// ponto de chegada depois da última, e esse trecho fica enquanto alguma faltar.
export function linhaQueFalta(linha: [number, number][], paradas: ParadaDaLinha[], comFim: boolean): [number, number][][] {
  if (linha.length < 2 || !paradas.length) return [linha];
  const cortes = [0];
  for (const p of paradas) cortes.push(corte(linha, p, cortes[cortes.length - 1]));
  const trechos: {de: number; ate: number}[] = paradas.map((p, k) => p.feita ? null : {de: cortes[k], ate: cortes[k + 1]})
    .filter((t): t is {de: number; ate: number} => !!t);
  if (comFim && paradas.some(p => !p.feita)) trechos.push({de: cortes[cortes.length - 1], ate: linha.length - 1});
  // trechos seguidos viram um traço só
  const juntos: {de: number; ate: number}[] = [];
  for (const t of trechos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && ultimo.ate === t.de) ultimo.ate = t.ate;
    else juntos.push({...t});
  }
  return juntos.map(t => linha.slice(t.de, t.ate + 1)).filter(t => t.length >= 2);
}

// Dono, 27/11, com a foto do mapa ao vivo: "a linha continua atrás de onde estou, atrapalha mais que
// ajuda". O trecho até a próxima começa na última feita; com o GPS em cima dele, começa no entregador.
// Longe da linha (outro caminho, GPS ruim), ela fica como está: cortar num lugar errado engana mais.
const NA_LINHA_M = 40;

// o ponto do segmento a-b mais perto de p, e a distância até ele, num plano local (poucos metros)
function noSegmento(a: [number, number], b: [number, number], p: Ponto): {d: number; q: [number, number]} {
  const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
  const ax = (a[1] - p.lng) * kx, ay = (a[0] - p.lat) * ky, dx = (b[1] - a[1]) * kx, dy = (b[0] - a[0]) * ky;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  const x = ax + t * dx, y = ay + t * dy;
  return {d: Math.hypot(x, y), q: [p.lat + y / ky, p.lng + x / kx]};
}

export function aPartirDeMim(trechos: [number, number][][], eu: Ponto | null): [number, number][][] {
  if (!eu || !trechos.length) return trechos;
  const [t, ...resto] = trechos;
  let melhor = -1, menor = Infinity, q: [number, number] = t[0];
  for (let i = 0; i < t.length - 1; i++) {
    const s = noSegmento(t[i], t[i + 1], eu);
    if (s.d < menor) { menor = s.d; melhor = i; q = s.q; }
    // como no corte: numa rua de ida e volta, vale a primeira passagem
    else if (menor <= NA_LINHA_M && s.d > 2 * NA_LINHA_M) break;
  }
  if (menor > NA_LINHA_M) return trechos;
  return [[q, ...t.slice(melhor + 1)], ...resto];
}

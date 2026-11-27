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

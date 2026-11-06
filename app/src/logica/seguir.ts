// O mapa seguindo o motorista (05/11, "o mapa não está sempre seguindo o ponto, isso é bem chato
// enquanto roda"). Ele só ia atrás depois de 30 m: a 40 km/h, um salto a cada 3 s, e entre um e
// outro o ponto escorregava para fora do meio. Agora vai a cada leitura boa do GPS. Os números são
// os de partida, para ajustar no celular.
import {haversine} from './geo';
import type {Ponto} from './tipos';

// menos que isso é o GPS tremendo com ele parado
export const MOVER_M = 5;
// margem maior que esta: o ponto não é confiável para centrar o mapa nele
export const SEGUIR_ATE_M = 50;
// 180 km/h: mais rápido que isso, desde a leitura anterior, é salto do GPS
export const VELOCIDADE_MAX = 50;

export interface Leitura extends Ponto {
  quando: number;
}

export type Passo = 'mover' | 'ficar' | 'esperar';

const rapidoDemais = (de: Leitura, para: Leitura) =>
  haversine(de, para) / (Math.max(para.quando - de.quando, 1000) / 1000) > VELOCIDADE_MAX;

// `ancora` é onde o mapa centrou da última vez; `suspeita`, a leitura que saltou e ficou de fora.
// Um salto sozinho não move o mapa; a leitura seguinte, perto dele, confirma (o GPS se acertou,
// ou ele de fato está lá), e o mapa vai.
export function passoDoSeguir(ancora: Leitura, eu: Leitura, suspeita: Leitura | null): {passo: Passo; suspeita: Leitura | null} {
  if (haversine(ancora, eu) < MOVER_M) return {passo: 'ficar', suspeita: null};
  if (!rapidoDemais(ancora, eu)) return {passo: 'mover', suspeita: null};
  if (suspeita && eu.quando > suspeita.quando && !rapidoDemais(suspeita, eu)) return {passo: 'mover', suspeita: null};
  return {passo: 'esperar', suspeita: suspeita && suspeita.quando === eu.quando ? suspeita : eu};
}

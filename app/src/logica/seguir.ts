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

// Pedro, 07/11: entregou pelo cartão do pino, o cartão ficou aberto e o mapa ficou no pino
// enquanto ele rodava. O cartão aberto pausa o seguir, para ele olhar o lugar; afastando isto de
// onde abriu, ele já foi embora, e o cartão fecha. Número de partida, para validar na rua.
export const SAIR_DO_CARTAO_M = 50;

// `desde` é onde ele estava ao abrir o cartão; nulo enquanto não houve leitura boa, e a primeira
// boa vira o ponto de partida. Leitura com margem acima da do seguir não conta: parado na porta,
// um GPS ruim "anda" dezenas de metros.
// `pino`, o lugar do cartão. Chegando nele, o cartão fica (dono, 27/11): abriu o cartão do P33
// vindo de longe, andou até a porta, o cartão fechou sozinho e o da próxima apareceu debaixo do
// dedo; o Entreguei caiu na Rua João Dionízio 208, a 600 m dali. Fecha só quem está indo embora.
export function cartaoAoAndar(desde: Ponto | null, eu: Ponto & {precisao: number}, pino: Ponto | null = null): {desde: Ponto | null; fechar: boolean} {
  if (eu.precisao > SEGUIR_ATE_M) return {desde, fechar: false};
  if (!desde) return {desde: {lat: eu.lat, lng: eu.lng}, fechar: false};
  if (haversine(desde, eu) < SAIR_DO_CARTAO_M) return {desde, fechar: false};
  if (pino && (haversine(eu, pino) < SAIR_DO_CARTAO_M || haversine(eu, pino) < haversine(desde, pino))) return {desde, fechar: false};
  return {desde, fechar: true};
}

// Olhar à frente (dono, 27/11: "olhar pra frente acho interessante, vamos testar"). Andando, o meio
// do mapa fica adiante dele, na direção em que ele vai: ele fica mais para a borda de trás e a tela
// mostra mais do caminho. O mapa continua com o norte para cima. Parado não há rumo: ele fica no
// meio, como antes. O rumo vai em passos de 15°, para o mapa não tremer a cada leitura.
export const A_FRENTE_LARGURA = 0.3;
export const A_FRENTE_ALTURA = 0.28;
export function olharAFrente(rumo: number | null, largura: number, altura: number): {x: number; y: number} {
  if (rumo == null || !Number.isFinite(rumo)) return {x: 0, y: 0};
  const r = Math.round(rumo / 15) * 15 * Math.PI / 180;
  // na tela, y cresce para baixo: indo para o norte, o meio fica acima dele
  return {x: Math.round(Math.sin(r) * A_FRENTE_LARGURA * largura) || 0, y: Math.round(-Math.cos(r) * A_FRENTE_ALTURA * altura) || 0};
}

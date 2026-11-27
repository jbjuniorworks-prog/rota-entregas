import {haversine} from './geo';
import {distanciaDaLinha} from './linhaQueFalta';
import type {Ponto} from './tipos';

// Dono, 27/11, com a foto do Google Maps na rua: "se conseguimos deixar o mapa reagindo bem, se
// adaptando à nossa movimentação, paramos de usar o Maps e o Waze". Pegou outra rua, a linha até a
// próxima continuava no caminho velho. Aqui se decide quando pedir um caminho novo, de onde ele está.

// Fora da linha mais que isto. O GPS de até 30 m pode pôr ele na rua do lado: 50 m é sair de verdade.
export const FORA_M = 50;
// E por este tempo: uma leitura ruim, ou parar na calçada do outro lado, não refaz nada.
export const FORA_POR_MS = 10_000;
// O serviço de ruas é de graça e pede calma (um pedido por segundo, para todo mundo).
export const ENTRE_PEDIDOS_MS = 20_000;
// Chegando, a porta está à vista: o caminho novo não ajuda.
export const PERTO_DA_PARADA_M = 80;
// GPS pior que isto não diz onde ele está.
export const GPS_BOM_M = 30;

export interface Vigia {
  foraDesde: number | null;
  ultimoPedido: number;
}
export const vigiaNova = (): Vigia => ({foraDesde: null, ultimoPedido: -Infinity});

export interface Leitura extends Ponto {
  precisao: number;
  quando: number;
}

// `linha`: o caminho desenhado até a próxima (null: nenhum). Devolve se é hora de pedir outro.
export function devoRefazer(linha: [number, number][] | null, eu: Leitura, destino: Ponto, v: Vigia): {pedir: boolean; vigia: Vigia} {
  if (eu.precisao > GPS_BOM_M) return {pedir: false, vigia: v};
  const fora = haversine(eu, destino) > PERTO_DA_PARADA_M && (!linha || linha.length === 0 || distanciaDaLinha(linha, eu) > FORA_M);
  if (!fora) return {pedir: false, vigia: {...v, foraDesde: null}};
  const foraDesde = v.foraDesde ?? eu.quando;
  const pedir = eu.quando - foraDesde >= FORA_POR_MS && eu.quando - v.ultimoPedido >= ENTRE_PEDIDOS_MS;
  return {pedir, vigia: {foraDesde, ultimoPedido: pedir ? eu.quando : v.ultimoPedido}};
}

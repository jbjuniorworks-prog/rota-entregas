import {hojeLocal} from './uso';
import type {Parada, PortaAntes} from './tipos';

// "Às vezes o cliente fala depois que é uma localização errada, e temos o trabalho de arrumar"
// (dono, 25/11). O desfazer da porta era o aviso de 10 s; o do "Entreguei aqui", só junto com a
// entrega. Medido no banco no mesmo dia: de 286 vezes que um motorista mudou de novo, em mais de
// 25 m, a porta que o próprio motorista tinha marcado, 148 foram mais de 2 min depois.
//
// A porta ainda se desfaz pelo cartão enquanto o pino está onde a marcação pôs, e no mesmo dia.
// Mexido de novo depois, a marcação de antes já não descreve o pino; de outro dia, ninguém lembra
// mais de onde ele estava.
export interface PortaDesfazivel {
  de: 'mudanca' | 'entrega';
  quando: number;
}

const valeAinda = (p: Parada, a: PortaAntes | undefined, hoje: string): a is PortaAntes & {quando: number} =>
  !!a && a.quando != null && hojeLocal(a.quando) === hoje && p.lat === a.porta.lat && p.lng === a.porta.lng;

export function portaDesfazivel(p: Parada, agora = Date.now()): PortaDesfazivel | null {
  const hoje = hojeLocal(agora);
  // a mudança vem depois da entrega quando as duas existem: é a que está no pino
  if (valeAinda(p, p.mudanca, hoje)) return {de: 'mudanca', quando: p.mudanca.quando};
  if (valeAinda(p, p.portaAntes, hoje)) return {de: 'entrega', quando: p.portaAntes.quando};
  return null;
}

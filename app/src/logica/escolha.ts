import {MAPS_MAX} from './otimizacao';
import type {Parada} from './tipos';

// Escolher os pinos para o Maps (pedido do dono, 16/10): cada toque num pino marca ou desmarca, e
// a ordem dos toques é a ordem do Maps, que chama os pontos de A a I. O pino mostra a mesma letra.
export const LETRAS = 'ABCDEFGHI'.slice(0, MAPS_MAX);

// `ids` são as entregas do pino tocado, na ordem da rota. Vale a primeira ainda por entregar: é
// para onde ele vai.
export function alternarEscolha(escolhidas: string[], ids: string[], parada: (id: string) => Parada | undefined): {escolhidas: string[]; aviso?: string} {
  const ja = escolhidas.find(id => ids.includes(id));
  if (ja) return {escolhidas: escolhidas.filter(id => id !== ja)};
  const aberta = ids.map(parada).find(p => p && !p.entregue && p.lat != null && p.lng != null);
  if (!aberta) return {escolhidas, aviso: 'Este pino já foi entregue.'};
  if (escolhidas.length >= MAPS_MAX) return {escolhidas, aviso: `Já são ${MAPS_MAX}, o máximo do Maps. Toque num escolhido para tirar.`};
  return {escolhidas: [...escolhidas, aberta.id]};
}

export function letraDoPino(escolhidas: string[], ids: string[]): string {
  const i = escolhidas.findIndex(id => ids.includes(id));
  return i < 0 ? '' : LETRAS[i];
}

import {haversine, RAIO_BLOCO} from './geo';
import {MAPS_MAX} from './otimizacao';
import type {Parada, Ponto} from './tipos';

// Escolher os pinos para o Maps (pedido do dono, 16/10): cada toque num pino marca ou desmarca, e
// a ordem dos toques é a ordem do Maps, que chama os pontos de A a I. O pino mostra a mesma letra.
export const LETRAS = 'ABCDEFGHI'.slice(0, MAPS_MAX);

const valida = (p: Parada | undefined): p is Parada => !!p && !p.entregue && p.lat != null && p.lng != null;

// O que conta da escolha: entrega que ainda existe, por entregar e com posição. O contador, as
// letras dos pinos, a lista do cartão e o link do Maps saem todos daqui, para não discordarem.
export function escolhidasValidas(escolhidas: string[], parada: (id: string) => Parada | undefined): string[] {
  return escolhidas.filter(id => valida(parada(id)));
}

// Um pino pode juntar entregas de lugares diferentes (o mapa empilha o que fica perto na tela).
// Cada lugar é um destino, na ordem da rota (`ids` já vem nela); a até 10 m é a mesma porta.
function destinosDoPino(ids: string[], parada: (id: string) => Parada | undefined): string[] {
  const out: Parada[] = [];
  for (const p of ids.map(parada)) {
    if (valida(p) && !out.some(q => haversine(q as Ponto, p as Ponto) <= RAIO_BLOCO)) out.push(p);
  }
  return out.map(p => p.id);
}

// Tocar num pino que tem escolhido tira todos os dele: com o mapa afastado, dois escolhidos podem
// cair no mesmo pino, e ele mostra os dois.
export function alternarEscolha(escolhidas: string[], ids: string[], parada: (id: string) => Parada | undefined): {escolhidas: string[]; aviso?: string} {
  const atuais = escolhidasValidas(escolhidas, parada);
  if (atuais.some(id => ids.includes(id))) return {escolhidas: atuais.filter(id => !ids.includes(id))};
  const novos = destinosDoPino(ids, parada);
  if (!novos.length) return {escolhidas: atuais, aviso: 'Este pino já foi entregue.'};
  const cabem = MAPS_MAX - atuais.length;
  if (!cabem) return {escolhidas: atuais, aviso: `Já são ${MAPS_MAX}, o limite que o app manda ao Maps. Toque num escolhido para tirar.`};
  if (novos.length > cabem) return {escolhidas: atuais, aviso: `Este pino junta ${novos.length} lugares, e só cabem mais ${cabem}. Aproxime o mapa para escolher um por um.`};
  return {escolhidas: [...atuais, ...novos]};
}

// A letra do primeiro escolhido do pino e, havendo mais, quantos: "A+2".
export function letraDoPino(escolhidas: string[], ids: string[]): string {
  const is = escolhidas.flatMap((id, i) => ids.includes(id) ? [i] : []);
  return is.length ? LETRAS[is[0]] + (is.length > 1 ? `+${is.length - 1}` : '') : '';
}

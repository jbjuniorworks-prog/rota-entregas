import {describe, expect, test} from 'vitest';
import {devoRefazer, ENTRE_PEDIDOS_MS, FORA_POR_MS, vigiaNova, type Vigia} from './desvio';

// A linha até a próxima: uma rua reta de oeste para leste, uns 1,1 km; a próxima no fim dela.
const linha: [number, number][] = [[-10.95, -37.06], [-10.95, -37.05]];
const destino = {lat: -10.95, lng: -37.05};
// norte = metros ao norte da rua, no meio dela
const eu = (norte: number, quando: number, precisao = 8) => ({lat: -10.95 + norte / 110540, lng: -37.055, precisao, quando});

// passa as leituras em sequência, como o GPS, e diz em quais o app pediu caminho novo
function andar(leituras: ReturnType<typeof eu>[], l: [number, number][] | null = linha, v: Vigia = vigiaNova()) {
  const pediu: number[] = [];
  for (const x of leituras) {
    const r = devoRefazer(l, x, destino, v);
    v = r.vigia;
    if (r.pedir) pediu.push(x.quando);
  }
  return pediu;
}
const cada = (de: number, ate: number, passo: number, norte: number) =>
  Array.from({length: Math.floor((ate - de) / passo) + 1}, (_, i) => eu(norte, de + i * passo));

describe('quando pedir um caminho novo até a próxima', () => {
  test('na linha, nunca', () => {
    expect(andar(cada(0, 60_000, 1000, 20))).toEqual([]);
  });

  test('fora dela, só depois de 10 s seguidos fora', () => {
    expect(andar(cada(0, FORA_POR_MS - 1000, 1000, 120))).toEqual([]);
    expect(andar(cada(0, FORA_POR_MS, 1000, 120))).toEqual([FORA_POR_MS]);
  });

  test('voltar para a linha no meio zera a conta', () => {
    expect(andar([...cada(0, 8000, 1000, 120), eu(10, 9000), ...cada(10_000, 18_000, 1000, 120)])).toEqual([]);
  });

  test('continuando fora, o próximo pedido espera 20 s', () => {
    // (o pedido que não trouxe caminho: com caminho novo, ele está na linha nova)
    expect(andar(cada(0, 45_000, 1000, 120))).toEqual([FORA_POR_MS, FORA_POR_MS + ENTRE_PEDIDOS_MS]);
  });

  test('perto da próxima, não pede: a porta está à vista', () => {
    const chegando = Array.from({length: 15}, (_, i) => ({lat: -10.9495, lng: -37.0505, precisao: 8, quando: i * 1000}));
    expect(andar(chegando)).toEqual([]);
  });

  test('com GPS ruim, não pede', () => {
    expect(andar(cada(0, 30_000, 1000, 120).map(x => ({...x, precisao: 60})))).toEqual([]);
  });

  test('sem linha nenhuma até a próxima, pede do mesmo jeito', () => {
    expect(andar(cada(0, FORA_POR_MS, 1000, 0), null)).toEqual([FORA_POR_MS]);
  });
});

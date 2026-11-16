import {describe, expect, it} from 'vitest';
import {avisoDaGaiola, foraDaGaiola, naoVistos, textoDaGaiola} from './gaiola';
import {estadoVazio} from './guarda';
import {adicionarDaPlanilha} from './importar';
import {itensDaPlanilha} from './planilha';
import type {Estado} from './tipos';

// Planilhas no molde da Shopee, com endereços e códigos inventados. "-" na sequência e na parada é
// o pacote que veio sem número.
const CAB = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
const linha = (at: string, seq: number | '-', tn: string | null, numero: number, bairro = 'Bairro Alfa') =>
  [at, seq, seq, tn ?? '', `Rua Inventada, ${numero}`, bairro, 'Aracaju', '49000-000', -10.95 + numero / 1e5, -37.05];
const numeradas = (at: string, n: number, desde = 1) => Array.from({length: n}, (_, i) => linha(at, desde + i, `BR${at}${desde + i}`, desde + i));
const carregar = (e: Estado, linhas: unknown[][], cab = CAB) => {
  adicionarDaPlanilha(e, itensDaPlanilha([cab, ...linhas], 'rota.xlsx'), () => false);
  return e;
};
const tns = (e: Estado) => foraDaGaiola(e.paradas).map(f => f.tn);

describe('os pacotes que não estão na gaiola', () => {
  it('são os que vieram sem número de parada, com o bairro de cada um', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 501, 'Bairro Beta'), linha('AT1', '-', 'BRX2', 502)]);
    expect(foraDaGaiola(e.paradas).map(f => [f.tn, f.bairro])).toEqual([['BRX1', 'Bairro Beta'], ['BRX2', 'Bairro Alfa']]);
  });

  it('o entregue sai da conta', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 501), linha('AT1', '-', 'BRX2', 502)]);
    e.paradas.find(p => p.pacotes?.includes('BRX1'))!.entregue = true;
    expect(tns(e)).toEqual(['BRX2']);
  });

  it('no mesmo endereço de um numerado, só o pacote sem número conta', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 5)]);
    // os dois juntos numa parada só
    expect(e.paradas.find(p => p.pacotes?.includes('BRX1'))!.pacotes).toEqual(['BRAT15', 'BRX1']);
    expect(tns(e)).toEqual(['BRX1']);
  });

  it('a planilha que veio inteira sem sequência não avisa nada', () => {
    const e = carregar(estadoVazio(), Array.from({length: 8}, (_, i) => linha('AT1', '-', `BRX${i}`, 600 + i)));
    expect(tns(e)).toEqual([]);
  });

  it('até 30% sem número ainda é exceção; 40% é a planilha que veio sem sequência', () => {
    const com3 = carregar(estadoVazio(), [...numeradas('AT1', 7), ...[1, 2, 3].map(i => linha('AT1', '-', `BRX${i}`, 600 + i))]);
    expect(tns(com3)).toHaveLength(3);
    const com4 = carregar(estadoVazio(), [...numeradas('AT1', 6), ...[1, 2, 3, 4].map(i => linha('AT1', '-', `BRX${i}`, 600 + i))]);
    expect(tns(com4)).toEqual([]);
  });

  it('cada planilha por si: a segunda, sem sequência, não apaga o aviso da primeira', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 501)]);
    carregar(e, Array.from({length: 5}, (_, i) => linha('AT2', '-', `BRY${i}`, 700 + i)));
    expect(tns(e)).toEqual(['BRX1']);
  });

  it('com número de parada, mesmo sem sequência, o pacote está na rota: não avisa', () => {
    const semSequencia = linha('AT1', '-', 'BRX1', 501);
    semSequencia[2] = 11;
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), semSequencia]);
    expect(tns(e)).toEqual([]);
  });

  it('sem código de pacote não é da Shopee: não avisa', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', null, 501)]);
    expect(tns(e)).toEqual([]);
  });
});

describe('o "Já peguei"', () => {
  it('vale para os pacotes que estavam no aviso; o novo volta a avisar', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 501), linha('AT1', '-', 'BRX2', 502)]);
    expect(naoVistos(foraDaGaiola(e.paradas), ['BRX1', 'BRX2'])).toEqual([]);
    carregar(e, [linha('AT1', '-', 'BRX3', 503)]);
    expect(naoVistos(foraDaGaiola(e.paradas), ['BRX1', 'BRX2']).map(f => f.tn)).toEqual(['BRX3']);
  });
});

describe('os textos', () => {
  it('um e vários', () => {
    expect(avisoDaGaiola(1)).toBe('1 pacote não está na sua gaiola.');
    expect(avisoDaGaiola(3)).toBe('3 pacotes não estão na sua gaiola.');
  });

  it('para os analistas: o código e o bairro de cada um', () => {
    const e = carregar(estadoVazio(), [...numeradas('AT1', 10), linha('AT1', '-', 'BRX1', 501, 'Bairro Beta'), linha('AT1', '-', 'BRX2', 502)]);
    expect(textoDaGaiola(foraDaGaiola(e.paradas))).toBe([
      '2 pacotes não estão na minha gaiola. Vieram na rota sem número de parada:',
      'BRX1 · Bairro Beta',
      'BRX2 · Bairro Alfa',
    ].join('\n'));
  });
});

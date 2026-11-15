import {describe, expect, it} from 'vitest';
import {GPS_DO_AVISO, pinosPerto, RAIO_DO_AVISO, REARMAR} from './aviso';
import type {Parada} from './tipos';

const PINO = {lat: -10.9605, lng: -37.0455};
const parada = (id: string, extra: Partial<Parada> = {}): Parada => ({
  id, area: 'a', ml: null, texto: id, unidades: null, comercial: false, ...PINO,
  exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
// 1 m de latitude são 1/111320 grau: pontos ao norte do pino, a tantos metros dele
const aNorte = (metros: number, precisao = 8) => ({lat: PINO.lat + metros / 111320, lng: PINO.lng, precisao});

describe('o toque perto do pino', () => {
  it('chegando a menos do raio de uma parada por entregar, ela toca', () => {
    expect(pinosPerto([parada('a')], aNorte(RAIO_DO_AVISO - 5), new Set())).toEqual(['a']);
  });

  it('do lado de fora do raio, não toca', () => {
    expect(pinosPerto([parada('a')], aNorte(RAIO_DO_AVISO + 5), new Set())).toEqual([]);
  });

  it('continuando perto, a mesma parada não toca de novo', () => {
    const avisadas = new Set<string>();
    pinosPerto([parada('a')], aNorte(20), avisadas);
    expect(pinosPerto([parada('a')], aNorte(10), avisadas)).toEqual([]);
  });

  it('o GPS oscilando para fora do raio e de volta, sem se afastar, não toca de novo', () => {
    const avisadas = new Set<string>();
    pinosPerto([parada('a')], aNorte(30), avisadas);
    pinosPerto([parada('a')], aNorte(RAIO_DO_AVISO + 20), avisadas);
    expect(pinosPerto([parada('a')], aNorte(30), avisadas)).toEqual([]);
  });

  it('depois de se afastar mais que o rearmar, passando de novo ela toca de novo', () => {
    const avisadas = new Set<string>();
    pinosPerto([parada('a')], aNorte(30), avisadas);
    pinosPerto([parada('a')], aNorte(REARMAR + 10), avisadas);
    expect(pinosPerto([parada('a')], aNorte(30), avisadas)).toEqual(['a']);
  });

  it('entregue, não toca', () => {
    expect(pinosPerto([parada('a', {entregue: true})], aNorte(10), new Set())).toEqual([]);
  });

  it('pino em dúvida, posto pelo meio do bairro, não toca', () => {
    expect(pinosPerto([parada('a', {precisao: 'bairro'})], aNorte(10), new Set())).toEqual([]);
  });

  it('sem posição, não toca', () => {
    expect(pinosPerto([parada('a', {lat: null, lng: null})], aNorte(10), new Set())).toEqual([]);
  });

  it('com o GPS mais incerto que o limite, não toca', () => {
    expect(pinosPerto([parada('a')], aNorte(10, GPS_DO_AVISO + 1), new Set())).toEqual([]);
  });

  it('duas paradas que ficam perto na mesma leitura vêm juntas', () => {
    expect(pinosPerto([parada('a'), parada('b')], aNorte(10), new Set())).toEqual(['a', 'b']);
  });
});

import {describe, expect, it} from 'vitest';
import {diaCurto, diaDaRota, oQueFazerNoDiaNovo, resumoDoDia} from './diaNovo';
import {estadoVazio} from './guarda';
import {adicionarDaPlanilha, adicionarLinhas} from './importar';
import {itensDaPlanilha} from './planilha';
import type {Estado, Parada} from './tipos';

// Meio-dia em Aracaju (UTC-3) de cada dia, longe da virada.
const MEIO_DIA = (dia: string) => Date.parse(`${dia}T15:00:00Z`);
const parada = (id: string, entregueEm: number | null, extra: Partial<Parada> = {}): Parada =>
  ({id, texto: `Rua Inventada, ${id}`, area: 'a1', ml: null, lat: -10.95, lng: -37.05, precisao: 'planilha', candidatos: [], entregue: entregueEm != null, entregueEm, ...extra} as Parada);
const estado = (paradas: Parada[], dia?: string): Estado => Object.assign(estadoVazio(), {paradas}, dia ? {dia} : {});

describe('o dia da rota', () => {
  it('é o da última leitura ou o da última entrega, o mais novo', () => {
    expect(diaDaRota(estado([parada('1', null)], '2026-11-15'))).toBe('2026-11-15');
    expect(diaDaRota(estado([parada('1', MEIO_DIA('2026-11-14')), parada('2', MEIO_DIA('2026-11-15'))]))).toBe('2026-11-15');
    expect(diaDaRota(estado([parada('1', MEIO_DIA('2026-11-16'))], '2026-11-15'))).toBe('2026-11-16');
    expect(diaDaRota(estado([parada('1', null)]))).toBe(null);
  });

  it('a entrega das 23h de Aracaju é daquele dia, não do seguinte em UTC', () => {
    expect(diaDaRota(estado([parada('1', Date.parse('2026-11-17T02:00:00Z'))]))).toBe('2026-11-16');
  });
});

describe('o que fazer ao abrir num dia novo', () => {
  const HOJE = MEIO_DIA('2026-11-17');

  it('a rota de ontem toda entregue sai sozinha', () => {
    expect(oQueFazerNoDiaNovo(estado([parada('1', MEIO_DIA('2026-11-16')), parada('2', MEIO_DIA('2026-11-16'))], '2026-11-16'), HOJE))
      .toEqual({acao: 'limpar', dia: '2026-11-16'});
  });

  it('com entrega por fazer, pergunta, dizendo quantas', () => {
    const e = estado([parada('1', MEIO_DIA('2026-11-16')), parada('2', null), parada('3', null, {adiada: true})], '2026-11-16');
    expect(oQueFazerNoDiaNovo(e, HOJE)).toEqual({acao: 'perguntar', dia: '2026-11-16', pendentes: 2});
  });

  it('no mesmo dia, nada', () => {
    expect(oQueFazerNoDiaNovo(estado([parada('1', MEIO_DIA('2026-11-17'))], '2026-11-17'), HOJE)).toEqual({acao: 'nada'});
  });

  it('sem data nenhuma, não dá para dizer que é de ontem: nada', () => {
    expect(oQueFazerNoDiaNovo(estado([parada('1', null)]), HOJE)).toEqual({acao: 'nada'});
  });

  it('sem parada, nada', () => {
    expect(oQueFazerNoDiaNovo(estado([], '2026-11-10'), HOJE)).toEqual({acao: 'nada'});
  });
});

describe('a leitura grava o dia', () => {
  const CAB = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
  const planilha = (n: number) => itensDaPlanilha([CAB, ...Array.from({length: n}, (_, i) => ['AT1', i + 1, i + 1, `BR${i}`, `Rua Inventada, ${i + 1}`, 'Bairro Alfa', 'Aracaju', '49000-000', -10.95 - i / 1e4, -37.05])], 'rota.xlsx');

  it('a planilha, no dia em que entra', () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, planilha(3), () => false, MEIO_DIA('2026-11-16'));
    expect(e.dia).toBe('2026-11-16');
  });

  it('a mesma planilha lida de novo no dia seguinte não muda o dia: nada entrou', () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, planilha(3), () => false, MEIO_DIA('2026-11-16'));
    adicionarDaPlanilha(e, planilha(3), () => false, MEIO_DIA('2026-11-17'));
    expect(e.dia).toBe('2026-11-16');
  });

  it('os endereços colados ou lidos de print também', () => {
    const e = estadoVazio();
    adicionarLinhas(e, ['Rua Inventada, 10, Bairro Alfa, Aracaju'], [], MEIO_DIA('2026-11-16'));
    expect(e.dia).toBe('2026-11-16');
  });
});

describe('o resumo do fim', () => {
  it('quantas entregas, da primeira à última hora', () => {
    const e = estado([parada('1', MEIO_DIA('2026-11-16') - 3600e3), parada('2', MEIO_DIA('2026-11-16')), parada('3', null)]);
    expect(resumoDoDia(e)).toEqual({entregas: 2, de: MEIO_DIA('2026-11-16') - 3600e3, ate: MEIO_DIA('2026-11-16')});
  });

  it('o dia como o motorista fala', () => {
    expect(diaCurto('2026-11-16')).toBe('16/11');
  });
});

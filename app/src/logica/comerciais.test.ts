import {describe, expect, it} from 'vitest';
import {aplicarComerciais, ehComercial, quemMarcou} from './comerciais';
import type {Parada} from './tipos';

const parada = (id: string, extra: Partial<Parada> = {}): Parada => ({
  id, area: 'a', ml: null, texto: id, unidades: null, comercial: false, lat: -10.9, lng: -37.05,
  exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
const chaveDe = (p: Parada) => p.texto === 'sem' ? null : p.texto;

describe('pino comercial', () => {
  it('o leitor do Meli, a minha marca ou a de outro motorista deixam o pino comercial', () => {
    expect(ehComercial(parada('a'))).toBe(false);
    expect(ehComercial(parada('a', {comercial: true}))).toBe(true);
    expect(ehComercial(parada('a', {comercialMeu: true}))).toBe(true);
    expect(ehComercial(parada('a', {comercialOutros: true}))).toBe(true);
  });

  it('a nuvem diz de quem é a marca de cada endereço', () => {
    const ps = [parada('a'), parada('b'), parada('c')];
    const n = aplicarComerciais(ps, [{chave_lugar: 'a', minha: true, outros: false}, {chave_lugar: 'b', minha: false, outros: true}], chaveDe, {}, new Set(['a', 'b', 'c']));
    expect(n).toBe(2);
    expect(ps.map(p => [p.comercialMeu, p.comercialOutros])).toEqual([[true, undefined], [undefined, true], [undefined, undefined]]);
  });

  // Ele tirou a marca sem sinal; a consulta que volta antes do envio ainda diz que é dele.
  it('o que espera na fila manda na minha marca, e não mexe na dos outros', () => {
    const ps = [parada('a', {comercialMeu: true}), parada('b')];
    aplicarComerciais(ps, [{chave_lugar: 'a', minha: true, outros: true}, {chave_lugar: 'b', minha: false, outros: false}], chaveDe,
      {a: 'tirar', b: 'marcar'}, new Set(['a', 'b']));
    expect(ps[0].comercialMeu).toBeUndefined();
    expect(ps[0].comercialOutros, 'tirar a minha não apaga a de outro motorista').toBe(true);
    expect(ps[1].comercialMeu).toBe(true);
  });

  it('o admin tirando de todos não espera a nuvem para apagar a dos outros', () => {
    const ps = [parada('a', {comercialOutros: true})];
    aplicarComerciais(ps, [{chave_lugar: 'a', minha: false, outros: true}], chaveDe, {a: 'tirarTodas'}, new Set(['a']));
    expect(ps[0].comercialOutros).toBeUndefined();
  });

  it('marca que a nuvem tirou some; endereço fora da consulta ou sem chave fica como estava', () => {
    const ps = [parada('a', {comercialOutros: true}), parada('b', {comercialMeu: true}), parada('sem', {comercialMeu: true})];
    aplicarComerciais(ps, [], chaveDe, {}, new Set(['a']));
    expect(ps[0].comercialOutros).toBeUndefined();
    expect(ps[1].comercialMeu).toBe(true);
    expect(ps[2].comercialMeu).toBe(true);
  });

  // Ele tocou depois que a consulta saiu, e o envio já terminou: a fila está vazia e a resposta,
  // de antes do toque, diz que não há marca. O endereço tocado fica como ele deixou (revisão de 07/11).
  it('endereço tocado durante a consulta fica como ele deixou, mesmo com a fila já vazia', () => {
    const ps = [parada('a', {comercialMeu: true}), parada('b', {comercialMeu: true})];
    aplicarComerciais(ps, [], chaveDe, {}, new Set(['a', 'b']), new Set(['a']));
    expect(ps[0].comercialMeu, 'tocado durante a consulta').toBe(true);
    expect(ps[1].comercialMeu, 'não tocado: a resposta vale').toBeUndefined();
  });

  it('o texto embaixo do botão diz de quem é a marca', () => {
    expect(quemMarcou(parada('a', {comercialMeu: true, comercialOutros: true}))).toBe('Marcado por você e por outro motorista.');
    expect(quemMarcou(parada('a', {comercialOutros: true}))).toBe('Marcado por outro motorista.');
    expect(quemMarcou(parada('a', {comercial: true}))).toBe('O Mercado Livre diz horário comercial.');
  });
});

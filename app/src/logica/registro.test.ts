import {describe, expect, it} from 'vitest';
import type {Parada} from './tipos';
import {itensDaRota} from './registro';

let n = 0;
const parada = (extra: Partial<Parada> = {}): Parada => ({
  id: 'p' + ++n, area: 'a', ml: null, texto: 'Rua X, 10', unidades: null, comercial: false,
  lat: -10.9, lng: -37.05, exibido: '', precisao: 'planilha', candidatos: [], entregue: false,
  rota: 'r1', pacotes: ['TN1'], ...extra,
});

describe('registro do que o app decidiu', () => {
  it('leva a origem e a precisão de cada pacote', () => {
    const itens = itensDaRota([parada({fonte: 'IBGE', precisao: 'bom'})], 'r1');
    expect(itens).toEqual([{tn: 'TN1', lat: -10.9, lng: -37.05, fonte: 'IBGE', precisao: 'bom'}]);
  });

  it('uma parada com vários pacotes rende uma linha por pacote', () => {
    const itens = itensDaRota([parada({pacotes: ['A', 'B', 'C'], fonte: 'outro motorista'})], 'r1');
    expect(itens.map(i => i.tn)).toEqual(['A', 'B', 'C']);
    expect(new Set(itens.map(i => i.fonte))).toEqual(new Set(['outro motorista']));
  });

  it('não mistura rotas', () => {
    const itens = itensDaRota([parada(), parada({rota: 'r2', pacotes: ['Z']})], 'r1');
    expect(itens.map(i => i.tn)).toEqual(['TN1']);
  });

  it('parada sem posição entra com lat/lng nulos, para o buraco ficar visível', () => {
    const itens = itensDaRota([parada({lat: null, lng: null, precisao: 'nao', fonte: 'nao achou'})], 'r1');
    expect(itens[0]).toMatchObject({lat: null, lng: null, fonte: 'nao achou', precisao: 'nao'});
  });

  it('quando ninguém anotou a origem, diz isso em vez de inventar', () => {
    const itens = itensDaRota([parada({fonte: undefined})], 'r1');
    expect(itens[0].fonte).toBe('(sem origem)');
  });

  it('parada sem pacote não gera linha', () => {
    expect(itensDaRota([parada({pacotes: []})], 'r1')).toEqual([]);
  });
});

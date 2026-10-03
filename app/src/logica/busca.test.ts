import {describe, expect, it} from 'vitest';
import {acharNaParada, peneiraDaNuvem} from './busca';
import type {Parada} from './tipos';

const parada = (texto: string, extra: Partial<Parada> = {}): Parada => ({
  id: texto, area: 'a', ml: null, texto, unidades: null, comercial: false, lat: null, lng: null,
  exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra,
});

const CENTRAL_35 = parada('Avenida Central, 35, Bairro Sul, CEP 49000-101', {ml: '2', stop: '1', pacotes: ['BRTESTD0002']});
const CENTRAL_135 = parada('Avenida Central, 135, Bairro Norte, CEP 49000-103', {ml: '22', stop: '3', pacotes: ['BRTESTD0022', 'BRTESTD0023']});
const ACACIAS = parada('Rua das Acácias, 110', {bairro: 'Bairro Leste'});

const acha = (p: Parada, busca: string) => acharNaParada(p, busca) !== null;

describe('busca de Todos os endereços', () => {
  it('rua e número, sem acento e em qualquer ordem', () => {
    expect(acha(ACACIAS, 'acacias 110')).toBe(true);
    expect(acha(ACACIAS, '110 ACÁCIAS')).toBe(true);
    expect(acha(ACACIAS, 'acacias 111')).toBe(false);
  });

  it('o número da casa é inteiro: 35 não acha o 135 da mesma avenida', () => {
    expect(acha(CENTRAL_35, 'central 35')).toBe(true);
    expect(acha(CENTRAL_135, 'central 35')).toBe(false);
  });

  it('número curto não procura no código do pacote, que tem 13 dígitos e quase tudo dentro', () => {
    const comCodigoLongo = parada('Avenida Central, 135', {pacotes: ['BRTESTE3501234567']});
    expect(acha(comCodigoLongo, 'central 35')).toBe(false);
    expect(acha(comCodigoLongo, 'br')).toBe(false);
    expect(acharNaParada(comCodigoLongo, '4567')).toEqual({pacotes: ['BRTESTE3501234567']});
  });

  it('pelo fim do código do pacote, dizendo qual código bateu', () => {
    expect(acharNaParada(CENTRAL_135, '0023')).toEqual({pacotes: ['BRTESTD0023']});
    expect(acharNaParada(CENTRAL_135, 'brtestd0022')).toEqual({pacotes: ['BRTESTD0022']});
    expect(acha(CENTRAL_35, '0023')).toBe(false);
  });

  it('pelo número da parada no app, com ou sem #', () => {
    expect(acha(CENTRAL_135, '#22')).toBe(true);
    expect(acha(CENTRAL_135, '22')).toBe(true);
    // com # é só o número da parada, não a casa
    expect(acha(CENTRAL_135, '#135')).toBe(false);
  });

  it('pelo CEP, a partir de 5 dígitos', () => {
    expect(acha(CENTRAL_135, '49000103')).toBe(true);
    expect(acha(CENTRAL_135, '49000-103')).toBe(true);
    expect(acha(CENTRAL_35, '49000103')).toBe(false);
  });

  it('pelo bairro, que pode vir fora do texto', () => {
    expect(acha(ACACIAS, 'leste')).toBe(true);
    expect(acha(ACACIAS, 'norte')).toBe(false);
  });

  it('busca vazia não filtra nada', () => {
    expect(acharNaParada(ACACIAS, '  ')).toBeNull();
  });
});

describe('peneira da busca nos dias anteriores', () => {
  // o banco compara letra por letra: sem trocar as vogais, "acacias" não acharia "Acácias"
  const casa = (padrao: string, texto: string) =>
    new RegExp('^' + padrao.replace(/\*/g, '.*').replace(/_/g, '.') + '$', 'i').test(texto);
  const padroes = (busca: string) => [...peneiraDaNuvem(busca)!.matchAll(/endereco\.ilike\.([^,)]+)/g)].map(m => m[1]);

  it('acha com acento e cedilha o que foi digitado sem', () => {
    expect(casa(padroes('acacias')[0], 'Rua das Acácias, 110')).toBe(true);
    expect(casa(padroes('praca')[0], 'Praça Fausto Cardoso, 12')).toBe(true);
  });

  it('cada palavra é uma condição, e todas valem juntas', () => {
    expect(peneiraDaNuvem('central 35')).toBe('and(or(endereco.ilike.*__ntr_l*,bairro.ilike.*__ntr_l*),'
      + 'or(endereco.ilike.*35*,bairro.ilike.*35*,cep.ilike.*35*))');
  });

  it('só procura no código com 4 dígitos ou mais, como na rota de hoje', () => {
    expect(peneiraDaNuvem('35')).not.toContain('spx_tn');
    expect(peneiraDaNuvem('4567')).toContain('spx_tn.ilike.*4567*');
    expect(peneiraDaNuvem('brtestd0022')).toContain('spx_tn.ilike.*brtestd0022*');
  });

  it('sem nada digitado, não vai à nuvem', () => {
    expect(peneiraDaNuvem(' # ')).toBeNull();
  });
});

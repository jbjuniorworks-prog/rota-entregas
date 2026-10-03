import {describe, expect, it} from 'vitest';
import {acharNaParada} from './busca';
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

import {describe, expect, it} from 'vitest';
import {cartaoAoAndar, MOVER_M, passoDoSeguir, SAIR_DO_CARTAO_M, SEGUIR_ATE_M, type Leitura} from './seguir';

// 0,0001 grau de latitude são uns 11 m
const A: Leitura = {lat: -10.96, lng: -37.05, quando: 0};
const aNorte = (metros: number, segundos: number): Leitura => ({lat: A.lat + metros / 111320, lng: A.lng, quando: segundos * 1000});

describe('o mapa seguindo o motorista', () => {
  it('parado, a tremida do GPS não move o mapa', () => {
    expect(passoDoSeguir(A, aNorte(MOVER_M - 1, 1), null).passo).toBe('ficar');
  });

  it('andando, move a cada leitura, mesmo bem menos que os 30 m de antes', () => {
    expect(passoDoSeguir(A, aNorte(10, 1), null).passo).toBe('mover');
  });

  it('a 40 km/h, uma leitura por segundo move o mapa', () => {
    expect(passoDoSeguir(A, aNorte(11, 1), null).passo).toBe('mover');
  });

  it('um salto impossível desde a leitura anterior não move, e fica guardado como suspeito', () => {
    const salto = aNorte(4000, 1);
    expect(passoDoSeguir(A, salto, null)).toEqual({passo: 'esperar', suspeita: salto});
  });

  it('a mesma leitura do salto, de novo, não se confirma sozinha', () => {
    const salto = aNorte(4000, 1);
    expect(passoDoSeguir(A, salto, salto).passo).toBe('esperar');
  });

  it('a leitura seguinte perto do salto confirma, e o mapa vai', () => {
    const salto = aNorte(4000, 1), depois = aNorte(4010, 2);
    expect(passoDoSeguir(A, depois, salto)).toEqual({passo: 'mover', suspeita: null});
  });

  it('o salto seguido de outro salto, para outro lado, continua esperando', () => {
    const salto = aNorte(4000, 1), outro = aNorte(-3000, 2);
    expect(passoDoSeguir(A, outro, salto)).toEqual({passo: 'esperar', suspeita: outro});
  });

  it('longe, mas com tempo para ter chegado (o app reaberto depois de rodar), move', () => {
    expect(passoDoSeguir(A, aNorte(4000, 5 * 60), null).passo).toBe('mover');
  });
});

// Pedro, 07/11: o cartão do pino aberto pausava o seguir, e ele rodou com o mapa parado no pino.
describe('o cartão do pino aberto, com ele andando', () => {
  const em = (metros: number, precisao = 10) => ({lat: A.lat + metros / 111320, lng: A.lng, precisao});

  it('a primeira leitura boa é o ponto de onde ele abriu', () => {
    expect(cartaoAoAndar(null, em(0))).toEqual({desde: {lat: A.lat, lng: A.lng}, fechar: false});
  });

  it('parado na porta, a tremida do GPS não fecha', () => {
    expect(cartaoAoAndar(A, em(SAIR_DO_CARTAO_M - 5)).fechar).toBe(false);
  });

  it('afastando 50 m de onde abriu, fecha', () => {
    expect(cartaoAoAndar(A, em(SAIR_DO_CARTAO_M + 1)).fechar).toBe(true);
  });

  it('leitura com margem maior que a do seguir não fecha, nem vira o ponto de partida', () => {
    expect(cartaoAoAndar(A, em(300, SEGUIR_ATE_M + 1))).toEqual({desde: A, fechar: false});
    expect(cartaoAoAndar(null, em(0, SEGUIR_ATE_M + 1))).toEqual({desde: null, fechar: false});
  });
});

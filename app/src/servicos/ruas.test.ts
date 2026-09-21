import {matriz} from './ruas';

const PTS = [{lat: -10.94, lng: -37.06}, {lat: -10.95, lng: -37.07}];
const RESPOSTA = {code: 'Ok', durations: [[0, 60], [60, 0]], distances: [[0, 500], [500, 0]]};
const original = globalThis.fetch;

describe('matriz de ruas', () => {
  afterEach(() => { globalThis.fetch = original; });

  it('a primeira falha não tira as ruas da rota: tenta de novo', async () => {
    let n = 0;
    globalThis.fetch = (async () => {
      if (++n === 1) throw new Error('caiu');
      return {ok: true, json: async () => RESPOSTA} as Response;
    }) as typeof fetch;
    const m = await matriz(PTS);
    expect(n).toBe(2);
    expect(m.porRuas).toBe(true);
    expect(m.dur[0][1]).toBe(60);
  });

  it('falhando as duas, usa linha reta e diz por quê', async () => {
    globalThis.fetch = (async () => { throw new Error('caiu'); }) as typeof fetch;
    const m = await matriz(PTS);
    expect(m.porRuas).toBe(false);
    expect(m.motivo).toBe('sem conexão');
    expect(m.dist[0][1]).toBeGreaterThan(0);
  });

  it('com mais pontos do que o serviço aceita, nem tenta e explica', async () => {
    let n = 0;
    globalThis.fetch = (async () => { n++; return {ok: true, json: async () => RESPOSTA} as Response; }) as typeof fetch;
    const m = await matriz(Array.from({length: 101}, (_, i) => ({lat: -10.94 - i / 1000, lng: -37.06})));
    expect(n).toBe(0);
    expect(m.porRuas).toBe(false);
    expect(m.motivo).toContain('101 pontos');
  });
});

import {aPartirDeMim, linhaAteAProxima, type ParadaDaLinha} from './linhaQueFalta';

// Uma rua reta, de oeste para leste, com um ponto a cada ~55 m (0,0005 grau).
const rua = (de: number, ate: number, lat = -10.95): [number, number][] => {
  const pts: [number, number][] = [];
  for (let k = 0; de + k * 0.0005 <= ate + 1e-9; k++) pts.push([lat, +(de + k * 0.0005).toFixed(4)]);
  return pts;
};
// a parada fica uns 5 m ao lado da rua, como a porta fica da linha do serviço de ruas
const parada = (lng: number, feita = false): ParadaDaLinha => ({lat: -10.94995, lng, feita});
const lngs = (t: [number, number][]) => [t[0][1], t[t.length - 1][1]];

describe('a linha só até a próxima', () => {
  const linha = rua(-37.06, -37.04);

  test('nada feito: do começo até a primeira, e não até o fim', () => {
    expect(linhaAteAProxima(linha, [parada(-37.055), parada(-37.05), parada(-37.045)]).map(lngs)).toEqual([[-37.06, -37.055]]);
  });

  test('as primeiras feitas: da última feita até a próxima', () => {
    const t = linhaAteAProxima(linha, [parada(-37.055, true), parada(-37.05), parada(-37.045)]);
    expect(t.map(lngs)).toEqual([[-37.055, -37.05]]);
  });

  test('feita fora da ordem: a próxima é a primeira que falta', () => {
    const t = linhaAteAProxima(linha, [parada(-37.055), parada(-37.05, true), parada(-37.045)]);
    expect(t.map(lngs)).toEqual([[-37.06, -37.055]]);
  });

  test('tudo feito: nenhuma linha', () => {
    expect(linhaAteAProxima(linha, [parada(-37.055, true), parada(-37.05, true)])).toEqual([]);
  });

  test('rua de ida e volta: o corte é na passagem certa, não na primeira vez que a linha passa perto', () => {
    // vai até -37.04 e volta pela mesma rua até -37.06; a segunda parada fica na volta
    const ida = rua(-37.06, -37.04), volta = [...ida].reverse().slice(1);
    const t = linhaAteAProxima([...ida, ...volta], [parada(-37.04, true), parada(-37.055)]);
    expect(t).toHaveLength(1);
    // o trecho que falta é o da volta: de -37.04 até -37.055, e não um pedaço da ida
    expect(lngs(t[0])).toEqual([-37.04, -37.055]);
    expect(t[0]).toHaveLength(31);
  });

  test('sem paradas, nenhuma linha', () => {
    expect(linhaAteAProxima(linha, [])).toEqual([]);
  });
});

describe('a linha começa onde o entregador está', () => {
  // dois trechos: até a próxima (-37.06 a -37.05) e um depois de uma feita fora da ordem
  const trechos = [rua(-37.06, -37.05), rua(-37.045, -37.04)];
  const eu = (lng: number, lat = -10.95) => ({lat, lng});

  test('no meio do trecho até a próxima: o que ficou para trás sai, o resto fica igual', () => {
    const [t, outro] = aPartirDeMim(trechos, eu(-37.0573, -10.9501));
    expect(t[0][0]).toBeCloseTo(-10.95, 6);
    expect(t[0][1]).toBeCloseTo(-37.0573, 6);
    expect(t.slice(1)).toEqual(trechos[0].filter(([, lng]) => lng > -37.0573));
    expect(outro).toEqual(trechos[1]);
  });

  test('longe da linha, ou sem GPS: a linha fica como está', () => {
    expect(aPartirDeMim(trechos, eu(-37.0573, -10.9506))).toEqual(trechos);
    expect(aPartirDeMim(trechos, null)).toEqual(trechos);
  });

  test('rua sem saída de ida e volta: no começo da ida, a volta continua desenhada', () => {
    const ida = rua(-37.06, -37.05);
    const t = [[...ida, ...ida.slice(0, -1).reverse()]];
    const [r] = aPartirDeMim(t as [number, number][][], eu(-37.0588));
    expect(r[r.length - 1][1]).toBe(-37.06);
    expect(Math.max(...r.map(([, lng]) => lng))).toBe(-37.05);
  });
});

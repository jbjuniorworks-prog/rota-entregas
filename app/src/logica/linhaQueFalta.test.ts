import {linhaQueFalta, type ParadaDaLinha} from './linhaQueFalta';

// Uma rua reta, de oeste para leste, com um ponto a cada ~55 m (0,0005 grau).
const rua = (de: number, ate: number, lat = -10.95): [number, number][] => {
  const pts: [number, number][] = [];
  for (let k = 0; de + k * 0.0005 <= ate + 1e-9; k++) pts.push([lat, +(de + k * 0.0005).toFixed(4)]);
  return pts;
};
// a parada fica uns 5 m ao lado da rua, como a porta fica da linha do serviço de ruas
const parada = (lng: number, feita = false): ParadaDaLinha => ({lat: -10.94995, lng, feita});
const lngs = (t: [number, number][]) => [t[0][1], t[t.length - 1][1]];

describe('a linha só do que falta', () => {
  const linha = rua(-37.06, -37.04);

  test('nada feito: a linha inteira', () => {
    expect(linhaQueFalta(linha, [parada(-37.055), parada(-37.05), parada(-37.045)], false).map(lngs)).toEqual([[-37.06, -37.045]]);
  });

  test('as primeiras feitas: a linha começa na última feita e vai à próxima', () => {
    const t = linhaQueFalta(linha, [parada(-37.055, true), parada(-37.05), parada(-37.045)], false);
    expect(t.map(lngs)).toEqual([[-37.055, -37.045]]);
  });

  test('feita fora da ordem: some só o trecho que chegava nela', () => {
    const t = linhaQueFalta(linha, [parada(-37.055), parada(-37.05, true), parada(-37.045)], false);
    expect(t.map(lngs)).toEqual([[-37.06, -37.055], [-37.05, -37.045]]);
  });

  test('tudo feito: nenhuma linha', () => {
    expect(linhaQueFalta(linha, [parada(-37.055, true), parada(-37.05, true)], false)).toEqual([]);
  });

  test('com ponto de chegada: o trecho até ele fica enquanto alguma falta, e sai com todas feitas', () => {
    expect(linhaQueFalta(linha, [parada(-37.055, true), parada(-37.05)], true).map(lngs)).toEqual([[-37.055, -37.04]]);
    expect(linhaQueFalta(linha, [parada(-37.055, true), parada(-37.05, true)], true)).toEqual([]);
  });

  test('rua de ida e volta: o corte é na passagem certa, não na primeira vez que a linha passa perto', () => {
    // vai até -37.04 e volta pela mesma rua até -37.06; a segunda parada fica na volta
    const ida = rua(-37.06, -37.04), volta = [...ida].reverse().slice(1);
    const idaEVolta = [...ida, ...volta];
    const t = linhaQueFalta(idaEVolta, [parada(-37.04, true), parada(-37.055)], false);
    expect(t).toHaveLength(1);
    // o trecho que falta é o da volta: de -37.04 até -37.055, e não um pedaço da ida
    expect(lngs(t[0])).toEqual([-37.04, -37.055]);
    expect(t[0]).toHaveLength(31);
  });

  test('sem paradas, a linha fica como veio', () => {
    expect(linhaQueFalta(linha, [], false)).toEqual([linha]);
  });
});

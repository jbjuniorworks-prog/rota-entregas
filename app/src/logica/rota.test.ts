import {haversine, marcarIsoladas, proximaAPe} from './geo';
import {gruposNoMapa, blocos, custo, linkMapsVarios, matrizAproximada, otimizar, trechos} from './otimizacao';
import type {Parada} from './tipos';

let seq = 0;
function parada(lat: number | null, lng: number | null, extra: Partial<Parada> = {}): Parada {
  return {id: 'p' + ++seq, area: 'a', ml: null, texto: 'Rua X, 1', unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra};
}
const grupo = () => [
  parada(-10.9600, -37.0450), parada(-10.9610, -37.0450), parada(-10.9620, -37.0440),
  parada(-10.9650, -37.0420), parada(-10.9580, -37.0480), parada(-10.9630, -37.0470),
];

describe('marcarIsoladas', () => {
  it('marca a posição a 12 km do grupo', () => {
    const ps = [...grupo(), parada(-10.8500, -37.0745)];
    expect(marcarIsoladas(ps)).toBe(1);
    expect(ps.at(-1)!.precisao).toBe('longe');
  });
  it('pega duas erradas perto uma da outra', () => {
    const ps = [...grupo(), parada(-10.80, -37.20), parada(-10.8005, -37.2005)];
    expect(marcarIsoladas(ps)).toBe(2);
  });
  it('vale para posição de busca e lembrada, não para a ajustada à mão', () => {
    const ps = [...grupo(), parada(-9.66, -35.73, {precisao: 'exato'}), parada(-11.30, -37.40, {precisao: 'lembrado'}), parada(-11.40, -37.50, {precisao: 'manual'})];
    expect(marcarIsoladas(ps)).toBe(2);
    expect(ps.map(p => p.precisao).slice(-3)).toEqual(['longe', 'longe', 'manual']);
  });
  it('volta à precisão de antes quando a parada volta para perto', () => {
    const ps = [...grupo(), parada(-9.66, -35.73, {precisao: 'exato'})];
    marcarIsoladas(ps);
    Object.assign(ps.at(-1)!, {lat: -10.9601, lng: -37.0451});
    marcarIsoladas(ps);
    expect(ps.at(-1)!.precisao).toBe('exato');
  });
  it('não alarma uma entrega certa a 4 km do centro (caso do Cond. Brisa Marina)', () => {
    const ps = [...grupo(), parada(-10.9959, -37.0558)];
    expect(marcarIsoladas(ps)).toBe(0);
  });
  it('ignora entregues e rotas com menos de 4 paradas', () => {
    expect(marcarIsoladas([parada(-10.96, -37.04), parada(-10.96, -37.04), parada(-9.0, -35.0)])).toBe(0);
    const ps = [...grupo(), parada(-10.8500, -37.0745, {entregue: true})];
    expect(marcarIsoladas(ps)).toBe(0);
  });
});

describe('otimizar', () => {
  const linha = [0, 1, 2, 3, 4].map(i => ({lat: -10.93, lng: -37.10 + i * 0.01}));
  it('com saída fixa no meio, percorre sem voltar à toa', () => {
    const pts = [linha[2], ...linha];
    const {dur} = matrizAproximada(pts);
    const p = otimizar(pts.length, dur, true);
    expect(p[0]).toBe(0);
    expect(new Set(p).size).toBe(pts.length);
  });
  it('com fim fixo, o último é sempre o fim', () => {
    const fim = {lat: -10.93, lng: -37.055};
    const pts = [linha[2], ...linha, fim];
    const {dur} = matrizAproximada(pts);
    const p = otimizar(pts.length, dur, true, true);
    expect(p.at(-1)).toBe(pts.length - 1);
    expect(p.at(-2)).toBe(5);
  });
  it('não piora uma ordem que já é ótima', () => {
    const {dur} = matrizAproximada(linha);
    const p = otimizar(linha.length, dur, false);
    expect(custo(p, dur)).toBeCloseTo(custo([0, 1, 2, 3, 4], dur), 6);
  });
});

describe('blocos e trechos do Maps', () => {
  const ps = [parada(-10.9620, -37.0440), parada(-10.9620, -37.0440), parada(-10.9621, -37.0440), parada(-10.9640, -37.0440)];
  const achar = (id: string) => ps.find(p => p.id === id);
  const ordem = ps.map(p => p.id);
  it('só juntam o que está no mesmo ponto (até 10 m)', () => {
    expect(blocos(ordem, achar).map(b => b.length)).toEqual([2, 1, 1]);
  });
  it('cada bloco vira uma marcação, e o fim entra no último trecho se couber', () => {
    const fim = {id: 'fim', lat: -10.97, lng: -37.04, exibido: ''};
    const ts = trechos(ordem, achar, 9, fim);
    expect(ts.map(t => t.length)).toEqual([4]);
    expect(ts[0].at(-1)!.ids).toEqual([]);
    expect(trechos(ordem, achar, 2, null).map(t => t.length)).toEqual([2, 1]);
  });
  it('entregues somem do trecho', () => {
    const outras = ps.map(p => ({...p}));
    outras[3].entregue = true;
    expect(trechos(ordem, id => outras.find(p => p.id === id), 9, null)[0]).toHaveLength(2);
  });
  it('o link do Maps leva os pontos do meio como waypoints', () => {
    const u = new URL(linkMapsVarios([{lat: 1, lng: 2}, {lat: 3, lng: 4}, {lat: 5, lng: 6}]));
    expect(u.searchParams.get('waypoints')).toBe('1,2|3,4');
    expect(u.searchParams.get('destination')).toBe('5,6');
  });
});

describe('aviso a pé', () => {
  it('avisa entre 10 m e 300 m, arredondando de 10 em 10', () => {
    const a = parada(-10.9300, -37.1000);
    expect(proximaAPe(a, parada(-10.9313, -37.1000))).toBe(140);
    expect(proximaAPe(a, parada(-10.9300, -37.1000))).toBeNull();
    expect(proximaAPe(a, parada(-10.9400, -37.1000))).toBeNull();
    expect(Math.round(haversine({lat: -10.93, lng: -37.10}, {lat: -10.9313, lng: -37.10}))).toBe(145);
  });
});

describe('balão de pacotes no mapa', () => {
  const parada = (id: string, texto: string, lat: number, lng: number, extra: any = {}) =>
    ({id, area: 'a', ml: null, texto, unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra}) as any;

  it('soma os pacotes do mesmo ponto e conta quantos endereços são', () => {
    const ps = [
      parada('1', 'Rua dos Ipês, 300, ap 101', -10.94, -37.06, {unidades: 12}),
      parada('2', 'Rua dos Ipês, 300, ap 202', -10.940005, -37.060005, {unidades: 8}),
      parada('3', 'Rua dos Ipês, 318', -10.94001, -37.06001),
      parada('4', 'Avenida Longe, 10', -10.99, -37.10, {unidades: 3}),
    ];
    const g = gruposNoMapa(ps);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({pacotes: 21, enderecos: 2});
    expect(g[1]).toMatchObject({pacotes: 3, enderecos: 1});
  });
  it('entrega já feita não conta no balão', () => {
    const ps = [
      parada('1', 'Rua A, 1', -10.94, -37.06, {unidades: 5, entregue: true}),
      parada('2', 'Rua A, 1', -10.94, -37.06, {unidades: 2}),
    ];
    expect(gruposNoMapa(ps)[0]).toMatchObject({pacotes: 2, enderecos: 1});
  });
});

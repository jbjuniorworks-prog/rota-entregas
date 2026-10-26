import {emLeque, empilhar} from './pinos';
import type {Parada, Ponto} from './tipos';

const GRAU = 111320;
const tela = (mPorPixel: number) => (p: Ponto) => ({x: p.lng * GRAU * 0.98 / mPorPixel, y: -p.lat * GRAU / mPorPixel});
const metros = (m: number) => m / GRAU;

function parada(id: string, texto: string, norte: number, extra: Partial<Parada> = {}): Parada {
  return {id, area: 'a', ml: null, texto, bairro: 'Jardins', unidades: null, comercial: false,
    lat: -10.94 + metros(norte), lng: -37.06, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra};
}

const ids = (ps: ReturnType<typeof empilhar>) => ps.map(g => g.ps.map(p => p.id));

describe('empilhar pinos', () => {
  it('o prédio continua um pino só mesmo com a planilha jogando as entregas a 17 m, e o vizinho de número fica de fora', () => {
    const ps = [
      parada('predio1', 'Avenida das Flores, 1210, Apto 1601', 0),
      parada('predio2', 'Avenida das Flores, 1210, Condomínio Portal', 17),
      parada('vizinho', 'Avenida das Flores, 1241, Escritório de Imóveis', 22),
    ];
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['predio1', 'predio2'], ['vizinho']]);
  });

  it('o mesmo condomínio em ruas diferentes vira um pino, em qualquer zoom', () => {
    const ps = [
      parada('condoA', 'Avenida das Flores, 1500, Ed Villa Sorrento', 0),
      parada('condoB', 'Rua do Poeta, 1500, Apt 704 edificio Villa Sorento', 37),
    ];
    expect(ids(empilhar(ps, tela(0.1)))).toEqual([['condoA', 'condoB']]);
  });

  // Pedro, 29/09: arrumou uma, entregou, e o mapa a desenhou de volta no pino da outra rua.
  // Pausada ela aparecia no lugar certo, porque pausada não empilha com pendente.
  it('casas do mesmo conjunto em ruas diferentes não viram um pino', () => {
    const ps = [
      parada('gerson', 'Rua das Acácias, 284, Conjunto Solar Verde', 0),
      parada('rollemberg', 'Rua dos Ipês, 22, Conjunto: Solar Verde', 106),
    ];
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['gerson'], ['rollemberg']]);
  });

  it('longe um do outro, junta quando o zoom afasta e separa quando aproxima', () => {
    const ps = [
      parada('a', 'Rua A, 10, Casa', 0),
      parada('b', 'Rua B, 20, Casa', 200),
    ];
    expect(ids(empilhar(ps, tela(10)))).toEqual([['a', 'b']]);
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['a'], ['b']]);
  });

  it('entregue não empilha com pendente', () => {
    const ps = [
      parada('feita', 'Avenida das Flores, 1210, Apto 101', 0, {entregue: true}),
      parada('falta', 'Avenida das Flores, 1210, Apto 102', 0),
    ];
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['feita'], ['falta']]);
  });

  // Rota do Luan, 16/10: a ADS do 1623 vinha primeiro na planilha, na porta do Mercure (1630), e o
  // resto do 1623 a 40 m. Entregue "aqui", o 1630 entrava na pilha pela ADS e era desenhado no
  // primeiro do 1623 pela rota: o pino sumia de onde ele estava.
  it('a entrega marcada na porta aparece na porta, não no pino de outro endereço que a planilha pôs ali perto', () => {
    const feita = {entregue: true};
    const ps = [
      parada('ads1623', 'Avenida das Flores, 1623, Cond Aquarius 101 B', 0, feita),
      parada('aquarius', 'Avenida das Flores, 1623, Bloco C ap 103', 40, feita),
      parada('mercure', 'Avenida das Flores, 1630, Condomínio Mercure', -3, feita),
    ];
    const naRota: Record<string, number> = {aquarius: 0, mercure: 1, ads1623: 2};
    const pilhas = empilhar(ps, tela(0.3), p => naRota[p.id]);
    const doMercure = pilhas.find(g => g.ps.some(p => p.id === 'mercure'))!;
    // o pino é desenhado na primeira da pilha
    expect(Math.abs(doMercure.ps[0].lat! - ps[2].lat!) * GRAU).toBeLessThan(10);
    expect(ids(pilhas)).toEqual([['aquarius', 'ads1623'], ['mercure']]);
  });

  // Dono, 26/10: separou os 5 pacotes do mesmo endereço e continuou vendo um pino só. Separada é
  // para ter o seu: no mesmo ponto, as que faltam abrem em leque em volta dele.
  it('a separada que falta tem o seu pino, e as do mesmo ponto abrem em leque', () => {
    const ps = [
      parada('merc', 'Rodovia Teste, 67, Mercearia', 0, {separada: true}),
      parada('cond', 'Rodovia Teste, 67, Condominio Portal', 0, {separada: true}),
      parada('casa', 'Rodovia Teste, 67', 0, {separada: true}),
      parada('feita', 'Rodovia Teste, 67, Outra', 0, {separada: true, entregue: true}),
      parada('junta1', 'Rua Outra, 10', 200),
      parada('junta2', 'Rua Outra, 10, Apto 2', 200),
    ];
    const pilhas = emLeque(empilhar(ps, tela(0.5)));
    expect(ids(pilhas)).toEqual([['merc'], ['cond'], ['casa'], ['feita'], ['junta1', 'junta2']]);
    const leque = pilhas.slice(0, 3).map(g => [g.dx, g.dy]);
    expect(leque.every(([dx, dy]) => dx != null && Math.round(Math.hypot(dx, dy!)) >= 29)).toBe(true);
    expect(new Set(leque.map(d => d.join(','))).size).toBe(3);
    // a entregue e a pilha de sempre ficam no ponto delas
    for (const g of pilhas.slice(3)) expect(g.dx).toBeUndefined();
  });

  it('a separada não entra na pilha de outra entrega, nem recebe outra na dela', () => {
    const merc = () => parada('merc', 'Rodovia Teste, 67, Mercearia', 0, {separada: true});
    // a outra entrega do mesmo endereço, antes e depois dela na rota, e uma de outra rua a 5 m
    expect(ids(empilhar([parada('antes', 'Rodovia Teste, 67, Bloco A', 0), merc()], tela(0.5)))).toEqual([['antes'], ['merc']]);
    expect(ids(empilhar([merc(), parada('depois', 'Rodovia Teste, 67, Bloco B', 0)], tela(0.5)))).toEqual([['merc'], ['depois']]);
    expect(ids(empilhar([merc(), parada('perto', 'Rua Vizinha, 3', 5)], tela(0.5)))).toEqual([['merc'], ['perto']]);
  });

  it('uma separada sozinha no ponto não sai do lugar', () => {
    const pilhas = emLeque(empilhar([parada('so', 'Rodovia Teste, 67, Mercearia', 0, {separada: true}), parada('outra', 'Rua Longe, 5', 300)], tela(0.5)));
    expect(pilhas.map(g => g.dx)).toEqual([undefined, undefined]);
  });
});

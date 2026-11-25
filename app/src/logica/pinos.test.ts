import {abrirAsQueSeCobrem, avisoDeAproximar, emLeque, empilhar, inclinacao, pinosDoDia, SE_COBREM} from './pinos';
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

  it('as separadas do mesmo ponto abrem por cima dele', () => {
    const ps = ['Mercearia', 'Condominio Portal', 'Casa'].map((c, k) => parada(String(k), `Rodovia Teste, 67, ${c}`, 0, {separada: true}));
    const pilhas = emLeque(empilhar(ps, tela(0.5)));
    expect(pilhas.every(g => g.dy! < 0)).toBe(true);
  });

  // O pino inclinado aponta para o ponto, na ponta do traço: o da esquerda tomba para a esquerda.
  it('o pino do leque se inclina para o lado em que foi desenhado, e o do ponto fica em pé', () => {
    const ps = [parada('a', 'Rua Um, 1', 0), parada('b', 'Rua Dois, 2', 0), parada('longe', 'Rua Longe, 5', 300)];
    const [a, b, longe] = abrirAsQueSeCobrem(empilhar(ps, tela(0.29), () => 0, true));
    const [esq, dir] = a.dx! < b.dx! ? [a, b] : [b, a];
    expect(inclinacao(esq)).toBeLessThan(0);
    expect(inclinacao(dir)).toBeGreaterThan(0);
    expect(inclinacao(longe)).toBe(0);
  });

  it('o pino inclinado aponta para o ponto', () => {
    // desenhado 30 px à direita e 30 px acima: a ponta olha para baixo e para a esquerda, a 45 graus
    expect(inclinacao({ps: [], x: 0, y: 0, estado: 'p', dx: 30, dy: -30})).toBe(45);
    expect(inclinacao({ps: [], x: 0, y: 0, estado: 'p', dx: 0, dy: -30})).toBe(0);
  });

  it('uma separada sozinha no ponto não sai do lugar', () => {
    const pilhas = emLeque(empilhar([parada('so', 'Rodovia Teste, 67, Mercearia', 0, {separada: true}), parada('outra', 'Rua Longe, 5', 300)], tela(0.5)));
    expect(pilhas.map(g => g.dx)).toEqual([undefined, undefined]);
  });
});

// Dono, 15/11: duas casas uma em frente à outra, a 8 m, viravam um pino que nenhum zoom separava.
describe('no zoom máximo, casa diferente não divide pino', () => {
  // zoom 19 em Aracaju: uns 0,29 m por pixel, e os 38 px de juntar dão 11 m
  const z19 = tela(0.29);
  const desenhado = (g: ReturnType<typeof empilhar>[number]) => ({x: g.x + (g.dx ?? 0), y: g.y + (g.dy ?? 0)});
  const entre = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(a.x - b.x, a.y - b.y);

  it('a 8 m, juntam fora do zoom máximo e se separam nele', () => {
    const ps = [parada('426', 'Rua Recanto, 426', 0), parada('425', 'Rua Recanto, 425', 8)];
    expect(ids(empilhar(ps, z19))).toEqual([['426', '425']]);
    expect(ids(empilhar(ps, z19, () => 0, true))).toEqual([['426'], ['425']]);
  });

  it('o mesmo endereço continua um pino só no zoom máximo', () => {
    const ps = [parada('predio1', 'Avenida das Flores, 1210, Apto 1601', 0), parada('predio2', 'Avenida das Flores, 1210, Condomínio Portal', 17)];
    expect(ids(empilhar(ps, z19, () => 0, true))).toEqual([['predio1', 'predio2']]);
  });

  it('as que se cobrem abrem sem se cobrir, cada uma do seu lado', () => {
    // a do 32 fica 1,8 m a leste da do 30, e vem antes na planilha
    const ps = [parada('32', 'Rua Recanto, 32', 0, {lng: -37.06 + metros(1.8)}), parada('30', 'Rua Recanto, 30', 0)];
    const gs = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(gs.every(g => g.dx != null)).toBe(true);
    const [d32, d30] = gs.map(desenhado);
    expect(entre(d32, d30)).toBeGreaterThanOrEqual(30);
    expect(d32.x).toBeGreaterThan(d30.x);
  });

  it('três no mesmo ponto não se cobrem', () => {
    const ps = [parada('a', 'Rua Um, 1', 0), parada('b', 'Rua Dois, 2', 0), parada('c', 'Rua Três, 3', 0)];
    const ds = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true)).map(desenhado);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(entre(ds[i], ds[j])).toBeGreaterThanOrEqual(30);
  });

  // Dono, 18/11: com dois no mesmo ponto, um ia para cima e o outro para baixo, e os traços viravam
  // uma barra em pé que sumia atrás dos pinos. Em V, os dois por cima do ponto, se vê que é um lugar.
  it('dois no mesmo ponto ficam os dois por cima dele, um de cada lado', () => {
    const ps = [parada('a', 'Rua Um, 1', 0), parada('b', 'Rua Dois, 2', 0)];
    const gs = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(gs.every(g => g.dy! < 0)).toBe(true);
  });

  it('dois no mesmo ponto ficam lado a lado, na mesma altura, um de cada lado do ponto', () => {
    const ps = [parada('a', 'Rua Um, 1', 0), parada('b', 'Rua Dois, 2', 0)];
    const [a, b] = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(a.dy).toBe(b.dy);
    expect(Math.sign(a.dx!) * Math.sign(b.dx!)).toBe(-1);
  });

  it('muitos no mesmo ponto continuam por cima dele, sem se cobrir', () => {
    const ps = Array.from({length: 8}, (_, k) => parada(String(k), `Rua ${k}, ${k + 1}`, 0));
    const gs = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(gs.every(g => g.dy! < 0)).toBe(true);
    const ds = gs.map(desenhado);
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) expect(entre(ds[i], ds[j])).toBeGreaterThanOrEqual(30);
  });

  it('afastadas o bastante para o dedo, ficam no seu ponto', () => {
    const ps = [parada('426', 'Rua Recanto, 426', 0), parada('425', 'Rua Recanto, 425', 8)];
    const gs = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(Math.abs(gs[0].y - gs[1].y)).toBeGreaterThanOrEqual(SE_COBREM);
    expect(gs.map(g => g.dx)).toEqual([undefined, undefined]);
  });

  it('a entregue não abre em leque com a que falta', () => {
    const ps = [parada('feita', 'Rua Recanto, 30', 0, {entregue: true}), parada('falta', 'Rua Recanto, 32', 1)];
    const gs = abrirAsQueSeCobrem(empilhar(ps, z19, () => 0, true));
    expect(gs.map(g => g.dx)).toEqual([undefined, undefined]);
  });
});

// Luan, pelo dono, 18/11: as paradas do topo são os pinos do mapa, não as paradas da Shopee.
describe('os pinos do dia, para o topo', () => {
  it('o mesmo endereço é um pino só, e o vizinho de número é outro', () => {
    const ps = [
      parada('ap1', 'Avenida das Flores, 1210, Apto 1601', 0),
      parada('ap2', 'Avenida das Flores, 1210, Apto 302', 17),
      parada('vizinho', 'Avenida das Flores, 1241', 22),
    ];
    expect(pinosDoDia(ps)).toEqual({feitos: 0, total: 2});
  });

  it('uma parada da Shopee em dois lugares são dois pinos', () => {
    const ps = [
      parada('cem', 'Rodovia Inventada, 100, por trás do condomínio', 0, {stop: '37'}),
      parada('cinquenta', 'Rodovia Inventada, 50A, atrás do condomínio', 919, {stop: '37'}),
    ];
    expect(pinosDoDia(ps)).toEqual({feitos: 0, total: 2});
  });

  it('o pino só está feito quando tudo dele foi entregue', () => {
    const ps = [parada('ap1', 'Avenida das Flores, 1210, Apto 1601', 0), parada('ap2', 'Avenida das Flores, 1210, Apto 302', 5)];
    ps[0].entregue = true;
    expect(pinosDoDia(ps)).toEqual({feitos: 0, total: 1});
    ps[1].entregue = true;
    expect(pinosDoDia(ps)).toEqual({feitos: 1, total: 1});
  });

  it('a separada é o seu pino, e continua sendo depois de entregue', () => {
    const ps = [
      parada('s1', 'Rua do Restaurante, 106, ao lado do restaurante', 0, {separada: true}),
      parada('s2', 'Rua do Restaurante, 106, próximo ao restaurante', 0, {separada: true}),
    ];
    expect(pinosDoDia(ps)).toEqual({feitos: 0, total: 2});
    ps[0].entregue = true;
    expect(pinosDoDia(ps)).toEqual({feitos: 1, total: 2});
  });

  it('sem posição não há pino', () => {
    const ps = [parada('com', 'Rua Recanto, 30', 0), parada('sem', 'Rua Recanto, 90', 0, {lat: null, lng: null})];
    expect(pinosDoDia(ps)).toEqual({feitos: 0, total: 1});
  });
});

// O P24 de 25/11 (foto do dono na rua): duas entregas da mesma travessa, a 54 m, as duas com porta
// verificada, e o cartão dizia "Entregas de ruas diferentes neste pino: aproxime o mapa para marcar
// a porta de cada uma".
describe('o aviso de aproximar o mapa no cartão do pino', () => {
  const travessa = (id: string, norte: number, extra: Partial<Parada> = {}) =>
    parada(id, `Travessa José Teste dos Santos, ${id}`, norte, extra);

  it('com todas as portas verificadas não há porta a marcar, e o aviso não aparece', () => {
    const ps = [travessa('168', 0, {precisao: 'confirmado'}), travessa('sn', 54, {precisao: 'confirmado'})];
    expect(avisoDeAproximar(ps)).toBeNull();
  });

  it('com uma porta a marcar, diz a distância entre as duas, sem falar em ruas diferentes', () => {
    const ps = [travessa('168', 0, {precisao: 'confirmado'}), travessa('sn', 54)];
    expect(avisoDeAproximar(ps)).toBe('Entregas a 54 m uma da outra neste pino: aproxime o mapa para marcar a porta de cada uma.');
  });

  it('no chão, a até 10 m da primeira, não há o que aproximar', () => {
    expect(avisoDeAproximar([travessa('1', 0), travessa('2', 9)])).toBeNull();
  });

  it('com três ou mais, diz a maior distância entre duas delas, mesmo que nenhuma seja a primeira', () => {
    const ps = [travessa('meio', 0), travessa('norte', 40), travessa('sul', -60)];
    expect(avisoDeAproximar(ps)).toBe('Entregas a até 100 m uma da outra neste pino: aproxime o mapa para marcar a porta de cada uma.');
  });

  it('de longe, a pilha pode juntar entregas a quilômetros, e a distância sai em km', () => {
    const ps = [travessa('a', 0), travessa('b', 1240)];
    expect(avisoDeAproximar(ps)).toContain('a 1,2 km uma da outra');
  });
});

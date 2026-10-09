import {haversine, marcarIsoladas, marcarNumerosIncoerentes, moverPeloBairro, noPino, proximaAPe, voltarDoBairro} from './geo';
import {montarRota as montarRotaDoEstado} from './montagem';
import {agruparPorEndereco, agruparVisitas, gruposNoMapa, blocos, custo, linkMapsVarios, matrizAproximada, otimizar, trechos} from './otimizacao';
import type {Parada, Ponto} from './tipos';

let seq = 0;
function parada(lat: number | null, lng: number | null, extra: Partial<Parada> = {}): Parada {
  return {id: 'p' + ++seq, area: 'a', ml: null, texto: 'Rua X, 1', unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra};
}
const grupo = () => [
  parada(-10.9600, -37.0450), parada(-10.9610, -37.0450), parada(-10.9620, -37.0440),
  parada(-10.9650, -37.0420), parada(-10.9580, -37.0480), parada(-10.9630, -37.0470),
];

// Leudy, 09/10: a versão de antes levou o grupo do Jatobá inteiro para um ponto do mapa a 13 km
describe('voltarDoBairro', () => {
  const levada = (lat: number, lng: number, extra: Partial<Parada> = {}) => parada(-10.95, -37.05, {precisao: 'bairro', fonte: 'bairro', exibido: 'Posição pelo bairro X',
    candidatos: [{lat: -10.95, lng: -37.05, exibido: 'Pelo bairro X', precisao: 'bairro', fonte: 'bairro'}, {lat, lng, exibido: 'Posição que veio na planilha (longe das outras entregas)', precisao: 'longe', fonte: 'planilha'}], ...extra});
  it('a levada que tinha vizinhas no ponto da planilha volta para ele; a sozinha e a entregue ficam', () => {
    const grupoLevado = [levada(-10.8500, -37.0745), levada(-10.8510, -37.0750), levada(-10.8490, -37.0760)];
    const sozinha = levada(-10.70, -36.90), entregue = levada(-10.8505, -37.0748, {entregue: true});
    const voltaram = voltarDoBairro([...grupo(), ...grupoLevado, sozinha, entregue]);
    expect(voltaram).toEqual(grupoLevado);
    expect(grupoLevado[0]).toMatchObject({lat: -10.8500, lng: -37.0745, precisao: 'planilha', fonte: 'planilha', candidatos: []});
    expect(sozinha.precisao).toBe('bairro');
    expect(entregue.precisao).toBe('bairro');
  });
  it('a porta verificada e o pino arrumado à mão ficam, mesmo com a planilha guardada nas opções', () => {
    const verificada = levada(-10.8500, -37.0745, {precisao: 'confirmado', fonte: 'outro motorista', lat: -10.86, lng: -37.08});
    const amao = levada(-10.8510, -37.0750, {precisao: 'manual', fonte: 'manual', lat: -10.861, lng: -37.081});
    const grupoLevado = [levada(-10.8490, -37.0760), levada(-10.8495, -37.0755)];
    expect(voltarDoBairro([...grupo(), verificada, amao, ...grupoLevado])).toEqual(grupoLevado);
    expect(verificada).toMatchObject({precisao: 'confirmado', lat: -10.86});
    expect(amao).toMatchObject({precisao: 'manual', lat: -10.861});
    // de novo, nada mais muda
    expect(voltarDoBairro([...grupo(), verificada, amao, ...grupoLevado])).toEqual([]);
  });
});

// Leudy, 09/10: na rodovia o portão do condomínio tem o número dela, e a casa lá dentro outro
describe('marcarNumerosIncoerentes', () => {
  it('números distantes no mesmo ponto: marca na rua, não na rodovia', () => {
    const rua = [parada(-10.9600, -37.0450, {texto: 'Rua Inventada, 7'}), parada(-10.9600, -37.0450, {texto: 'Rua Inventada, 1928'})];
    const rodovia = [parada(-10.8816, -36.9980, {texto: 'Rodovia Inventada, 7300, Cond Teste casa 288'}), parada(-10.8816, -36.9980, {texto: 'Rodovia Inventada, 1120, Cond Teste'})];
    const rod = [parada(-10.8700, -36.9900, {texto: 'Rod Inventada, 6500'}), parada(-10.8700, -36.9900, {texto: 'Rod Inventada, 112'})];
    expect(marcarNumerosIncoerentes([...rua, ...rodovia, ...rod])).toBe(2);
    expect(rua.map(p => p.precisao)).toEqual(['numero', 'numero']);
    expect([...rodovia, ...rod].map(p => p.precisao)).toEqual(['planilha', 'planilha', 'planilha', 'planilha']);
  });
});

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
  // Leudy, 09/10: duas ADS do Jatobá vieram com o ponto do centro da Barra, a 12,8 km das outras
  // do bairro, e no meio de entregas de outros bairros
  it('longe das outras do mesmo bairro, com elas juntas, é marcada e vai para o meio delas', () => {
    const norte = [-10.8500, -10.8505, -10.8510, -10.8495].map(lat => parada(lat, -37.0745, {bairro: 'Bairro Norte'}));
    const errada = parada(-10.9605, -37.0455, {bairro: 'Bairro  Norte.'});
    const ps = [...grupo(), ...grupo(), ...norte, errada];
    marcarIsoladas(ps);
    expect(errada.precisao).toBe('longe');
    expect(norte.map(p => p.precisao)).toEqual(['planilha', 'planilha', 'planilha', 'planilha']);
    expect(moverPeloBairro(ps)).toEqual([errada]);
    expect(errada).toMatchObject({precisao: 'bairro', lng: -37.0745});
    expect(errada.lat).toBeCloseTo(-10.85025, 5);
  });
  it('a 3 km das outras do bairro, ou com o bairro espalhado, fica', () => {
    // as duas no meio da rota: só a regra do bairro poderia marcá-las
    const perto = [-10.9330, -10.9335, -10.9325, -10.9332].map(lat => parada(lat, -37.0450, {bairro: 'Bairro Perto'}));
    const a3km = parada(-10.9605, -37.0455, {bairro: 'Bairro Perto'});
    const espalhado = [-37.10, -37.13, -37.16, -37.19].map(lng => parada(-10.9605, lng, {bairro: 'Bairro Grande'}));
    const doGrande = parada(-10.9610, -37.0450, {bairro: 'Bairro Grande'});
    marcarIsoladas([...grupo(), ...grupo(), ...grupo(), ...perto, a3km, ...espalhado, doGrande]);
    expect([a3km.precisao, doGrande.precisao]).toEqual(['planilha', 'planilha']);
  });
  // Leudy, 09/10: 15 entregas no Jatobá a 13 km das outras eram outra parte da rota, não erro
  it('um grupo de três ou mais longe do meio da rota é outra parte dela, e não é marcado', () => {
    const longe = [parada(-10.8500, -37.0745), parada(-10.8510, -37.0750), parada(-10.8490, -37.0760)];
    const ps = [...grupo(), ...grupo(), ...longe];
    expect(marcarIsoladas(ps)).toBe(0);
    expect(longe.map(p => p.precisao)).toEqual(['planilha', 'planilha', 'planilha']);
  });
  it('vale para posição de busca e lembrada, não para a ajustada à mão nem a verificada', () => {
    const ps = [...grupo(), parada(-9.66, -35.73, {precisao: 'exato'}), parada(-11.30, -37.40, {precisao: 'lembrado'}), parada(-11.40, -37.50, {precisao: 'manual'}), parada(-11.50, -37.60, {precisao: 'confirmado'})];
    expect(marcarIsoladas(ps)).toBe(2);
    expect(ps.map(p => p.precisao).slice(-4)).toEqual(['longe', 'longe', 'manual', 'confirmado']);
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

describe('ordem do app de entrega', () => {
  const daPlanilha = (id: string, stop: string, ml: string, lat: number, lng: number) =>
    ({id, area: 'a', ml, stop, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false}) as Parada;

  const estado = (ordemDoApp: boolean) => ({
    cidade: 'Aracaju', tamTrecho: 9, voltar: false, ordemDoApp,
    inicio: {id: 'inicio', lat: -10.9600, lng: -37.0451, exibido: 'saída'},
    areas: [{id: 'a', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'a', areasManual: false,
    pernas: {}, rota: null,
    paradas: [
      daPlanilha('longe', '3', '3', -10.9700, -37.0400),
      daPlanilha('perto', '1', '1', -10.9605, -37.0450),
      daPlanilha('meio', '2', '2', -10.9650, -37.0420),
    ],
  }) as never;

  const servicos = {
    matriz: async (pts: Ponto[]) => {
      const m = pts.map(a => pts.map(b => haversine(a, b)));
      return {dur: m, dist: m, porRuas: false};
    },
    linha: async () => null,
  };

  it('desmarcada, monta a melhor sequência; marcada, segue parada 1, 2, 3', async () => {
    const solta = estado(false) as {paradas: Parada[]; rota: {areas: {ordem: string[]}[]} | null};
    const rSolta = await montarRotaDoEstado(solta as never, servicos);
    expect(rSolta.areas[0].ordem).toEqual(['perto', 'meio', 'longe']);

    const presa = estado(true);
    const rPresa = await montarRotaDoEstado(presa, servicos);
    expect(rPresa.areas[0].ordem).toEqual(['perto', 'meio', 'longe']);
    expect(rPresa.ordemDoApp).toBe(true);
    expect(rPresa.melhorDist).toBeGreaterThan(0);
  });

  it('quando a ordem do app é pior, a rota segue ela e o app diz quanto custa', async () => {
    const presa = estado(true) as {paradas: Parada[]};
    presa.paradas[0].stop = '1';
    presa.paradas[1].stop = '3';
    const r = await montarRotaDoEstado(presa as never, servicos);
    expect(r.areas[0].ordem).toEqual(['longe', 'meio', 'perto']);
    expect(r.dist).toBeGreaterThan(r.melhorDist!);
  });
});

describe('entregas no mesmo ponto viram uma visita só', () => {
  const noPonto = (id: string, lat: number, lng: number) =>
    ({id, area: 'a', ml: null, stop: null, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false}) as Parada;

  it('junta o que está no mesmo lugar, sem ir emendando de uma em uma', () => {
    const vs = agruparVisitas([
      noPonto('a', -10.9400, -37.0600),
      noPonto('b', -10.94015, -37.0600),
      noPonto('c', -10.9403, -37.0600),
      noPonto('longe', -10.9500, -37.0600),
    ] as never);
    expect(vs.map(v => v.ps.map(p => p.id))).toEqual([['a', 'b'], ['c'], ['longe']]);
  });

  it('a mesma parada da Shopee fica junta mesmo espalhada, e não se mistura com a de outra planilha', () => {
    const daParada = (id: string, stop: string, lat: number, rota = 'AT1') =>
      ({...noPonto(id, lat, -37.0600), stop, rota}) as Parada;
    const vs = agruparVisitas([
      daParada('p9a', '9', -10.9400),
      daParada('p9b', '9', -10.9409),
      daParada('p10', '10', -10.94105),
      daParada('outroDia', '9', -10.9420, 'AT2'),
    ] as never);
    expect(vs.map(v => v.ps.map(p => p.id))).toEqual([['p9a', 'p9b'], ['p10'], ['outroDia']]);
  });

  it('junta o mesmo condomínio em ruas diferentes, e deixa o prédio vizinho de fora', () => {
    const comNome = (id: string, texto: string, lat: number) =>
      ({...noPonto(id, lat, -37.0600), texto, bairro: 'Jardins'}) as Parada;
    const vs = agruparVisitas([
      comNome('condoA', 'Avenida das Flores, 1500, Ed Villa Sorrento a', -10.9400),
      comNome('condoB', 'Rua do Poeta, 1500, Apt 704 edificio Villa Sorento', -10.94033),
      comNome('vizinho', 'Rua do Poeta, 300, algarve residence apto 604', -10.93950),
    ] as never);
    expect(vs.map(v => v.ps.map(p => p.id))).toEqual([['condoA', 'condoB'], ['vizinho']]);
  });

  it('casas do mesmo conjunto em ruas diferentes são visitas diferentes', () => {
    const comNome = (id: string, texto: string, lat: number) =>
      ({...noPonto(id, lat, -37.0600), texto, bairro: 'Jardins'}) as Parada;
    const vs = agruparVisitas([
      comNome('a', 'Rua das Acácias, 284, Conjunto Solar Verde', -10.9400),
      comNome('b', 'Rua dos Ipês, 22, Conjunto: Solar Verde', -10.94095),
    ] as never);
    expect(vs.map(v => v.ps.map(p => p.id))).toEqual([['a'], ['b']]);
  });

  it('a matriz de ruas pede um ponto por visita, e as entregas do mesmo ponto ficam juntas', async () => {
    const e = {
      cidade: 'Aracaju', tamTrecho: 9, voltar: false, ordemDoApp: false,
      inicio: {id: 'inicio', lat: -10.9600, lng: -37.0451, exibido: 'saída'},
      areas: [{id: 'a', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'a', areasManual: false,
      pernas: {} as Record<string, {dur: number; dist: number}>, rota: null,
      paradas: [noPonto('porta1', -10.9650, -37.0420), noPonto('longe', -10.9700, -37.0400), noPonto('porta2', -10.96501, -37.04201)],
    };
    let pontos = 0;
    const r = await montarRotaDoEstado(e as never, {
      matriz: async (pts: Ponto[]) => {
        pontos = pts.length;
        const m = pts.map(a => pts.map(b => haversine(a, b)));
        return {dur: m, dist: m, porRuas: true};
      },
      linha: async () => null,
    });
    expect(pontos).toBe(3);
    const ordem = r.areas[0].ordem;
    expect(ordem).toHaveLength(3);
    expect(Math.abs(ordem.indexOf('porta1') - ordem.indexOf('porta2'))).toBe(1);
    expect(e.pernas.porta2).toEqual({dur: 0, dist: 0});
  });
});

describe('condomínio e casa do lado na mesma parada', () => {
  const parada2 = (id: string, texto: string, extra: Partial<Parada> = {}) =>
    ({id, area: 'a', ml: null, texto, unidades: null, comercial: false, lat: -10.94, lng: -37.06, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra}) as Parada;

  it('separa por endereço quem está na mesma parada, somando os pacotes de cada um', () => {
    const g = agruparPorEndereco([
      parada2('1', 'Rua Passos Cabral, 742, Cond. Alameda Residence apt 201', {unidades: 3}),
      parada2('2', 'Rua Passos Cabral, 742, Cond. Alameda Residence apt 504'),
      parada2('3', 'Rua Passos Cabral, 731, Loja laranja lima', {unidades: 2}),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({titulo: 'Rua Passos Cabral, 742', pacotes: 4});
    expect(g[0].ps.map(p => p.id)).toEqual(['1', '2']);
    expect(g[1]).toMatchObject({titulo: 'Rua Passos Cabral, 731', pacotes: 2});
  });
  it('um endereço só continua sendo um grupo só, sem cabeçalho a mais', () => {
    expect(agruparPorEndereco([
      parada2('1', 'Rua dos Ipês, 300, Bloco A ap 101'),
      parada2('2', 'Rua dos Ipês, 300, Bloco B ap 202'),
    ])).toHaveLength(1);
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

// O "Entreguei aqui" leva o pino para o GPS antes de guardar a passagem: comparada depois, toda
// entrega saía "no pino", e uma passagem no pino verifica o endereço sozinha (revisão de 05/10).
describe('entrega no pino', () => {
  const gps = {lat: -10.9605, lng: -37.0455};
  it('compara com o pino que ele seguia, até 30 m', () => {
    expect(noPino({lat: gps.lat + 0.0002, lng: gps.lng}, gps)).toBe(true);
    expect(noPino({lat: gps.lat + 0.0005, lng: gps.lng}, gps)).toBe(false);
  });
  it('sem pino, não foi no pino', () => {
    expect(noPino({lat: null, lng: null}, gps)).toBe(false);
    expect(noPino({}, gps)).toBe(false);
  });
});

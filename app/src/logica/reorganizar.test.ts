import {describe, expect, it} from 'vitest';
import {haversine} from './geo';
import {montarRota} from './montagem';
import {ANDOU_DEMAIS, andouDemais, GPS_DE_AGORA, pontoDePartida, reorganizarDaqui} from './reorganizar';
import type {Estado, Parada, Ponto} from './tipos';

// Seis paradas em fila para o sul, uns 111 m uma da outra, saindo do norte: a rota é a, b, c, d, e, f.
const LNG = -37.05;
const sul = (i: number) => -10.95 - i * 0.001;
const parada = (id: string, lat: number, lng = LNG): Parada =>
  ({id, area: 'v', ml: null, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false});

function estado(extra: Partial<Estado> = {}): Estado {
  return {
    cidade: 'Aracaju', regiao: null, tamTrecho: 9, voltar: false, ordemDoApp: false, areasManual: false,
    inicio: {id: 'inicio', lat: sul(0), lng: LNG, exibido: 'saída'},
    areas: [{id: 'v', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'v',
    paradas: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => parada(id, sul(i + 1))),
    rota: null, pernas: {},
    ...extra,
  } as Estado;
}

// o serviço de ruas de mentira: a distância em linha reta, a 10 m/s
const ruas = {
  matriz: async (pts: Ponto[]) => {
    const dist = pts.map(a => pts.map(b => haversine(a, b)));
    return {dur: dist.map(l => l.map(m => m / 10)), dist, porRuas: true};
  },
  linha: async () => null,
};

async function montado(extra: Partial<Estado> = {}) {
  const e = estado(extra);
  await montarRota(e, ruas);
  return e;
}
const p = (e: Estado, id: string) => e.paradas.find(x => x.id === id)!;
const entregar = (e: Estado, ...ids: string[]) => ids.forEach(id => { p(e, id).entregue = true; });
const ordem = (e: Estado) => e.rota!.areas[0].ordem;

describe('a rota segue da entrega feita fora da ordem', () => {
  it('montada, a rota guarda os tempos entre as visitas, sem a saída', async () => {
    const e = await montado();
    expect(ordem(e)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const t = e.rota!.areas[0].tempos!;
    expect(t.visitas.map(v => v.ids)).toEqual([['a'], ['b'], ['c'], ['d'], ['e'], ['f']]);
    expect(t.dur).toHaveLength(6);
    expect(t.dist![0][5]).toBe(Math.round(haversine(p(e, 'a') as Ponto, p(e, 'f') as Ponto)));
  });

  it('entregando a última com a primeira por fazer, o resto vem dali para trás', async () => {
    const e = await montado();
    const r = reorganizarDaqui(e, p(e, 'f'))!;
    expect(r.rota.areas[0].ordem).toEqual(['f', 'e', 'd', 'c', 'b', 'a']);
    expect(r.pernas.e.dist).toBe(Math.round(haversine(p(e, 'f') as Ponto, p(e, 'e') as Ponto)));
    expect(r.pontos.map(x => x.lat)).toEqual([sul(6), sul(5), sul(4), sul(3), sul(2), sul(1)]);
    // não mexe na rota que está na tela: quem aplica é quem chamou
    expect(ordem(e)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  // Nos dois, a ordem guardada tem c antes de b: refeita dali, mudaria. Seguindo o cartão, não muda.
  it('a do cartão da próxima não muda nada, mesmo que desse para melhorar', async () => {
    const e = await montado();
    e.rota!.areas[0].ordem = ['a', 'c', 'b', 'd', 'e', 'f'];
    expect(reorganizarDaqui(e, p(e, 'a'))).toBeNull();
  });

  it('a do mesmo bloco do cartão não muda nada', async () => {
    const e = estado();
    e.paradas.splice(1, 0, parada('a2', sul(1) - 0.00004));
    await montarRota(e, ruas);
    const [x, y] = ordem(e);
    expect([x, y].sort()).toEqual(['a', 'a2']);
    e.rota!.areas[0].ordem = [x, y, 'c', 'b', 'd', 'e', 'f'];
    expect(reorganizarDaqui(e, p(e, y))).toBeNull();
  });

  it('quando a melhor continua sendo a de antes, nada muda', async () => {
    // de b, ir até a e voltar custa menos que deixar a para o fim
    const e = await montado();
    expect(reorganizarDaqui(e, p(e, 'b'))).toBeNull();
  });

  it('as já entregues ficam na ordem, na frente', async () => {
    const e = await montado();
    entregar(e, 'a', 'b');
    const r = reorganizarDaqui(e, p(e, 'f'))!;
    expect(r.rota.areas[0].ordem).toEqual(['a', 'b', 'f', 'e', 'd', 'c']);
  });

  it('na sequência das entregas, a ordem é a da planilha e não muda', async () => {
    const e = await montado();
    e.ordemDoApp = true;
    expect(reorganizarDaqui(e, p(e, 'f'))).toBeNull();
  });

  it('rota montada antes desta versão, sem os tempos, não muda', async () => {
    const e = await montado();
    delete e.rota!.areas[0].tempos;
    expect(reorganizarDaqui(e, p(e, 'f'))).toBeNull();
  });

  it('um pino do que falta que andou mais que o limite deixa a ordem como está', async () => {
    const e = await montado();
    p(e, 'c').lng = LNG + (ANDOU_DEMAIS + 20) / 111000;
    expect(reorganizarDaqui(e, p(e, 'f'))).toBeNull();
  });

  it('a entrega feita com o pino longe de onde foi medida também', async () => {
    const e = await montado();
    p(e, 'f').lng = LNG + (ANDOU_DEMAIS + 20) / 111000;
    expect(reorganizarDaqui(e, p(e, 'f'))).toBeNull();
  });

  it('pino que andou pouco não impede', async () => {
    const e = await montado();
    p(e, 'c').lng = LNG + (ANDOU_DEMAIS - 20) / 111000;
    expect(reorganizarDaqui(e, p(e, 'f'))).not.toBeNull();
  });

  it('a linha nova sai da entregue: a rota guarda que as feitas antes dela ficam fora do traço', async () => {
    const e = await montado();
    entregar(e, 'a', 'b');
    const r = reorganizarDaqui(e, p(e, 'f'))!;
    expect(r.rota.areas[0].ordem.slice(0, 3)).toEqual(['a', 'b', 'f']);
    expect(r.rota.areas[0].linhaDesde).toBe(2);
    expect(r.pontos[0].lat).toBe(sul(6));
  });

  it('a separada depois de montar vai junto com a sua visita', async () => {
    const e = await montado();
    e.paradas.push(parada('c2', sul(3)));
    ordem(e).splice(3, 0, 'c2');
    const r = reorganizarDaqui(e, p(e, 'f'))!;
    expect(r.rota.areas[0].ordem).toEqual(['f', 'e', 'd', 'c', 'c2', 'b', 'a']);
    expect(r.pernas.c2).toEqual({dur: 0, dist: 0});
  });

  it('com ponto final, ele continua no fim, e a perna até ele é a nova', async () => {
    const fim = {id: 'fim', lat: sul(0), lng: LNG, exibido: 'casa'};
    const e = await montado({fim});
    const ultima = ordem(e)[ordem(e).length - 1];
    const r = reorganizarDaqui(e, p(e, ultima))!;
    expect(r).not.toBeNull();
    expect(r.pontos[r.pontos.length - 1]).toEqual({lat: fim.lat, lng: fim.lng});
    const nova = r.rota.areas[0].ordem;
    expect(r.rota.fim!.dist).toBe(Math.round(haversine(p(e, nova[nova.length - 1]) as Ponto, fim)));
  });

  it('o total passa a ser o feito na ordem velha mais o que falta na nova', async () => {
    const e = await montado();
    const antes = e.rota!.dist;
    const r = reorganizarDaqui(e, p(e, 'f'))!;
    // saíam da conta: saída→a e as pernas até b, c, d, e (5 trechos); entram f→e, e→d, d→c, c→b, b→a
    const velhas = ['a', 'b', 'c', 'd', 'e'].reduce((s, id) => s + e.pernas[id].dist, 0);
    const novas = ['a', 'b', 'c', 'd', 'e'].reduce((s, id) => s + r.pernas[id].dist, 0);
    expect(r.rota.dist).toBeCloseTo(antes - velhas + novas, 6);
    expect(r.rota.areas[0].dist).toBeCloseTo(e.rota!.areas[0].dist - velhas + novas, 6);
  });
});

// Dono, 15/11: "quando mudamos pinos, ela reage?". Com rede, a rota se refaz sozinha quando um
// pino do que falta anda mais que o limite (acoes/rota.ts); aqui, só a decisão.
describe('quando um pino do que falta anda demais', () => {
  const longe = (m: number) => LNG + m / 109000;

  it('acabada de montar, nada andou', async () => {
    expect(andouDemais(await montado())).toBe(false);
  });

  it('um pino do que falta que andou mais que o limite pede a rota de novo', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS + 20);
    expect(andouDemais(e)).toBe(true);
  });

  it('andando pouco, a ordem continua valendo', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS - 20);
    expect(andouDemais(e)).toBe(false);
  });

  it('a entregue que mudou de lugar (a porta marcada na entrega) não pede nada', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS + 20);
    p(e, 'c').entregue = true;
    expect(andouDemais(e)).toBe(false);
  });

  it('a deixada para depois não pede nada: ela volta pelo "Voltar para a rota"', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS + 20);
    p(e, 'c').adiada = true;
    expect(andouDemais(e)).toBe(false);
  });

  it('na sequência das entregas, a ordem não depende do pino', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS + 20);
    e.ordemDoApp = true;
    expect(andouDemais(e)).toBe(false);
  });

  it('rota de antes desta versão, sem os tempos, fica com o aviso de sempre', async () => {
    const e = await montado();
    p(e, 'c').lng = longe(ANDOU_DEMAIS + 20);
    delete e.rota!.areas[0].tempos;
    expect(andouDemais(e)).toBe(false);
  });
});

describe('de onde sai a rota refeita no caminho', () => {
  const agora = 1_000_000;
  const eu = {lat: -10.97, lng: -37.06, precisao: 12, quando: agora - 30_000};

  it('do GPS, se é de agora e bom', async () => {
    const e = await montado();
    expect(pontoDePartida(e, eu, agora)).toMatchObject({lat: eu.lat, lng: eu.lng});
  });

  it('com o GPS velho, da última entrega, não da saída da manhã', async () => {
    const e = await montado();
    Object.assign(p(e, 'b'), {entregue: true, entregueEm: agora - 600_000});
    Object.assign(p(e, 'd'), {entregue: true, entregueEm: agora - 60_000});
    const velho = {...eu, quando: agora - GPS_DE_AGORA - 1};
    expect(pontoDePartida(e, velho, agora)).toMatchObject({lat: p(e, 'd').lat, lng: p(e, 'd').lng});
  });

  it('com o GPS impreciso, também da última entrega', async () => {
    const e = await montado();
    Object.assign(p(e, 'b'), {entregue: true, entregueEm: agora - 60_000});
    expect(pontoDePartida(e, {...eu, precisao: 900}, agora)).toMatchObject({lat: p(e, 'b').lat});
  });

  it('sem GPS e sem entrega feita, da saída de sempre', async () => {
    const e = await montado();
    expect(pontoDePartida(e, null, agora)).toBe(e.inicio);
  });
});

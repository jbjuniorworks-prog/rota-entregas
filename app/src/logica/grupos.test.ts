import {haversine} from './geo';
import {aplicarGrupos, circular, coresDosGrupos, dentroDoLaco, gruposValidos, tirarGrupos} from './grupos';
import {montarRota} from './montagem';
import type {Estado, Parada, Ponto} from './tipos';

const parada = (id: string, lat: number, lng: number, extra: Partial<Parada> = {}): Parada =>
  ({id, area: 'a', ml: null, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
// um quadrado em volta do ponto, com uns 110 m de lado
const quadrado = (lat: number, lng: number, d = 0.0005): Ponto[] =>
  [{lat: lat - d, lng: lng - d}, {lat: lat - d, lng: lng + d}, {lat: lat + d, lng: lng + d}, {lat: lat + d, lng: lng - d}];

const estado = (paradas: Parada[]): Estado => ({
  cidade: 'Aracaju', tamTrecho: 9, voltar: false, ordemDoApp: false,
  inicio: {id: 'inicio', lat: -10.9600, lng: -37.0451, exibido: 'saída'}, fim: null,
  areas: [{id: 'a', nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: 'a', areasManual: false,
  pernas: {}, rota: null, paradas,
});

const servicos = {
  matriz: async (pts: Ponto[]) => {
    const m = pts.map(a => pts.map(b => haversine(a, b)));
    return {dur: m, dist: m, porRuas: false};
  },
  linha: async () => null,
};

describe('circular grupos no mapa', () => {
  it('dentro é o que o traço cerca, mesmo sem fechar e mesmo torto', () => {
    // um "C" aberto para leste: o miolo do C fica fora
    const c: Ponto[] = [{lat: 0, lng: 0}, {lat: 0, lng: 3}, {lat: 1, lng: 3}, {lat: 1, lng: 1}, {lat: 2, lng: 1}, {lat: 2, lng: 3}, {lat: 3, lng: 3}, {lat: 3, lng: 0}];
    expect(dentroDoLaco(c, {lat: 0.5, lng: 2})).toBe(true);
    expect(dentroDoLaco(c, {lat: 1.5, lng: 2}), 'o miolo do C').toBe(false);
    expect(dentroDoLaco(c, {lat: 2.5, lng: 0.5})).toBe(true);
    expect(dentroDoLaco(c, {lat: 4, lng: 1})).toBe(false);
  });

  it('cada círculo é um grupo, na ordem em que foi desenhado; quem já tem grupo fica nele', () => {
    const ps = [parada('a', -10.95, -37.05), parada('b', -10.9502, -37.0502), parada('c', -10.96, -37.05), parada('d', -10.97, -37.05)];
    let r = circular([], quadrado(-10.96, -37.05), ps);
    r = circular(r.grupos, quadrado(-10.95, -37.05), ps);
    expect(r.grupos.map(g => g.ids)).toEqual([['c'], ['a', 'b']]);
    // o terceiro pega 'b' de novo e o 'd'
    r = circular(r.grupos, [{lat: -10.9505, lng: -37.06}, {lat: -10.9505, lng: -37.04}, {lat: -10.975, lng: -37.04}, {lat: -10.975, lng: -37.06}], ps);
    expect(r.grupos.map(g => g.ids)).toEqual([['c'], ['a', 'b'], ['d']]);
  });

  it('entregue, deixada para depois e sem posição não entram; círculo vazio avisa e não vira grupo', () => {
    const ps = [parada('feita', -10.95, -37.05, {entregue: true}), parada('depois', -10.95, -37.05, {adiada: true}), parada('sem', -10.95, -37.05, {lat: null, lng: null})];
    const r = circular([], quadrado(-10.95, -37.05), ps);
    expect(r.grupos).toEqual([]);
    expect(r.aviso).toBe('Nenhuma entrega por fazer dentro do círculo.');
    const um = circular([], quadrado(-10.96, -37.05), [parada('x', -10.96, -37.05)]);
    expect(circular(um.grupos, quadrado(-10.96, -37.05), [parada('x', -10.96, -37.05)]).aviso).toBe('As entregas deste círculo já estão num grupo.');
  });

  it('entregue depois de circulada sai do grupo, e o grupo vazio sai da conta', () => {
    const ps = [parada('a', -10.95, -37.05), parada('b', -10.96, -37.05)];
    const grupos = [{ids: ['a'], laco: []}, {ids: ['b'], laco: []}];
    ps[0].entregue = true;
    expect(gruposValidos(grupos, id => ps.find(p => p.id === id)).map(g => g.ids)).toEqual([['b']]);
  });

  it('o primeiro grupo não tem a cor das que ficaram fora', () => {
    expect(coresDosGrupos([{id: 'a', nome: 'Verde', cor: '#16a34a', prazo: ''}])[0]).not.toBe('#16a34a');
    expect(coresDosGrupos([{id: 'a', nome: 'Verde', cor: '#16a34a', prazo: ''}]).at(-1)).toBe('#16a34a');
  });

  // O resultado que importa: a rota vai aonde ele circulou primeiro, mesmo sendo o mais longe.
  it('a rota segue os grupos na ordem desenhada, a melhor ordem dentro de cada um, e as de fora por último', async () => {
    const e = estado([
      parada('perto', -10.9605, -37.0450), parada('meio', -10.9650, -37.0420),
      parada('longe1', -10.9700, -37.0400), parada('longe2', -10.9702, -37.0402),
    ]);
    let id = 0;
    const novas = aplicarGrupos(e, [{ids: ['longe2', 'longe1'], laco: []}], () => 'g' + ++id);
    expect(novas.map(a => [a.nome, a.cor])).toEqual([['Amarelo', '#ca8a04']]);
    expect(e.areas.map(a => a.id)).toEqual(['g1', 'a']);
    expect(e.areasManual).toBe(true);
    const r = await montarRota(e, servicos);
    expect(r.areas.map(ra => ra.ordem)).toEqual([['longe1', 'longe2'], ['meio', 'perto']]);
  });

  it('circulando tudo, a área de antes fica vazia, mas fica: é nela que entra a próxima planilha', () => {
    const e = estado([parada('a', -10.95, -37.05), parada('b', -10.96, -37.05)]);
    e.areas.push({id: 'velha', nome: 'Roxo', cor: '#9333ea', prazo: '10:00'});
    let id = 0;
    aplicarGrupos(e, [{ids: ['b'], laco: []}, {ids: ['a'], laco: []}], () => 'g' + ++id);
    expect(e.areas.map(a => a.id)).toEqual(['g1', 'g2', 'a']);
    expect(e.paradas.map(p => p.area)).toEqual(['g2', 'g1']);
    // a Roxo, vazia, saiu; os grupos não pegaram a cor de nenhuma área que existia
    expect(e.areas.map(a => a.nome)).toEqual(['Amarelo', 'Azul', 'Verde']);
  });

  it('tirar os grupos volta tudo para a área de antes, a rota volta a ser uma só, e a área feita à mão fica', async () => {
    const e = estado([parada('perto', -10.9605, -37.0450), parada('meio', -10.9650, -37.0420), parada('longe', -10.9700, -37.0400), parada('cedo', -10.9610, -37.0455)]);
    e.areas.push({id: 'manha', nome: 'Roxo', cor: '#9333ea', prazo: '10:00'});
    e.paradas[3].area = 'manha';
    let id = 0;
    aplicarGrupos(e, [{ids: ['longe'], laco: []}, {ids: ['meio'], laco: []}], () => 'g' + ++id);
    expect(e.areas.filter(a => a.circulo).map(a => a.id)).toEqual(['g1', 'g2']);
    expect(tirarGrupos(e)).toBe(2);
    expect(e.areas.map(a => a.id)).toEqual(['a', 'manha']);
    expect(e.paradas.map(p => p.area)).toEqual(['a', 'a', 'a', 'manha']);
    expect(e.areasManual).toBe(false);
    expect(tirarGrupos(e), 'sem grupos, não mexe').toBe(0);
    const r = await montarRota(e, servicos);
    // a da manhã, com horário, vai primeiro de novo; depois o resto, do mais perto ao mais longe
    expect(r.areas.map(ra => ra.ordem)).toEqual([['cedo'], ['perto', 'meio', 'longe']]);
  });
});

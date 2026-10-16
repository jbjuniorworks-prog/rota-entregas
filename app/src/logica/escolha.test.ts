import {alternarEscolha, escolhidasValidas, letraDoPino} from './escolha';
import type {Parada} from './tipos';

const parada = (id: string, extra: Partial<Parada> = {}): Parada =>
  ({id, area: 'a', ml: null, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat: -10.95, lng: -37.05, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
// três lugares a ~110 m um do outro, que o mapa afastado junta num pino só
const longe = (id: string, i: number) => parada(id, {lat: -10.96 - i * 0.001});
const ps = [parada('a'), parada('b', {entregue: true}), parada('c'), ...Array.from({length: 10}, (_, i) => parada('n' + i)),
  longe('g0', 0), longe('g1', 1), longe('g2', 2), parada('g0bis', {lat: -10.96, lng: -37.05})];
const achar = (id: string) => ps.find(p => p.id === id);

describe('escolher os pinos para o Maps', () => {
  it('a ordem dos toques é a ordem do Maps, e tocar de novo tira', () => {
    let e = alternarEscolha([], ['c'], achar).escolhidas;
    e = alternarEscolha(e, ['a'], achar).escolhidas;
    expect(e).toEqual(['c', 'a']);
    expect(letraDoPino(e, ['a'])).toBe('B');
    e = alternarEscolha(e, ['c'], achar).escolhidas;
    expect(e).toEqual(['a']);
    expect(letraDoPino(e, ['a'])).toBe('A');
    expect(letraDoPino(e, ['c'])).toBe('');
  });

  it('pino de uma porta só, com várias entregas, é um destino: a primeira por entregar', () => {
    const e = alternarEscolha([], ['b', 'c', 'a'], achar).escolhidas;
    expect(e).toEqual(['c']);
    expect(alternarEscolha(e, ['b', 'c', 'a'], achar).escolhidas).toEqual([]);
  });

  it('pino que junta lugares diferentes vira um destino por lugar, na ordem da rota, e mostra quantos', () => {
    const grupo = ['g0', 'g0bis', 'g1', 'g2'];
    const e = alternarEscolha(['a'], grupo, achar).escolhidas;
    // o g0bis está na mesma porta do g0
    expect(e).toEqual(['a', 'g0', 'g1', 'g2']);
    expect(letraDoPino(e, grupo)).toBe('B+2');
    // de perto, cada um com a sua letra
    expect(['g0', 'g1', 'g2'].map(id => letraDoPino(e, [id]))).toEqual(['B', 'C', 'D']);
  });

  it('dois escolhidos que caem no mesmo pino, com o mapa afastado: ele mostra os dois, e tocar tira os dois', () => {
    let e = alternarEscolha([], ['g2'], achar).escolhidas;
    e = alternarEscolha(e, ['g0'], achar).escolhidas;
    const afastado = ['g0', 'g1', 'g2'];
    expect(letraDoPino(e, afastado)).toBe('A+1');
    expect(alternarEscolha(e, afastado, achar).escolhidas).toEqual([]);
  });

  it('pino que não cabe inteiro não entra pela metade', () => {
    let e: string[] = [];
    for (let i = 0; i < 7; i++) e = alternarEscolha(e, ['n' + i], achar).escolhidas;
    const r = alternarEscolha(e, ['g0', 'g1', 'g2'], achar);
    expect(r.escolhidas).toEqual(e);
    expect(r.aviso).toBe('Este pino junta 3 lugares, e só cabem mais 2. Aproxime o mapa para escolher um por um.');
  });

  it('pino já entregue não entra', () => {
    const r = alternarEscolha([], ['b'], achar);
    expect(r.escolhidas).toEqual([]);
    expect(r.aviso).toBe('Este pino já foi entregue.');
  });

  it('não passa de 9, o teto do app (até a letra I)', () => {
    let e: string[] = [];
    for (let i = 0; i < 9; i++) e = alternarEscolha(e, ['n' + i], achar).escolhidas;
    expect(letraDoPino(e, ['n8'])).toBe('I');
    const r = alternarEscolha(e, ['n9'], achar);
    expect(r.escolhidas).toHaveLength(9);
    expect(r.aviso).toBe('Já são 9, o limite que o app manda ao Maps. Toque num escolhido para tirar.');
  });

  it('entrega que foi entregue ou sumiu sai da escolha, e as letras andam com a lista', () => {
    const vivas = ps.map(p => ({...p}));
    const achar2 = (id: string) => vivas.find(p => p.id === id);
    const e = ['n0', 'n1', 'n2', 'nao-existe'];
    vivas.find(p => p.id === 'n0')!.entregue = true;
    expect(escolhidasValidas(e, achar2)).toEqual(['n1', 'n2']);
    expect(letraDoPino(escolhidasValidas(e, achar2), ['n2'])).toBe('B');
    // e o próximo toque já parte da lista limpa
    expect(alternarEscolha(e, ['n3'], achar2).escolhidas).toEqual(['n1', 'n2', 'n3']);
  });
});

import {alternarEscolha, letraDoPino} from './escolha';
import type {Parada} from './tipos';

const parada = (id: string, extra: Partial<Parada> = {}): Parada =>
  ({id, area: 'a', ml: null, texto: `Rua ${id}, 1`, unidades: null, comercial: false, lat: -10.95, lng: -37.05, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
const ps = [parada('a'), parada('b', {entregue: true}), parada('c'), ...Array.from({length: 10}, (_, i) => parada('n' + i))];
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

  it('num pino com várias entregas vale a primeira por entregar, e tocar nele tira a escolhida', () => {
    const e = alternarEscolha([], ['b', 'c'], achar).escolhidas;
    expect(e).toEqual(['c']);
    expect(alternarEscolha(e, ['b', 'c'], achar).escolhidas).toEqual([]);
  });

  it('pino já entregue não entra', () => {
    const r = alternarEscolha([], ['b'], achar);
    expect(r.escolhidas).toEqual([]);
    expect(r.aviso).toBe('Este pino já foi entregue.');
  });

  it('não passa de 9, o que o Maps aceita (até a letra I)', () => {
    let e: string[] = [];
    for (let i = 0; i < 9; i++) e = alternarEscolha(e, ['n' + i], achar).escolhidas;
    expect(letraDoPino(e, ['n8'])).toBe('I');
    const r = alternarEscolha(e, ['n9'], achar);
    expect(r.escolhidas).toHaveLength(9);
    expect(r.aviso).toBe('Já são 9, o máximo do Maps. Toque num escolhido para tirar.');
  });
});

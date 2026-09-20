import {aplicarCompartilhadas, type PosicaoCompartilhada} from './compartilhadas';
import type {Parada} from './tipos';

let n = 0;
const parada = (chave: string, extra: Partial<Parada> = {}): Parada & {chave: string} => ({
  id: 'p' + ++n, chave, area: 'a', ml: null, texto: chave, unidades: null, comercial: false,
  lat: -10.90, lng: -37.05, exibido: 'Posição da planilha', precisao: 'planilha', candidatos: [], entregue: false, ...extra,
});
const pos = (chave: string, situacao: 'confirmado' | 'sugestao', extra: Partial<PosicaoCompartilhada> = {}): PosicaoCompartilhada =>
  ({chave_lugar: chave, lat: -11.04, lng: -37.10, situacao, motoristas: situacao === 'confirmado' ? 2 : 1, minha: false, ...extra});
const aplicar = (ps: (Parada & {chave: string})[], rs: PosicaoCompartilhada[]) => aplicarCompartilhadas(ps, rs, p => (p as any).chave);

describe('posições de outros motoristas', () => {
  it('confirmada por 2 motoristas: aplica sozinha e guarda a de antes como opção', () => {
    const p = parada('a|1');
    expect(aplicar([p], [pos('a|1', 'confirmado')])).toEqual({confirmadas: 1, sugestoes: 0});
    expect(p).toMatchObject({lat: -11.04, lng: -37.10, precisao: 'confirmado', exibido: 'Posição confirmada por 2 motoristas'});
    expect(p.candidatos[0]).toMatchObject({lat: -10.90, precisao: 'planilha', fonte: 'original'});
  });
  it('posição confirmada pelas entregas feitas no local diz de onde veio', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {fonte: 'entrega', motoristas: 0, entregas: 2})]);
    expect(p.exibido).toBe('Posição confirmada por 2 entrega(s) feitas aqui');
    expect(p.precisao).toBe('confirmado');
  });
  it('correção do administrador vale como confirmada', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {motoristas: 1})]);
    expect(p.exibido).toBe('Posição confirmada por quem administra');
  });
  it('de 1 motorista só: não move, vira sugestão com a distância', () => {
    const p = parada('a|1');
    expect(aplicar([p], [pos('a|1', 'sugestao')])).toEqual({confirmadas: 0, sugestoes: 1});
    expect(p.lat).toBe(-10.90);
    expect(p.sugestao).toMatchObject({lat: -11.04, lng: -37.10});
    expect(p.sugestao!.distancia).toBeGreaterThan(15000);
  });
  it('sugestão igual à posição que já está (menos de 30 m) não aparece', () => {
    const p = parada('a|1', {lat: -11.04001, lng: -37.10001});
    expect(aplicar([p], [pos('a|1', 'sugestao')]).sugestoes).toBe(0);
    expect(p.sugestao).toBeUndefined();
  });
  it('a escolha do próprio motorista vence: não mexe em ajustada nem lembrada', () => {
    const a = parada('a|1', {precisao: 'manual'}), b = parada('b|1', {precisao: 'lembrado'});
    expect(aplicar([a, b], [pos('a|1', 'confirmado'), pos('b|1', 'confirmado')]).confirmadas).toBe(0);
    expect([a.lat, b.lat]).toEqual([-10.90, -10.90]);
  });
  it('ignora a posição que é minha, entregues e paradas sem chave', () => {
    const a = parada('a|1'), b = parada('b|1', {entregue: true}), c = parada('');
    expect(aplicar([a, b, c], [pos('a|1', 'confirmado', {minha: true}), pos('b|1', 'confirmado')])).toEqual({confirmadas: 0, sugestoes: 0});
  });
  it('confirmada tira a sugestão antiga e corrige a posição que a planilha jogou longe', () => {
    const p = parada('a|1', {precisao: 'bairro', sugestao: {lat: 1, lng: 1, distancia: 5}});
    aplicar([p], [pos('a|1', 'confirmado')]);
    expect(p.precisao).toBe('confirmado');
    expect(p.sugestao).toBeUndefined();
  });
});

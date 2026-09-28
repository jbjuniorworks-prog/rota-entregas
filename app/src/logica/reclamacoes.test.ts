import {aplicarReclamacoes, avisoXarope, type ReclamacaoDaNuvem} from './reclamacoes';
import type {Parada} from './tipos';

let n = 0;
const parada = (chave: string, extra: Partial<Parada> = {}): Parada & {chave: string} => ({
  id: 'p' + ++n, chave, area: 'a', ml: null, texto: chave, unidades: null, comercial: false,
  lat: -10.9, lng: -37.05, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra,
});
const daNuvem = (chave: string, motivo: 'jogado' | 'vizinho', minha = false): ReclamacaoDaNuvem =>
  ({chave_lugar: chave, motivo, quando: '2026-09-20T12:00:00Z', minha});
const aplicar = (ps: (Parada & {chave: string})[], rs: ReclamacaoDaNuvem[]) => aplicarReclamacoes(ps, rs, p => (p as any).chave);

describe('cliente xarope', () => {
  it('chega em todas as entregas do mesmo endereço, e só nelas', () => {
    const a = parada('a|1'), b = parada('a|1'), c = parada('b|2');
    expect(aplicar([a, b, c], [daNuvem('a|1', 'vizinho')])).toBe(2);
    expect(a.reclamacoes).toEqual([{motivo: 'vizinho', quando: '2026-09-20T12:00:00Z', minha: false}]);
    expect(b.reclamacoes).toHaveLength(1);
    expect(c.reclamacoes).toBeUndefined();
  });

  // Marcou sem sinal: está na fila, a nuvem ainda não sabe. A consulta não pode tirar da tela.
  it('não apaga o que este aparelho marcou e ainda não subiu', () => {
    const a = parada('a|1', {reclamacoes: [{motivo: 'jogado', quando: '2026-09-28T15:00:00Z', minha: true}]});
    aplicar([a], [daNuvem('a|1', 'vizinho')]);
    expect(a.reclamacoes!.map(r => r.motivo).sort()).toEqual(['jogado', 'vizinho']);
    expect(a.reclamacoes!.find(r => r.motivo === 'jogado')!.minha).toBe(true);
  });

  it('motivo que o app não conhece não entra', () => {
    const a = parada('a|1');
    expect(aplicar([a], [{...daNuvem('a|1', 'jogado'), motivo: 'outro' as any}])).toBe(0);
    expect(a.reclamacoes).toBeUndefined();
  });

  it('o aviso diz o que fazer, na língua deles', () => {
    expect(avisoXarope(undefined)).toBeNull();
    expect(avisoXarope([{motivo: 'vizinho', quando: '', minha: false}]))
      .toBe('Cliente xarope: já reclamou de deixar com vizinho — não deixe com vizinho.');
  });
});

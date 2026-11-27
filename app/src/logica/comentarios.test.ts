import {aplicarComentarios, comentariosDe, problemaDoComentario, type ComentarioDaNuvem} from './comentarios';
import type {Parada} from './tipos';

const parada = (chave: string, extra: Partial<Parada> = {}) => ({id: chave, texto: chave, ...extra}) as unknown as Parada;
const daNuvem = (chave: string, texto: string, minha = false, id = 1): ComentarioDaNuvem => ({id, chave_lugar: chave, texto, quando: '2026-11-26T12:00:00Z', minha});

describe('o texto do comentário', () => {
  test('o lugar passa: casa da filha, o número da casa ao lado', () => {
    expect(problemaDoComentario('casa da filha')).toBeNull();
    expect(problemaDoComentario('número da casa ao lado é 500, a 502 é a dela')).toBeNull();
  });
  test('telefone não passa, com ou sem separadores', () => {
    expect(problemaDoComentario('liga 79 99999-1234')).toMatch(/telefone/);
    expect(problemaDoComentario('(79) 9.9999.1234')).toMatch(/telefone/);
  });
  test('CEP também não (8 dígitos): limite conhecido, como no banco', () => {
    expect(problemaDoComentario('CEP certo é 49000-100')).toMatch(/CEP/);
  });
  test('até 120 letras', () => {
    expect(problemaDoComentario('a'.repeat(120))).toBeNull();
    expect(problemaDoComentario('a'.repeat(121))).toMatch(/120/);
  });
});

describe('os comentários da nuvem na parada', () => {
  test('os da nuvem trocam os de antes, e a parada sem nenhum fica sem', () => {
    const a = parada('k1', {comentarios: [{id: 9, texto: 'velho', quando: 'x', minha: false}]}), b = parada('k2', {comentarios: [{id: 8, texto: 'apagado', quando: 'x', minha: false}]});
    expect(aplicarComentarios([a, b], [daNuvem('k1', 'casa da filha')], p => p.id)).toBe(1);
    expect(a.comentarios!.map(c => c.texto)).toEqual(['casa da filha']);
    expect(b.comentarios).toBeUndefined();
  });

  test('o seu mexido neste aparelho vale sobre o da nuvem até a fila mandar', () => {
    const p = parada('k1', {comentarioMeu: {texto: 'portão azul', quando: 'y'}});
    aplicarComentarios([p], [daNuvem('k1', 'texto velho', true), daNuvem('k1', 'casa da filha', false, 2)], q => q.id);
    expect(comentariosDe(p)).toEqual({meu: {texto: 'portão azul', quando: 'y'}, outros: [expect.objectContaining({texto: 'casa da filha'})]});
  });

  test('apagado neste aparelho, o da nuvem não volta', () => {
    const p = parada('k1', {comentarioMeu: {texto: '', quando: 'y'}});
    aplicarComentarios([p], [daNuvem('k1', 'texto velho', true)], q => q.id);
    expect(comentariosDe(p).meu).toBeNull();
  });

  test('sem mexer aqui, o seu vem da nuvem', () => {
    const p = parada('k1');
    aplicarComentarios([p], [daNuvem('k1', 'nº ao lado é 500', true)], q => q.id);
    expect(comentariosDe(p).meu?.texto).toBe('nº ao lado é 500');
    expect(comentariosDe(p).outros).toEqual([]);
  });
});

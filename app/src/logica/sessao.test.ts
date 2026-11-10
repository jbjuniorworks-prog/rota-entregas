import {describe, expect, it} from 'vitest';
import {chaveDaSessao} from './sessao';

const parte = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sessao = (sub: string, sessionId: string | undefined, exp: number) =>
  ({access_token: ['cabecalho', parte({sub, exp, ...(sessionId ? {session_id: sessionId} : {})}), 'assinatura'].join('.'), user: {id: sub}});

// Revisão de 07/11: o cliente do comercial vale enquanto a sessão em que nasceu for a mesma. Renovar o
// token é a mesma sessão; sair e entrar, mesmo com a mesma conta, é outra.
describe('chave da sessão', () => {
  it('renovar o token não muda a chave', () => {
    expect(chaveDaSessao(sessao('A', 's1', 100), 0)).toBe(chaveDaSessao(sessao('A', 's1', 200), 0));
  });

  it('entrar de novo com a mesma conta muda a chave', () => {
    expect(chaveDaSessao(sessao('A', 's1', 100), 0)).not.toBe(chaveDaSessao(sessao('A', 's2', 100), 0));
  });

  it('A, depois B, depois A de novo: a chave de A não volta a ser a mesma', () => {
    const a1 = chaveDaSessao(sessao('A', 's1', 100), 0);
    const b = chaveDaSessao(sessao('B', 's2', 100), 1);
    const a2 = chaveDaSessao(sessao('A', 's3', 100), 2);
    expect(new Set([a1, b, a2]).size).toBe(3);
  });

  it('sem session_id no token, a vez da entrada separa uma sessão da outra', () => {
    expect(chaveDaSessao(sessao('A', undefined, 100), 0)).toBe(chaveDaSessao(sessao('A', undefined, 200), 0));
    expect(chaveDaSessao(sessao('A', undefined, 100), 0)).not.toBe(chaveDaSessao(sessao('A', undefined, 100), 1));
  });

  it('sem sessão não há chave, e token ilegível não derruba', () => {
    expect(chaveDaSessao(null, 0)).toBeNull();
    expect(chaveDaSessao({access_token: 'lixo', user: {id: 'A'}}, 0)).toBe('0|A|');
  });
});

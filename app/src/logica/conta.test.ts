import {CHAVES, DO_MOTORISTA, guardadaDe, trocarDeConta} from './guarda';

// Cada conta tem o seu dia no aparelho (decisão de 20/10, auditoria da fila): quem entra não vê,
// nem manda, nada do dia de quem saiu, e quem volta acha o seu como deixou.

function armazem(inicial: Record<string, string> = {}, cabe = Infinity) {
  const dados: Record<string, string> = {...inicial};
  let gravadas = 0;
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => { if (gravadas++ >= cabe) throw new DOMException('cheio', 'QuotaExceededError'); dados[k] = v; },
    removeItem: (k: string) => { delete dados[k]; },
  };
}

const A = 'conta-a', B = 'conta-b';
const diaDeA = {[CHAVES.estado]: '{"paradas":["de A"]}', [CHAVES.fila]: '[{"tipo":"correcao"}]', [CHAVES.memoria]: '{"porta":"de A"}', [CHAVES.buscas]: '[{"id":"b1"}]'};

describe('o dia de cada conta no aparelho', () => {
  it('o que está guardado sem dono fica com a primeira conta que aparece, sem mexer em nada', () => {
    const a = armazem({...diaDeA, [CHAVES.sessao]: 'sessao'});
    expect(trocarDeConta(a, A)).toBe('primeira');
    expect(a.dados[CHAVES.dono]).toBe(A);
    for (const [k, v] of Object.entries(diaDeA)) expect(a.dados[k]).toBe(v);
  });

  it('a mesma conta de novo não mexe em nada', () => {
    const a = armazem({...diaDeA, [CHAVES.dono]: A});
    expect(trocarDeConta(a, A)).toBe('mesma');
    for (const [k, v] of Object.entries(diaDeA)) expect(a.dados[k]).toBe(v);
  });

  it('outra conta entra: o dia de quem estava vai para o lado, e quem entrou começa limpo', () => {
    const a = armazem({...diaDeA, [CHAVES.dono]: A, [CHAVES.sessao]: 'sessao'});
    expect(trocarDeConta(a, B)).toBe('trocada');
    expect(a.dados[CHAVES.dono]).toBe(B);
    for (const k of DO_MOTORISTA) expect(a.dados[k], k).toBeUndefined();
    for (const [k, v] of Object.entries(diaDeA)) expect(a.dados[guardadaDe(k, A)]).toBe(v);
    // a sessão é do aparelho, não do dia: não vai junto
    expect(a.dados[CHAVES.sessao]).toBe('sessao');
  });

  it('quem volta acha o seu dia como deixou, e o de quem estava vai para o lado', () => {
    const a = armazem({...diaDeA, [CHAVES.dono]: A});
    trocarDeConta(a, B);
    a.dados[CHAVES.estado] = '{"paradas":["de B"]}';
    expect(trocarDeConta(a, A)).toBe('trocada');
    for (const [k, v] of Object.entries(diaDeA)) expect(a.dados[k]).toBe(v);
    expect(a.dados[guardadaDe(CHAVES.estado, B)]).toBe('{"paradas":["de B"]}');
    expect(Object.keys(a.dados).filter(k => k.endsWith('@' + A))).toEqual([]);
  });

  it('todas as chaves do dia vão junto, a telemetria e a fila segurada também', () => {
    expect(DO_MOTORISTA).toEqual(expect.arrayContaining([CHAVES.estado, CHAVES.backup, CHAVES.memoria, CHAVES.fila,
      CHAVES.filaDesde, CHAVES.seguradas, CHAVES.rotasNuvem, CHAVES.uso, CHAVES.buscas]));
    expect(DO_MOTORISTA).not.toContain(CHAVES.sessao);
    expect(DO_MOTORISTA).not.toContain(CHAVES.dono);
  });

  it('a troca que para no meio (memória cheia) não perde nada, e termina na próxima vez', () => {
    const a = armazem({...diaDeA, [CHAVES.dono]: A}, 2);
    expect(() => trocarDeConta(a, B)).toThrow();
    // nada de A sumiu: o que já foi para o lado está lá, o resto continua no lugar
    for (const [k, v] of Object.entries(diaDeA)) expect(a.dados[k] ?? a.dados[guardadaDe(k, A)], k).toBe(v);
    // e o dono não mudou: ninguém entra pela metade
    expect(a.dados[CHAVES.dono]).toBe(A);
    // com espaço, A volta inteiro
    const b = armazem(a.dados);
    expect(trocarDeConta(b, A)).toBe('trocada');
    for (const [k, v] of Object.entries(diaDeA)) expect(b.dados[k]).toBe(v);
  });
});

import {describe, expect, it} from 'vitest';
import {haversine, LONGE_DA_PORTA, longeDaPorta, passaDaPorta} from './geo';

// Pedro, 26/10: o "Entreguei aqui" dado na base gravou a porta a 18 km. Mais de 3 km do pino que
// ele seguia, o GPS não é a porta; em 3 km, ainda vale.
describe('o GPS longe demais do pino não é a porta', () => {
  const pino = {lat: -11.06524, lng: -37.136334};
  // o ponto ao norte a exatamente `metros` do pino, pelo mesmo haversine do app (por bisseção)
  function aNorte(metros: number): {lat: number; lng: number} {
    let lo = 0, hi = 0.1;
    for (let i = 0; i < 200; i++) {
      const meio = (lo + hi) / 2;
      if (haversine(pino, {lat: pino.lat + meio, lng: pino.lng}) <= metros) lo = meio; else hi = meio;
    }
    return {lat: pino.lat + lo, lng: pino.lng};
  }

  it('até 3 km vale; passando de 3 km, não', () => {
    expect(LONGE_DA_PORTA).toBe(3000);
    // o limite, na régua: exatamente 3 km ainda é porta
    expect(passaDaPorta(3000)).toBe(false);
    expect(passaDaPorta(3000.001)).toBe(true);
    // a correção da mercearia, que estava certa
    expect(longeDaPorta(pino, aNorte(1400))).toBe(false);
    const tres = aNorte(3000);
    expect(Math.abs(haversine(pino, tres) - 3000)).toBeLessThan(1e-6);
    expect(longeDaPorta(pino, tres)).toBe(false);
    expect(longeDaPorta(pino, aNorte(3001))).toBe(true);
    // a de 26/10
    expect(longeDaPorta(pino, {lat: -10.918952, lng: -37.069245})).toBe(true);
  });

  // O teste de "Entreguei aqui, pelo pino": a planilha pôs a Rua D 12 km longe das outras, e o
  // motorista na porta conserta o pino com o GPS. Pino em dúvida não é a porta a proteger.
  it('pino que o app já põe em dúvida pode ser consertado pelo GPS de longe', () => {
    const longe = {lat: -10.918952, lng: -37.069245};
    for (const precisao of ['longe', 'aproximada', 'bairro', 'nao', 'ruim', 'numero'] as const) expect(longeDaPorta({...pino, precisao}, longe)).toBe(false);
    for (const precisao of ['planilha', 'manual', 'lembrado', 'confirmado', 'vizinha'] as const) expect(longeDaPorta({...pino, precisao}, longe)).toBe(true);
  });

  it('sem pino, não tem com o que comparar: fica a regra de sempre', () => {
    expect(longeDaPorta({lat: null, lng: null}, {lat: -10.9, lng: -37.0})).toBe(false);
  });
});

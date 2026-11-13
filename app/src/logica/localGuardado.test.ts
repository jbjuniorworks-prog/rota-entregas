import {describe, expect, it} from 'vitest';
import {localDeHoje} from './localGuardado';

// 12/11 (dono): a localização compartilhada antes da rota fica guardada só no dia em que chegou.
describe('a localização guardada antes da rota', () => {
  const meioDia = Date.parse('2026-11-12T15:00:00Z'); // 12h em Aracaju
  const g = {lat: -10.9632, lng: -37.047, endereco: 'Av. Inventada, 149', quando: meioDia};

  it('vale no mesmo dia de Aracaju', () => {
    expect(localDeHoje(g, Date.parse('2026-11-13T02:30:00Z'))).toEqual(g); // 23h30 do dia 12 em Aracaju
  });

  it('a de ontem não vale, mesmo com menos de 24 horas', () => {
    expect(localDeHoje(g, Date.parse('2026-11-13T03:30:00Z'))).toBeNull(); // 0h30 do dia 13 em Aracaju
  });

  it('guardado torto ou vazio não vale', () => {
    for (const x of [null, undefined, {}, {lat: '1', lng: 2, quando: meioDia}, {lat: 1, lng: 2}]) expect(localDeHoje(x, meioDia)).toBeNull();
  });
});

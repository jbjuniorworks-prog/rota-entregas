import {describe, expect, it} from 'vitest';
import {textoDoFim} from './previsao';

const as = (h: number, m: number) => new Date(2026, 10, 24, h, m).getTime();

describe('o fim da rota no topo', () => {
  it('antes da metade, a hora vai arredondada para cima quando passa do meio do quarto de hora', () => {
    expect(textoDoFim(as(13, 55), 1, 80)).toBe('fim por volta das 14h');
  });

  it('antes da metade, a hora vai arredondada para baixo quando está mais perto do quarto de antes', () => {
    expect(textoDoFim(as(13, 52), 1, 80)).toBe('fim por volta das 13h45');
  });

  it('na metade das entregas, volta o minuto exato', () => {
    expect(textoDoFim(as(13, 55), 40, 80)).toBe('fim às 13:55');
  });

  it('uma entrega antes da metade, ainda arredondada', () => {
    expect(textoDoFim(as(13, 55), 39, 80)).toBe('fim por volta das 14h');
  });

  it('à 1h, "da" e não "das"', () => {
    expect(textoDoFim(as(1, 2), 0, 10)).toBe('fim por volta da 1h');
  });
});

import {describe, expect, test} from 'vitest';
import {anguloLegivel, proximoGiro} from './giro';

describe('o giro do mapa', () => {
  test('começa no rumo; sem rumo, fica como está', () => {
    expect(proximoGiro(null, 90)).toBe(90);
    expect(proximoGiro(null, -30)).toBe(330);
    expect(proximoGiro(120, null)).toBe(120);
  });

  test('o rumo tremendo menos de 10° não mexe no mapa', () => {
    expect(proximoGiro(90, 97)).toBe(90);
    expect(proximoGiro(90, 83)).toBe(90);
    expect(proximoGiro(90, 101)).toBe(101);
  });

  test('passando pelo norte anda o caminho curto, sem dar a volta', () => {
    expect(proximoGiro(350, 10)).toBe(370);
    expect(proximoGiro(10, 350)).toBe(-10);
  });
});

describe('o nome da rua no mapa girado', () => {
  test('sem giro, como estava', () => {
    expect(anguloLegivel(30, 0)).toBe(30);
  });

  test('de cabeça para baixo na tela, vira', () => {
    // a rua a 30°, o mapa girado 180°: na tela ficaria a -150°
    expect(anguloLegivel(30, 180)).toBe(210);
    expect(anguloLegivel(0, 100)).toBe(180);
  });

  test('legível na tela, não mexe', () => {
    expect(anguloLegivel(0, 45)).toBe(0);
    expect(anguloLegivel(-60, -100)).toBe(-60);
  });
});

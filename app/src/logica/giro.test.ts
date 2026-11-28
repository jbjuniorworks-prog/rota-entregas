import {describe, expect, test} from 'vitest';
import {anguloLegivel, inicioDoGiro, proximoGiro, suavizarGiro} from './giro';

describe('o giro do mapa', () => {
  test('começa no rumo; sem rumo, fica como está', () => {
    expect(proximoGiro(null, 90)).toBe(90);
    expect(proximoGiro(null, -30)).toBe(330);
    expect(proximoGiro(120, null)).toBe(120);
  });

  test('o rumo tremendo menos de 4° não mexe no mapa; a partir daí, muda', () => {
    expect(proximoGiro(90, 93)).toBe(90);
    expect(proximoGiro(90, 87)).toBe(90);
    // eram 10°: cada mudança, um tranco de 10° (dono, 28/11)
    expect(proximoGiro(90, 96)).toBe(96);
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

describe('o giro andando suave', () => {
  test('a cada quadro anda uma parte do que falta, sem pular', () => {
    const um = suavizarGiro(0, 90, 16);
    expect(um).toBeGreaterThan(0);
    expect(um).toBeLessThan(10);
  });

  test('em pouco mais de 1 s chega no destino', () => {
    let a = 0;
    for (let t = 0; t < 1400; t += 16) a = suavizarGiro(a, 90, 16);
    expect(a).toBe(90);
  });

  test('o destino mudando no meio, continua de onde está, sem voltar', () => {
    let a = 0;
    for (let t = 0; t < 200; t += 16) a = suavizarGiro(a, 90, 16);
    const meio = a;
    expect(suavizarGiro(meio, 120, 16)).toBeGreaterThan(meio);
  });

  test('começa do norte, pelo lado mais curto', () => {
    expect(inicioDoGiro(90)).toBe(0);
    expect(inicioDoGiro(270)).toBe(360);
    expect(inicioDoGiro(-10)).toBe(0);
  });
});

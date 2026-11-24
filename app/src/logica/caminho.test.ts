import {describe, expect, it} from 'vitest';
import {devoAnotar, gastoDaBateria, resumirCaminho, type LeituraDaBateria, type MarcaDoCaminho, type PontoDoCaminho} from './caminho';

const T0 = new Date(2026, 10, 24, 8, 0).getTime();
const s = (n: number) => T0 + n * 1000, min = (n: number) => T0 + n * 60000;
// 0,0002 grau de latitude são uns 22 m; 0,00005, uns 5 m
const p = (t: number, norte = 0): PontoDoCaminho => ({t, lat: -10.9 + norte, lng: -37.05, prec: 8});
const marca = (t: number, tipo: MarcaDoCaminho['tipo']): MarcaDoCaminho => ({t, tipo});

describe('quando o caminho anota um ponto', () => {
  it('o primeiro ponto entra', () => {
    expect(devoAnotar(undefined, p(s(0)))).toBe(true);
  });

  it('com menos de 10 s, não entra, mesmo andando', () => {
    expect(devoAnotar(p(s(0)), p(s(9), 0.0002))).toBe(false);
  });

  it('com 10 s e andando 15 m ou mais, entra', () => {
    expect(devoAnotar(p(s(0)), p(s(10), 0.0002))).toBe(true);
  });

  it('com 10 s e quase parado, não entra', () => {
    expect(devoAnotar(p(s(0)), p(s(30), 0.00005))).toBe(false);
  });

  it('parado, entra um por minuto: é o que separa parado de buraco', () => {
    expect(devoAnotar(p(s(0)), p(s(60)))).toBe(true);
  });
});

// Um ponto por minuto de 8h a 8h10, um buraco de 8h10 às 8h30, e de novo de 8h30 a 8h40.
const comBuraco = () => [...Array.from({length: 11}, (_, i) => p(min(i))), ...Array.from({length: 11}, (_, i) => p(min(30 + i)))];

describe('o resumo do caminho', () => {
  it('sem pontos, nada', () => {
    expect(resumirCaminho([], [])).toBeNull();
  });

  it('o buraco com o app escondido no meio é do app escondido', () => {
    const r = resumirCaminho(comBuraco(), [marca(min(11), 'escondido'), marca(min(29), 'visivel')])!;
    expect(r.escondido).toEqual({vezes: 1, ms: 20 * 60000, maior: 20 * 60000});
  });

  it('o buraco fora da Rota é de fora da Rota', () => {
    const r = resumirCaminho(comBuraco(), [marca(min(11), 'fora'), marca(min(29), 'rota')])!;
    expect(r.fora.vezes).toBe(1);
  });

  it('o buraco sem marca nenhuma é na Rota, sem leitura do GPS', () => {
    const r = resumirCaminho(comBuraco(), [])!;
    expect(r.naRota.vezes).toBe(1);
  });

  it('escondido e fora da Rota no mesmo buraco: conta como escondido', () => {
    const r = resumirCaminho(comBuraco(), [marca(min(12), 'fora'), marca(min(13), 'escondido'), marca(min(28), 'visivel'), marca(min(29), 'rota')])!;
    expect([r.escondido.vezes, r.fora.vezes]).toEqual([1, 0]);
  });

  it('o app já escondido antes do buraco começar também conta como escondido', () => {
    const ps = [p(min(0)), p(min(1)), p(min(20))];
    const r = resumirCaminho(ps, [marca(min(1) - 1000, 'escondido')])!;
    expect(r.escondido.vezes).toBe(1);
  });

  it('dois minutos sem ponto ainda não é buraco', () => {
    const r = resumirCaminho([p(min(0)), p(min(2)), p(min(4))], [])!;
    expect(r.naRota.vezes + r.escondido.vezes + r.fora.vezes).toBe(0);
  });

  it('a cobertura é o tempo sem buraco', () => {
    // 40 minutos, 20 de buraco
    expect(resumirCaminho(comBuraco(), [])!.cobertura).toBe(0.5);
  });

  it('o ponto gravado com o app escondido é contado: é a prova de que o navegador manda o GPS', () => {
    const ps = [p(min(0)), p(min(1)), p(min(2)), p(min(3))];
    const r = resumirCaminho(ps, [marca(min(1) + 1000, 'escondido'), marca(min(3) - 1000, 'visivel')])!;
    expect([r.pontosEscondido, r.tempoEscondido]).toEqual([1, 2 * 60000 - 2000]);
  });
});

const leitura = (m: number, nivel: number, gravando = true, carregando = false): LeituraDaBateria => ({t: min(m), nivel, carregando, gravando});
// uma hora gravando, uma leitura a cada 5 minutos, caindo 1% a cada uma: 12% em uma hora
const umaHora = (gravando = true, desde = 0, nivel = 90) => Array.from({length: 13}, (_, i) => leitura(desde + i * 5, nivel - i, gravando));

describe('a bateria do teste', () => {
  it('gravando, o gasto é o que caiu por hora de app aberto', () => {
    expect(gastoDaBateria(umaHora(), []).gravando).toEqual({porHora: 12, minutos: 60});
  });

  it('sem gravar fica separado de gravando', () => {
    const g = gastoDaBateria([...umaHora(true), ...umaHora(false, 200, 70)], []);
    expect(g.semGravar).toEqual({porHora: 12, minutos: 60});
  });

  it('na tomada não conta', () => {
    const ls = umaHora().map((l, i) => i >= 7 ? {...l, carregando: true} : l);
    expect(gastoDaBateria(ls, []).gravando.minutos).toBe(30);
  });

  it('duas leituras longe uma da outra tiveram o app fechado no meio: não contam', () => {
    expect(gastoDaBateria([leitura(0, 90), leitura(20, 85)], []).gravando.minutos).toBe(0);
  });

  it('com o app escondido entre duas leituras, o par não conta', () => {
    const g = gastoDaBateria(umaHora(), [marca(min(7), 'escondido'), marca(min(8), 'visivel')]);
    expect(g.gravando.minutos).toBe(55);
  });

  it('a bateria subindo não conta como gasto negativo', () => {
    expect(gastoDaBateria([leitura(0, 50), leitura(5, 52)], []).gravando.minutos).toBe(0);
  });

  it('com menos de meia hora, ainda não dá número', () => {
    expect(gastoDaBateria(umaHora().slice(0, 6), []).gravando).toEqual({porHora: null, minutos: 25});
  });
});

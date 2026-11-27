import {describe, expect, test} from 'vitest';
import {manobraDaVez, manobrasDoServico, metrosLegiveis, textoDaManobra, type Manobra} from './manobras';

// Uma resposta do serviço de ruas como a de verdade: sai, segue, vira à esquerda na Av. Principal,
// a rua troca de nome, vira à direita, chega.
const passo = (lng: number, lat: number, type: string, modifier?: string, name = '') => ({maneuver: {location: [lng, lat] as [number, number], type, modifier}, name});
const resposta = {legs: [{steps: [
  passo(-37.06, -10.95, 'depart', undefined, 'Estrada Sonho Meu'),
  passo(-37.058, -10.95, 'continue', 'straight', 'Estrada Sonho Meu'),
  passo(-37.055, -10.95, 'turn', 'left', 'Av. Principal'),
  passo(-37.055, -10.948, 'new name', 'straight', 'Rua Nova'),
  passo(-37.055, -10.9465, 'turn', 'right', ''),
  passo(-37.054, -10.9465, 'arrive', undefined, ''),
]}]};

describe('as manobras do serviço de ruas', () => {
  test('só o que é virar, e a chegada', () => {
    expect(manobrasDoServico(resposta).map(m => [m.tipo, m.lado, m.rua])).toEqual([
      ['turn', 'left', 'Av. Principal'], ['turn', 'right', ''], ['arrive', null, '']]);
  });

  test('resposta sem os passos (o pedido sem manobras): nenhuma', () => {
    expect(manobrasDoServico({})).toEqual([]);
  });

  test('o texto de cada uma', () => {
    const m = (tipo: string, lado: string | null, saida?: number): Manobra => ({lat: 0, lng: 0, tipo, lado, rua: '', saida});
    expect(textoDaManobra(m('turn', 'left'))).toEqual({seta: '↰', frase: 'Vire à esquerda'});
    expect(textoDaManobra(m('turn', 'slight right'))).toEqual({seta: '↗', frase: 'Vire levemente à direita'});
    expect(textoDaManobra(m('end of road', 'right')).frase).toBe('No fim da rua, à direita');
    expect(textoDaManobra(m('roundabout', 'right', 2)).frase).toBe('Na rotatória, 2ª saída');
    expect(textoDaManobra(m('continue', 'uturn')).frase).toBe('Faça o retorno');
    expect(textoDaManobra(m('arrive', null)).frase).toBe('Chegando');
  });

  test('a distância como se lê', () => {
    expect([metrosLegiveis(4), metrosLegiveis(34), metrosLegiveis(996), metrosLegiveis(1240)]).toEqual(['10 m', '30 m', '1,0 km', '1,2 km']);
  });
});

describe('a curva da vez', () => {
  const lista = manobrasDoServico(resposta);
  const eu = (lng: number, lat = -10.95) => ({lat, lng});

  test('antes da primeira curva: ela, com a distância até ela', () => {
    const v = manobraDaVez(lista, 0, eu(-37.058))!;
    expect(v.agora.rua).toBe('Av. Principal');
    expect(Math.round(v.metros / 10) * 10).toBe(330);
  });

  test('a 20 m da curva ela conta como feita, e a da vez passa a ser a seguinte', () => {
    expect(manobraDaVez(lista, 0, eu(-37.0552))!.agora.lado).toBe('right');
  });

  test('virou sem o GPS chegar a 25 m da esquina: já andando para a seguinte, passa', () => {
    // 40 m depois da esquina, na Av. Principal
    expect(manobraDaVez(lista, 0, {lat: -10.94964, lng: -37.05502})!.agora.lado).toBe('right');
  });

  test('a seguinte, se vem logo depois, entra junto ("Depois, ↱")', () => {
    // a da direita fica a uns 110 m da chegada
    expect(manobraDaVez(lista, 1, eu(-37.055, -10.9475))!.depois?.tipo).toBe('arrive');
    // a da esquerda fica a uns 390 m da da direita: longe demais para "depois"
    expect(manobraDaVez(lista, 0, eu(-37.058))!.depois).toBeNull();
  });

  test('a curva feita não volta, mesmo com ele perto dela de novo', () => {
    expect(manobraDaVez(lista, 1, eu(-37.0551))!.passadas).toBe(1);
  });

  test('a chegada fica na faixa até a parada mudar', () => {
    expect(manobraDaVez(lista, 2, eu(-37.054, -10.9465))!.agora.tipo).toBe('arrive');
  });
});

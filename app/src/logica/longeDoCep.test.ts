import {readFileSync} from 'node:fs';
import {lerTabela} from '../servicos/ibge';
import {distanciaAoCep, longeDoProprioCep, marcarLongeDoCep, type PortasDoCenso} from './longeDoCep';
import type {Parada} from './tipos';

// Um censo de mentira: o CEP 49099-101 tem portas perto de (-10.90, -37.05), e a faixa 49099 também.
const CENSO: PortasDoCenso = {
  ceps: [49099100, 49099101, 49099101, 49099200],
  lats: [-10900500, -10900000, -10900200, -10901000],
  lngs: [-37050500, -37050000, -37050100, -37051000],
};
const PERTO = {lat: -10.9005, lng: -37.0502};
const LONGE = {lat: -11.03, lng: -37.05};   // uns 14 km ao sul

function parada(texto: string, ponto: {lat: number; lng: number}, extra: Partial<Parada> = {}): Parada {
  return {id: texto, area: 'a', ml: null, texto, bairro: 'Bairro Teste', unidades: null, comercial: false, ...ponto,
    exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra};
}

describe('o pino da planilha longe do próprio CEP', () => {
  it('a 14 km das portas do CEP dele, é marcado com a distância', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', LONGE);
    expect(marcarLongeDoCep([p], CENSO)).toEqual([p]);
    expect(p.longeDoCep! / 1000).toBeCloseTo(14.4, 0);
  });

  it('perto das portas do CEP, não é marcado', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', PERTO);
    expect(marcarLongeDoCep([p], CENSO)).toEqual([]);
  });

  // o condomínio da Soledade é mais novo que o censo: o CEP dele não está lá, a faixa está
  it('com o CEP fora do censo, mede pela faixa dos 5 primeiros dígitos', () => {
    const p = parada('Rua Teste, 250, CEP 49099-141', LONGE);
    expect(marcarLongeDoCep([p], CENSO)).toEqual([p]);
  });

  it('com a faixa fora do censo, não diz nada', () => {
    const p = parada('Rua Teste, 250, CEP 49077-141', LONGE);
    expect(marcarLongeDoCep([p], CENSO)).toEqual([]);
  });

  // o 000 cobre um pedaço grande da cidade: estar longe das portas dele não diz nada
  it('com o CEP genérico, não diz nada', () => {
    expect(distanciaAoCep(LONGE, '49099000', {...CENSO, ceps: [49099000, 49099000, 49099000, 49099000]})).toBeNull();
  });

  it('a posição verificada não é marcada', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', LONGE, {precisao: 'confirmado'});
    expect(marcarLongeDoCep([p], CENSO)).toEqual([]);
  });

  it('a entregue não é marcada', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', LONGE, {entregue: true});
    expect(marcarLongeDoCep([p], CENSO)).toEqual([]);
  });

  it('o pino que chegou perto depois perde a marca', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', LONGE);
    marcarLongeDoCep([p], CENSO);
    Object.assign(p, PERTO);
    marcarLongeDoCep([p], CENSO);
    expect(p.longeDoCep).toBeUndefined();
  });

  it('arrumado pelo motorista, sai do aviso', () => {
    const p = parada('Rua Teste, 250, CEP 49099-101', LONGE);
    marcarLongeDoCep([p], CENSO);
    p.precisao = 'manual';
    expect(longeDoProprioCep([p])).toEqual([]);
  });

  // o caso de 23/11, com o censo de verdade: o pino da planilha e onde o dono entregou
  it('o condomínio da Soledade: o pino da planilha é marcado, a porta onde ele entregou não', () => {
    const t = lerTabela(new Uint8Array(readFileSync('app/public/aracaju-v1.bin')));
    expect(distanciaAoCep({lat: -11.067095, lng: -37.105393}, '49089141', t)! / 1000).toBeGreaterThan(10);
    expect(distanciaAoCep({lat: -10.87464, lng: -37.088531}, '49089141', t)!).toBeLessThan(500);
  });
});

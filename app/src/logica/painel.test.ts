import {describe, expect, it} from 'vitest';
import {hojeEmMaceio, PARADA_MIN, resumirDia, situacaoDaRota} from './painel';

const AGORA = Date.parse('2026-10-19T19:00:00Z'); // 16:00 em Maceió
const antes = (min: number) => new Date(AGORA - min * 60000).toISOString();

describe('situação da rota no painel', () => {
  it('terminou, não começou, na rua e parada', () => {
    expect(situacaoDaRota(10, 10, antes(300), AGORA)).toEqual({situacao: 'terminou', parada: 0});
    expect(situacaoDaRota(10, 0, null, AGORA)).toEqual({situacao: 'não começou', parada: 0});
    expect(situacaoDaRota(10, 4, antes(PARADA_MIN - 1), AGORA)).toEqual({situacao: 'na rua', parada: 0});
    // o César de 19/10: 14 de 121, nada desde 12:58
    expect(situacaoDaRota(121, 14, antes(182), AGORA)).toEqual({situacao: 'parada', parada: 182});
  });

  it('rota vazia não terminou', () => {
    expect(situacaoDaRota(0, 0, null, AGORA).situacao).toBe('não começou');
  });

  it('o dia é o de Maceió, não o de Greenwich', () => {
    expect(hojeEmMaceio(Date.parse('2026-10-20T01:30:00Z'))).toBe('2026-10-19');
  });
});

describe('resumo do dia', () => {
  const rotas = [
    {id: 'a', motorista: 'Teste Um', arquivo: 'a.xlsx'},
    {id: 'b', motorista: 'Teste Dois', arquivo: 'b.xlsx'},
  ];
  const pacotes = [
    // dois pacotes do mesmo endereço são um endereço só
    {rota_id: 'a', chave_lugar: '49000100|10', endereco: 'Rua Teste, 10', entregue_em: antes(30)},
    {rota_id: 'a', chave_lugar: '49000100|10', endereco: 'Rua Teste, 10', entregue_em: antes(20)},
    {rota_id: 'a', chave_lugar: '49000100|20', endereco: 'Rua Teste, 20', entregue_em: null},
    // sem chave: conta como endereço, nunca como verificado
    {rota_id: 'a', chave_lugar: null, endereco: 'Travessa Teste, Sem N', entregue_em: null},
    {rota_id: 'b', chave_lugar: '49000100|30', endereco: 'Rua Teste, 30', entregue_em: antes(90)},
    {rota_id: 'b', chave_lugar: '49000100|40', endereco: 'Rua Teste, 40', entregue_em: null},
  ];
  const confirmadas = new Set(['49000100|10', '49000100|30', '49000100|99']);

  it('conta pacotes, entregues, endereços e verificados por rota e no dia', () => {
    const d = resumirDia(rotas, pacotes, confirmadas, AGORA);
    const a = d.linhas.find(l => l.id === 'a')!, b = d.linhas.find(l => l.id === 'b')!;
    expect([a.pacotes, a.entregues, a.enderecos, a.verificados, a.ultima, a.situacao]).toEqual([4, 2, 3, 1, antes(20), 'na rua']);
    expect([b.pacotes, b.entregues, b.enderecos, b.verificados, b.situacao, b.parada]).toEqual([2, 1, 2, 1, 'parada', 90]);
    expect([d.pacotes, d.entregues, d.enderecos, d.verificados, d.naRua]).toEqual([6, 3, 5, 2, 1]);
  });

  it('a parada vem primeiro, e a que terminou por último', () => {
    const terminou = {id: 'c', motorista: 'Teste Três', arquivo: null};
    const d = resumirDia([terminou, ...rotas], [...pacotes, {rota_id: 'c', chave_lugar: null, endereco: 'Rua X, 1', entregue_em: antes(5)}], confirmadas, AGORA);
    expect(d.linhas.map(l => l.situacao)).toEqual(['parada', 'na rua', 'terminou']);
  });
});

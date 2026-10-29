import {describe, expect, it} from 'vitest';
import {porQueNaoVerificou, SUBINDO_MIN, type MarcaDoDia, type PacoteDaRota} from './verificacao';

// Os casos medidos nas rotas de 15 a 29/10, com endereços inventados.
const AGORA = Date.parse('2026-10-29T22:00:00Z');
const antes = (min: number) => new Date(AGORA - min * 60000).toISOString();
const PINO = {lat: -10.96, lng: -37.06};
const pacote = (chave: string | null, entregue: number | null, endereco = 'Rua Teste, ' + chave): PacoteDaRota =>
  ({chave_lugar: chave, endereco, ...PINO, entregue_em: entregue == null ? null : antes(entregue)});
const marca = (chave: string, extra: Partial<MarcaDoDia> = {}, ao = PINO): MarcaDoDia => ({chave_lugar: chave, ...ao, criado_em: antes(60), ...extra});
// 0,0001 grau de latitude são uns 11 m
const aNorte = (metros: number) => ({lat: PINO.lat + metros / 111320, lng: PINO.lng});
const motivos = (r: ReturnType<typeof porQueNaoVerificou>) => r.semVerificar.map(s => [s.endereco, s.motivo]);

describe('por que a porta de um endereço entregue não ficou verificada', () => {
  it('conta só os entregues; o verificado e o por entregar não entram na lista', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120), pacote('1|10', 120), pacote('1|20', null)], new Set(['1|10']), [], [], AGORA);
    expect(r).toEqual({entregues: 1, verificados: 1, semVerificar: [], porEntregar: 1});
  });

  it('motorista em conferência: espera a aprovação, mesmo com a entrega no pino', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {pendente: true, no_pino: true})], [], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'aprovar']]);
  });

  it('as do fim da rota: sem a marca da entrega ainda, se faz menos de 15 minutos, está subindo', () => {
    const recente = porQueNaoVerificou([pacote('1|10', SUBINDO_MIN - 1)], new Set(), [], [marca('1|10')], AGORA);
    expect(motivos(recente)).toEqual([['Rua Teste, 1|10', 'subindo']]);
    // passado o prazo, só com a correção
    const velha = porQueNaoVerificou([pacote('1|10', SUBINDO_MIN + 1)], new Set(), [], [marca('1|10')], AGORA);
    expect(motivos(velha)).toEqual([['Rua Teste, 1|10', 'so-correcao']]);
    const nada = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [], [], AGORA);
    expect(motivos(nada)).toEqual([['Rua Teste, 1|10', 'sem-marca']]);
  });

  it('o "Entreguei" longe do pino diz a quantos metros', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {}, aNorte(43))], [], AGORA);
    expect(r.semVerificar).toEqual([{endereco: 'Rua Teste, 1|10', pacotes: 1, motivo: 'longe', metros: 43}]);
  });

  it('correção e entrega em lugares diferentes: marcas que não batem', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {}, aNorte(80))], [marca('1|10')], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'nao-batem']]);
  });

  it('separada: as marcas com o complemento na chave não são a porta do número', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10|bloco d')], [marca('1|10|bloco d')], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'separada']]);
  });

  it('recusada no Admin, e endereço sem chave', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120), pacote(null, 120, 'Travessa Teste, Sem N')], new Set(), [marca('1|10', {recusada: true})], [], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'recusada'], ['Travessa Teste, Sem N', 'sem-chave']]);
  });

  it('na ordem do que ele resolve primeiro, com os pacotes de cada endereço', () => {
    const r = porQueNaoVerificou([
      pacote('1|30', 120), pacote('1|30', 110), pacote('1|40', 5), pacote('1|50', 120),
    ], new Set(), [marca('1|30', {}, aNorte(488)), marca('1|50', {pendente: true})], [], AGORA);
    expect(r.semVerificar.map(s => [s.motivo, s.pacotes])).toEqual([['aprovar', 1], ['subindo', 1], ['longe', 2]]);
    expect(r.entregues).toBe(3);
  });
});

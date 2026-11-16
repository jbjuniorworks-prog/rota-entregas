import {describe, expect, it} from 'vitest';
import {marcarPortasVerificadas, minhasPortas, porQueNaoVerificou, SUBINDO_MIN, verificadasDoDia, verificadasPorMotorista, type MarcaDoDia, type PacoteDaRota} from './verificacao';
import type {Parada} from './tipos';

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

  it('motorista em conferência: espera a aprovação quando aprovar verifica', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {pendente: true, no_pino: true})], [], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'aprovar']]);
    // o Entreguei aqui: correção e entrega no mesmo ponto
    const aqui = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {pendente: true}, aNorte(200))], [marca('1|10', {pendente: true}, aNorte(205))], AGORA);
    expect(motivos(aqui)).toEqual([['Rua Teste, 1|10', 'aprovar']]);
  });

  // O César de 29/10: três entregas pendentes a 86 m, 176 m e 1 km do pino, e o "Em conferência"
  // vazio, porque aprovar não mudava nada.
  it('em conferência mas longe do pino: aprovar não verifica, e o motivo é a distância', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {pendente: true}, aNorte(176))], [], AGORA);
    expect(r.semVerificar).toEqual([{endereco: 'Rua Teste, 1|10', pacotes: 1, motivo: 'longe', metros: 176}]);
  });

  it('marcas que bastariam e a nuvem não conta: motorista desativado', () => {
    const r = porQueNaoVerificou([pacote('1|10', 120)], new Set(), [marca('1|10', {no_pino: true})], [], AGORA);
    expect(motivos(r)).toEqual([['Rua Teste, 1|10', 'nao-conta']]);
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
    ], new Set(), [marca('1|30', {}, aNorte(488)), marca('1|50', {pendente: true, no_pino: true})], [], AGORA);
    expect(r.semVerificar.map(s => [s.motivo, s.pacotes])).toEqual([['aprovar', 1], ['subindo', 1], ['longe', 2]]);
    expect(r.entregues).toBe(3);
  });
});

describe('verificadas por motorista no período', () => {
  const daRota = (rota_id: string, chave: string | null, entregue: number | null, endereco?: string) => ({...pacote(chave, entregue, endereco), rota_id});
  const rotas = [
    {id: 'a1', motorista: 'Teste A', motorista_id: 'ma'}, {id: 'a2', motorista: 'Teste A', motorista_id: 'ma'},
    {id: 'b1', motorista: 'Teste B', motorista_id: 'mb'}, {id: 'c1', motorista: 'Teste C', motorista_id: 'mc'},
  ];
  it('soma as rotas de cada motorista com a conta de cada rota, o de menos verificadas primeiro', () => {
    const r = verificadasPorMotorista(rotas, [
      // A: três pacotes no mesmo número são um endereço; o sem chave conta e não verifica
      daRota('a1', '1|10', 30), daRota('a1', '1|10', 30), daRota('a1', '1|10', 30), daRota('a1', null, 30, 'Travessa Teste, Sem N'),
      daRota('a2', '1|20', 30), daRota('a2', '1|30', null),
      // B: um de dois
      daRota('b1', '1|10', 30), daRota('b1', '1|40', 30),
      // C: nada entregue, fica de fora
      daRota('c1', '1|50', null),
    ], new Set(['1|10', '1|20']));
    expect(r).toEqual([
      {motorista_id: 'mb', motorista: 'Teste B', rotas: 1, entregues: 2, verificados: 1},
      {motorista_id: 'ma', motorista: 'Teste A', rotas: 2, entregues: 3, verificados: 2},
    ]);
  });
});

// Luan, pelo dono, 15/11: a lista de verificados do Admin para o motorista, só das rotas dele.
describe('as portas verificadas do próprio motorista', () => {
  const da = (rota_id: string, p: PacoteDaRota) => ({...p, rota_id});
  const ontem = {id: 'r1', dia: '2026-10-28', arquivo: 'a.xlsx'};
  const hoje = {id: 'r2', dia: '2026-10-29', arquivo: 'b.xlsx'};
  const vazia = {id: 'r3', dia: '2026-10-29', arquivo: 'c.xlsx'};
  const pacotes = [
    da('r1', pacote('1|10', 1500)), da('r1', pacote('1|20', 1500)),
    da('r2', pacote('1|30', 120)), da('r2', pacote('1|40', 120)), da('r2', pacote('1|50', null)),
    da('r3', pacote('1|60', null)),
  ];
  const confirmadas = new Set(['1|10', '1|30']);

  it('soma as rotas com entrega, a mais nova primeiro, e bate com a conta do Admin', () => {
    const r = minhasPortas([ontem, hoje, vazia], pacotes, confirmadas, [], [], AGORA);
    expect(r.porRota.map(x => x.rota.id)).toEqual(['r2', 'r1']);
    expect([r.rotas, r.entregues, r.verificados]).toEqual([2, 4, 2]);
    const admin = verificadasPorMotorista([ontem, hoje, vazia].map(x => ({...x, motorista: 'Luan'})), pacotes, confirmadas);
    expect([admin[0].rotas, admin[0].entregues, admin[0].verificados]).toEqual([r.rotas, r.entregues, r.verificados]);
  });

  it('o porquê de cada rota usa só as marcas do dia dela', () => {
    // a passagem do 1|40 é de ontem: na rota de hoje, a entrega não deixou marca
    const deOntem = {...marca('1|40', {}, aNorte(80)), dia: ontem.dia};
    const r = minhasPortas([ontem, hoje], pacotes, confirmadas, [deOntem], [], AGORA);
    expect(motivos(r.porRota[0].portas)).toEqual([['Rua Teste, 1|40', 'sem-marca']]);
    const doDia = {...deOntem, dia: hoje.dia};
    const certo = minhasPortas([ontem, hoje], pacotes, confirmadas, [doDia], [], AGORA);
    expect(motivos(certo.porRota[0].portas)).toEqual([['Rua Teste, 1|40', 'longe']]);
  });

  it('a correção vale no dia de Aracaju: 22h do dia 28 é o dia 28, mesmo já sendo 29 no relógio do servidor', () => {
    const dasDez = marca('1|20', {criado_em: '2026-10-29T01:00:00Z'});
    const r = minhasPortas([ontem, hoje], pacotes, confirmadas, [], [dasDez], AGORA);
    expect(motivos(r.porRota[1].portas)).toEqual([['Rua Teste, 1|20', 'so-correcao']]);
  });
});

// Dono, 15/11: "o que eles forem verificando, só mostra 13/45", na tela dos pinos.
describe('as verificadas do dia, no topo da tela dos pinos', () => {
  const parada = (id: string, extra: Partial<Parada> = {}): Parada =>
    ({id, area: 'a', ml: null, texto: 'Rua ' + id, unidades: null, comercial: false, lat: -10.96, lng: -37.06, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
  const chaveDe = (p: Parada) => 'k|' + p.id;

  it('conta o pino verificado e a entregue cuja porta a nuvem verificou depois', () => {
    const ps = [parada('a', {precisao: 'confirmado'}), parada('b', {entregue: true, portaVerificada: true}), parada('c', {entregue: true}), parada('d')];
    expect(verificadasDoDia(ps)).toEqual({verificadas: 2, total: 4});
  });

  it('a nuvem verificando a porta de uma entregue marca ela, sem mexer no pino', () => {
    const ps = [parada('feita', {entregue: true}), parada('falta')];
    expect(marcarPortasVerificadas(ps, new Set(['k|feita', 'k|falta']), chaveDe)).toBe(1);
    expect(ps[0]).toMatchObject({portaVerificada: true, lat: -10.96, lng: -37.06, precisao: 'planilha'});
    // a que falta é da conferência de pinos (verPinosNovos), que pode mover o pino: aqui, não
    expect(ps[1].portaVerificada).toBeUndefined();
  });

  it('a entregue sem a porta na resposta da nuvem continua sem verificar', () => {
    const ps = [parada('feita', {entregue: true})];
    expect(marcarPortasVerificadas(ps, new Set(['k|outra']), chaveDe)).toBe(0);
    expect(verificadasDoDia(ps).verificadas).toBe(0);
  });
});

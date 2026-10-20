import {describe, expect, it} from 'vitest';
import {hojeEmMaceio, PARADA_MIN, resumirDia, situacaoDaRota, suspeitaDaRota} from './painel';

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
    const d = resumirDia(rotas, pacotes, confirmadas, {agora: AGORA});
    const a = d.linhas.find(l => l.id === 'a')!, b = d.linhas.find(l => l.id === 'b')!;
    expect([a.pacotes, a.entregues, a.enderecos, a.verificados, a.ultima, a.situacao]).toEqual([4, 2, 3, 1, antes(20), 'na rua']);
    expect([b.pacotes, b.entregues, b.enderecos, b.verificados, b.situacao, b.parada]).toEqual([2, 1, 2, 1, 'parada', 90]);
    expect([d.pacotes, d.entregues, d.enderecos, d.verificados, d.naRua]).toEqual([6, 3, 5, 2, 1]);
  });

  it('a parada vem primeiro, e a que terminou por último', () => {
    const terminou = {id: 'c', motorista: 'Teste Três', arquivo: null};
    const d = resumirDia([terminou, ...rotas], [...pacotes, {rota_id: 'c', chave_lugar: null, endereco: 'Rua X, 1', entregue_em: antes(5)}], confirmadas, {agora: AGORA});
    expect(d.linhas.map(l => l.situacao)).toEqual(['parada', 'na rua', 'terminou']);
  });
});

// 19/10: 61 de 133 rotas de 30 dias não tiveram entrega, quase todas planilhas abertas na conta do
// dono para ver ou testar. Nomes de arquivo como os da Shopee, motoristas inventados.
describe('rota para conferir', () => {
  const MOTORISTAS = ['Teste', 'Fulano Silva', 'Beltrano'];
  it('planilha de outro dia, mesmo na conta de quem administra', () => {
    expect(suspeitaDaRota('19-09-2026 Fulano Silva De Souza.xlsx', '2026-10-19', 'Admin', MOTORISTAS, true, 0)).toEqual({tipo: 'outro dia', dia: '19/09/2026'});
  });
  it('planilha de outro motorista na conta de um motorista, e não na de quem administra', () => {
    expect(suspeitaDaRota('19-10-2026 Fulano Silva De Souza.xlsx', '2026-10-19', 'Teste', MOTORISTAS, false, 0)).toEqual({tipo: 'outro motorista', nome: 'Fulano Silva'});
    expect(suspeitaDaRota('19-10-2026 Fulano Silva De Souza.xlsx', '2026-10-19', 'Admin', MOTORISTAS, true, 0)).toBeNull();
  });
  it('a própria planilha, a sem nome conhecido e a que já tem entrega não são suspeitas', () => {
    expect(suspeitaDaRota('19-10-2026 FULANO SILVA DE SOUZA.xlsx', '2026-10-19', 'Fulano Silva', MOTORISTAS, false, 0)).toBeNull();
    expect(suspeitaDaRota('rota.xlsx', '2026-10-19', 'Teste', MOTORISTAS, false, 0)).toBeNull();
    expect(suspeitaDaRota('18-10-2026 Fulano Silva.xlsx', '2026-10-19', 'Teste', MOTORISTAS, false, 3)).toBeNull();
  });

  it('fica fora dos números e da tabela, e a repetida também', () => {
    const rotas = [
      {id: 'boa', motorista: 'Teste', arquivo: '19-10-2026 Teste Da Silva.xlsx', criado_em: '2026-10-19T09:00:00Z'},
      {id: 'velha', motorista: 'Teste', arquivo: '19-09-2026 Teste Da Silva.xlsx', criado_em: '2026-10-19T10:00:00Z'},
      {id: 'dele', motorista: 'Beltrano', arquivo: '19-10-2026 Teste Da Silva.xlsx', criado_em: '2026-10-19T11:00:00Z'},
      {id: 'de-novo', motorista: 'Teste', arquivo: '(1)19-10-2026 Teste Da Silva.xlsx', criado_em: '2026-10-19T12:00:00Z'},
    ];
    const pacotes = rotas.map(r => ({rota_id: r.id, chave_lugar: '49000100|1', endereco: 'Rua Teste, 1', entregue_em: r.id === 'boa' ? antes(10) : null, lat: -10.9, lng: -37.0}));
    const d = resumirDia(rotas, pacotes, new Set(), {agora: AGORA, motoristas: ['Teste', 'Beltrano']});
    expect(d.linhas.map(l => l.id)).toEqual(['boa']);
    expect(d.paraConferir.map(l => [l.id, l.suspeita.tipo])).toEqual([['velha', 'outro dia'], ['dele', 'outro motorista'], ['de-novo', 'repetida']]);
    expect([d.pacotes, d.entregues, d.pontos.length]).toEqual([1, 1, 1]);
  });

  it('a parada sem pino por fazer entra uma vez por endereço; a entregue e a de rota para conferir, não', () => {
    const rotas = [{id: 'a', motorista: 'Teste', arquivo: null}, {id: 'b', motorista: 'Admin', arquivo: '01-01-2026 x.xlsx', doAdmin: true}];
    const p = (rota_id: string, chave_lugar: string | null, endereco: string, entregue_em: string | null = null, lat: number | null = null) =>
      ({rota_id, chave_lugar, endereco, entregue_em, lat, lng: lat == null ? null : -37, bairro: 'Bairro Teste'});
    const d = resumirDia(rotas, [
      p('a', '49000100|5', 'Rua Teste, 5'), p('a', '49000100|5', 'Rua Teste, 5'),
      p('a', null, 'Travessa Teste, Sem N'), p('a', '49000100|7', 'Rua Teste, 7', antes(5)), p('a', '49000100|9', 'Rua Teste, 9', null, -10.9),
      p('b', '49000100|5', 'Rua Teste, 5'),
    ], new Set(), {agora: AGORA});
    expect(d.semLocal).toEqual([
      {rota_id: 'a', motorista: 'Teste', endereco: 'Rua Teste, 5', bairro: 'Bairro Teste', chave: '49000100|5', pacotes: 2},
      {rota_id: 'a', motorista: 'Teste', endereco: 'Travessa Teste, Sem N', bairro: 'Bairro Teste', chave: null, pacotes: 1},
    ]);
  });

  it('a rota na conta de quem administra só entra com uma marcação dele nela, feita depois de abrir', () => {
    const rota = (id: string, arquivo: string) => ({id, motorista: 'Admin', motorista_id: 'adm', arquivo, criado_em: '2026-10-19T12:00:00Z', doAdmin: true});
    const rotas = [rota('marcada', '19-10-2026 Teste.xlsx'), rota('antes', '19-10-2026 Outra.xlsx'), rota('teste', '19-09-2026 Teste.xlsx')];
    const pacote = (rota_id: string, chave_lugar: string, lat: number | null = -10.9) => ({rota_id, chave_lugar, endereco: 'Rua Teste, ' + chave_lugar, entregue_em: null, lat, lng: -37});
    const d = resumirDia(rotas, [pacote('marcada', '49000100|1'), pacote('antes', '49000100|2'), pacote('teste', '49000100|3', null)], new Set(), {agora: AGORA, marcasDoAdmin: [
      {motorista_id: 'adm', chave_lugar: '49000100|1', criado_em: '2026-10-19T12:30:00Z'},
      // marcada antes de abrir a rota, no Admin: não faz a rota ser de verdade
      {motorista_id: 'adm', chave_lugar: '49000100|2', criado_em: '2026-10-19T11:00:00Z'},
      // de outra pessoa
      {motorista_id: 'outro', chave_lugar: '49000100|3', criado_em: '2026-10-19T12:30:00Z'},
    ]});
    expect(d.linhas.map(l => l.id)).toEqual(['marcada']);
    // o teste some do painel inteiro: nem para conferir, nem parada sem local
    expect([d.paraConferir.length, d.semLocal.length, d.pontos.length]).toEqual([0, 0, 1]);
  });
});

describe('parada sem local', () => {
  it('a que a nuvem já sabe onde fica não entra: o motorista marcou depois de montar a rota', () => {
    const rotas = [{id: 'a', motorista: 'Teste', arquivo: null}];
    const p = (chave_lugar: string) => ({rota_id: 'a', chave_lugar, endereco: 'Rua Teste, ' + chave_lugar, entregue_em: null, lat: null, lng: null});
    const d = resumirDia(rotas, [p('49000100|1'), p('49000100|2')], new Set(), {agora: AGORA, comPosicao: new Set(['49000100|1'])});
    expect(d.semLocal.map(s => s.chave)).toEqual(['49000100|2']);
  });
});

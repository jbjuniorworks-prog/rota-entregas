import {agruparConferencia, contarConferencia, marcadasDoMesmoPonto, ruaDaChave, type MarcaEmConferencia, type PontoPendente} from './conferencia';

const PINO = {lat: -10.9500, lng: -37.0500};
// ~3,5 km ao norte, como as entregas marcadas de casa em 15/10
const CASA = {lat: -10.9185, lng: -37.0500};

const linha = (chave: string, extra: Partial<MarcaEmConferencia> = {}): MarcaEmConferencia => ({
  motorista_id: 'n1', nome: 'Novo', chave_lugar: chave, endereco: `Rua ${chave}, 1`, criado_em: '2026-10-15T22:40:00Z',
  ...CASA, situacao: 'confirmado', lat_antes: null, lng_antes: null, situacao_antes: null,
  pino_lat: PINO.lat, pino_lng: PINO.lng, no_pino: false, ...extra,
});

describe('o que o motorista em conferência espera do admin', () => {
  it('a porta levada para longe do pino vem antes, e diz quanto', () => {
    const [g] = agruparConferencia([
      linha('perto', {lat: -10.9502, lng: -37.0500}),
      linha('longe'),
    ]);
    expect(g.mexem.map(i => i.chave_lugar)).toEqual(['longe', 'perto']);
    expect(g.mexem[0].texto).toBe('A 3,5 km do pino da rota. Aprovada, fica verificada.');
  });

  it('a rota lida de vídeo não tem pino: vai para o alto, sem inventar distância', () => {
    const [g] = agruparConferencia([linha('longe'), linha('video', {pino_lat: null, pino_lng: null})]);
    expect(g.mexem[0].chave_lugar).toBe('video');
    expect(g.mexem[0].doPino).toBeNull();
    expect(g.mexem[0].texto).toBe('Sem pino da rota para comparar. Aprovada, fica verificada.');
  });

  it('a entrega no pino fica separada, para aprovar todas de uma vez', () => {
    const [g] = agruparConferencia([linha('a', {...PINO, no_pino: true}), linha('b')]);
    expect(g.noPino.map(i => i.chave_lugar)).toEqual(['a']);
    expect(g.noPino[0].texto).toBe('Entregue no pino da rota. Aprovada, fica verificada.');
    expect(g.mexem.map(i => i.chave_lugar)).toEqual(['b']);
  });

  it('diz quando aprovar tira do lugar uma porta que já vale', () => {
    const [g] = agruparConferencia([linha('a', {lat_antes: PINO.lat, lng_antes: PINO.lng, situacao_antes: 'confirmado'})]);
    expect(g.mexem[0].texto).toBe('A 3,5 km do pino da rota. A porta verificada hoje fica a 3,5 km. Aprovada, fica verificada.');
  });

  it('uma marcação sozinha vira sugestão, e diz isso', () => {
    const [g] = agruparConferencia([linha('a', {situacao: 'sugestao'})]);
    expect(g.mexem[0].texto).toBe('A 3,5 km do pino da rota. Aprovada, vira sugestão para os outros.');
  });

  it('separa por motorista, o de mais pendências primeiro, e conta tudo', () => {
    const gs = agruparConferencia([
      linha('a'), linha('b', {motorista_id: 'n2', nome: 'Outro'}), linha('c', {motorista_id: 'n2', nome: 'Outro', no_pino: true}),
    ]);
    expect(gs.map(g => g.nome)).toEqual(['Outro', 'Novo']);
    expect(contarConferencia(gs)).toBe(3);
  });
});

// O César de 19/10: cinco endereços de duas ruas marcados parado num lugar só. Inventados.
describe('marcadas do mesmo ponto', () => {
  const ponto = (chave: string, metros = 0, minutos = 0, motorista = 'n1'): PontoPendente => ({
    motorista_id: motorista, chave_lugar: chave, lat: CASA.lat + metros / 111320, lng: CASA.lng,
    criado_em: new Date(Date.parse('2026-10-19T15:43:00Z') + minutos * 60000).toISOString(),
  });

  it('a rua da chave é o CEP, ou a rua e o bairro sem o número', () => {
    expect(ruaDaChave('49000100|155')).toBe('49000100');
    expect(ruaDaChave('r|rua teste|20|bairro teste|aracaju')).toBe('r|rua teste|bairro teste|aracaju');
  });

  it('três endereços de duas ruas do mesmo ponto: marca os três, com quantos e de quantas ruas', () => {
    const m = marcadasDoMesmoPonto([ponto('49000100|155'), ponto('49000100|66', 1), ponto('49000200|60', 0, 1), ponto('49000100|184', 26)]);
    expect(Object.fromEntries(m)).toEqual({
      'n1|49000100|155': {enderecos: 3, ruas: 2}, 'n1|49000100|66': {enderecos: 3, ruas: 2}, 'n1|49000200|60': {enderecos: 3, ruas: 2},
    });
  });

  it('o mesmo prédio, vários endereços da mesma rua no mesmo ponto, não marca', () => {
    expect(marcadasDoMesmoPonto([ponto('49000100|10'), ponto('49000100|12'), ponto('49000100|14'), ponto('49000100|16')]).size).toBe(0);
  });

  it('nem longe no tempo, nem de outro motorista, nem só dois endereços', () => {
    expect(marcadasDoMesmoPonto([ponto('49000100|1'), ponto('49000200|2'), ponto('49000300|3', 0, 45)]).size).toBe(0);
    expect(marcadasDoMesmoPonto([ponto('49000100|1'), ponto('49000200|2'), ponto('49000300|3', 0, 0, 'n2')]).size).toBe(0);
    expect(marcadasDoMesmoPonto([ponto('49000100|1'), ponto('49000200|2')]).size).toBe(0);
  });

  it('o item da lista leva o aviso', () => {
    const [g] = agruparConferencia([linha('49000100|155')], new Map([['n1|49000100|155', {enderecos: 3, ruas: 2}]]));
    expect(g.mexem[0].mesmoPonto).toEqual({enderecos: 3, ruas: 2});
  });
});

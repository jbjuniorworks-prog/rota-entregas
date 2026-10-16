import {agruparConferencia, contarConferencia, type MarcaEmConferencia} from './conferencia';

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

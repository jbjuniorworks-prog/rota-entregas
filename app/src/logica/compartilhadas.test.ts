import {aplicarCompartilhadas, type PosicaoCompartilhada} from './compartilhadas';
import type {Parada} from './tipos';

let n = 0;
const parada = (chave: string, extra: Partial<Parada> = {}): Parada & {chave: string} => ({
  id: 'p' + ++n, chave, area: 'a', ml: null, texto: chave, unidades: null, comercial: false,
  lat: -10.90, lng: -37.05, exibido: 'Posição da planilha', precisao: 'planilha', candidatos: [], entregue: false, ...extra,
});
const pos = (chave: string, situacao: 'confirmado' | 'sugestao', extra: Partial<PosicaoCompartilhada> = {}): PosicaoCompartilhada =>
  ({chave_lugar: chave, lat: -11.04, lng: -37.10, situacao, motoristas: situacao === 'confirmado' ? 2 : 1, minha: false, ...extra});
const aplicar = (ps: (Parada & {chave: string})[], rs: PosicaoCompartilhada[]) => aplicarCompartilhadas(ps, rs, p => (p as any).chave);

describe('posições de outros motoristas', () => {
  it('confirmada por 2 motoristas: aplica sozinha e guarda a de antes como opção', () => {
    const p = parada('a|1');
    expect(aplicar([p], [pos('a|1', 'confirmado')])).toEqual({confirmadas: 1, sugestoes: 0, minhas: 0, lembradasVerificadas: 0});
    expect(p).toMatchObject({lat: -11.04, lng: -37.10, precisao: 'confirmado', exibido: 'Endereço verificado por 2 motoristas'});
    expect(p.candidatos[0]).toMatchObject({lat: -10.90, precisao: 'planilha', fonte: 'original'});
  });
  it('posição confirmada pelas entregas feitas no local diz de onde veio', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {fonte: 'entrega', motoristas: 0, entregas: 2})]);
    expect(p.exibido).toBe('Endereço verificado: 2 entregas feitas aqui');
    expect(p.precisao).toBe('confirmado');
  });
  // Pedido de 28/09, "igual o Mercado Livre faz": uma entrega feita no pino já verifica o endereço.
  it('uma entrega só, feita no pino, já verifica o endereço', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {fonte: 'entrega', motoristas: 0, entregas: 1})]);
    expect(p.exibido).toBe('Endereço verificado: já entregaram aqui');
    expect(p.precisao).toBe('confirmado');
  });
  // O "📍 Entreguei aqui" do balão manda correção e passagem no mesmo ponto, e a nuvem confirma
  // com um motorista só. Para quem recebe, isso tem de ler como gente, não "por 1 motoristas".
  it('confirmada por um motorista na porta, com a entrega feita ali', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {fonte: 'correcao', motoristas: 1, entregas: 1})]);
    expect(p.exibido).toBe('Endereço verificado por outro motorista, na porta');
  });
  it('correção do administrador vale como confirmada', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {motoristas: 1})]);
    expect(p.exibido).toBe('Endereço verificado por quem administra');
  });
  // A porta do censo é palpite até alguém entregar: a verificada passa por cima dela, mesmo com o
  // censo levando a parada de onde a planilha punha (Pedro, 09/10: entregue a 8 m da planilha).
  it('a porta verificada vence a porta do censo; a sugestão só aparece, sem mover', () => {
    const a = parada('a|1', {precisao: 'censo', fonte: 'IBGE'}), b = parada('b|1', {precisao: 'censo', fonte: 'IBGE'});
    aplicar([a, b], [pos('a|1', 'confirmado', {fonte: 'entrega', motoristas: 0, entregas: 1}), pos('b|1', 'sugestao')]);
    expect(a).toMatchObject({lat: -11.04, lng: -37.10, precisao: 'confirmado'});
    expect(a.candidatos[0]).toMatchObject({lat: -10.90, precisao: 'censo', fonte: 'original'});
    expect(b).toMatchObject({lat: -10.90, precisao: 'censo'});
    expect(b.sugestao).toMatchObject({lat: -11.04});
  });
  it('de 1 motorista só: não move, vira sugestão com a distância', () => {
    const p = parada('a|1');
    expect(aplicar([p], [pos('a|1', 'sugestao')])).toEqual({confirmadas: 0, sugestoes: 1, minhas: 0, lembradasVerificadas: 0});
    expect(p.lat).toBe(-10.90);
    expect(p.sugestao).toMatchObject({lat: -11.04, lng: -37.10});
    expect(p.sugestao!.distancia).toBeGreaterThan(15000);
  });
  it('sugestão igual à posição que já está (menos de 30 m) não aparece', () => {
    const p = parada('a|1', {lat: -11.04001, lng: -37.10001});
    expect(aplicar([p], [pos('a|1', 'sugestao')]).sugestoes).toBe(0);
    expect(p.sugestao).toBeUndefined();
  });
  it('o pino ajustado na mão vence; o que o navegador só lembrava, não', () => {
    const a = parada('a|1', {precisao: 'manual'}), b = parada('b|1', {precisao: 'lembrado'});
    expect(aplicar([a, b], [pos('a|1', 'confirmado'), pos('b|1', 'confirmado')]).confirmadas).toBe(1);
    expect(a.lat).toBe(-10.90);
    expect(b.lat).toBe(-11.04);
  });
  it('não mexe em entrega já feita nem em parada sem chave', () => {
    const b = parada('b|1', {entregue: true}), c = parada('');
    expect(aplicar([b, c], [pos('b|1', 'confirmado')])).toEqual({confirmadas: 0, sugestoes: 0, minhas: 0, lembradasVerificadas: 0});
    expect(b.lat).toBe(-10.90);
  });
  it('confirmada tira a sugestão antiga e corrige a posição que a planilha jogou longe', () => {
    const p = parada('a|1', {precisao: 'bairro', sugestao: {lat: 1, lng: 1, distancia: 5}});
    aplicar([p], [pos('a|1', 'confirmado')]);
    expect(p.precisao).toBe('confirmado');
    expect(p.sugestao).toBeUndefined();
  });
});

describe('a posição que o próprio motorista arrumou', () => {
  // Volta, mas não como "verificado": ninguém entregou ali. Chamar de verificada travava os
  // botões de arrumar na Rota e fazia a Conferir perguntar "já está verificado?" à toa.
  it('volta para ele em outro aparelho, mesmo sem ninguém mais ter confirmado, como corrigida por ele', () => {
    const p = parada('a|1');
    const r = aplicar([p], [pos('a|1', 'sugestao', {minha: true})]);
    expect(r).toEqual({confirmadas: 0, sugestoes: 0, minhas: 1, lembradasVerificadas: 0});
    expect(p).toMatchObject({lat: -11.04, lng: -37.10, precisao: 'lembrado', exibido: 'Posição que você mesmo arrumou aqui'});
    expect(p.sugestao).toBeUndefined();
  });

  it('não vira recado de "outro motorista confirmou"', () => {
    const p = parada('a|1');
    aplicar([p], [pos('a|1', 'confirmado', {minha: true})]);
    expect(p.exibido).toBe('Endereço verificado (marcado por você)');
    expect(p.precisao).toBe('confirmado');
  });

  // Pedro, 10/10: 13 endereços verificados pelas entregas dele e nenhum "verificado" no aviso
  it('verificada pelas entregas dele conta como verificada, não como "a que você arrumou"', () => {
    const p = parada('a|1');
    expect(aplicar([p], [pos('a|1', 'confirmado', {minha: true})])).toEqual({confirmadas: 1, sugestoes: 0, minhas: 0, lembradasVerificadas: 0});
  });

  it('a de outro motorista continua sendo só sugestão enquanto não confirma', () => {
    const p = parada('a|1');
    const r = aplicar([p], [pos('a|1', 'sugestao', {minha: false})]);
    expect(r).toEqual({confirmadas: 0, sugestoes: 1, minhas: 0, lembradasVerificadas: 0});
    expect(p.precisao).toBe('planilha');
    expect(p.sugestao).toBeTruthy();
  });

  it('o que o motorista escolheu na mão neste aparelho não é mexido', () => {
    const p = parada('a|1', {precisao: 'manual', lat: -10.5, lng: -37.5});
    aplicar([p], [pos('a|1', 'confirmado', {minha: true})]);
    expect(p).toMatchObject({lat: -10.5, lng: -37.5, precisao: 'manual'});
  });
});

describe('memória deste navegador contra o que os motoristas arrumaram', () => {
  it('posição confirmada vence o que este navegador só lembrava', () => {
    const p = parada('a|1', {precisao: 'lembrado', exibido: 'Posição que você corrigiu em 19/09'});
    const r = aplicar([p], [pos('a|1', 'confirmado')]);
    expect(r.confirmadas).toBe(1);
    expect(p).toMatchObject({lat: -11.04, lng: -37.10, precisao: 'confirmado'});
    // e o que estava antes continua à mão, para poder voltar
    expect(p.candidatos[0]).toMatchObject({precisao: 'lembrado', fonte: 'original'});
  });

  it('a lembrada que a nuvem verifica é contada para sair do "já tinha corrigido"', () => {
    const a = parada('a|1', {precisao: 'lembrado'}), b = parada('b|1', {precisao: 'lembrado'});
    const r = aplicar([a, b], [pos('a|1', 'confirmado', {minha: true}), pos('b|1', 'sugestao', {minha: true})]);
    expect(r).toEqual({confirmadas: 1, sugestoes: 0, minhas: 1, lembradasVerificadas: 1});
  });

  it('o pino arrastado agora neste aparelho continua ganhando de tudo', () => {
    const p = parada('a|1', {precisao: 'manual', lat: -10.5, lng: -37.5});
    expect(aplicar([p], [pos('a|1', 'confirmado')]).confirmadas).toBe(0);
    expect(p).toMatchObject({lat: -10.5, lng: -37.5, precisao: 'manual'});
  });

  it('sugestão de um motorista só não derruba a memória do navegador', () => {
    const p = parada('a|1', {precisao: 'lembrado'});
    aplicar([p], [pos('a|1', 'sugestao')]);
    expect(p.precisao).toBe('lembrado');
    expect(p.sugestao).toBeTruthy();
  });
});

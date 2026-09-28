import {porQuePrecisaDeVoce, situacaoDoLugar, triar, type LugarParaTriar, type MarcaDoLugar} from './triagem';

const AGORA = Date.parse('2026-09-28T12:00:00Z');
const DIA = 864e5;
const PORTA = {lat: -10.9500, lng: -37.0500};
// ~110 m ao norte: outra porta, longe do raio de 30 m da nuvem
const OUTRA = {lat: -10.9490, lng: -37.0500};

const marca = (nome: string, diasAtras: number, onde = PORTA, papel = 'motorista'): MarcaDoLugar =>
  ({motorista_id: nome, nome, papel, ...onde, criado_em: new Date(AGORA - diasAtras * DIA).toISOString()});
const lugar = (chave: string, marcacoes: MarcaDoLugar[], extra: Partial<LugarParaTriar> = {}): LugarParaTriar =>
  ({chave, marcacoes, situacao: 'confirmado', escolhida: PORTA, ...extra});

describe('o que precisa do administrador', () => {
  it('pino de um motorista só, sem entrega no ponto, espera ele decidir', () => {
    const l = lugar('a', [marca('Luan', 1)], {situacao: 'sugestao'});
    expect(porQuePrecisaDeVoce(l)).toBe('Só Luan marcou, e ninguém entregou nesse ponto ainda.');
  });

  it('dois motoristas em lugares diferentes, sem entrega em nenhum', () => {
    const l = lugar('a', [marca('Luan', 1), marca('Pedro', 2, OUTRA)], {situacao: 'sugestao'});
    expect(porQuePrecisaDeVoce(l)).toBe('Luan e Pedro marcaram em lugares diferentes, e ninguém entregou em nenhum deles.');
  });

  it('a palavra mais nova da rua contra a posição que vale', () => {
    const l = lugar('a', [marca('Luan', 0.5, OUTRA), marca('Pedro', 3)]);
    expect(porQuePrecisaDeVoce(l)).toBe('Luan marcou por último em outro lugar, a 111 m da que vale.');
  });

  // Marcação velha que já perdeu para uma mais nova não é pergunta: a rua já respondeu.
  it('marcação antiga que já foi vencida por uma mais nova não volta a pedir', () => {
    const l = lugar('a', [marca('Luan', 5, OUTRA), marca('Pedro', 1)]);
    expect(porQuePrecisaDeVoce(l)).toBeNull();
  });

  it('o que você já decidiu não volta; o que chegou depois da sua decisão, sim', () => {
    const decidido = lugar('a', [marca('Luan', 3, OUTRA), marca('Você', 1, PORTA, 'admin')], {fonte: 'admin'});
    expect(porQuePrecisaDeVoce(decidido)).toBeNull();
    const depois = lugar('b', [marca('Luan', 0.5, OUTRA), marca('Você', 1, PORTA, 'admin')], {fonte: 'admin'});
    expect(porQuePrecisaDeVoce(depois)).toContain('Luan marcou por último em outro lugar');
  });

  it('porta confirmada no mesmo ponto não pede nada', () => {
    expect(porQuePrecisaDeVoce(lugar('a', [marca('Luan', 1)], {fonte: 'correcao', motoristas: 1, entregas: 1}))).toBeNull();
  });
});

describe('como a tela separa as marcações', () => {
  const decidir = lugar('decidir', [marca('Luan', 2)], {situacao: 'sugestao'});
  const ontem = lugar('ontem', [marca('Pedro', 1)]);
  const hoje = lugar('hoje', [marca('Luan', 0.1)]);
  const velha = lugar('velha', [marca('Luan', 20)]);
  const soSua = lugar('sua', [marca('Você', 0.2, PORTA, 'admin')], {fonte: 'admin'});

  it('o que espera decisão vem primeiro, os últimos 7 dias do mais novo para o mais velho, o resto guardado', () => {
    const t = triar([velha, ontem, soSua, decidir, hoje], AGORA, null);
    expect(t.decidir.map(l => l.chave)).toEqual(['decidir']);
    expect(t.recentes.map(l => l.chave)).toEqual(['hoje', 'ontem']);
    // a sua própria marcação não é mudança que eles pediram
    expect(t.outras.map(l => l.chave)).toEqual(['sua', 'velha']);
  });

  it('marca como novo o que chegou depois da última vez que você olhou', () => {
    const t = triar([decidir, ontem, hoje], AGORA, AGORA - 1.5 * DIA);
    expect(t.novas).toBe(2);
    expect(t.novo(hoje)).toBe(true);
    expect(t.novo(ontem)).toBe(true);
    expect(t.novo(decidir)).toBe(false);
  });

  it('sem visita anterior, nada aparece como novo', () => {
    const t = triar([decidir, hoje], AGORA, null);
    expect(t.novas).toBe(0);
    expect(t.novo(hoje)).toBe(false);
  });
});

describe('o nome da situação, do jeito que se lê', () => {
  it('diz quem confirmou', () => {
    expect(situacaoDoLugar(lugar('a', [], {situacao: 'sugestao'})).texto).toBe('Sugestão');
    expect(situacaoDoLugar(lugar('a', [], {fonte: 'admin'})).texto).toBe('Confirmada por você');
    expect(situacaoDoLugar(lugar('a', [], {fonte: 'correcao', motoristas: 2, entregas: 0})).texto).toBe('Confirmada por 2 motoristas');
    expect(situacaoDoLugar(lugar('a', [], {fonte: 'correcao', motoristas: 1, entregas: 1})).texto).toBe('Confirmada na porta, com a entrega');
    expect(situacaoDoLugar(lugar('a', [], {situacao: null})).texto).toBe('Não vale: motorista desativado');
  });
});

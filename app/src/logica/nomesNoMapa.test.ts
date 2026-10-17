import {classificar, indexar} from '../../../ferramentas/nomes-no-mapa.mjs';
import {nomesNoMapa, rotulosNaTela, ruasDoDia, type TrechoDaBase} from './nomesNoMapa';
import type {Parada} from './tipos';

// ~110 m por 0,001 grau perto do equador; os testes são em Aracaju
const L = -10.95, G = -37.05;
const reta = (de: [number, number], ate: [number, number]): [number, number][] => [de, ate];

describe('npm run nomes-no-mapa: como cada trecho da prefeitura aparece no mapa', () => {
  const osm = [
    {nome_chave: null, linha: reta([L, G], [L, G + 0.002])},
    {nome_chave: 'acacias', linha: reta([L + 0.001, G], [L + 0.001, G + 0.002])},
  ];
  const grade = indexar(osm);

  it('em cima de uma rua do mapa sem nome: escreve o nome', () => {
    expect(classificar({nome_chave: 'albertina bezerra ribeiro', fonte: 'prefeitura', linha: reta([L + 0.00005, G], [L + 0.00005, G + 0.002])}, grade)).toBe('sem_nome');
  });

  it('em cima de uma rua do mapa com o mesmo nome: nada a fazer', () => {
    expect(classificar({nome_chave: 'acacias', fonte: 'prefeitura', linha: reta([L + 0.001, G], [L + 0.001, G + 0.002])}, grade)).toBe('com_nome');
  });

  it('longe de qualquer rua do mapa: desenha o trecho', () => {
    expect(classificar({nome_chave: 'nova', fonte: 'prefeitura', linha: reta([L - 0.003, G], [L - 0.003, G + 0.002])}, grade)).toBe('fora');
  });

  // um trecho reto vem com dois pontos só: as duas pontas no mapa não dizem nada do meio
  it('as pontas no mapa e o meio fora dele: é trecho que falta', () => {
    const curva = indexar([{nome_chave: null, linha: [[L, G], [L - 0.003, G + 0.001], [L, G + 0.002]] as [number, number][]}]);
    expect(classificar({nome_chave: 'reta', fonte: 'prefeitura', linha: reta([L, G], [L, G + 0.002])}, curva)).toBe('fora');
  });

  // as rodovias vão a 7 km do ponto guardado: procurando pelo ponto, o trecho ali não era achado
  it('uma rodovia comprida conta no lugar por onde passa, não só no meio dela', () => {
    const rodovia = indexar([{nome_chave: 'nauf', linha: reta([L, G - 0.05], [L, G + 0.05])}]);
    expect(classificar({nome_chave: 'inacio barbosa', fonte: 'prefeitura', linha: reta([L, G + 0.04], [L, G + 0.042])}, rodovia)).toBe('sem_nome');
  });

  it('o trecho que os motoristas nomearam é rua do mapa, mesmo que o mapa de agora não a tenha', () => {
    expect(classificar({nome_chave: 'estanislau', fonte: 'motorista', linha: reta([L - 0.003, G], [L - 0.003, G + 0.002])}, grade)).toBe('sem_nome');
  });
});

const parada = (id: string, texto: string, lat: number, lng: number, extra: Partial<Parada> = {}): Parada =>
  ({id, area: 'a', ml: null, texto, bairro: 'Robalo', unidades: null, comercial: false, lat, lng, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra});
const trecho = (nome_chave: string, linha: [number, number][], no_mapa = 'sem_nome', fonte = 'prefeitura'): TrechoDaBase => ({nome_chave, fonte, linha, no_mapa});

describe('o nome da rua no mapa, no celular', () => {
  const ps = [
    parada('a', 'Rua Professora Albertina Bezerra Ribeiro, 137, Na casa de cuia, Robalo', L, G),
    parada('b', 'RUA PROFESSORA ALBERTINA BEZERRA RIBEIRO, 142', L, G + 0.0005),
    parada('c', 'Rua Professora Albertina Bezerra Ribeiro, 280', L, G + 0.001, {entregue: true}),
    parada('d', 'Rua A, 10', L, G),
  ];

  it('o nome é o da planilha, na grafia que mais aparece, e a entregue continua contando', () => {
    const doDia = ruasDoDia(ps);
    const albertina = [...doDia.values()].find(r => r.texto.includes('Albertina'))!;
    expect(albertina.texto).toBe('Rua Professora Albertina Bezerra Ribeiro');
    expect(albertina.pontos).toHaveLength(3);
  });

  it('só o trecho perto de uma entrega daquela rua: o "Rua A" de outro loteamento fica de fora', () => {
    const doDia = ruasDoDia(ps);
    const k = [...doDia].find(([, r]) => r.texto === 'Rua A')![0];
    const kAlb = [...doDia].find(([, r]) => r.texto.includes('Albertina'))![0];
    const nomes = nomesNoMapa(doDia, [
      trecho(kAlb, reta([L + 0.0001, G - 0.0005], [L + 0.0001, G + 0.0015])),
      trecho(k, reta([L + 0.01, G], [L + 0.01, G + 0.001])),
      trecho(k, reta([L + 0.0002, G], [L + 0.0002, G + 0.001]), 'fora'),
      trecho('outra rua', reta([L, G], [L, G + 0.001])),
    ]);
    expect(nomes.map(n => [n.texto, n.traco])).toEqual([['Rua Professora Albertina Bezerra Ribeiro', false], ['Rua A', true]]);
  });

  it('trecho dos motoristas e trecho já com o nome no mapa não viram traço', () => {
    const doDia = ruasDoDia(ps);
    const kAlb = [...doDia].find(([, r]) => r.texto.includes('Albertina'))![0];
    const nomes = nomesNoMapa(doDia, [trecho(kAlb, reta([L, G], [L, G + 0.001]), 'fora', 'motorista'), trecho(kAlb, reta([L, G], [L, G + 0.001]), 'com_nome')]);
    expect(nomes.map(n => n.traco)).toEqual([false]);
  });
});

describe('onde o nome entra na tela', () => {
  const largura = (t: string) => t.length * 7;
  const tela = {largura: 400, altura: 600};

  it('no meio do trecho, na direção da rua, e nunca de cabeça para baixo', () => {
    const [deitado] = rotulosNaTela([{texto: 'Rua B', pixels: [{x: 300, y: 100}, {x: 100, y: 100}]}], tela, largura);
    expect([deitado.x, deitado.y, deitado.angulo]).toEqual([200, 100, 0]);
    const [subindo] = rotulosNaTela([{texto: 'Rua C', pixels: [{x: 100, y: 300}, {x: 200, y: 200}]}], tela, largura);
    expect(subindo.angulo).toBeCloseTo(-45);
    const [descendo] = rotulosNaTela([{texto: 'Rua D', pixels: [{x: 200, y: 200}, {x: 100, y: 100}]}], tela, largura);
    expect(descendo.angulo).toBeCloseTo(45);
  });

  it('um nome não encosta no outro: o trecho mais longo fica com o lugar', () => {
    const r = rotulosNaTela([
      {texto: 'Rua Curta', pixels: [{x: 150, y: 205}, {x: 250, y: 205}]},
      {texto: 'Rua Comprida', pixels: [{x: 50, y: 200}, {x: 350, y: 200}]},
      {texto: 'Rua Longe', pixels: [{x: 50, y: 400}, {x: 350, y: 400}]},
    ], tela, largura);
    expect(r.map(x => x.texto)).toEqual(['Rua Comprida', 'Rua Longe']);
  });

  it('a rua cortada em trechos mostra o nome uma vez por pedaço da tela, e fora da tela não mostra', () => {
    const trechos = [0, 1, 2, 3].map(k => ({texto: 'Rua Albertina', pixels: [{x: 20 + k * 90, y: 300}, {x: 100 + k * 90, y: 300}]}));
    expect(rotulosNaTela(trechos, tela, largura)).toHaveLength(1);
    expect(rotulosNaTela([{texto: 'Rua Fora', pixels: [{x: 500, y: 300}, {x: 700, y: 300}]}], tela, largura)).toHaveLength(0);
  });
});

import {describe, expect, it} from 'vitest';
import {conferirRomaneio, daGaiola, meiosDosBairros, pacotesDoRomaneio, textoParaAnalistas, type PortasDoCenso} from './romaneio';
import {chaveBairro} from './texto';

// Bairros e gaiolas inventados. 0,009 grau de latitude são uns 1.000 m.
const BASE = {lat: -10.95, lng: -37.05};
const aNorte = (km: number) => ({lat: BASE.lat + km * 0.009, lng: BASE.lng});
const LUGAR: Record<string, {lat: number; lng: number}> = {
  'Bairro Alfa': aNorte(0),
  'Bairro Beta': aNorte(2),
  'Bairro Gama': aNorte(12),
  'Bairro Delta': aNorte(-15),
  'Bairro Epsilon': aNorte(13),
};
// cada bairro com cinco portas em volta do meio
const cidade = (nome: string, lugares: Record<string, {lat: number; lng: number}>): PortasDoCenso => {
  const bairros = Object.keys(lugares), iBairro: number[] = [], lats: number[] = [], lngs: number[] = [];
  bairros.forEach((b, k) => [-2, -1, 0, 1, 2].forEach(d => {
    iBairro.push(k); lats.push(Math.round((lugares[b].lat + d * 0.0005) * 1e6)); lngs.push(Math.round(lugares[b].lng * 1e6));
  }));
  return {cidade: nome, bairros, iBairro, lats, lngs};
};
const MEIOS = meiosDosBairros([cidade('Aracaju', LUGAR)]);
const pacotes = (gaiola: string, bairro: string, n: number) => Array.from({length: n}, () => ({gaiola, bairro}));
// a gaiola B-7 é da Alfa e da Beta; a D-2, da Gama
const GALPAO = [...pacotes('B-7', 'Bairro Alfa', 40), ...pacotes('B-7', 'Bairro Beta', 20), ...pacotes('D-2', 'Bairro Gama', 50)];

describe('ler o romaneio', () => {
  it('acha as colunas de bairro e de gaiola abaixo de um título, e pula a linha vazia', () => {
    const linhas = [['Romaneio do dia'], ['Neighborhood', 'Corridor Cage'], ['Bairro Alfa', 'b-7'], ['', ''], ['Bairro Gama', 'D-2']];
    expect(pacotesDoRomaneio(linhas)).toEqual([{bairro: 'Bairro Alfa', gaiola: 'B-7'}, {bairro: 'Bairro Gama', gaiola: 'D-2'}]);
  });

  it('em português também', () => {
    expect(pacotesDoRomaneio([['Gaiola', 'Bairro'], ['B-7', 'Bairro Alfa']])).toEqual([{bairro: 'Bairro Alfa', gaiola: 'B-7'}]);
  });

  it('a planilha da rota não é romaneio: diz o que falta', () => {
    expect(() => pacotesDoRomaneio([['Sequence', 'Destination Address', 'Bairro'], ['1', 'Rua A, 1', 'Alfa']])).toThrow('não achei as colunas de bairro e de gaiola');
  });
});

describe('o meio de cada bairro pelo censo', () => {
  it('é a mediana das portas: uma porta com o bairro errado, longe, não arrasta', () => {
    const c = cidade('Aracaju', {'Bairro Alfa': LUGAR['Bairro Alfa']});
    const comErrada = {...c, iBairro: [...c.iBairro as number[], 0], lats: [...c.lats as number[], Math.round(aNorte(30).lat * 1e6)], lngs: [...c.lngs as number[], c.lngs[0]]};
    const [meio] = meiosDosBairros([comErrada]).get(chaveBairro('Bairro Alfa'))!;
    expect(Math.abs(meio.lat - LUGAR['Bairro Alfa'].lat)).toBeLessThan(0.001);
  });

  it('o mesmo nome em duas cidades, longe, são dois lugares; perto, um só', () => {
    const longe = meiosDosBairros([cidade('Aracaju', {Centro: aNorte(0)}), cidade('Socorro', {Centro: aNorte(10)})]);
    expect(longe.get(chaveBairro('Centro'))).toHaveLength(2);
    const perto = meiosDosBairros([cidade('Aracaju', {Centro: aNorte(0)}), cidade('Socorro', {Centro: aNorte(1)})]);
    expect(perto.get(chaveBairro('Centro'))).toHaveLength(1);
  });
});

describe('conferir o romaneio', () => {
  it('o pacote de um bairro longe da gaiola é suspeito, com a gaiola onde o bairro vai', () => {
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Bairro Gama', 1)], MEIOS);
    expect(c.suspeitos).toEqual([{gaiola: 'B-7', bairro: 'Bairro Gama', pacotes: 1, metros: expect.any(Number), casas: ['D-2']}]);
    expect(c.suspeitos[0].metros).toBeGreaterThan(9000);
  });

  it('o bairro vizinho, a 2 km, não é suspeito', () => {
    const c = conferirRomaneio([...pacotes('B-7', 'Bairro Alfa', 60), ...pacotes('B-7', 'Bairro Beta', 1), ...pacotes('D-2', 'Bairro Gama', 50)], MEIOS);
    expect(c.suspeitos).toEqual([]);
  });

  it('na rota de dois pedaços, o bairro com 20% da gaiola também é do núcleo', () => {
    // a B-7 tem a Alfa e, a 12 km, a Gama; o pacote do Épsilon, ao lado da Gama, é da rota
    const c = conferirRomaneio([...pacotes('B-7', 'Bairro Alfa', 80), ...pacotes('B-7', 'Bairro Gama', 20), ...pacotes('B-7', 'Bairro Epsilon', 1)], MEIOS);
    expect(c.suspeitos).toEqual([]);
  });

  it('quatro pacotes do mesmo bairro longe são um pedaço da rota, não pacotes perdidos', () => {
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Bairro Gama', 4)], MEIOS);
    expect(c.suspeitos).toEqual([]);
  });

  it('o bairro que o censo não conhece fica sem conferir, e é contado', () => {
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Bairro Que Nao Existe', 2)], MEIOS);
    expect(c.suspeitos).toEqual([]);
    expect(c.semConferir).toBe(2);
  });

  it('o nome que existe em duas cidades fica com o lugar mais perto da gaiola', () => {
    const meios = meiosDosBairros([cidade('Aracaju', {...LUGAR, Centro: aNorte(1)}), cidade('Socorro', {Centro: aNorte(-20)})]);
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Centro', 1)], meios);
    expect(c.suspeitos).toEqual([]);
  });

  it('no núcleo, o nome de duas cidades vale onde fica perto dos outros bairros dela', () => {
    // a D-2 tem a Gama e o Centro; o Centro de Socorro fica junto da Gama, o de Aracaju (o primeiro
    // da lista) ao lado da Alfa
    const meios = meiosDosBairros([cidade('Aracaju', {...LUGAR, Centro: aNorte(0.5)}), cidade('Socorro', {Centro: aNorte(12.5)})]);
    const c = conferirRomaneio([...pacotes('D-2', 'Bairro Gama', 30), ...pacotes('D-2', 'Centro', 30), ...pacotes('D-2', 'Bairro Alfa', 1),
      ...pacotes('B-7', 'Bairro Alfa', 60)], meios);
    expect(c.suspeitos.map(s => [s.gaiola, s.bairro])).toEqual([['D-2', 'Bairro Alfa']]);
  });

  it('a gaiola cujo núcleo é só um nome de duas cidades fica sem conferir', () => {
    // nenhum dos dois Centros fica perto da Gama: escolher qualquer um acusaria a Gama sem base
    const meios = meiosDosBairros([cidade('Aracaju', {...LUGAR, Centro: aNorte(-20)}), cidade('Socorro', {Centro: aNorte(30)})]);
    const c = conferirRomaneio([...pacotes('X-1', 'Centro', 30), ...pacotes('X-1', 'Bairro Gama', 1)], meios);
    expect(c.suspeitos).toEqual([]);
    expect(c.semConferir).toBe(31);
  });

  it('a gaiola cujo núcleo o censo não conhece fica sem conferir', () => {
    const c = conferirRomaneio([...pacotes('X-1', 'Bairro Que Nao Existe', 30), ...pacotes('X-1', 'Bairro Gama', 1)], MEIOS);
    expect(c.suspeitos).toEqual([]);
    expect(c.semConferir).toBe(31);
  });
});

describe('a gaiola de quem pega a rota', () => {
  it('os de fora que estão nela, e os do bairro dela parados em outras', () => {
    // a Delta na D-2 também é de fora, mas não é da B-7: não entra na lista de quem pega a B-7
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Bairro Gama', 1), ...pacotes('D-2', 'Bairro Alfa', 2), ...pacotes('D-2', 'Bairro Delta', 1)], MEIOS);
    expect(c.suspeitos.map(s => s.bairro)).toContain('Bairro Delta');
    const d = daGaiola(c, ' b-7 ');
    expect(d.naGaiola.map(s => s.bairro)).toEqual(['Bairro Gama']);
    expect(d.emOutras.map(s => [s.gaiola, s.bairro, s.pacotes])).toEqual([['D-2', 'Bairro Alfa', 2]]);
  });
});

describe('o texto para os analistas', () => {
  it('uma linha por gaiola e bairro, com a distância e para onde o bairro vai', () => {
    const c = conferirRomaneio([...GALPAO, ...pacotes('B-7', 'Bairro Gama', 1), ...pacotes('D-2', 'Bairro Alfa', 2)], MEIOS);
    expect(textoParaAnalistas(c.suspeitos)).toBe([
      'Romaneio: 3 pacote(s) parecem fora de rota, pelo bairro. Para conferir:',
      // da Beta, a parte da B-7 mais perto da Gama
      'B-7: 1 pacote(s) de Bairro Gama, a 10 km da área da gaiola. Esse bairro vai na gaiola D-2.',
      'D-2: 2 pacote(s) de Bairro Alfa, a 12 km da área da gaiola. Esse bairro vai na gaiola B-7.',
    ].join('\n'));
  });

  it('sem nenhum suspeito, diz isso', () => {
    expect(textoParaAnalistas(conferirRomaneio(GALPAO, MEIOS).suspeitos)).toBe('Romaneio conferido: nenhum pacote parece fora de rota.');
  });
});

describe('as gaiolas do romaneio', () => {
  it('vêm todas, em ordem de letra e número, para a tela saber se a gaiola digitada existe', () => {
    const c = conferirRomaneio([...pacotes('B-10', 'Bairro Alfa', 1), ...GALPAO, ...pacotes('A-3', 'Bairro Beta', 1)], MEIOS);
    expect(c.gaiolas).toEqual(['A-3', 'B-7', 'B-10', 'D-2']);
  });
});

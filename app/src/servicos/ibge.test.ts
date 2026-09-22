import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {montar} from '../../../ferramentas/cnefe.mjs';
import {lerTabela, procurar, procurarRua} from './ibge';

const CABECA = 'COD_UNICO_ENDERECO;COD_UF;COD_MUNICIPIO;COD_DISTRITO;COD_SUBDISTRITO;COD_SETOR;NUM_QUADRA;'
  + 'NUM_FACE;CEP;DSC_LOCALIDADE;NOM_TIPO_SEGLOGR;NOM_TITULO_SEGLOGR;NOM_SEGLOGR;NUM_ENDERECO;DSC_MODIFICADOR;'
  + 'NOM_COMP_ELEM1;VAL_COMP_ELEM1;NOM_COMP_ELEM2;VAL_COMP_ELEM2;NOM_COMP_ELEM3;VAL_COMP_ELEM3;NOM_COMP_ELEM4;'
  + 'VAL_COMP_ELEM4;NOM_COMP_ELEM5;VAL_COMP_ELEM5;LATITUDE;LONGITUDE;NV_GEO_COORD;COD_ESPECIE';

function linha(cep: string, rua: string, numero: number, lat: number, lng: number, comp = '', bairro = 'ARUANA') {
  const c = new Array(29).fill('');
  c[8] = cep; c[9] = bairro; c[10] = 'RUA'; c[12] = rua; c[13] = String(numero);
  if (comp) { c[15] = comp; c[16] = '101'; }
  c[25] = String(lat); c[26] = String(lng); c[27] = '1'; c[28] = '1';
  return c.join(';');
}
const csv = (linhas: string[]) => [CABECA, ...linhas].join('\n');
const tabelaDe = (linhas: string[]) => lerTabela(new Uint8Array(montar(csv(linhas)).arquivo));

describe('endereços do IBGE', () => {
  it('acha o número exato e devolve a coordenada', () => {
    const t = tabelaDe([
      linha('49000001', 'FRANCOIS HOALD', 100, -10.93, -37.07),
      linha('49000001', 'FRANCOIS HOALD', 200, -10.94, -37.08),
    ]);
    const a = procurar(t, '49000001', 200);
    expect(a).not.toBeNull();
    expect(a!.lat).toBeCloseTo(-10.94, 5);
    expect(a!.lng).toBeCloseTo(-37.08, 5);
    expect(a!.salto).toBe(0);
    expect(a!.rua).toBe('RUA FRANCOIS HOALD');
  });

  it('cai no vizinho quando o número não existe, e diz o quanto pulou', () => {
    const t = tabelaDe([
      linha('49000001', 'FRANCOIS HOALD', 100, -10.93, -37.07),
      linha('49000001', 'FRANCOIS HOALD', 110, -10.94, -37.08),
    ]);
    const a = procurar(t, '49000001', 108);
    expect(a!.numero).toBe(110);
    expect(a!.salto).toBe(2);
  });

  it('recusa o vizinho longe demais em vez de dar resposta ruim', () => {
    const t = tabelaDe([linha('49000001', 'FRANCOIS HOALD', 100, -10.93, -37.07)]);
    expect(procurar(t, '49000001', 130)).toBeNull();
    expect(procurar(t, '49000001', 118)).not.toBeNull();
  });

  it('não confunde CEPs vizinhos', () => {
    const t = tabelaDe([
      linha('49000001', 'RUA A', 100, -10.93, -37.07),
      linha('49000002', 'RUA B', 100, -10.95, -37.09),
    ]);
    expect(procurar(t, '49000002', 100)!.lat).toBeCloseTo(-10.95, 5);
    expect(procurar(t, '49000009', 100)).toBeNull();
  });

  it('marca prédio quando o endereço tem apartamentos', () => {
    const t = tabelaDe([
      linha('49000001', 'RUA A', 10, -10.93, -37.07, 'APARTAMENTO'),
      linha('49000001', 'RUA A', 10, -10.93, -37.07, 'APARTAMENTO'),
      linha('49000001', 'RUA A', 10, -10.93, -37.07, 'APARTAMENTO'),
      linha('49000001', 'RUA A', 20, -10.94, -37.08),
    ]);
    expect(procurar(t, '49000001', 10)!.predio).toBe(true);
    expect(procurar(t, '49000001', 20)!.predio).toBe(false);
  });

  it('guarda a coordenada sem perder precisão de rua', () => {
    const t = tabelaDe([linha('49000001', 'RUA A', 10, -10.9358241, -37.0668582)]);
    const a = procurar(t, '49000001', 10)!;
    expect(Math.abs(a.lat - -10.9358241)).toBeLessThan(1e-6);
    expect(Math.abs(a.lng - -37.0668582)).toBeLessThan(1e-6);
  });

  it('lê o arquivo de verdade que vai junto no app', () => {
    const bruto = new Uint8Array(readFileSync('app/public/aracaju-v1.bin'));
    const t = lerTabela(bruto);
    expect(t.cidade).toBe('aracaju');
    expect(t.ceps.length).toBeGreaterThan(100000);
    // os CEPs têm que estar em ordem, senão a busca binária mente
    let foraDeOrdem = 0;
    for (let i = 1; i < t.ceps.length; i++) if (t.ceps[i] < t.ceps[i - 1]) foraDeOrdem++;
    expect(foraDeOrdem).toBe(0);
    // um endereço real de Aracaju cai dentro da cidade
    const a = procurar(t, '49097710', 170);
    expect(a).not.toBeNull();
    expect(a!.lat).toBeGreaterThan(-11.2);
    expect(a!.lat).toBeLessThan(-10.8);
    expect(a!.lng).toBeGreaterThan(-37.3);
    expect(a!.lng).toBeLessThan(-36.9);
  });
});

describe('mesma rua em vários bairros, sem CEP', () => {
  // "Rua Vinte e Cinco" existe em quatro bairros de Aracaju. Sem CEP, o que separa
  // uma da outra é o número da porta e a distância das outras entregas do dia.
  const t = () => tabelaDe([
    linha('49096150', 'VINTE E CINCO', 5, -10.9452, -37.0827, '', 'JABOTIANA'),
    linha('49096150', 'VINTE E CINCO', 35, -10.9451, -37.0827, '', 'JABOTIANA'),
    linha('49043763', 'VINTE E CINCO', 30, -10.9872, -37.1020, '', 'SANTA MARIA'),
    linha('49043763', 'VINTE E CINCO', 579, -10.9880, -37.1030, '', 'SANTA MARIA'),
  ]);

  it('escolhe o bairro onde a rota está', () => {
    const a = procurarRua(t(), 'Rua Vinte e Cinco', 34, {lat: -10.952, lng: -37.090});
    expect(a).not.toBeNull();
    expect(a!.bairro).toBe('JABOTIANA');
    expect(a!.numero).toBe(35);
    expect(a!.salto).toBe(1);
  });

  it('o bairro dito na planilha vale mais que a distância', () => {
    const a = procurarRua(t(), 'Rua Vinte e Cinco', 34, {lat: -10.945, lng: -37.082}, 'Santa Maria');
    expect(a!.bairro).toBe('SANTA MARIA');
    expect(a!.numero).toBe(30);
  });

  it('quando o número cabe nos dois, sem bairro e sem referência não chuta', () => {
    expect(procurarRua(t(), 'Rua Vinte e Cinco', 34, null)).toBeNull();
  });

  it('diz em quantos bairros o nome se repete, que é o que justifica consultar o censo', () => {
    expect(procurarRua(t(), 'Rua Vinte e Cinco', 34, {lat: -10.952, lng: -37.090})!.bairros).toBe(2);
    const uma = tabelaDe([linha('49096150', 'VINTE E CINCO', 35, -10.9451, -37.0827, '', 'JABOTIANA')]);
    const so = procurarRua(uma, 'Rua Vinte e Cinco', 34, null)!;
    expect(so.bairro).toBe('JABOTIANA');
    expect(so.bairros).toBe(1);
  });

  it('número que não existe em trecho nenhum não vira resposta', () => {
    expect(procurarRua(t(), 'Rua Vinte e Cinco', 9000, {lat: -10.952, lng: -37.090})).toBeNull();
  });

  it('rua que não está no censo não vira resposta', () => {
    expect(procurarRua(t(), 'Rua Que Nao Existe', 34, {lat: -10.952, lng: -37.090})).toBeNull();
  });
});

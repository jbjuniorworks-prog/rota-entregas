import {readFileSync, readdirSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {montar} from '../../../ferramentas/cnefe.mjs';
import {acharAncoraDoBairro, apelidoDaCidade, candidatoDaRua, candidatoSemCep, corrigirLinhaLida, lerTabela, portaNoBairro, procurar, procurarRua, ruaNoCenso} from './ibge';
import {chaveRua, juntarQuadros} from '../logica/texto';

const CABECA = 'COD_UNICO_ENDERECO;COD_UF;COD_MUNICIPIO;COD_DISTRITO;COD_SUBDISTRITO;COD_SETOR;NUM_QUADRA;'
  + 'NUM_FACE;CEP;DSC_LOCALIDADE;NOM_TIPO_SEGLOGR;NOM_TITULO_SEGLOGR;NOM_SEGLOGR;NUM_ENDERECO;DSC_MODIFICADOR;'
  + 'NOM_COMP_ELEM1;VAL_COMP_ELEM1;NOM_COMP_ELEM2;VAL_COMP_ELEM2;NOM_COMP_ELEM3;VAL_COMP_ELEM3;NOM_COMP_ELEM4;'
  + 'VAL_COMP_ELEM4;NOM_COMP_ELEM5;VAL_COMP_ELEM5;LATITUDE;LONGITUDE;NV_GEO_COORD;COD_ESPECIE';

function linha(cep: string, rua: string, numero: number, lat: number, lng: number, comp = '', bairro = 'ARUANA', tipo = 'RUA') {
  const c = new Array(29).fill('');
  c[8] = cep; c[9] = bairro; c[10] = tipo; c[12] = rua; c[13] = String(numero);
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

  // Todos os testes acima perguntam do jeito que o censo escreve. A planilha do Mercado Livre
  // escreve "Rua 25", e era esse o jeito que nunca tinha sido testado.
  it('a planilha escreve com algarismo e o censo por extenso: é a mesma rua', () => {
    const porExtenso = procurarRua(t(), 'Rua Vinte e Cinco', 34, {lat: -10.952, lng: -37.090});
    const comAlgarismo = procurarRua(t(), 'Rua 25', 34, {lat: -10.952, lng: -37.090});
    expect(comAlgarismo).toEqual(porExtenso);
    expect(comAlgarismo!.bairro).toBe('JABOTIANA');
  });
});

// Medido na gravação de 26/09 (58 paradas do Mercado Livre, Jardins e Grageru).
describe('o tipo da via escrito diferente do censo', () => {
  // O Meli manda "Rua Antônio de Pádua Araújo"; o IBGE tem "Alameda Antônio de Pádua Araújo",
  // com as quatro portas da entrega. Recusar pelo tipo deixava as quatro sem pino nenhum —
  // o OpenStreetMap também não tem essa via.
  const alameda = () => tabelaDe([
    linha('49027050', 'ANTONIO DE PADUA ARAUJO', 100, -10.9440, -37.0640, '', 'GRAGERU', 'ALAMEDA'),
    linha('49027050', 'ANTONIO DE PADUA ARAUJO', 200, -10.9442, -37.0642, '', 'GRAGERU', 'ALAMEDA'),
    linha('49027050', 'ANTONIO DE PADUA ARAUJO', 300, -10.9444, -37.0644, '', 'GRAGERU', 'ALAMEDA'),
  ]);

  it('acha a porta quando o censo só conhece o nome com um tipo só', () => {
    const a = procurarRua(alameda(), 'Rua Antônio de Pádua Araújo', 200, null);
    expect(a).not.toBeNull();
    expect(a!.numero).toBe(200);
    expect(a!.salto).toBe(0);
    expect(a!.rua).toBe('ALAMEDA ANTONIO DE PADUA ARAUJO');
  });

  it('mas continua sem chutar quando o tipo é o que separa duas vias de mesmo nome', () => {
    const duas = tabelaDe([
      linha('49000001', 'PRINCIPAL', 100, -10.93, -37.07, '', 'ARUANA', 'RUA'),
      linha('49000002', 'PRINCIPAL', 100, -10.99, -37.11, '', 'SANTA MARIA', 'AVENIDA'),
    ]);
    // pedindo uma terceira: existem duas com esse nome e tipos diferentes, não dá para escolher
    expect(procurarRua(duas, 'Travessa Principal', 100, {lat: -10.93, lng: -37.07})).toBeNull();
    // e pedindo pelo tipo certo, continua indo na certa
    expect(procurarRua(duas, 'Avenida Principal', 100, null)!.bairro).toBe('SANTA MARIA');
  });
});

describe('rua de um bairro só: a porta do censo vale mais que o meio da rua', () => {
  const um = (salto = 0) => ({
    lat: -10.944, lng: -37.064, bairro: 'GRAGERU', rua: 'RUA LUCIO MOTA', numero: 100 + salto,
    predio: false, salto, bairros: 1,
  });

  it('com o número exato, responde — é porta medida pelo recenseador', () => {
    const c = candidatoDaRua(um(0), 100);
    expect(c).not.toBeNull();
    expect(c!.precisao).toBe('bom');
    expect(c!.fonte).toBe('IBGE');
  });

  it('sem o número exato, não responde: aí o pino da nossa base de ruas serve igual', () => {
    expect(candidatoDaRua(um(6), 100)).toBeNull();
  });

  it('em vários bairros continua respondendo mesmo aproximando o número', () => {
    expect(candidatoDaRua({...um(6), bairros: 3}, 100)!.precisao).toBe('rua');
  });
});

// 11/10: "Avenida Augusto Franco 4141", cartão bloqueado do Meli, sem CEP nem bairro. O censo para
// no 4120, a 21 números, e o pino foi para o meio da avenida, a 900 m. Nomes inventados.
describe('sem CEP, a avenida de vários bairros aceita a porta do censo mais longe no número', () => {
  const t = () => tabelaDe([
    linha('49000201', 'AUGUSTO INVENTADO', 500, -10.9100, -37.0600, '', 'CENTRO TESTE', 'AVENIDA'),
    linha('49000202', 'AUGUSTO INVENTADO', 2500, -10.9300, -37.0700, '', 'BAIRRO MEIO TESTE', 'AVENIDA'),
    linha('49000203', 'AUGUSTO INVENTADO', 4101, -10.9417, -37.0773, '', 'PONTA TESTE', 'AVENIDA'),
    linha('49000203', 'AUGUSTO INVENTADO', 4120, -10.9404, -37.0775, '', 'PONTA TESTE', 'AVENIDA'),
    linha('49000204', 'F', 10, -10.9500, -37.0500, '', 'CENTRO TESTE'),
    linha('49000205', 'F', 10, -10.9600, -37.0400, '', 'PONTA TESTE'),
    linha('49000206', 'RUA SO DE UM BAIRRO TESTE', 10, -10.9700, -37.0300, '', 'PONTA TESTE'),
  ]);
  const meioDaRota = {lat: -10.9300, lng: -37.0700};
  it('a 21 números da última porta, vai para ela, e diz que o número é aproximado', () => {
    expect(procurarRua(t(), 'Avenida Augusto Inventado', 4141, meioDaRota)).toBeNull();
    const c = candidatoSemCep(t(), 'Avenida Augusto Inventado', 4141, meioDaRota)!;
    expect(c).toMatchObject({lat: -10.9404, lng: -37.0775, precisao: 'rua', fonte: 'IBGE'});
    expect(c.exibido).toContain('nº 4120');
    expect(candidatoSemCep(t(), 'Avenida Augusto Inventado', 4200, meioDaRota)).toMatchObject({lat: -10.9404});
  });
  it('a mais de 100 números, o nome genérico e a rua de um bairro só continuam sem resposta do censo', () => {
    expect(candidatoSemCep(t(), 'Avenida Augusto Inventado', 4300, meioDaRota)).toBeNull();
    expect(candidatoSemCep(t(), 'Rua F', 40, meioDaRota)).toBeNull();
    expect(candidatoSemCep(t(), 'Rua So de Um Bairro Teste', 40, meioDaRota)).toBeNull();
  });
});

// A entrega que falhou na rua, contra o censo de verdade que vai junto no app.
describe('a Rua 25 da Jabotiana, no arquivo que o app leva', () => {
  const perto = {lat: -10.952, lng: -37.090};
  const censo = () => lerTabela(new Uint8Array(readFileSync('app/public/aracaju-v1.bin')));

  it('os dois jeitos de escrever caem na mesma porta', () => {
    const t = censo();
    const comAlgarismo = procurarRua(t, 'Rua 25', 34, perto, 'Jabotiana')!;
    const porExtenso = procurarRua(t, 'Rua Vinte e Cinco', 34, perto, 'Jabotiana')!;
    expect(comAlgarismo).not.toBeNull();
    expect(comAlgarismo.bairro).toBe('JABOTIANA');
    expect(comAlgarismo.numero).toBe(34);
    expect(comAlgarismo.salto).toBe(0);
    expect(porExtenso.lat).toBeCloseTo(comAlgarismo.lat, 6);
    expect(porExtenso.lng).toBeCloseTo(comAlgarismo.lng, 6);
  });

  it('o censo guarda os dois jeitos como nomes diferentes, e a chave junta eles', () => {
    const nomes = censo().ruas.filter(n => chaveRua(n) === '25');
    expect(nomes).toContain('RUA 25');
    expect(nomes).toContain('RUA VINTE E CINCO');
    // e continua separando o que é de verdade outra rua
    expect(chaveRua('Rua 25')).not.toBe(chaveRua('Rua 24'));
  });

  // `testes/e2e/regiao.spec.ts` só testa o que ele testa enquanto o censo ficar calado nessa rua:
  // se ela entrar no arquivo, o censo responde primeiro e aqueles cinco testes viram enfeite.
  // Falhar aqui é o aviso para trocar a rua de lá, não para afrouxar isto.
  it('a rua que o regiao.spec.ts usa continua fora do censo', () => {
    const chaves = new Set(censo().ruas.map(n => chaveRua(n)));
    expect(chaves.has(chaveRua('Rua Construtora Cunha'))).toBe(false);
  });
});

describe('âncora do bairro (piso de sanidade)', () => {
  const t = () => tabelaDe([
    linha('49096150', 'VINTE E CINCO', 5, -10.9450, -37.0827, '', 'JABOTIANA'),
    linha('49096150', 'VINTE E CINCO', 35, -10.9460, -37.0837, '', 'JABOTIANA'),
    linha('49096160', 'OUTRA', 10, -10.9470, -37.0847, '', 'JABOTIANA'),
    linha('49070830', 'PRINCIPAL', 20, -10.8901, -37.0743, '', 'CIDADE NOVA'),
    linha('49000100', 'A', 10, -10.9100, -37.0500, '', 'DEZESSETE DE MARCO'),
  ]);

  it('acha o bairro e devolve um ponto dentro dele', () => {
    const a = acharAncoraDoBairro(t(), 'Jabotiana')!;
    expect(a.nome).toBe('JABOTIANA');
    expect(a.lat).toBeCloseTo(-10.946, 2);
  });

  it('lê o bairro sujo que vem na planilha', () => {
    expect(acharAncoraDoBairro(t(), 'Jabotiana - Cond Vila Verde')!.nome).toBe('JABOTIANA');
    expect(acharAncoraDoBairro(t(), 'Cidade Nova Bl 04 Ap 403')!.nome).toBe('CIDADE NOVA');
  });

  it('casa o bairro escrito com algarismo com o do censo por extenso', () => {
    expect(acharAncoraDoBairro(t(), '17 de Março')!.nome).toBe('DEZESSETE DE MARCO');
  });

  it('bairro que não é da cidade não vira âncora', () => {
    expect(acharAncoraDoBairro(t(), 'Boa Viagem')).toBeNull();
  });
});

// A Zona de Expansão fica de 10 a 18 km do centro e é a parte da cidade que ninguém tinha
// conferido. O censo cobre: 5.716 endereços nos seis bairros de lá. Isto é para saber na hora
// se uma reconstrução do arquivo (npm run cnefe) deixar essa ponta de fora — do jeito que o
// app funciona, a falta não aparece como erro, aparece como entrega caindo no centro do bairro.
describe('a Zona de Expansão está no arquivo', () => {
  const censo = () => lerTabela(new Uint8Array(readFileSync('app/public/aracaju-v1.bin')));
  const DE_LA = ['SAO JOSE DOS NAUFRAGOS', 'MOSQUEIRO', 'AREIA BRANCA', 'ROBALO', 'MATAPOA', 'GAMELEIRA'];

  it('cada bairro de lá tem endereços e uma âncora dentro de Aracaju', () => {
    const t = censo();
    const quantos = new Map<number, number>();
    for (const i of t.iBairro) quantos.set(i, (quantos.get(i) || 0) + 1);
    for (const nome of DE_LA) {
      const i = t.bairros.indexOf(nome);
      expect(i, `${nome} sumiu do censo`).toBeGreaterThanOrEqual(0);
      expect(quantos.get(i) || 0, `${nome} com endereços de menos`).toBeGreaterThan(200);
      const a = acharAncoraDoBairro(t, nome)!;
      expect(a, `${nome} sem âncora`).not.toBeNull();
      expect(a.lat).toBeGreaterThan(-11.2);
      expect(a.lat).toBeLessThan(-10.8);
      expect(a.lng).toBeGreaterThan(-37.3);
      expect(a.lng).toBeLessThan(-36.9);
    }
  });

  it('o bairro do jeito que a planilha escreve chega no do censo', () => {
    const t = censo();
    expect(acharAncoraDoBairro(t, 'Zona de Expansão (Robalo)')!.nome).toBe('ROBALO');
    expect(acharAncoraDoBairro(t, 'São José dos Náufragos/Robalo')!.nome).toBe('SAO JOSE DOS NAUFRAGOS');
    expect(acharAncoraDoBairro(t, 'Mosqueiro')!.nome).toBe('MOSQUEIRO');
  });
});

describe('um arquivo de censo por cidade', () => {
  it('o apelido da cidade é o nome do arquivo, e aguenta o campo sujo', () => {
    expect(apelidoDaCidade('Aracaju')).toBe('aracaju');
    expect(apelidoDaCidade('Aracaju, SE')).toBe('aracaju');
    expect(apelidoDaCidade('Nossa Senhora do Socorro')).toBe('nossa-senhora-do-socorro');
    expect(apelidoDaCidade('São Cristóvão')).toBe('sao-cristovao');
    expect(apelidoDaCidade('Barra dos Coqueiros')).toBe('barra-dos-coqueiros');
  });

  it('todo arquivo que vai junto no app abre, diz a sua cidade e está em Sergipe', () => {
    const arquivos = readdirSync('app/public').filter(n => n.endsWith('-v1.bin'));
    expect(arquivos.length).toBeGreaterThanOrEqual(4);
    for (const nome of arquivos) {
      const t = lerTabela(new Uint8Array(readFileSync('app/public/' + nome)));
      // o nome do arquivo tem que ser o apelido da cidade que está dentro dele
      expect(nome).toBe(apelidoDaCidade(t.cidade) + '-v1.bin');
      expect(t.ceps.length).toBeGreaterThan(1000);
      // os CEPs têm que estar em ordem, senão a busca binária mente
      let foraDeOrdem = 0;
      for (let i = 1; i < t.ceps.length; i++) if (t.ceps[i] < t.ceps[i - 1]) foraDeOrdem++;
      expect(foraDeOrdem, nome).toBe(0);
      for (let i = 0; i < t.lats.length; i += 97) {
        expect(t.lats[i] / 1e6, nome).toBeGreaterThan(-11.6);
        expect(t.lats[i] / 1e6, nome).toBeLessThan(-9.5);
        expect(t.lngs[i] / 1e6, nome).toBeGreaterThan(-38.3);
        expect(t.lngs[i] / 1e6, nome).toBeLessThan(-36.3);
      }
    }
  });
});

// "Rua M" existe em dez bairros de Aracaju: o bairro escrito diz qual, e só com o número exato
describe('a rua do complemento no bairro escrito', () => {
  const t = () => tabelaDe([
    linha('49000301', 'M', 24, -11.0022, -37.0939, '', 'ARUANA'),
    linha('49000302', 'M', 24, -10.9851, -37.0950, '', 'SANTA MARIA'),
    linha('49000302', 'M', 30, -10.9853, -37.0951, '', 'SANTA MARIA'),
    linha('49000302', 'M', 300, -10.9870, -37.0960, '', 'SANTA MARIA'),
    linha('49000303', 'K', 5, -10.9452, -37.0827, '', 'JABOTIANA'),
  ]);
  it('acha a porta com o número exato no bairro escrito', () => {
    expect(portaNoBairro(t(), 'Rua M', 24, 'Santa Maria')).toMatchObject({lat: -10.9851, lng: -37.095, rua: 'Rua M', bairro: 'Santa Maria', fonte: 'IBGE'});
  });
  it('sem o número exato, ou em bairro que não tem a rua, não responde', () => {
    expect(portaNoBairro(t(), 'Rua M', 26, 'Santa Maria')).toBeNull();
    expect(portaNoBairro(t(), 'Rua M', 24, 'Jabotiana')).toBeNull();
    // o 300 só cabe na Rua M de Santa Maria: escrito Jabotiana, não é ela
    expect(portaNoBairro(t(), 'Rua M', 300, 'Jabotiana')).toBeNull();
    expect(portaNoBairro(t(), 'Rua M', 24, 'Bairro Que Nao Existe')).toBeNull();
    expect(portaNoBairro(t(), 'Rua M', 24, '')).toBeNull();
  });
  it('diz se a rua do endereço existe no censo', () => {
    expect(ruaNoCenso(t(), 'Rua M')).toBe(true);
    expect(ruaNoCenso(t(), 'Recanto das Mangueiras')).toBe(false);
  });
});

// Gravação de 11/10: "Toncrefi) Neves" num quadro e "Tancredo Neves" nos outros viravam duas
// paradas, e a torta ficava sem posição. Nomes inventados.
describe('o nome da rua lido torto, pelo censo', () => {
  const t = () => tabelaDe([
    linha('49000010', 'PRESIDENTE TANCREDO INVENTADO', 3515, -10.9440, -37.0640, '', 'PONTO NOVO', 'AVENIDA'),
    linha('49000010', 'PRESIDENTE TANCREDO INVENTADO', 3790, -10.9460, -37.0660, '', 'PONTO NOVO', 'AVENIDA'),
    linha('49000011', 'CAPITAO INVENTADO MACHADO', 16, -10.9300, -37.0600, '', 'PONTO NOVO'),
    linha('49000012', 'JOSE INVENTADO SILVA', 40, -10.9200, -37.0500),
    linha('49000016', 'JOSE INVENTADO SILVO', 40, -10.9210, -37.0510),
    linha('49000013', 'PROJETADA 13 INVENTADA', 50, -10.9100, -37.0400),
    linha('49000014', 'MARIA INVENTADA', 60, -10.9000, -37.0300),
    linha('49000015', 'MARIO INVENTADO', 60, -10.9010, -37.0310),
  ]);
  it('troca pelo nome do censo, mantendo o resto da linha', () => {
    expect(corrigirLinhaLida(t(), 'Avenida Presidente Toncrefi) Inventado 3515')).toBe('Avenida Presidente Tancredo Inventado 3515');
    expect(corrigirLinhaLida(t(), '#24 Rua Capitão Inventado Vochoo af) 16, CEP 49000011 · 1 unid'))
      .toBe('#24 Rua Capitao Inventado Machado 16, CEP 49000011 · 1 unid');
  });
  it('a leitura torta e a certa, em quadros diferentes, viram uma parada', () => {
    const quadros = [['Avenida Presidente Toncrefi) Inventado 3515'], ['Avenida Presidente Tancredo Inventado 3515'], ['Avenida Presidente Tancredo Inventado 3515']];
    expect(juntarQuadros(quadros)).toHaveLength(2);
    expect(juntarQuadros(quadros.map(q => q.map(l => corrigirLinhaLida(t(), l))))).toEqual(['Avenida Presidente Tancredo Inventado 3515']);
  });
  it('sem a porta com esse número, com outro CEP, empatada, com outros algarismos, longe demais ou já certa, fica como veio', () => {
    for (const l of [
      'Avenida Presidente Toncrefi) Inventado 3516',
      'Avenida Presidente Toncrefi) Inventado 3515, CEP 49000099',
      'Rua Jose Inventado Silvu 40',
      'Rua Mariu Inventadu 60',
      'Rua Projetada 12 Inventadx 50',
      'Avenida Tancredo Kwyzpq 3515',
      'Avenida Presidente Tancredo Inventado 3790',
      'Rua Desconhecida Daqui Mesmo 3515',
    ]) expect(corrigirLinhaLida(t(), l)).toBe(l);
  });
});

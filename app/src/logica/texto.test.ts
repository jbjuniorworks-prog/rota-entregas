import {analisarLinha, chaveEndereco, conjuntoDoEndereco, semTipoDeArea, chaveLugar, decompor, extrairEnderecos, juntarLeituras, juntarQuadros, mesmaRua, mesmoEndereco, normal, ruaCompleta} from './texto';

describe('decompor', () => {
  it.each([
    ['Rua Honduras, 417, América, CEP 49080-320', {rua: 'Rua Honduras', numero: '417', cep: '49080320'}],
    ['Avenida Dulce Diniz 920, Condomínio Luzia', {rua: 'Avenida Dulce Diniz', numero: '920', cep: null}],
    ['R Francisco Rabelo leite Neto, N.820, Cond. Brisa marina', {rua: 'R Francisco Rabelo leite Neto', numero: '820', cep: null}],
    ['Travessa Armando Sales, 15, Loja 01, Ponto Novo, 49097070', {rua: 'Travessa Armando Sales', numero: '15', cep: '49097070'}],
  ])('%s', (txt, esperado) => {
    expect(decompor(txt)).toMatchObject(esperado);
  });
});

describe('analisarLinha', () => {
  it('separa o número do app, as unidades e o horário comercial', () => {
    expect(analisarLinha('18 Avenida Dulce Diniz 920 · 2 unid · comercial')).toEqual({ml: '18', texto: 'Avenida Dulce Diniz 920', unidades: 2, comercial: true});
  });
});

describe('chaveEndereco', () => {
  it('apartamentos diferentes do mesmo prédio são endereços diferentes', () => {
    expect(chaveEndereco('Rua dos Ipês, 300, Bloco A ap 101')).not.toBe(chaveEndereco('Rua dos Ipês, 300, Bloco B ap 202'));
  });
  it('a mesma entrega escrita igual gera a mesma chave', () => {
    expect(chaveEndereco('Rua Maruim, 94, Centro, CEP 49010-160')).toBe(chaveEndereco('Rua Maruim, 94, Centro, CEP 49010-160'));
  });
  it('mesmoEndereco ignora o complemento', () => {
    expect(mesmoEndereco(['Rua dos Ipês, 300, Bloco A ap 101', 'Rua dos Ipês, 300, Bloco B ap 202'])).toBe(true);
    expect(mesmoEndereco(['Rua dos Ipês, 300', 'Rua dos Ipês, 302'])).toBe(false);
  });
});

describe('chaveLugar (memória de posições)', () => {
  it('com CEP de rua, usa CEP + número', () => {
    expect(chaveLugar('Rua D, 100, CEP 49043-861', '', 'Aracaju')).toBe('49043861|100');
  });
  it('mesma rua em bairros diferentes não divide a posição', () => {
    const a = chaveLugar('Rua Bahia, 100', 'Santa Maria', 'Aracaju');
    const b = chaveLugar('Rua Bahia, 100', 'Dom Luciano', 'Aracaju');
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });
  it('Rua e Avenida de mesmo nome não colidem, e abreviação vira o nome inteiro', () => {
    expect(chaveLugar('Avenida Bahia, 100', 'Centro', 'Aracaju')).not.toBe(chaveLugar('Rua Bahia, 100', 'Centro', 'Aracaju'));
    expect(chaveLugar('R Bahia, 100', 'Centro', 'Aracaju')).toBe(chaveLugar('Rua Bahia, 100', 'Centro', 'Aracaju'));
    expect(chaveLugar('Rua Dr. Silva, 10', 'Centro', 'Aracaju')).not.toBe(chaveLugar('Rua Silva, 10', 'Centro', 'Aracaju'));
  });
  it('rua de uma letra é guardada quando há bairro', () => {
    expect(chaveLugar('Rua D, 100', 'Santa Maria', 'Aracaju')).toBe('r|rua d|100|santa maria|aracaju');
  });
  it('CEP genérico da cidade não serve de chave sozinho', () => {
    expect(chaveLugar('Rua D, 100, CEP 49000-000', 'Santa Maria', 'Aracaju')).toBe('r|rua d|100|santa maria|aracaju');
  });
  it('sem CEP bom e sem bairro, não guarda', () => {
    expect(chaveLugar('Rua D, 100', '', 'Aracaju')).toBeNull();
    expect(chaveLugar('Rua Bahia, 100, Centro, Santa Maria', '', 'Aracaju')).toBeNull();
  });
  it('sem número, não guarda', () => {
    expect(chaveLugar('Rua D, Santa Maria', 'Santa Maria', 'Aracaju')).toBeNull();
  });
});

describe('extrairEnderecos (texto de print ou PDF)', () => {
  it('junta a linha do número do app e o complemento', () => {
    expect(extrairEnderecos('18\nAvenida Dulce Diniz 920\nCondomínio Luzia Residence\nCEP 49048430')).toEqual(['18 Avenida Dulce Diniz 920, Condomínio Luzia Residence, CEP 49048430']);
  });
  it('não descarta rua de uma letra nem logradouro abreviado "R "', () => {
    expect(extrairEnderecos('Rua B, 120\nBairro Santa Maria')).toEqual(['Rua B, 120, Bairro Santa Maria']);
    expect(extrairEnderecos('7\nRua D 49\nCEP 49044-190')).toEqual(['7 Rua D 49, CEP 49044-190']);
    expect(extrairEnderecos('R Laranjeiras 100')).toEqual(['R Laranjeiras 100']);
    expect(extrairEnderecos('12 R. Itabaiana, 45')).toEqual(['12 R. Itabaiana, 45']);
  });
  it('lista do Mercado Livre (Envios Extras): rua em 2 linhas, ícone no meio e número pela etiqueta', () => {
    const ocr = [
      '13:30h a 17:40h',
      'L40 | Avenida das Mangueiras 2850',
      'Ss',
      'Condomínio Jardim Teste |,',
      'CEP 49000100',
      'Entrega 2 unidades | ETIQUETA',
      '4EB-40...',
      'v Estou chegando',
      '1.43 Avenida das Mangueiras 3434',
      'Condomínio Condominio',
      'Residencial Padre Teste, CEP',
      'Entrega 1 unidade | ETIQUETA',
      'HEB-43...',
      'Paradas finalizadas v',
      'E? Avenida Doutor Fulano de',
      'Tal Souza 160',
      '[2 Rua Beltrano Martins',
      'Fontes 200',
      '= Avenida Conselheiro Sicrano',
      'Moreira Filho 2151 &',
      'Condomínio Pátio Teste, CEP 49000200',
      'Com portaria 24 h.',
      'Entrega 1 unidade | ETIQUETA',
      'HAHEB-5 1...',
      'O = O =',
      'Início Disponíveis — Agendados Mais',
    ].join('\n');
    expect(extrairEnderecos(ocr)).toEqual([
      '40 Avenida das Mangueiras 2850, Condomínio Jardim Teste, CEP 49000100 · 2 unid',
      '43 Avenida das Mangueiras 3434, Condomínio Condominio, Residencial Padre Teste, CEP · 1 unid',
      'Avenida Doutor Fulano de Tal Souza 160',
      '2 Rua Beltrano Martins Fontes 200',
      '5 Avenida Conselheiro Sicrano Moreira Filho 2151, Condomínio Pátio Teste, CEP 49000200 · 1 unid',
    ]);
  });
  it('juntando as leituras do mesmo print, o ícone lido como dígito a mais sai do número', () => {
    expect(juntarLeituras([
      '5 Avenida Conselheiro Sicrano 21518, Condomínio Pátio Teste, CEP 49000200 · 1 unid',
      'Avenida Conselheiro Sicrano 2151',
      '63 Avenida das Mangueiras 3580',
      'Avenida das Mangueiras 3580',
      'Rua Um 12',
      'Rua Dois 125',
    ])).toEqual([
      '5 Avenida Conselheiro Sicrano 2151, Condomínio Pátio Teste, CEP 49000200 · 1 unid',
      '63 Avenida das Mangueiras 3580',
      'Rua Um 12',
      'Rua Dois 125',
    ]);
    expect(analisarLinha('1.63 Avenida das Mangueiras 3580').ml).toBe('63');
  });
  it('a leitura de apoio só corrige número; endereço que só ela viu entra apenas se as outras não acharam nada', () => {
    const principais = ['5 Avenida Conselheiro Sicrano 21518, CEP 49000200', 'Rua Beltrano Fontes 190'];
    const apoio = ['Avenida Conselheiro Sicrano 2151', 'Rua Beltrano Fontesl) 190', 'Rua Fulana Barbosa 8'];
    expect(juntarLeituras(principais, apoio)).toEqual(['5 Avenida Conselheiro Sicrano 2151, CEP 49000200', 'Rua Beltrano Fontes 190']);
    expect(juntarLeituras([], apoio)).toEqual(apoio);
  });
  it('entre quadros do vídeo: junta o mesmo endereço e descarta o número cortado na borda', () => {
    expect(juntarQuadros([
      ['Avenida Santos Teste 230', 'Avenida Santos Teste 2'],
      ['Avenida Santos Teste 230', '12 Rua Beltrano Fontes 200'],
      ['Rua Beltrano Fontes 200', 'Rua Dois 125'],
      ['Rua Dois 12'],
      ['Rua Dois 12'],
    ])).toEqual(['Avenida Santos Teste 230', '12 Rua Beltrano Fontes 200', 'Rua Dois 125', 'Rua Dois 12']);
  });
  it('o círculo do ✓ lido como "O" no meio do endereço sai', () => {
    expect(extrairEnderecos('Rua Beltrano Martins\nO Fontes 200\nAvenida Santos Teste O\n230')).toEqual(['Rua Beltrano Martins Fontes 200', 'Avenida Santos Teste 230']);
  });
  it('horário da janela de entrega não vira número da parada', () => {
    expect(extrairEnderecos('13:30h a 17:40h\nAvenida das Mangueiras 3580')).toEqual(['Avenida das Mangueiras 3580']);
  });
  it('continua ignorando ruído que começa parecido com rua', () => {
    expect(extrairEnderecos('R$ 12,00\nBR 101 km 5\nR 12\nRua x\nRua B')).toEqual([]);
    expect(analisarLinha('BR 101, 200')).toMatchObject({ml: null, texto: 'BR 101, 200'});
  });
});

describe('conjunto do endereço', () => {
  it('acha conjunto, loteamento e condomínio, no complemento ou no bairro', () => {
    expect(conjuntoDoEndereco('Rua B, 120, Conjunto Augusto Franco, CEP 49040-000')).toBe('Conjunto Augusto Franco');
    expect(conjuntoDoEndereco('Rua D, 49, Bloco 3 ap 201', 'Conjunto Orlando Dantas')).toBe('Conjunto Orlando Dantas');
    expect(conjuntoDoEndereco('Rua F, 10, Loteamento Aquário casa 2')).toBe('Loteamento Aquário');
    expect(conjuntoDoEndereco('Rua das Flores, 100, Centro')).toBe('');
  });
  it('compara conjunto ignorando a palavra conjunto/residencial', () => {
    expect(semTipoDeArea('Conjunto Augusto Franco')).toBe(semTipoDeArea('Augusto Franco'));
    expect(semTipoDeArea('Residencial Serigy')).toBe('serigy');
  });
});

describe('comparação de ruas', () => {
  it('ignora tipo, acento e palavras vazias', () => {
    expect(mesmaRua('Rua Jornalista João Batista de Santana', 'Rua Jornalista João Batista de SantAnna')).toBe(true);
    expect(mesmaRua('Rua Maruim', 'Rua Laranjeiras')).toBe(false);
    expect(mesmaRua('Av. Presidente Tancredo Neves', 'Avenida Tancredo Neves')).toBe(true);
  });
  it('nome mais curto que o pedido não vale: faltam palavras do endereço', () => {
    expect(mesmaRua('Rua Antônio Carlos Vasconcelos Lima', 'Rua Carlos Vasconcelos')).toBe(false);
    expect(mesmaRua('Rua Doutor Osório de Araújo Ramos', 'Rua Doutor Osório Ramos')).toBe(true);
    expect(mesmaRua('Avenida Santos Santana', 'Avenida Jornalista Santos Santana')).toBe(true);
  });
  it('normal e ruaCompleta', () => {
    expect(normal('  São   Cristóvão ')).toBe('sao cristovao');
    expect(ruaCompleta('Av. Beira-Mar')).toBe('avenida beira mar');
  });
});

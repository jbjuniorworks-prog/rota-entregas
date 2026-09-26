import {coordenadaNoTexto, semLink, chaveRua, chaveBairro, comNumeros, jeitosDeLerBairro, nomeDoLugar, analisarLinha, chaveEndereco, enderecoDaComanda, enderecosDaLista, juntarComandas, conjuntoDoEndereco, semTipoDeArea, chaveLugar, decompor, extrairEnderecos, juntarLeituras, juntarQuadros, mesmaRua, mesmoEndereco, mesmoLugarNomeado, normal, pistasDeLugar, ruaCompleta} from './texto';

describe('mesmo condomínio, endereços diferentes', () => {
  const p = (texto: string, bairro = 'Jardins') => ({texto, bairro});

  it('junta o mesmo prédio escrito de três jeitos, em ruas diferentes', () => {
    expect(mesmoLugarNomeado(
      p('Avenida das Flores, 1500, Ed Villa Sorrento a'),
      p('Rua do Poeta, 1500, Apt 704 edificio Villa Sorento'),
    )).toBe(true);
    expect(mesmoLugarNomeado(
      p('Avenida das Flores, 1500, Ed Villa Sorrento a'),
      p('Rua do Poeta, 16, Apt 103-Villa Sorrentto (fundo)'),
    )).toBe(true);
  });

  it('um nome comprido sozinho basta', () => {
    expect(mesmoLugarNomeado(p('Rua A, 700, Ed Itacimirim 101'), p('Rua A, 700, bloco itacimirim 304'))).toBe(true);
  });

  it('não junta prédio vizinho, nem referência a ponto conhecido', () => {
    expect(mesmoLugarNomeado(p('Rua A, 475, Apto 1302 cond. Alto Belo'), p('Rua B, 300, algarve residence apto 604'))).toBe(false);
    expect(mesmoLugarNomeado(p('Rua A, 89, Pousada Raio de Sol'), p('Rua A, 263, Casa 1 (perto pousada vila aju)'))).toBe(false);
    expect(mesmoLugarNomeado(p('Rua A, 10, Residencial das Palmeiras'), p('Rua B, 20, Residencial dos Ipês'))).toBe(false);
  });

  it('bloco I e bloco II do mesmo conjunto são lugares diferentes', () => {
    expect(mesmoLugarNomeado(p('Rua F, 60, Rua f franco freire 1'), p('Rua E, 23, Franco Freire I'))).toBe(true);
    expect(mesmoLugarNomeado(p('Rua E, 23, Franco Freire I'), p('Rua E, 264, Residencial Franco Freire 2'))).toBe(false);
  });

  it('nome de comércio usado como referência não junta', () => {
    expect(mesmoLugarNomeado(p('Rua A, 741, Mercearia Kibarato'), p('Rua A, 105, perto Mercearia ki barato'))).toBe(false);
  });

  it('instrução de horário não é nome de lugar', () => {
    expect(mesmoLugarNomeado(p('Rua A, 91, Comercio / segunda a sexta'), p('Rua B, 731, Entrega no hr comerci 8 a 18h'))).toBe(false);
  });

  it('tira do complemento o nome que vale guardar, e ignora o que não é nome', () => {
    expect(nomeDoLugar('Avenida das Flores, 1500, Ed Villa Sorrento apto 101, Jardins', 'Jardins'))
      .toEqual({chave: 'sorrento villa', nome: 'Ed Villa Sorrento'});
    expect(nomeDoLugar('Rua A, 700, Ed Itacimirim 101', 'Atalaia')).toMatchObject({chave: 'itacimirim'});
    expect(nomeDoLugar('Rua A, 10, Apto 101, Atalaia', 'Atalaia')).toBeNull();
    expect(nomeDoLugar('Rua A, 91, Comercio / segunda a sexta', 'Atalaia')).toBeNull();
  });

  it('bairro não é nome de lugar', () => {
    expect(pistasDeLugar('Rua A, 10, Apto 101, Atalaia', 'Atalaia')).toEqual([]);
  });
});

describe('decompor', () => {
  it.each([
    ['Rua Honduras, 417, América, CEP 49080-320', {rua: 'Rua Honduras', numero: '417', cep: '49080320'}],
    ['Avenida Dulce Diniz 920, Condomínio Luzia', {rua: 'Avenida Dulce Diniz', numero: '920', cep: null}],
    ['R Francisco Rabelo leite Neto, N.820, Cond. Brisa marina', {rua: 'R Francisco Rabelo leite Neto', numero: '820', cep: null}],
    ['Travessa Armando Sales, 15, Loja 01, Ponto Novo, 49097070', {rua: 'Travessa Armando Sales', numero: '15', cep: '49097070'}],
  ])('%s', (txt, esperado) => {
    expect(decompor(txt)).toMatchObject(esperado);
  });

  it('complemento escrito junto da rua não rouba o lugar do número da porta', () => {
    expect(decompor('Rua Antônio Andrade- Casa 03, 380, Ao lado do hotel marezzi, Coroa do Meio, CEP 49035-050'))
      .toMatchObject({rua: 'Rua Antônio Andrade', numero: '380', resto: ['Casa 03', 'Ao lado do hotel marezzi', 'Coroa do Meio']});
    expect(decompor('Rua Prof Jugurta Feitosa Franco Bloco D Apto 303, 334, Cond.resid San Francisco, CEP 49035-690'))
      .toMatchObject({rua: 'Rua Prof Jugurta Feitosa Franco', numero: '334', resto: ['Bloco D Apto 303', 'Cond.resid San Francisco']});
  });

  it('contagem colada no número da porta não apaga o número', () => {
    expect(decompor('Avenida Governador Paulo Barreto de Menezes 2082(3)'))
      .toMatchObject({rua: 'Avenida Governador Paulo Barreto de Menezes', numero: '2082'});
    expect(chaveEndereco('Avenida Governador Paulo Barreto de Menezes 2082(3)'))
      .toBe(chaveEndereco('Avenida Governador Paulo Barreto de Menezes 2082'));
  });

  it('sem número da rua, a numeração de dentro do condomínio não vira número da porta', () => {
    expect(decompor('Rua Antônio Andrade Casa 03, Coroa do Meio, CEP 49035-050'))
      .toMatchObject({rua: 'Rua Antônio Andrade', numero: null, resto: ['Casa 03', 'Coroa do Meio']});
    expect(chaveLugar('Rua Antônio Andrade Casa 03, Coroa do Meio, CEP 49035-050', 'Coroa do Meio', 'Aracaju')).toBeNull();
  });

  it('palavra de unidade que faz parte do nome da rua não tira o número da porta', () => {
    expect(decompor('Rua Casa Forte 100')).toMatchObject({rua: 'Rua Casa Forte', numero: '100'});
  });

  it('zero à esquerda não divide a mesma porta nem a mesma casa', () => {
    expect(decompor('Rua Antônio Andrade, 08')).toMatchObject({numero: '8'});
    expect(chaveEndereco('Rua Antônio Andrade, 08, CEP 49035-050')).toBe(chaveEndereco('Rua Antônio Andrade, 8, CEP 49035-050'));
    expect(chaveLugar('Rua Antônio Andrade, 08, CEP 49035-050', 'Coroa do Meio', 'Aracaju'))
      .toBe(chaveLugar('Rua Antônio Andrade, 8, CEP 49035-050', 'Coroa do Meio', 'Aracaju'));
    expect(chaveEndereco('Rua Antônio Andrade, 380, Casa 03')).toBe(chaveEndereco('Rua Antônio Andrade, 380, Casa 3'));
    expect(chaveEndereco('Rua Antônio Andrade, 380, Apto 09')).toBe(chaveEndereco('Rua Antônio Andrade, 380, Apto 9'));
  });

  it('apartamentos diferentes continuam diferentes com zero à esquerda', () => {
    expect(chaveEndereco('Rua Antônio Andrade, 380, Apto 09')).not.toBe(chaveEndereco('Rua Antônio Andrade, 380, Apto 90'));
  });

  it('número que faz parte do nome da rua continua na rua', () => {
    expect(decompor('Travessa L 2, 16')).toMatchObject({rua: 'Travessa L 2', numero: '16'});
    expect(decompor('Quadra 15, 20')).toMatchObject({rua: 'Quadra 15', numero: '20'});
  });

  it('a mesma porta escrita com e sem o complemento na rua divide a mesma chave', () => {
    expect(chaveLugar('Rua Prof Jugurta Feitosa Franco Bloco D Apto 303, 334, CEP 49035-690', 'Coroa do Meio', 'Aracaju'))
      .toBe(chaveLugar('Rua Professor Jugurta Feitosa Franco, 334, Condomínio, CEP 49035-690', 'Coroa do Meio', 'Aracaju'));
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
  it('nome de rua que quebra de linha não perde a entrega', () => {
    expect(extrairEnderecos('#25\nAvenida Governador Paulo Barreto de\nMenezes, 1500, Ed. Champs Elysees-\napto 502, Jardins, CEP 49025-040'))
      .toEqual(['25 Avenida Governador Paulo Barreto de Menezes, 1500, Ed. Champs Elysees-, apto 502, Jardins, CEP 49025-040']);
  });
  it('o resto do nome da rua entra sem vírgula, para o número continuar sendo o da porta', () => {
    const [achado] = extrairEnderecos('Avenida Governador Paulo Barreto de\nMenezes, 1500, Jardins, CEP 49025-040');
    expect(decompor(achado)).toMatchObject({rua: 'Avenida Governador Paulo Barreto de Menezes', numero: '1500'});
  });
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
  it('a leitura de apoio corrige número; e vira a principal quando a imagem tratada quase não leu nada', () => {
    const principais = ['5 Avenida Conselheiro Sicrano 21518, CEP 49000200', 'Rua Beltrano Fontes 190'];
    const apoio = ['Avenida Conselheiro Sicrano 2151', 'Rua Beltrano Fontesl) 190', 'Rua Fulana Barbosa 8'];
    expect(juntarLeituras(principais, apoio)).toEqual(['5 Avenida Conselheiro Sicrano 2151, CEP 49000200', 'Rua Beltrano Fontes 190']);
    expect(juntarLeituras([], apoio)).toEqual(apoio);
    const soUma = ['Rua Beltrano Fontes 190'];
    expect(juntarLeituras(soUma, ['Avenida Um 10', 'Avenida Dois 20', 'Avenida Tres 30'])).toHaveLength(3);
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
  // Gravação de 26/09: com a faixa colada, a chave da rua virava "vereador lucilo costa pinto sn
  // 10 15h a 13 20h" e a parada foi a única do dia a ficar sem posição nenhuma.
  it('a janela colada no fim do endereço sai do nome da rua', () => {
    expect(extrairEnderecos('22\nAlameda Vereador Lucilo da Costa Pinto SN 10:15h a 13:20h'))
      .toEqual(['22 Alameda Vereador Lucilo da Costa Pinto SN']);
    expect(extrairEnderecos('Rua Lúcio Mota 95 Habilita as 11:45 h')).toEqual(['Rua Lúcio Mota 95']);
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

describe('comanda de restaurante (iFood/Goomer) fotografada', () => {
  const ifood = [
    'ENTREGA', '20/set - 12:50', 'Pedido: #11', 'Fulano de Tal',
    'Telefone: 0800 700 3020, localizador: 89571185', 'ID do pedido:876404608',
    'R, Cel. Testeiro da Silveira, 75, Nova torre do h', 'ospital teste. AP 723 para Fulano',
    'Aracaju - São José', 'Ref :Encontro na recepção',
    'Obs: Desconto do Restaurante: 4,99', 'Bandeira: NUBANK', 'Código de Coleta: 2961',
    'Entrega para às 14:10', 'Qt .Descrição Valor', '1 Prato 83,00',
  ].join('\n');

  it('pega só o endereço do cliente, com bairro, referência e número do pedido', () => {
    expect(enderecoDaComanda(ifood)).toEqual(['11 R, Cel. Testeiro da Silveira, 75, Nova torre do hospital teste. AP 723 para Fulano, São José, ref: Encontro na recepção']);
  });
  it('não leva nome, telefone, valores nem o endereço do restaurante', () => {
    const saida = enderecoDaComanda(ifood)[0];
    for (const proibido of ['Fulano de Tal', '0800', '89571185', '83,00', 'NUBANK', 'Coleta']) {
      expect(saida).not.toContain(proibido);
    }
  });
  it('lê também a comanda com bairro e CEP na mesma linha', () => {
    const goomer = [
      'Pedido #0004 - Entrega', '20/09/2026 12:05', 'Cliente: Beltrana Teste',
      'Telefone: (79) 99999-0000', 'Rua Construtora Teste, 145, (Apto 802), Grageru,', 'Aracaju/SE, CEP: 49027340',
      'NÃO É DOCUMENTO FISCAL', 'Qtd Item Preço', '1 GNOCCHI R$ 58,0', 'ID do pedido: 12', 'www.goomer.com.br',
    ].join('\n');
    expect(enderecoDaComanda(goomer)).toEqual(['4 Rua Construtora Teste, 145, (Apto 802), Grageru, Aracaju/SE, CEP: 49027340']);
  });
  it('junta o número do apartamento que caiu na linha de baixo', () => {
    const quebrada = [
      'Pedido: #7', 'Telefone: 0800 200 5011, localizador: 47154613', 'ID do pedido:876404502',
      'Av. Deputado Teste, 1235, Bloco B Apt', '203', 'Aracaju - Grageru', 'Ref:Praça Teste', 'Obs: Desconto',
    ].join('\n');
    expect(enderecoDaComanda(quebrada)).toEqual(['7 Av. Deputado Teste, 1235, Bloco B Apt 203, Grageru, ref: Praça Teste']);
  });
  it('junta o que faltou em cada leitura da mesma comanda', () => {
    expect(juntarComandas([
      {pedido: null, endereco: 'Av. Teste, 1235, Bloco B Apt', bairro: '', referencia: ''},
      {pedido: '30', endereco: 'Av. Teste, 1235, Bloco B Apt 203', bairro: 'Grageru', referencia: 'Praça Teste'},
      null,
    ])).toEqual(['30 Av. Teste, 1235, Bloco B Apt 203, Grageru, ref: Praça Teste']);
    expect(juntarComandas([null, null])).toEqual([]);
  });
  it('junta a linha de baixo quando o parêntese do complemento ficou aberto, e larga o CEP cortado', () => {
    const partida = [
      'Pedido 0030 - Entrega', '20/09/2026 20:0', 'Cliente: Fulana Teste', 'Telefone: (71) 99172-9234',
      'Rua Teste Rabelo Neto, 1340, (Dermeva', 'Mattos Casa 50), Atalaia, Aracaju/SE, CEP: 49037',
      'NÃO É DOCUMENTO FISCAL',
    ].join('\n');
    expect(enderecoDaComanda(partida)).toEqual(['30 Rua Teste Rabelo Neto, 1340, (Dermeva Mattos Casa 50), Atalaia, Aracaju/SE']);
  });
  it('print comum do app de entregas não vira comanda', () => {
    expect(enderecoDaComanda('18\nAvenida Dulce Diniz 920\nCEP 49048430')).toEqual([]);
  });
});

describe('print da lista de pedidos do app do restaurante', () => {
  const lista = [
    '20:36 &', 'Você está online.', 'Rota 10951', 'Pizzaria Teste', 'v1.31.3 (132)',
    'Pedido 64 Pedido pago', 'Nome: FULANA TESTE',
    'Endereço: Av. Poe. Teste de Moraes, 60 - Edf', 'Serra Testada ap 1004, Atalaia, Aracaju, SE',
    'Pedido feito em: 20/set, 20:28', 'Itens: 01 itens', 'Valor total do pedido: R$ 67,00', 'Ver mais',
    'Pedido 49 Pedido pago', 'Nome: Beltrano de Sá',
    'Endereço: R. A Cd Morada Teste, 8750 -', 'Condominio Morada Teste, Zona De Expansao,', 'Aracaju, SE',
    'Ponto de Referência: Poste 104', 'Pedido feito em: 20/set, 19:24', 'Itens: 02 itens',
    'Lista de rotas', 'Rota atual', 'Relatório de entregas',
  ].join('\n');

  it('lê os dois pedidos, com o número do pedido e a referência', () => {
    expect(enderecosDaLista(lista)).toEqual([
      '64 Av. Poe. Teste de Moraes, 60 - Edf Serra Testada ap 1004, Atalaia, Aracaju, SE',
      '49 R. A Cd Morada Teste, 8750 Condominio Morada Teste, Zona De Expansao, Aracaju, SE, ref: Poste 104',
    ]);
  });
  it('não leva o nome do cliente nem os valores', () => {
    const tudo = enderecosDaLista(lista).join(' | ');
    for (const proibido of ['FULANA', 'Beltrano', '67,00', 'Itens']) expect(tudo).not.toContain(proibido);
  });
  it('a lista tem prioridade sobre a comanda, e o print comum continua no caminho de sempre', () => {
    expect(extrairEnderecos(lista)).toHaveLength(2);
    expect(enderecosDaLista('18\nAvenida Dulce Diniz 920\nCEP 49048430')).toEqual([]);
  });
});

describe('bairro escrito de outro jeito', () => {
  it('número por extenso e em algarismo são o mesmo bairro', () => {
    expect(chaveBairro('17 de Março')).toBe(chaveBairro('Dezessete de Março'));
    expect(chaveBairro('13 de Julho')).toBe(chaveBairro('Treze de Julho'));
    expect(chaveBairro('18 do Forte')).toBe(chaveBairro('Dezoito do Forte'));
  });

  it('dezena com unidade vira um número só', () => {
    expect(comNumeros(['vinte', 'e', 'cinco'])).toEqual(['25']);
    expect(comNumeros(['vinte', 'cinco'])).toEqual(['25']);
    expect(comNumeros(['trinta', 'e', 'sete', 'de', 'marco'])).toEqual(['37', 'de', 'marco']);
    expect(comNumeros(['vinte'])).toEqual(['20']);
    expect(comNumeros(['jabotiana'])).toEqual(['jabotiana']);
  });

  // "Rua Cento e Dezessete" existe em Aracaju, e meio normalizada ("cento 17") ela não casava
  // com "Rua 117" nem ficava igual a si mesma escrita de outro jeito.
  it('centena por extenso vira um número só', () => {
    expect(comNumeros(['cento', 'e', 'dezessete'])).toEqual(['117']);
    expect(comNumeros(['cento', 'dezessete'])).toEqual(['117']);
    expect(comNumeros(['cento', 'e', 'vinte', 'e', 'cinco'])).toEqual(['125']);
    expect(comNumeros(['cem'])).toEqual(['100']);
    expect(comNumeros(['duzentos', 'e', 'dez', 'de', 'marco'])).toEqual(['210', 'de', 'marco']);
    expect(comNumeros(['cento', 'jabotiana'])).toEqual(['100', 'jabotiana']);
  });

  it('o campo do bairro vem sujo e ainda assim dá para ler', () => {
    expect(jeitosDeLerBairro('Aruana - Condomínio Vistaruana')).toContain('aruana');
    expect(jeitosDeLerBairro('São José dos Náufragos/Robalo')).toContain('jose naufragos');
    expect(jeitosDeLerBairro('Zona de Expansão (Robalo)')).toContain('robalo');
    expect(chaveBairro('17 de Março Bl 04 Ap 403')).toBe(chaveBairro('17 de Março'));
  });

  it('bairros diferentes continuam diferentes', () => {
    expect(chaveBairro('13 de Julho')).not.toBe(chaveBairro('13 de Junho'));
    expect(chaveBairro('Jabotiana')).not.toBe(chaveBairro('Jardins'));
  });
});

// A rua da Jabotiana que o app não achou na rua: a planilha do Meli escreve "Rua 25", o OSM e o
// censo escrevem "Rua Vinte e Cinco".
describe('a chave da rua', () => {
  it('lê o número escrito por extenso, como já fazia com o bairro', () => {
    expect(chaveRua('Rua Vinte e Cinco')).toBe(chaveRua('Rua 25'));
    expect(chaveRua('R. Vinte Cinco')).toBe(chaveRua('Rua 25'));
    expect(chaveRua('Rua Dois de Julho')).toBe(chaveRua('Rua 2 de Julho'));
    expect(chaveRua('Avenida Sete de Setembro')).toBe(chaveRua('Av 7 de Setembro'));
    expect(chaveRua('Rua Cento e Dezessete')).toBe(chaveRua('Rua 117'));
  });

  it('ruas diferentes continuam diferentes', () => {
    expect(chaveRua('Rua 25')).not.toBe(chaveRua('Rua 24'));
    expect(chaveRua('Rua Vinte e Cinco')).not.toBe(chaveRua('Rua Vinte e Seis'));
    expect(chaveRua('Rua 2 de Julho')).not.toBe(chaveRua('Rua 2 de Junho'));
    expect(chaveRua('Rua Cento e Dezessete')).not.toBe(chaveRua('Rua Dezessete'));
  });

  // A chave é gravada no banco pelas ferramentas e recalculada no celular. São duas
  // implementações (node e TypeScript): se elas se separarem, a rua deixa de ser achada e
  // ninguém fica sabendo. Este teste é a costura entre as duas.
  it('a ferramenta que grava no banco calcula a mesma chave que o app', async () => {
    const ferramenta = await import('../../../ferramentas/chave-rua.mjs');
    const nomes = [
      'Rua Vinte e Cinco', 'Rua 25', 'Avenida Desembargador João Bosco de A. Lima',
      'Trav. Dezessete de Março', 'R Dr. José Thomaz de Aquino', 'Rua Dois de Julho',
      'Alameda das Flores', 'Praça General Valadão', 'Rodovia dos Náufragos',
      'Rua Poeta Paulo Freire', 'Av. Eng. Gentil Tavares', 'Rua Trinta e Sete',
      'Rua Noventa e Nove', 'Beco Sem Nome', 'Estrada da Zona de Expansão',
      'Rua Cento e Dezessete', 'Rua Cem', 'Avenida Duzentos e Dez', 'Rua Cento e Vinte e Cinco',
    ];
    for (const n of nomes) expect([n, ferramenta.chaveRua(n)]).toEqual([n, chaveRua(n)]);
  });
});

// O formato que o app do Mercado Livre produz quando lido de uma gravação de tela. A forma é a
// de um caso real; a rua e o CEP são inventados, que o repositório é público. Três coisas aqui
// custaram entrega na rua: o selo de "verificado" vira lixo numa linha só dele entre a rua e o
// bairro, o endereço rural não tem número de porta ("SN"), e o "CEP" fica numa linha e os
// dígitos na seguinte.
const DA_LISTA_DO_MELI = `10:30h a 13:35h

Rua das Acácias 39
[2

Bairro Norte, CEP 49000101

Entrega 1 unidade | ETIQUETA
4V-9...

v Estou chegando

10:30h a 13:35h

o)   Rua dos Ipês 37A
Bairro Norte, CEP 49000102

Entrega 1 unidade | ETIQUETA
4V-10...

AQ Há uma observação para você
v Estou chegando

10:30h a 13:35h

(38)   Rua F Quadra B Lot Jardim
Teste Lot.Planalto SN &

Área Rural de Cidade Teste, CEP
49000199

Entrega 2 unidades | ETIQUETA
41-38...

v Estou chegando`;

describe('a lista do Mercado Livre lida de uma gravação', () => {
  const lidos = () => extrairEnderecos(DA_LISTA_DO_MELI);

  it('o selo entre a rua e o bairro não leva o CEP embora', () => {
    const acacias = lidos().find(e => /Acácias/.test(e));
    expect(acacias, 'a parada das Acácias sumiu').toBeTruthy();
    expect(acacias).toContain('49000101');
    expect(acacias).toContain('Bairro Norte');
  });

  it('endereço rural sem número de porta continua sendo endereço', () => {
    const rural = lidos().find(e => /Jardim/.test(e));
    expect(rural, 'a parada rural sumiu inteira').toBeTruthy();
    expect(rural).toContain('49000199');
  });

  it('as três paradas saem, e nenhuma a mais', () => {
    expect(lidos()).toHaveLength(3);
  });
});

describe('a mesma parada lida em dois quadros', () => {
  // No primeiro quadro o botão flutuante do mapa fica em cima do número da porta.
  const tapado = ['Rua dos Ipês O, Bairro Norte, CEP 49000102'];
  const inteiro = ['Rua dos Ipês 37A, Bairro Norte, CEP 49000102 · 1 unid'];

  it('o número tapado por um botão não vira uma segunda parada', () => {
    const r = juntarQuadros([tapado, inteiro]);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('37A');
  });
});

// Gravação de 26/09, tela do Luan: "Rua Monsenhor Olívio o Teixeira 680" ao lado da mesma parada
// inteira. A letra solta que sobra onde o botão do mapa tapou o texto já era limpa quando saía
// como "O" maiúsculo ou zero; minúscula passava, e virava outra rua.
describe('a mesma parada lida duas vezes no vídeo', () => {
  it('letra solta minúscula no meio do nome não cria outra rua', () => {
    expect(extrairEnderecos('Rua Monsenhor Olívio o Teixeira 680, CEP 49026225'))
      .toEqual(['Rua Monsenhor Olívio Teixeira 680, CEP 49026225']);
  });

  it('o cartão cortado pela borda do quadro não vira uma parada a mais', () => {
    const cortado = ['Rua Monsenhor Olívio Teixeira 680'];
    const inteiro = ['Rua Monsenhor Olívio Teixeira 680, Condomínio Terrazzo Verdetto, CEP 49026225'];
    expect(juntarQuadros([cortado, inteiro])).toEqual(inteiro);
    expect(juntarQuadros([inteiro, cortado])).toEqual(inteiro);
  });

  it('mas duas entregas de verdade na mesma porta continuam sendo duas', () => {
    const q = [
      'Avenida Ministro Geraldo Barreto Sobral 215, Loja Shopping Jardins, CEP 49026010',
      'Avenida Ministro Geraldo Barreto Sobral 215, Loja Tamystossemijoias, CEP 49026010',
    ];
    expect(juntarQuadros([q])).toHaveLength(2);
  });
});

// Texto cru do leitor, gravação de 26/09: a tarja do horário sai como "8 Habilita as 11:45 h",
// com o cadeado lido como dígito. Esse 8 virava o número da parada seguinte, e o número da parada
// entra na ordenação da rota — seis paradas do mesmo dia saíram como "#8".
describe('o cadeado da tarja de horário não é número de parada', () => {
  it('a tarja sozinha não deixa número para a linha de baixo', () => {
    expect(analisarLinha('8 Habilita as 11:45 h')).toMatchObject({texto: '', ml: null});
    expect(extrairEnderecos('8 Habilita as 11:45 h\n   Avenida Marieta Leite 51'))
      .toEqual(['Avenida Marieta Leite 51']);
  });

  it('e o número de parada de verdade continua entrando', () => {
    expect(extrairEnderecos('(32)   Rua Construtora Cunha 145')).toEqual(['32 Rua Construtora Cunha 145']);
    expect(extrairEnderecos('45\nAvenida Marieta Leite 51')).toEqual(['45 Avenida Marieta Leite 51']);
  });
});

// O crachá do Meli é único por parada. Quando o mesmo número sai em duas, foi o leitor errando o
// escudo colorido — e esse número vira o rótulo do cartão e entra na ordenação da rota.
describe('numero de parada repetido não é numero de parada', () => {
  it('o repetido cai, e a parada fica com a posição na leitura', () => {
    const r = juntarQuadros([[
      '3 Avenida Franklin de Campos Sobral 1630',
      '3 Rua Deputado Zeca Pereira 60',
      '46 Avenida Marieta Leite 64',
    ]]);
    expect(r).toEqual([
      'Avenida Franklin de Campos Sobral 1630',
      'Rua Deputado Zeca Pereira 60',
      '46 Avenida Marieta Leite 64',
    ]);
  });

  it('a mesma parada lida em dois quadros não conta como repetição', () => {
    const r = juntarQuadros([['45 Avenida Marieta Leite 51'], ['45 Avenida Marieta Leite 51']]);
    expect(r).toEqual(['45 Avenida Marieta Leite 51']);
  });
});

// O dono chega com a porta na mão, copiada do Google Maps, porque o censo não tem aquela rua.
// No link de lugar do Google o `!3d!4d` é a porta e o `@` é o enquadramento do mapa: em dois
// links reais da Sílvio Teixeira os dois diferiam 250 m, então a ordem importa.
describe('coordenada colada junto com o endereço', () => {
  const LINK = 'https://www.google.com/maps/place/Av.+Deputado+S%C3%ADlvio+Teixeira,+184/@-10.9400000,-37.0600000,17z/data=!3m1!4b1!4m6!3m5!1s0x71ab3ee76a1245d!8m2!3d-10.9436218!4d-37.0527487!16s%2Fg%2F11c2hrbs46';

  it('pega a porta do link, não o enquadramento do mapa', () => {
    const c = coordenadaNoTexto(LINK)!;
    expect(c.lat).toBeCloseTo(-10.9436218, 6);
    expect(c.lng).toBeCloseTo(-37.0527487, 6);
  });

  it('aceita o link de compartilhar e o par solto', () => {
    expect(coordenadaNoTexto('https://maps.google.com/?q=-10.9436218,-37.0527487')).toMatchObject({lat: -10.9436218});
    expect(coordenadaNoTexto('Rua X 100, -10.943622, -37.052749')).toMatchObject({lng: -37.052749});
    expect(coordenadaNoTexto('Rua X 100, Jardins, CEP 49025-100')).toBeNull();
  });

  it('o endereço sobra limpo, sem o link', () => {
    expect(semLink(`Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100 ${LINK}`))
      .toBe('Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100');
    expect(semLink('Rua X 100, -10.943622, -37.052749')).toBe('Rua X 100');
  });
});

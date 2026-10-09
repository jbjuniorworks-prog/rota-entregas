import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {estadoVazio} from './guarda';
import {cidadeDaParada, cidadeDoCep, levarParaAPortaDoCenso, levarParaOCenso, marcarIsoladas, marcarPontoGenerico, moverGenericasPeloBairro, planilhaForaDaRua, refinarPeloCenso, refinoPeloCenso} from './geo';
import {adicionarDaPlanilha, resumoPlanilha} from './importar';
import {coordenadaDaPlanilha, itensDaPlanilha} from './planilha';
import type {Candidato, Parada, Precisao} from './tipos';

const C = (() => {
  const wb = XLSX.read(readFileSync('testes/planilhas/rota-c.xlsx'), {type: 'buffer'});
  return itensDaPlanilha(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true}), 'rota-c.xlsx');
})();
const achar = (e: ReturnType<typeof estadoVazio>, t: string) => e.paradas.find(p => p.texto.startsWith(t))!;

describe('coordenada da planilha', () => {
  it('poucas casas decimais é aproximada', () => {
    expect(coordenadaDaPlanilha(-10.99, -37.0708)).toEqual({lat: -10.99, lng: -37.0708, aproximada: true});
    expect(coordenadaDaPlanilha(-10.9612, -37.0453)).toMatchObject({aproximada: false});
    expect(coordenadaDaPlanilha('-10,961204', '-37,045301')).toMatchObject({lat: -10.961204, aproximada: false});
  });
  it('latitude e longitude trocadas são destrocadas', () => {
    expect(coordenadaDaPlanilha(-37.0985, -11.0375)).toMatchObject({lat: -11.0375, lng: -37.0985});
  });
  it('fora do Brasil, zero ou vazio viram "sem posição"', () => {
    expect(coordenadaDaPlanilha(48.85, 2.35)).toBeNull();
    expect(coordenadaDaPlanilha(0, 0)).toBeNull();
    expect(coordenadaDaPlanilha('', '')).toBeNull();
  });
});

describe('planilha com posições fracas (caso do Robalo, 19/09)', () => {
  const e = estadoVazio();
  const {resumo} = adicionarDaPlanilha(e, C, () => false);

  it('resume tudo o que precisa de atenção', () => {
    expect(resumo).toMatchObject({novas: 10, longe: 1, noBairro: 1, aproximadas: 1, numeros: 2, semPosicao: 1});
    expect(resumoPlanilha(resumo)).toContain(' 1 com posição longe das outras entregas: levada(s) para o bairro certo, confira no local.');
  });
  it('a entrega jogada a 13 km vai para o meio das outras do mesmo bairro, e a posição da Shopee fica como opção', () => {
    const p = achar(e, 'Rua do Robalo Errado');
    expect(p.precisao).toBe('bairro');
    expect(p.lat).toBeCloseTo(-11.039879, 5);
    expect(p.lng).toBeCloseTo(-37.094650, 5);
    expect(p.exibido).toContain('Bairro Robalo Teste');
    expect(p.candidatos.map(c => c.precisao)).toEqual(['bairro', 'longe']);
    expect(p.candidatos[1].lat).toBeCloseTo(-10.92654, 5);
  });
  it('depois de levada, não volta a ser marcada como longe', () => {
    marcarIsoladas(e.paradas);
    expect(achar(e, 'Rua do Robalo Errado').precisao).toBe('bairro');
  });
  it('coordenada arredondada, números distantes no mesmo ponto e coordenadas trocadas ou impossíveis', () => {
    expect(achar(e, 'Rua Arredondada').precisao).toBe('aproximada');
    expect(achar(e, 'Avenida Numeração, 7,').precisao).toBe('numero');
    expect(achar(e, 'Avenida Numeração, 1928').precisao).toBe('numero');
    expect(achar(e, 'Rua Trocada').precisao).toBe('planilha');
    expect(achar(e, 'Rua Trocada').lat).toBeCloseTo(-11.0375, 5);
    expect(achar(e, 'Rua Trocada').lng).toBeCloseTo(-37.0985, 5);
    expect(achar(e, 'Rua Fora do Mapa')).toMatchObject({precisao: 'pendente', lat: null});
  });
  it('sem outra entrega do mesmo bairro, fica marcada como longe para o app procurar o bairro no mapa', () => {
    const e2 = estadoVazio();
    const {resumo: r} = adicionarDaPlanilha(e2, C.filter(it => !it.texto.includes('Robalo, ') && !/Rua (Norte|Sul) do Robalo/.test(it.texto)), () => false);
    expect(r).toMatchObject({longe: 1, noBairro: 0});
    expect(achar(e2, 'Rua do Robalo Errado').precisao).toBe('longe');
  });
});

// Luan, 01/10: a planilha pôs duas portas a 168 m e a 773 m, e o censo tinha as duas certas.
describe('planilha e censo do IBGE discordando', () => {
  const NORTE = 1 / 111320, LESTE = 1 / 109300;
  const parada = (precisao: Precisao = 'planilha') => ({id: 'p', area: 'a', ml: null, texto: 'Rua das Acácias, 109, Jardins, CEP 49000-100',
    unidades: null, comercial: false, lat: -10.94, lng: -37.06, exibido: 'Posição da planilha', precisao, candidatos: [], entregue: false}) as Parada;
  const porta = (norte: number, rua = 'Rua das Acácias') => ({lat: -10.94 + norte * NORTE, lng: -37.06,
    exibido: `${rua}, 109 — Jardins`, precisao: 'bom', rua, bairro: 'Jardins', fonte: 'IBGE'}) as Candidato;
  // a rua do censo correndo de leste a oeste, 170 m ao norte da planilha
  const ruaAoNorte = [-100, -50, 0, 50, 100].map(m => ({lat: -10.94 + 170 * NORTE, lng: -37.06 + m * LESTE}));

  it('planilha fora da rua: o pino vai para a porta do censo, e a planilha fica como opção', () => {
    const p = parada();
    const d = planilhaForaDaRua(p, porta(170), ruaAoNorte);
    expect(Math.round(d!)).toBe(170);
    levarParaAPortaDoCenso(p as Parada & {lat: number; lng: number}, porta(170), d!);
    expect(p).toMatchObject({lat: porta(170).lat, lng: -37.06, precisao: 'censo', fonte: 'IBGE'});
    expect(p.exibido).toContain('170 m, fora da rua');
    expect(p.candidatos.map(c => [c.fonte, c.lat])).toEqual([['IBGE', porta(170).lat], ['planilha', -10.94]]);
  });

  // nos medidos, quem estava em cima da rua e longe do número era o censo errando a numeração
  it('planilha em cima da rua, longe do número: fica como veio', () => {
    const ruaComAPlanilha = [...ruaAoNorte, {lat: -10.94 + 30 * NORTE, lng: -37.06}];
    expect(planilhaForaDaRua(parada(), porta(170), ruaComAPlanilha)).toBeNull();
  });

  it('perto do número, com o número em outra rua, ou com posição que não veio só da planilha: fica como veio', () => {
    expect(planilhaForaDaRua(parada(), porta(60), ruaAoNorte)).toBeNull();
    // o censo também erra: quando acha o número numa rua de outro nome, não é segunda opinião
    expect(planilhaForaDaRua(parada(), porta(500, 'Avenida Beira Mar'), ruaAoNorte)).toBeNull();
    for (const pr of ['lembrado', 'confirmado', 'manual', 'aproximada', 'longe'] as Precisao[]) expect(planilhaForaDaRua(parada(pr), porta(500), ruaAoNorte)).toBeNull();
    expect(planilhaForaDaRua({...parada(), entregue: true}, porta(500), ruaAoNorte)).toBeNull();
  });

  // Repassado em 24 planilhas reais: os que pioravam eram destes dois tipos.
  it('rua de nome genérico e condomínio de casas ficam como vieram; prédio sozinho, não', () => {
    const com = (texto: string) => ({...parada(), texto});
    // "Rua B1" tem em vários loteamentos: o censo achava outra, a 1,5 km
    expect(planilhaForaDaRua(com('Rua B1, 109, Lot. Aquarius, Jardins, CEP 49000-100'), porta(500, 'Rua B1'), ruaAoNorte)).toBeNull();
    // no condomínio a entrega é na portaria, e o censo põe o número lá dentro
    for (const c of ['Cond. Solar casa 18', 'Residencial Solar', 'Bloco G 002 apartamento', 'Ap301 BL10', 'Casa 21'])
      expect(planilhaForaDaRua(com(`Rua das Acácias, 109, ${c}, Jardins, CEP 49000-100`), porta(170), ruaAoNorte)).toBeNull();
    expect(planilhaForaDaRua(com('Rua das Acácias, 109, Edificio Solar apt 04, Jardins, CEP 49000-100'), porta(170), ruaAoNorte)).not.toBeNull();
    expect(planilhaForaDaRua(com('Rua das Acácias, 109, Casa, Jardins, CEP 49000-100'), porta(170), ruaAoNorte)).not.toBeNull();
  });

  it('o mesmo número decide junto, e as portas da rua só são buscadas para quem discorda', async () => {
    let ruas = 0;
    const censo = {
      porta: async (cep: string, numero: string) => numero === '109' ? porta(170) : {...porta(10), rua: 'Rua dos Ipês'},
      rua: async () => { ruas++; return ruaAoNorte; },
    };
    const ps = [
      {...parada(), id: 'a', texto: 'Rua das Acácias, 109, Jardins, CEP 49000-100'},
      {...parada(), id: 'b', texto: 'Rua das Acácias, 109, Casa 3, Jardins, CEP 49000-100'},
      {...parada(), id: 'c', texto: 'Rua dos Ipês, 20, Jardins, CEP 49000-200'},
    ];
    const r = await levarParaOCenso(ps, 'Aracaju', censo);
    // a casa 3 diz que o 109 é um condomínio: nenhuma das duas vai, para não ficar metade em cada pino
    expect(r.levadas).toEqual([]);
    // o 20 está a 10 m da porta do censo: só refina, e não precisou das portas da rua
    expect(r.refinadas.map(p => p.id)).toEqual(['c']);
    expect(ruas).toBe(0);
    const sozinha = [{...parada(), id: 'a'}];
    expect((await levarParaOCenso(sozinha, 'Aracaju', censo)).levadas.map(p => p.id)).toEqual(['a']);
    expect(ruas).toBe(1);
  });

  // Pedro, 08/10: a planilha pôs uma Rua B do Industrial noutra Rua B, a 11,7 km, sem aviso.
  // Luan, 09/10: uma Rua E a 460 m da porta, noutra rua, a 345 m da porta mais perto do CEP.
  describe('rua de nome genérico longe das portas do próprio CEP', () => {
    const LONGE = 3000;
    const doCep = [0, 20, 40].map(m => ({lat: -10.94 + (LONGE + m) * NORTE, lng: -37.06}));
    const ruaB = (bairro = 'Jardins', rua = 'Rua B') => ({...porta(LONGE, rua), bairro});
    const entrega = () => ({...parada(), texto: 'Rua B, 40, Jardins, CEP 49000-300', bairro: 'Jardins'});
    const conferir = async (achada: Candidato, portasDoCep = doCep, comCep = true) => {
      const p = entrega();
      const r = await levarParaOCenso([p], 'Aracaju', {porta: async () => achada, rua: async () => [], ...(comCep ? {cep: async () => portasDoCep} : {})});
      return {p, r};
    };

    it('vai para a porta exata do censo, com a planilha como opção', async () => {
      const {p, r} = await conferir(ruaB());
      expect(r.foraDoCep).toEqual([p]);
      expect(p).toMatchObject({lat: ruaB().lat, lng: -37.06, precisao: 'censo', fonte: 'IBGE'});
      expect(p.exibido).toContain('a planilha punha este pino a 3,0 km, longe das portas do CEP dela');
      expect(p.candidatos.map(c => c.fonte)).toEqual(['IBGE', 'planilha']);
    });

    it('fica como veio: bairro do censo diferente, ponto dentro do CEP, rua de outro nome', async () => {
      // com o bairro do censo diferente, nas medidas, quem errava era o CEP
      expect((await conferir(ruaB('Santa Maria'))).p.precisao).toBe('planilha');
      expect((await conferir(ruaB(), [{lat: -10.94 + 80 * NORTE, lng: -37.06}, ...doCep])).p.precisao).toBe('planilha');
      expect((await conferir(ruaB('Jardins', 'Rua C'))).p.precisao).toBe('planilha');
      expect((await conferir(ruaB(), doCep, false)).p.precisao).toBe('planilha');
    });

    it('a poucas centenas de metros também vai, e o aviso diz em metros', async () => {
      const p = entrega();
      const perto = [0, 20].map(m => ({lat: -10.94 + (345 + m) * NORTE, lng: -37.06}));
      await levarParaOCenso([p], 'Aracaju', {porta: async () => ({...porta(460, 'Rua B'), bairro: 'Jardins'}), rua: async () => [], cep: async () => perto});
      expect(p.precisao).toBe('censo');
      expect(p.exibido).toMatch(/a planilha punha este pino a 4\d\d m, longe das portas do CEP dela/);
    });

    // o "e" da Rua E é palavra vazia para o mesmaRua, e ela não batia nem com ela mesma
    it('a Rua E também', async () => {
      const p = {...entrega(), texto: 'Rua E, 40, Jardins, CEP 49000-300'};
      await levarParaOCenso([p], 'Aracaju', {porta: async () => ruaB('Jardins', 'Rua E'), rua: async () => [], cep: async () => doCep});
      expect(p.precisao).toBe('censo');
      const outra = {...entrega(), texto: 'Rua E, 40, Jardins, CEP 49000-300'};
      await levarParaOCenso([outra], 'Aracaju', {porta: async () => ruaB('Jardins', 'Rua F'), rua: async () => [], cep: async () => doCep});
      expect(outra.precisao).toBe('planilha');
      // o "e" no meio de outro nome não é a Rua E; a letra no começo do nome do censo é
      const noMeio = {...entrega(), texto: 'Travessa E, 40, Jardins, CEP 49000-300'};
      await levarParaOCenso([noMeio], 'Aracaju', {porta: async () => ruaB('Jardins', 'Travessa Trinta e Um de Março'), rua: async () => [], cep: async () => doCep});
      expect(noMeio.precisao).toBe('planilha');
      const doLoteamento = entrega();
      await levarParaOCenso([doLoteamento], 'Aracaju', {porta: async () => ruaB('Jardins', 'Rua B Moradas do Rio Doce'), rua: async () => [], cep: async () => doCep});
      expect(doLoteamento.precisao).toBe('censo');
    });

    it('o bairro do censo vale escrito no endereço também', async () => {
      const p = {...entrega(), texto: 'Rua B, 40, Vila Teste II, CEP 49000-300', bairro: 'Bairro Inventado'};
      await levarParaOCenso([p], 'Aracaju', {porta: async () => ruaB('Vila Teste Ii'), rua: async () => [], cep: async () => doCep});
      expect(p.precisao).toBe('censo');
    });
  });

  // 02/10: com as duas fontes a até 80 m, o censo acerta a casa e a planilha cai umas casas ao lado
  it('casa com a planilha a até 80 m do censo vai para a porta dele, verde, com a planilha como opção', () => {
    const p = parada();
    const d = refinoPeloCenso(p, porta(40));
    expect(Math.round(d!)).toBe(40);
    refinarPeloCenso(p as Parada & {lat: number; lng: number}, porta(40), d!);
    expect(p).toMatchObject({lat: porta(40).lat, lng: -37.06, precisao: 'exato', fonte: 'IBGE'});
    expect(p.exibido).toContain('40 m de onde a planilha punha');
    expect(p.candidatos.map(c => c.fonte)).toEqual(['IBGE', 'planilha']);
  });

  it('prédio, condomínio, rua genérica, mais de 80 m, ou posição que não veio só da planilha: não refina', () => {
    const com = (texto: string) => ({...parada(), texto});
    // no prédio o censo marca a porta lá dentro do terreno; a entrega é na portaria
    expect(refinoPeloCenso(parada(), {...porta(40), predio: true})).toBeNull();
    expect(refinoPeloCenso(com('Rua das Acácias, 109, Cond. Solar casa 18, Jardins, CEP 49000-100'), porta(40))).toBeNull();
    expect(refinoPeloCenso(com('Rua B1, 109, Jardins, CEP 49000-100'), porta(40, 'Rua B1'))).toBeNull();
    expect(refinoPeloCenso(parada(), porta(40, 'Avenida Beira Mar'))).toBeNull();
    expect(refinoPeloCenso(parada(), porta(120))).toBeNull();
    for (const pr of ['lembrado', 'confirmado', 'manual', 'censo'] as Precisao[]) expect(refinoPeloCenso(parada(pr), porta(40))).toBeNull();
  });
});

// Planilha do Jeferson, 05/10: 8 linhas de 7 bairros da Barra dos Coqueiros no mesmo ponto, a
// rotatória, e cinco paradas num pino só. E o censo, que levaria quase todas para a porta, era
// consultado no arquivo de Aracaju, a cidade que o app guardava de ontem.
describe('ponto que a planilha repete para vários bairros', () => {
  const ROTATORIA = {lat: -10.907875, lng: -37.026708};
  const linha = (id: string, texto: string, bairro: string, ponto = ROTATORIA, extra: Partial<Parada> = {}) => ({id, area: 'a', ml: null, texto, bairro,
    unidades: null, comercial: false, ...ponto, exibido: 'Posição da planilha', precisao: 'planilha', candidatos: [], entregue: false, ...extra}) as Parada;

  it('com 3 bairros ou mais no mesmo ponto, não é porta de ninguém', () => {
    const ps = [
      linha('a', 'Rua Um, 33, CEP 49140-901', 'Prisco Viana'),
      linha('b', 'Rua Dois, 77, CEP 49140-902', 'Moisés Gomes'),
      linha('c', 'Rua Tres, 199, CEP 49140-903', 'Antônio Pedro'),
    ];
    expect(marcarPontoGenerico(ps)).toBe(3);
    expect(ps.every(p => p.pontoGenerico && p.precisao === 'aproximada')).toBe(true);
    expect(ps[0].exibido).toContain('3 bairros');
  });

  // Nos 32 dias medidos, os outros pontos repetidos eram portaria de condomínio: 1 ou 2 bairros.
  it('portaria de condomínio, com 1 ou 2 bairros, continua junta; o mesmo bairro escrito de dois jeitos é um só', () => {
    const condominio = [
      linha('a', 'Avenida Um, 380, Cond Park', 'Luar da Barra'),
      linha('b', 'Rua Dois, 266, Bloco 2', 'Espaço Tropical-'),
      linha('c', 'Rua Tres, 10, Bloco 3', 'Espaco Tropical'),
    ];
    expect(marcarPontoGenerico(condominio)).toBe(0);
    expect(condominio.every(p => p.precisao === 'planilha' && !p.pontoGenerico)).toBe(true);
  });

  it('o que sobra vai para o meio das outras entregas do mesmo bairro, com o ponto da planilha como opção', () => {
    const ps = [
      linha('a', 'Rua Um, 33', 'Prisco Viana'),
      linha('b', 'Rua Dois, 77', 'Moisés Gomes'),
      linha('c', 'Rua Tres, 199', 'Antônio Pedro'),
      linha('v1', 'Rua Quatro, 10', 'Prisco Viana', {lat: -10.9105, lng: -37.0307}),
      linha('v2', 'Rua Cinco, 20', 'prisco viana', {lat: -10.9107, lng: -37.0303}),
    ];
    marcarPontoGenerico(ps);
    const movidas = moverGenericasPeloBairro(ps);
    expect(movidas.map(p => p.id)).toEqual(['a']);
    expect(ps[0]).toMatchObject({lat: -10.9106, lng: -37.0305, precisao: 'bairro', fonte: 'bairro'});
    expect(ps[0].pontoGenerico).toBeUndefined();
    expect(ps[0].candidatos.map(c => [c.precisao, c.lat])).toEqual([['bairro', -10.9106], ['aproximada', ROTATORIA.lat]]);
    // sem outra entrega do bairro, fica onde estava, vermelha, para o mapa ou para conferir
    expect(ps[1]).toMatchObject({...ROTATORIA, precisao: 'aproximada', pontoGenerico: true});
  });

  it('a cidade vem da linha da planilha, senão da faixa do CEP, senão da que o app guardou', () => {
    expect(cidadeDoCep('49140-901')).toBe('Barra dos Coqueiros');
    expect(cidadeDoCep('49000101')).toBe('Aracaju');
    expect(cidadeDoCep('57000-000')).toBeNull();
    expect(cidadeDaParada(linha('a', 'Rua Um, 33, CEP 49000-086', 'Centro', ROTATORIA, {cidade: 'Barra dos Coqueiros'}), 'Aracaju, SE')).toBe('Barra dos Coqueiros');
    expect(cidadeDaParada(linha('a', 'Rua Um, 33, CEP 49140-901', 'Centro'), 'Aracaju, SE')).toBe('Barra dos Coqueiros');
    expect(cidadeDaParada(linha('a', 'Rua Um, 33', 'Centro'), 'Aracaju, SE')).toBe('Aracaju, SE');
  });

  it('o censo é consultado na cidade da entrega, e o ponto genérico vai para a porta da mesma rua', async () => {
    const pedidas: string[] = [];
    const censo = {
      porta: async (cep: string, numero: string, cidade: string) => {
        pedidas.push(cidade);
        return {lat: -10.9107, lng: -37.0304, exibido: 'Rua Inventada Um, 33', precisao: 'bom', rua: numero === '33' ? 'Rua Inventada Um' : 'Outra Rua', bairro: 'Prisco Viana', fonte: 'IBGE'} as Candidato;
      },
      rua: async () => [],
    };
    const ps = [
      linha('a', 'Rua Inventada Um, 33, CEP 49140-901', 'Prisco Viana', ROTATORIA, {precisao: 'aproximada', pontoGenerico: true}),
      linha('b', 'Rua Inventada Dois, 77, CEP 49140-902', 'Moisés Gomes', ROTATORIA, {precisao: 'aproximada', pontoGenerico: true}),
    ];
    const r = await levarParaOCenso(ps, 'Aracaju, SE', censo);
    expect(pedidas).toEqual(['Barra dos Coqueiros', 'Barra dos Coqueiros']);
    expect(r.genericas.map(p => p.id)).toEqual(['a']);
    expect(ps[0]).toMatchObject({lat: -10.9107, lng: -37.0304, precisao: 'censo'});
    expect(ps[0].exibido).toContain('mesmo ponto para vários bairros');
    // o censo achou o número numa rua de outro nome: não é a porta dela, fica para o bairro
    expect(ps[1]).toMatchObject({...ROTATORIA, precisao: 'aproximada', pontoGenerico: true});
  });
});

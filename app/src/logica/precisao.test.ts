import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {estadoVazio} from './guarda';
import {levarParaAPortaDoCenso, levarParaOCenso, marcarIsoladas, planilhaForaDaRua} from './geo';
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
    expect(resumoPlanilha(resumo)).toContain('⚠️ 1 com posição longe das outras entregas: levada(s) para o bairro certo, confira no local.');
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
    // a casa 3 diz que o 109 é um condomínio: nenhuma das duas vai, para não ficar metade em cada pino
    expect(await levarParaOCenso(ps, 'Aracaju', censo)).toEqual([]);
    // o 20 está a 10 m da porta do censo: não precisou das portas da rua
    expect(ruas).toBe(0);
    const sozinha = [{...parada(), id: 'a'}];
    expect((await levarParaOCenso(sozinha, 'Aracaju', censo)).map(p => p.id)).toEqual(['a']);
    expect(ruas).toBe(1);
  });
});

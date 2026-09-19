import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {estadoVazio} from './guarda';
import {marcarIsoladas} from './geo';
import {adicionarDaPlanilha, resumoPlanilha} from './importar';
import {coordenadaDaPlanilha, itensDaPlanilha} from './planilha';

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

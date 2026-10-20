import {readFileSync} from 'node:fs';
import {CATEGORIAS, categoria, criarMedidor, montarEvento, origemDe, tipoDoArquivo, type Medicao, type PendenteNoFim} from './telemetria';

// Um relógio que só anda quando o teste manda.
function relogio() {
  let t = 0;
  return {agora: () => t, anda: (ms: number) => { t += ms; }};
}

const vazia = (): Medicao => ({tempo_ms: 0, paradas: new Map(), fontes: {
  nominatim: {chamadas: 0, ms: 0, espera: 0}, cep: {chamadas: 0, ms: 0, espera: 0},
  censo: {chamadas: 0, ms: 0, espera: 0}, banco: {chamadas: 0, ms: 0, espera: 0}}});

const evento = (pendentes: PendenteNoFim[], medicao = vazia(), origem = 'colada' as const) =>
  montarEvento({id: '7d0c2a8e-1f4b-4c3a-9e1d-2b6f8a9c0d11', motorista: 'm1', origem, quando: new Date('2026-10-20T12:00:00Z'), versao: 'mgx1', paradas: 60, pendentes, medicao});

const TERMINOU = CATEGORIAS.map(c => 'terminou_' + c);

describe('origem da lista', () => {
  it('uma só é ela; mais de uma é mista; nenhuma não tem', () => {
    expect(origemDe(['colada', 'colada'])).toBe('colada');
    expect(origemDe(['planilha', 'print'])).toBe('mista');
    expect(origemDe([])).toBeNull();
  });
  it('vídeo é gravação; o resto que o leitor lê é print', () => {
    expect(tipoDoArquivo({type: 'video/mp4'})).toBe('gravacao');
    expect(tipoDoArquivo({type: 'image/jpeg'})).toBe('print');
  });
});

describe('onde a parada terminou', () => {
  it('pela origem da posição, e sem posição é sem posição venha de onde vier', () => {
    const p = (fonte?: string) => categoria({lat: -10.9, lng: -37.05, fonte});
    expect(p('memoria do aparelho')).toBe('memoria');
    expect(p('IBGE')).toBe('censo');
    expect(p('nossa base')).toBe('base');
    expect(p('CEP')).toBe('cep');
    expect(p('entregas')).toBe('cep');
    expect(p('OpenStreetMap')).toBe('nominatim');
    expect(p('minha correcao')).toBe('conhecida');
    expect(p('outro motorista')).toBe('conhecida');
    expect(p('bairro')).toBe('outras');
    expect(p(undefined)).toBe('outras');
    expect(categoria({lat: null, lng: null, fonte: 'OpenStreetMap'})).toBe('sem_posicao');
  });
});

describe('o registro da busca', () => {
  const ponto = {lat: -10.9, lng: -37.05};
  const mix: PendenteNoFim[] = [
    {id: 'a', achada: ponto, ...ponto, fonte: 'IBGE'},
    {id: 'b', achada: ponto, ...ponto, fonte: 'OpenStreetMap'},
    {id: 'c', achada: null, lat: null, lng: null, fonte: 'nao achou'},
    {id: 'd', achada: ponto, ...ponto, fonte: 'vizinha'},
    {id: 'e', achada: ponto, ...ponto, fonte: 'outro motorista'},
    {id: 'f', achada: ponto, ...ponto, fonte: 'memoria do aparelho'},
  ];

  it('a soma de onde terminaram fecha com as pendentes', () => {
    const ev = evento(mix) as unknown as Record<string, number>;
    expect(TERMINOU.reduce((s, k) => s + ev[k], 0)).toBe(mix.length);
    expect(ev.pendentes).toBe(mix.length);
    expect([ev.terminou_censo, ev.terminou_nominatim, ev.terminou_sem_posicao, ev.terminou_outras, ev.terminou_conhecida, ev.terminou_memoria]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('tem só as colunas da 026, e só números além do id, de quem, da origem, da hora e da versão', () => {
    const sql = readFileSync('supabase/026_buscas_de_lista.sql', 'utf8');
    const tabela = sql.slice(sql.indexOf('create table if not exists public.buscas_de_lista ('), sql.indexOf('create index'));
    const colunas = [...tabela.matchAll(/^ {2}([a-z_]+) (?:uuid|text|int|timestamptz)\b/gm)].map(m => m[1]).filter(c => c !== 'criado_em');
    const ev = evento(mix);
    expect(Object.keys(ev).sort()).toEqual(colunas.sort());
    const texto = ['id', 'motorista_id', 'origem', 'buscado_em', 'versao'];
    for (const [k, v] of Object.entries(ev)) {
      if (texto.includes(k)) expect(typeof v, k).toBe('string');
      else expect(Number.isInteger(v), k).toBe(true);
    }
  });

  it('nunca negativo, e nos limites da 026', () => {
    const m = vazia();
    m.tempo_ms = 9e9;
    m.fontes.banco = {chamadas: -3, ms: -10, espera: 0};
    const ev = evento([], m) as unknown as Record<string, number>;
    expect(ev.tempo_ms).toBe(86_400_000);
    expect(ev.banco_chamadas).toBe(0);
    expect(ev.banco_ms).toBe(0);
  });

  it('origem fora da lista não vira registro', () => {
    expect(() => evento([], vazia(), 'whatsapp' as 'colada')).toThrow(/origem/);
  });

  it('a porta conhecida: o tempo e o Nominatim dela, e se a busca tinha posto longe', () => {
    const m = vazia();
    m.paradas.set('perto', {ms: 2000, nominatim: 1});
    m.paradas.set('longe', {ms: 3000, nominatim: 2});
    const ev = evento([
      {id: 'perto', achada: {lat: -10.9, lng: -37.0501}, ...ponto, fonte: 'outro motorista'},
      {id: 'longe', achada: {lat: -10.9005, lng: -37.05}, ...ponto, fonte: 'minha correcao'},
      {id: 'outra', achada: ponto, ...ponto, fonte: 'IBGE'},
    ], m);
    expect(ev.conhecidas).toBe(2);
    expect(ev.conhecidas_ms).toBe(5000);
    expect(ev.conhecidas_nominatim).toBe(3);
    // 11 m e 55 m da porta conhecida: só a segunda passa dos 30 m
    expect(ev.conhecidas_longe).toBe(1);
  });
});

describe('o medidor', () => {
  it('fora de uma busca só deixa passar', async () => {
    const r = relogio(), m = criarMedidor(r.agora);
    expect(await m.medir('banco', async () => 7)).toBe(7);
    expect(m.terminar()).toBeNull();
  });

  it('conta cada fonte e cada parada, e as partes cabem no tempo total', async () => {
    const r = relogio(), m = criarMedidor(r.agora);
    m.comecar();
    r.anda(50);
    m.naParada('p1');
    r.anda(1100);
    m.esperou('nominatim', 1100);
    await m.medir('nominatim', async () => { r.anda(400); });
    await m.medir('banco', async () => { r.anda(120); });
    m.naParada(null);
    m.naParada('p2');
    await m.medir('censo', async () => { r.anda(30); });
    m.naParada(null);
    await m.medir('banco', async () => { r.anda(200); });
    r.anda(10);
    const med = m.terminar()!;
    expect(med.tempo_ms).toBe(1910);
    expect(med.fontes.nominatim).toEqual({chamadas: 1, ms: 400, espera: 1100});
    expect(med.fontes.banco).toEqual({chamadas: 2, ms: 320, espera: 0});
    expect(med.paradas.get('p1')).toEqual({ms: 1620, nominatim: 1});
    expect(med.paradas.get('p2')).toEqual({ms: 30, nominatim: 0});
    const ev = evento([], med);
    expect(ev.tempo_ms).toBeGreaterThanOrEqual(ev.nominatim_espera_ms + ev.nominatim_ms + ev.banco_ms + ev.censo_ms + ev.cep_ms);
    // terminada, a próxima chamada não conta mais
    await m.medir('banco', async () => { r.anda(5); });
    expect(med.fontes.banco.chamadas).toBe(2);
  });

  it('a chamada que falha conta igual: o tempo foi gasto', async () => {
    const r = relogio(), m = criarMedidor(r.agora);
    m.comecar();
    await expect(m.medir('nominatim', async () => { r.anda(800); throw new Error('sem conexão'); })).rejects.toThrow();
    expect(m.terminar()!.fontes.nominatim).toEqual({chamadas: 1, ms: 800, espera: 0});
  });
});

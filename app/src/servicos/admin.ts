import type {SupabaseClient} from '@supabase/supabase-js';
import {nuvem} from './nuvem';

export interface Motorista {
  id: string;
  nome: string;
  papel: 'motorista' | 'admin';
  ativo: boolean;
}

export interface RotaResumo {
  id: string;
  dia: string;
  arquivo: string | null;
  criado_em: string;
  motorista: string;
  pacotes: number;
  entregues: number;
}

export interface PacoteAdmin {
  spx_tn: string | null;
  sequencia: number | null;
  endereco: string;
  bairro: string | null;
  lat: number | null;
  lng: number | null;
  entregue_em: string | null;
}

export interface Marcacao {
  motorista_id: string;
  nome: string;
  papel: string;
  lat: number;
  lng: number;
  criado_em: string;
  vezes: number;
}

export interface LugarCorrigido {
  chave: string;
  endereco: string;
  bairro: string;
  marcacoes: Marcacao[];
  situacao: 'confirmado' | 'sugestao' | null;
  escolhida: {lat: number; lng: number} | null;
  // de onde veio a confirmação: 'admin', 'correcao' (motoristas) ou 'entrega' (só passagens)
  fonte?: string | null;
  motoristas?: number;
  entregas?: number;
}

function cliente(): SupabaseClient {
  const c = nuvem.cliente;
  if (!c || !nuvem.sessao) throw new Error('entre na conta de administrador');
  return c;
}

function falhou(error: {message?: string} | null) {
  if (error) throw new Error(error.message || 'erro no servidor');
}

async function paginado<T>(consulta: (de: number, ate: number) => PromiseLike<{data: T[] | null; error: any}>): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const {data, error} = await consulta(de, de + 999);
    falhou(error);
    saida.push(...(data || []));
    if (!data || data.length < 1000) return saida;
  }
}

const pedacos = <T>(xs: T[], n: number) => Array.from({length: Math.ceil(xs.length / n)}, (_, i) => xs.slice(i * n, i * n + n));

export async function listarMotoristas(): Promise<Motorista[]> {
  const {data, error} = await cliente().from('perfis').select('id, nome, papel, ativo').order('papel').order('nome');
  falhou(error);
  return (data || []) as Motorista[];
}

export interface ContaNova {id: string; nome: string; senha: string}

// A conta nasce no banco, numa função que só quem administra chama: a chave de serviço, que é o
// outro jeito de criar conta, não pode vir para um app público (019_criar_motorista.sql).
export async function criarMotorista(email: string, nome: string): Promise<ContaNova> {
  const {data, error} = await cliente().rpc('criar_motorista', {email_: email, nome_: nome || null});
  if (error) {
    const faltaSql = error.code === 'PGRST202' || /criar_motorista/.test(error.message || '');
    throw new Error(faltaSql ? 'falta rodar o supabase/019_criar_motorista.sql no SQL Editor' : error.message || 'erro no servidor');
  }
  const conta = (data as ContaNova[] | null)?.[0];
  if (!conta?.senha) throw new Error('o banco não devolveu a senha');
  return conta;
}

export async function mudarAtivo(id: string, ativo: boolean) {
  const {error} = await cliente().from('perfis').update({ativo}).eq('id', id);
  falhou(error);
}

export async function listarRotas(dias = 14): Promise<RotaResumo[]> {
  const s = cliente();
  const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  const {data, error} = await s.from('rotas').select('id, dia, arquivo, criado_em, perfis(nome)').gte('dia', desde).order('dia', {ascending: false}).order('criado_em', {ascending: false});
  falhou(error);
  const rotas = (data || []) as any[];
  const ids = rotas.map(r => r.id as string);
  const contagem = await contarNoBanco(s, ids) || await contarBaixando(s, ids);
  return rotas.map(r => ({id: r.id, dia: r.dia, arquivo: r.arquivo, criado_em: r.criado_em, motorista: r.perfis?.nome || '?', ...contagem.get(r.id)!}));
}

type Contagem = Map<string, {pacotes: number; entregues: number}>;

// Uma ida e uma linha por rota (020_contagem_das_rotas.sql), em vez de baixar os 6 mil pacotes de
// 14 dias só para contar. Sem a função no banco, ou sem uma linha para cada rota, conta baixando.
async function contarNoBanco(s: SupabaseClient, ids: string[]): Promise<Contagem | null> {
  if (!ids.length) return new Map();
  const {data, error} = await s.rpc('contagem_das_rotas', {ids});
  if (error || !Array.isArray(data)) return null;
  const contagem: Contagem = new Map(data.map((x: any) => [x.rota_id, {pacotes: x.pacotes, entregues: x.entregues}]));
  return ids.every(id => contagem.has(id)) ? contagem : null;
}

async function contarBaixando(s: SupabaseClient, ids: string[]): Promise<Contagem> {
  const contagem: Contagem = new Map(ids.map(id => [id, {pacotes: 0, entregues: 0}]));
  // os pedaços ao mesmo tempo: um depois do outro, cada ida esperava a anterior
  await Promise.all(pedacos(ids, 50).map(async parte => {
    const pacotes = await paginado<{rota_id: string; entregue_em: string | null}>((de, ate) =>
      s.from('pacotes').select('rota_id, entregue_em').in('rota_id', parte).order('id').range(de, ate));
    for (const p of pacotes) {
      const c = contagem.get(p.rota_id);
      if (!c) continue;
      c.pacotes++;
      if (p.entregue_em) c.entregues++;
    }
  }));
  return contagem;
}

export async function pacotesDaRota(id: string): Promise<PacoteAdmin[]> {
  return paginado<PacoteAdmin>((de, ate) => cliente().from('pacotes')
    .select('spx_tn, sequencia, endereco, bairro, lat, lng, entregue_em').eq('rota_id', id)
    .order('sequencia', {nullsFirst: false}).order('id').range(de, ate));
}

export async function listarCorrecoes(limite = 500): Promise<LugarCorrigido[]> {
  const s = cliente();
  const {data, error} = await s.from('correcoes').select('chave_lugar, lat, lng, criado_em, motorista_id, perfis(nome, papel)')
    .order('criado_em', {ascending: false}).limit(limite);
  falhou(error);
  const lugares = new Map<string, LugarCorrigido>();
  for (const c of (data || []) as any[]) {
    let l = lugares.get(c.chave_lugar);
    if (!l) lugares.set(c.chave_lugar, l = {chave: c.chave_lugar, endereco: '', bairro: '', marcacoes: [], situacao: null, escolhida: null});
    const ja = l.marcacoes.find(m => m.motorista_id === c.motorista_id);
    if (ja) { ja.vezes++; continue; }
    l.marcacoes.push({motorista_id: c.motorista_id, nome: c.perfis?.nome || '?', papel: c.perfis?.papel || 'motorista', lat: c.lat, lng: c.lng, criado_em: c.criado_em, vezes: 1});
  }
  const chaves = [...lugares.keys()];
  // Os 300 lugares em pedaços de 100, todos ao mesmo tempo: um depois do outro eram 8 idas em fila,
  // 1,7 s só de espera (11/10). Cada pedaço tem chaves só dele, então a ordem de chegada não importa.
  await Promise.all(pedacos(chaves, 100).map(async parte => {
    const [{data: pos, error: e1}, {data: pac, error: e2}] = await Promise.all([
      s.rpc('posicoes', {chaves: parte}),
      s.from('pacotes').select('chave_lugar, endereco, bairro').in('chave_lugar', parte).order('criado_em', {ascending: false}).limit(1000),
    ]);
    falhou(e1);
    falhou(e2);
    for (const p of (pos || []) as any[]) {
      const l = lugares.get(p.chave_lugar);
      if (l) Object.assign(l, {situacao: p.situacao, escolhida: {lat: p.lat, lng: p.lng}, fonte: p.fonte, motoristas: p.motoristas, entregas: p.entregas});
    }
    for (const p of (pac || []) as any[]) {
      const l = lugares.get(p.chave_lugar);
      if (l && !l.endereco) { l.endereco = p.endereco; l.bairro = p.bairro || ''; }
    }
  }));
  return [...lugares.values()];
}

export interface Cobertura {
  ruas_com_nome: number;
  trechos_sem_nome: number;
  trechos_nossos: number;
  passagens: number;
  lugares: number;
  lugares_confirmados: number;
}

export interface UsoDoBotao {
  botao: string;
  total: number;
  depois: {botao: string; vezes: number}[];
}

// Soma os dias e os motoristas. Linha com `antes` vazio é o total do botão; com `antes`
// preenchido é "este botão foi tocado logo depois daquele".
export async function usoDosBotoes(dias = 30): Promise<{lista: UsoDoBotao[]; diasComDado: number}> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const {data, error} = await cliente().from('uso_dos_botoes').select('dia, botao, antes, vezes').gte('dia', desde).limit(5000);
  falhou(error);
  const linhas = (data || []) as {dia: string; botao: string; antes: string; vezes: number}[];
  const total = new Map<string, number>();
  const pares = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!l.antes) { total.set(l.botao, (total.get(l.botao) || 0) + l.vezes); continue; }
    if (!pares.has(l.antes)) pares.set(l.antes, new Map());
    const m = pares.get(l.antes)!;
    m.set(l.botao, (m.get(l.botao) || 0) + l.vezes);
  }
  const lista = [...total].sort((a, b) => b[1] - a[1]).map(([botao, t]) => ({
    botao, total: t,
    depois: [...(pares.get(botao) || new Map())].map(([b, v]) => ({botao: b, vezes: v})).sort((a, b) => b.vezes - a.vezes),
  }));
  return {lista, diasComDado: new Set(linhas.map(l => l.dia)).size};
}

export async function cobertura(): Promise<Cobertura | null> {
  const {data, error} = await cliente().rpc('cobertura');
  if (error) throw new Error(error.message);
  return (data && data[0]) || null;
}

export async function nomearRuas(): Promise<{trechos: number; ruas: number}> {
  const {data, error} = await cliente().rpc('nomear_ruas');
  if (error) throw new Error(error.message);
  return (data && data[0]) || {trechos: 0, ruas: 0};
}

export async function criarRuasDasEntregas(): Promise<{gravadas: number; pontos: number}> {
  const {data, error} = await cliente().rpc('criar_ruas_das_entregas');
  if (error) throw new Error(error.message);
  return (data && data[0]) || {gravadas: 0, pontos: 0};
}

export async function confirmarPosicao(chave: string, lat: number, lng: number) {
  const {error} = await cliente().from('correcoes').insert({chave_lugar: chave, lat, lng});
  falhou(error);
}

export async function apagarMarcacao(chave: string, motoristaId: string) {
  const {data, error} = await cliente().from('correcoes').delete().eq('chave_lugar', chave).eq('motorista_id', motoristaId).select('id');
  falhou(error);
  if (!data || !data.length) throw new Error('o servidor não deixou apagar (rode o supabase/003_admin.sql)');
}

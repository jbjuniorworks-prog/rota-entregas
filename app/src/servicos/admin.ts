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
  const contagem = new Map<string, {pacotes: number; entregues: number}>(rotas.map(r => [r.id, {pacotes: 0, entregues: 0}]));
  for (const ids of pedacos(rotas.map(r => r.id), 50)) {
    const pacotes = await paginado<{rota_id: string; entregue_em: string | null}>((de, ate) =>
      s.from('pacotes').select('rota_id, entregue_em').in('rota_id', ids).order('id').range(de, ate));
    for (const p of pacotes) {
      const c = contagem.get(p.rota_id);
      if (!c) continue;
      c.pacotes++;
      if (p.entregue_em) c.entregues++;
    }
  }
  return rotas.map(r => ({id: r.id, dia: r.dia, arquivo: r.arquivo, criado_em: r.criado_em, motorista: r.perfis?.nome || '?', ...contagem.get(r.id)!}));
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
  for (const parte of pedacos(chaves, 100)) {
    const {data: pos, error: e1} = await s.rpc('posicoes', {chaves: parte});
    falhou(e1);
    for (const p of (pos || []) as any[]) {
      const l = lugares.get(p.chave_lugar);
      if (l) { l.situacao = p.situacao; l.escolhida = {lat: p.lat, lng: p.lng}; }
    }
    const {data: pac, error: e2} = await s.from('pacotes').select('chave_lugar, endereco, bairro').in('chave_lugar', parte).order('criado_em', {ascending: false}).limit(1000);
    falhou(e2);
    for (const p of (pac || []) as any[]) {
      const l = lugares.get(p.chave_lugar);
      if (l && !l.endereco) { l.endereco = p.endereco; l.bairro = p.bairro || ''; }
    }
  }
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

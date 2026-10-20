import type {SupabaseClient} from '@supabase/supabase-js';
import {lugaresDaBusca, peneiraDaNuvem, peneiraDeChave, type LugarDaBusca} from '../logica/busca';
import {agruparConferencia, type MarcaEmConferencia, type MotoristaEmConferencia} from '../logica/conferencia';
import {hojeEmMaceio, resumirDia, type Dia, type PacoteDoDia} from '../logica/painel';
import type {PortaDaNuvem} from '../logica/triagem';
import {nuvem} from './nuvem';

export interface Motorista {
  id: string;
  nome: string;
  papel: 'motorista' | 'admin';
  ativo: boolean;
  // em conferência (022): o que marca ou entrega só vale depois que o admin aprova. Sem a 022
  // rodada, não vem.
  conferir?: boolean;
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
  const {data, error} = await cliente().from('perfis').select('*').order('papel').order('nome');
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

export async function mudarConferir(id: string, conferir: boolean) {
  const {error} = await cliente().from('perfis').update({conferir}).eq('id', id);
  falhou(error);
}

export async function listarRotas(dias = 14): Promise<RotaResumo[]> {
  const s = cliente();
  const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  // em partes: o servidor devolve 1.000 e cala, e 14 dias passam disso com uns 70 motoristas por dia
  const rotas = await paginado<any>((de, ate) => s.from('rotas').select('id, dia, arquivo, criado_em, perfis(nome)').gte('dia', desde)
    .order('dia', {ascending: false}).order('criado_em', {ascending: false}).order('id').range(de, ate));
  const ids = rotas.map(r => r.id as string);
  const contagem = await contarNoBanco(s, ids) || await contarBaixando(s, ids);
  return rotas.map(r => ({id: r.id, dia: r.dia, arquivo: r.arquivo, criado_em: r.criado_em, motorista: r.perfis?.nome || '?', ...contagem.get(r.id)!}));
}

type Contagem = Map<string, {pacotes: number; entregues: number}>;

// Uma ida e uma linha por rota (020_contagem_das_rotas.sql), em vez de baixar os 6 mil pacotes de
// 14 dias só para contar. Sem a função no banco, ou sem uma linha para cada rota, conta baixando.
async function contarNoBanco(s: SupabaseClient, ids: string[]): Promise<Contagem | null> {
  if (!ids.length) return new Map();
  // em pedaços: a resposta da função também para nas 1.000 linhas
  const partes = await Promise.all(pedacos(ids, 500).map(parte => s.rpc('contagem_das_rotas', {ids: parte})));
  if (partes.some(({data, error}) => error || !Array.isArray(data))) return null;
  const contagem: Contagem = new Map(partes.flatMap(({data}) => (data as any[]).map(x => [x.rota_id, {pacotes: x.pacotes, entregues: x.entregues}] as const)));
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

// O painel do dia: os pacotes das rotas de hoje e quais endereços já têm a porta verificada, pela
// mesma `posicoes` que o celular pergunta ao carregar.
export async function resumoDeHoje(rotas: RotaResumo[], agora = Date.now()): Promise<Dia> {
  const s = cliente();
  const hoje = rotas.filter(r => r.dia === hojeEmMaceio(agora));
  const pacotes: PacoteDoDia[] = [];
  await Promise.all(pedacos(hoje.map(r => r.id), 50).map(async parte => {
    pacotes.push(...await paginado<PacoteDoDia>((de, ate) => s.from('pacotes')
      .select('rota_id, chave_lugar, endereco, entregue_em').in('rota_id', parte).order('id').range(de, ate)));
  }));
  const chaves = [...new Set(pacotes.map(p => p.chave_lugar).filter((k): k is string => !!k))];
  const confirmadas = new Set<string>();
  // a `posicoes` recusa mais de 500 chaves de uma vez
  await Promise.all(pedacos(chaves, 500).map(async parte => {
    const {data, error} = await s.rpc('posicoes', {chaves: parte});
    falhou(error);
    for (const p of (data || []) as {chave_lugar: string; situacao: string}[]) if (p.situacao === 'confirmado') confirmadas.add(p.chave_lugar);
  }));
  return resumirDia(hoje.map(r => ({id: r.id, motorista: r.motorista, arquivo: r.arquivo})), pacotes, confirmadas, agora);
}

export async function pacotesDaRota(id: string): Promise<PacoteAdmin[]> {
  return paginado<PacoteAdmin>((de, ate) => cliente().from('pacotes')
    .select('spx_tn, sequencia, endereco, bairro, lat, lng, entregue_em').eq('rota_id', id)
    .order('sequencia', {nullsFirst: false}).order('id').range(de, ate));
}

export async function listarCorrecoes(limite = 500): Promise<LugarCorrigido[]> {
  const s = cliente();
  // `*` e não a lista: o `pendente` só existe depois da 022, e pedir uma coluna que falta derruba
  // a lista inteira
  const {data, error} = await s.from('correcoes').select('*, perfis(nome, papel)')
    .order('criado_em', {ascending: false}).limit(limite);
  falhou(error);
  const lugares = new Map<string, LugarCorrigido>();
  // a do motorista em conferência espera em "Em conferência", com o que mudaria se aprovada
  for (const c of ((data || []) as any[]).filter(c => !c.pendente)) {
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
  // em partes: o limit(5000) não passava das 1.000 que o servidor devolve, e 30 dias passam disso
  // no ritmo de outubro (uns 230 por semana)
  const linhas = await paginado<{dia: string; botao: string; antes: string; vezes: number}>((de, ate) => cliente().from('uso_dos_botoes')
    .select('dia, botao, antes, vezes').gte('dia', desde).order('dia').order('motorista_id').order('botao').order('antes').range(de, ate));
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

export interface LugarAchado extends LugarDaBusca {
  porta: (PortaDaNuvem & {lat: number; lng: number}) | null;
}

// "Procurar um endereço" (15/10): procura nos pacotes das planilhas, que têm o endereço escrito, e
// nas chaves das marcações e passagens, que é onde fica a porta de rota lida de vídeo. A porta que
// vale é a mesma que os celulares recebem, da `posicoes`.
export async function procurarLugares(busca: string): Promise<LugarAchado[]> {
  const s = cliente();
  const texto = peneiraDaNuvem(busca), chave = peneiraDeChave(busca);
  const nada = Promise.resolve({data: [] as any[], error: null});
  const [pac, cor, obs] = await Promise.all([
    texto ? s.from('pacotes').select('chave_lugar, endereco, bairro, cep').or(texto).order('criado_em', {ascending: false}).limit(200) : nada,
    chave ? s.from('correcoes').select('chave_lugar').ilike('chave_lugar', chave).order('criado_em', {ascending: false}).limit(200) : nada,
    chave ? s.from('observacoes').select('chave_lugar').ilike('chave_lugar', chave).order('criado_em', {ascending: false}).limit(200) : nada,
  ]);
  for (const r of [pac, cor, obs]) falhou(r.error);
  const marcadas = [...new Set([...(cor.data || []), ...(obs.data || [])].map((x: any) => x.chave_lugar as string))];
  const lugares = lugaresDaBusca(busca, (pac.data || []) as any[], marcadas);
  if (!lugares.length) return [];
  const {data: pos, error} = await s.rpc('posicoes', {chaves: lugares.map(l => l.chave)});
  falhou(error);
  const porChave = new Map(((pos || []) as any[]).map(p => [p.chave_lugar as string, p]));
  return lugares.map(l => ({...l, porta: porChave.get(l.chave) || null}));
}

export async function listarEmConferencia(): Promise<MotoristaEmConferencia[]> {
  const {data, error} = await cliente().rpc('marcas_em_conferencia');
  if (error) throw new Error(/marcas_em_conferencia/.test(error.message || '') ? 'falta rodar o supabase/022_conferencia.sql' : error.message);
  return agruparConferencia((data || []) as MarcaEmConferencia[]);
}

export async function decidirMarcas(motorista: string, chaves: string[], aprovar: boolean): Promise<number> {
  const {data, error} = await cliente().rpc('decidir_marcas', {motorista, chaves, aprovar});
  falhou(error);
  return (data as number) || 0;
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

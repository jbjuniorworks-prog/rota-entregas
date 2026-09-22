import type {Session, SupabaseClient} from '@supabase/supabase-js';
import {ErroNuvem, type ClienteNuvem} from '../logica/fila';
import {CHAVES} from '../logica/guarda';

const SUPA_URL = 'https://hkclzmlcfiksaqqspqsy.supabase.co';
const SUPA_CHAVE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrY2x6bWxjZmlrc2FxcXNwcXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NzcyNDgsImV4cCI6MjEwNTM1MzI0OH0.dPbu04slxXdKtzbfJtbMcxsUAnIoIxHg0eKAVX4K_h8';

export interface Perfil {
  id: string;
  nome: string;
  papel: 'motorista' | 'admin';
  ativo: boolean;
}

let supa: SupabaseClient | null = null;
let sessao: Session | null = null;
let perfil: Perfil | null = null;
let semServidor = false;

export const nuvem = {
  get sessao() { return sessao; },
  get perfil() { return perfil; },
  get semServidor() { return semServidor; },
  get cliente() { return supa; },
  get lembrada() { try { return !!localStorage.getItem(CHAVES.sessao); } catch { return false; } },
};

async function carregarPerfil() {
  if (!supa || !sessao) return;
  const {data} = await supa.from('perfis').select('id, nome, papel, ativo').eq('id', sessao.user.id).maybeSingle();
  perfil = (data as Perfil) || null;
}

export async function iniciarNuvem(): Promise<void> {
  try {
    const {createClient} = await import('@supabase/supabase-js');
    supa = createClient(SUPA_URL, SUPA_CHAVE, {auth: {persistSession: true, autoRefreshToken: true, storageKey: CHAVES.sessao}});
    sessao = (await supa.auth.getSession()).data.session;
    supa.auth.onAuthStateChange((_evento, s) => { sessao = s; if (!s) perfil = null; });
    await carregarPerfil();
    semServidor = false;
  } catch {
    semServidor = true;
  }
}

export async function entrar(email: string, senha: string): Promise<string> {
  if (!supa) return 'Sem conexão com o servidor. Tente de novo com internet.';
  if (!email || !senha) return 'Preencha o e-mail e a senha.';
  const {data, error} = await supa.auth.signInWithPassword({email, password: senha});
  if (error) return /invalid/i.test(error.message) ? 'E-mail ou senha errados.' : 'Não consegui entrar: ' + error.message;
  sessao = data.session;
  await carregarPerfil();
  return perfil && !perfil.ativo ? 'Sua conta está desativada. Fale com o responsável.' : `Olá, ${perfil ? perfil.nome : email}! Suas rotas vão ser salvas.`;
}

export async function sair() {
  if (supa) await supa.auth.signOut();
  sessao = null;
  perfil = null;
}

function erro(e: {code?: string; message?: string}): ErroNuvem {
  const deRede = !e.code || e.code === 'PGRST301' || /fetch|network|timeout/i.test(e.message || '');
  return new ErroNuvem(e.message || e.code || 'erro', deRede);
}

export function clienteNuvem(): ClienteNuvem | null {
  if (!supa || !sessao || !navigator.onLine) return null;
  const s = supa, uid = sessao.user.id;
  return {
    async rotaExistente(atId) {
      const {data, error} = await s.from('rotas').select('id').eq('at_id', atId).eq('motorista_id', uid).maybeSingle();
      if (error) throw erro(error);
      return data ? data.id : null;
    },
    async criarRota(id, atId, arquivo) {
      const {error} = await s.from('rotas').insert({id, at_id: atId, arquivo});
      if (error) throw erro(error);
    },
    async inserirPacotes(rotaId, pacotes) {
      const {error} = await s.from('pacotes').upsert(pacotes.map(p => ({...p, rota_id: rotaId})), {onConflict: 'rota_id,spx_tn', ignoreDuplicates: true});
      if (error) throw erro(error);
    },
    async marcarEntregue(rotaId, tns, quando) {
      const {error} = await s.from('pacotes').update({entregue_em: quando}).eq('rota_id', rotaId).in('spx_tn', tns);
      if (error) throw erro(error);
    },
    async inserirCorrecao(chave, lat, lng) {
      const {error} = await s.from('correcoes').insert({chave_lugar: chave, lat, lng});
      if (error) throw erro(error);
    },
    async apagarCorrecao(chave, lat, lng) {
      const {error} = await s.from('correcoes').delete().eq('chave_lugar', chave).eq('lat', lat).eq('lng', lng);
      if (error) throw erro(error);
    },
    async inserirObservacao({chave, lat, lng, precisao, endereco, rua, ruaChave}) {
      const {error} = await s.from('observacoes').upsert(
        {chave_lugar: chave, lat, lng, precisao_m: precisao, endereco, rua, rua_chave: ruaChave},
        {onConflict: 'chave_lugar,motorista_id,dia', ignoreDuplicates: true});
      if (error) throw erro(error);
    },
    async registrar(rotaId, semRuas, itens) {
      if (itens.length) {
        const {error} = await s.rpc('registrar_posicoes', {rota: rotaId, itens});
        if (error) throw erro(error);
      }
      const r = await s.from('rotas').update({sem_ruas: semRuas}).eq('id', rotaId);
      if (r.error) throw erro(r.error);
    },
    async inserirLugar({nomeChave, nome, cidade, lat, lng, endereco}) {
      const {error} = await s.from('lugares').upsert(
        {nome_chave: nomeChave, nome, cidade, lat, lng, endereco},
        {onConflict: 'nome_chave,cidade,motorista_id,dia', ignoreDuplicates: true});
      if (error) throw erro(error);
    },
    async lugaresConhecidos(palavras, cidade) {
      const {data, error} = await s.rpc('lugares_conhecidos', {palavras, cidade_: cidade});
      if (error) throw erro(error);
      return data || [];
    },
    async posicoes(chaves) {
      const saida = [];
      for (let i = 0; i < chaves.length; i += 400) {
        const {data, error} = await s.rpc('posicoes', {chaves: chaves.slice(i, i + 400)});
        if (error) throw erro(error);
        saida.push(...(data || []));
      }
      return saida;
    },
  };
}

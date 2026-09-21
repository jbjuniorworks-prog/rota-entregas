import {readFileSync} from 'node:fs';

export const TABELAS = ['perfis', 'rotas', 'pacotes', 'correcoes', 'observacoes', 'ruas'];

export function ambiente(sufixo = '') {
  const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
  const url = env['SUPABASE_URL' + sufixo], chave = env['SUPABASE_SERVICE_ROLE_KEY' + sufixo];
  if (!url || !chave) throw new Error(`Faltam SUPABASE_URL${sufixo} e SUPABASE_SERVICE_ROLE_KEY${sufixo} no .env`);
  return {url, chave};
}

export const mesmoBanco = (a, b) => !!a && !!b && (a.url === b.url || a.chave === b.chave);

export function api({url, chave}) {
  return async (caminho, init = {}) => {
    const r = await fetch(url + caminho, {
      ...init,
      headers: {apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', ...(init.headers || {})},
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${caminho} → ${r.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : null;
  };
}

export async function linhasDe(chamar, tabela, tamanho = 1000) {
  const saida = [];
  for (let de = 0; ; de += tamanho) {
    const parte = await chamar(`/rest/v1/${tabela}?select=*&order=id.asc&offset=${de}&limit=${tamanho}`);
    saida.push(...parte);
    if (parte.length < tamanho) return saida;
  }
}

export const usuariosDe = async chamar =>
  (await chamar('/auth/v1/admin/users?per_page=1000')).users.map(u => ({id: u.id, email: u.email, nome: (u.user_metadata || {}).nome || ''}));

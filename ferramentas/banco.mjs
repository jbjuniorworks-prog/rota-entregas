import {readFileSync} from 'node:fs';

// Todas as tabelas. Ficaram de fora de 21/09 a 21/10 as quatro do fim, criadas depois desta lista:
// o backup dizia "todas" e não levava os lugares.
export const TABELAS = ['perfis', 'rotas', 'pacotes', 'correcoes', 'observacoes', 'ruas',
  'lugares', 'reclamacoes', 'uso_dos_botoes', 'buscas_de_lista'];

// A chave de cada tabela, que dá a ordem da leitura. A uso_dos_botoes não tem id (016).
const CHAVE = {uso_dos_botoes: ['motorista_id', 'dia', 'botao', 'antes']};
export const chaveDe = tabela => CHAVE[tabela] || ['id'];

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

// Valor entre aspas dentro do or=(...): vírgula, ponto e parêntese são a sintaxe do filtro.
const literal = v => `"${String(v).replace(/[\\"]/g, m => '\\' + m)}"`;

// (a, b, …) > (x, y, …), do jeito que o PostgREST entende.
function depoisDe(chave, ultima) {
  if (chave.length === 1) return `${chave[0]}=gt.${encodeURIComponent(ultima[chave[0]])}`;
  const ramos = chave.map((c, i) => {
    const partes = [...chave.slice(0, i).map(k => `${k}.eq.${literal(ultima[k])}`), `${c}.gt.${literal(ultima[c])}`];
    return partes.length > 1 ? `and(${partes.join(',')})` : partes[0];
  });
  return 'or=' + encodeURIComponent(`(${ramos.join(',')})`);
}

// Cada página começa depois da última linha lida, não num número de linha: contando linhas, uma
// gravada no meio da leitura empurra as seguintes e uma sai duas vezes; uma apagada deixa outra de
// fora. Não é uma fotografia do banco: o gravado antes do ponto já lido, ou numa tabela já lida,
// fica para a próxima leitura.
export async function linhasDe(chamar, tabela, tamanho = 1000) {
  const chave = chaveDe(tabela), ordem = chave.map(c => c + '.asc').join(',');
  const saida = [];
  for (let ultima = null; ;) {
    const parte = await chamar(`/rest/v1/${tabela}?select=*&order=${ordem}${ultima ? '&' + depoisDe(chave, ultima) : ''}&limit=${tamanho}`);
    saida.push(...parte);
    if (parte.length < tamanho) return saida;
    ultima = parte[parte.length - 1];
  }
}

export const usuariosDe = async chamar =>
  (await chamar('/auth/v1/admin/users?per_page=1000')).users.map(u => ({id: u.id, email: u.email, nome: (u.user_metadata || {}).nome || ''}));

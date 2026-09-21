import {readFileSync} from 'node:fs';
import {randomInt} from 'node:crypto';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

async function api(caminho, init = {}) {
  const r = await fetch(BASE + caminho, {...init, headers: {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}});
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

function senha() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  for (;;) {
    const s = Array.from({length: 14}, () => a[randomInt(a.length)]).join('');
    if (/\d/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s)) return s;
  }
}

async function idPorEmail(email) {
  const {users} = await api('/auth/v1/admin/users?per_page=1000');
  const u = users.find(x => x.email.toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`nenhuma conta com ${email}`);
  return u.id;
}

const [acao, email, ...resto] = process.argv.slice(2);
const acoes = {
  async listar() {
    const perfis = await api('/rest/v1/perfis?select=id,nome,papel,ativo&order=papel,nome');
    const {users} = await api('/auth/v1/admin/users?per_page=1000');
    for (const p of perfis) console.log(`${p.ativo ? 'ativo  ' : 'INATIVO'}  ${p.papel.padEnd(9)}  ${p.nome.padEnd(20)}  ${users.find(u => u.id === p.id)?.email}`);
  },
  async criar() {
    const nome = resto.join(' ') || email.split('@')[0];
    const s = senha();
    await api('/auth/v1/admin/users', {method: 'POST', body: JSON.stringify({email, password: s, email_confirm: true, user_metadata: {nome}})});
    console.log(`Conta criada: ${nome} <${email}>\nSenha: ${s}`);
  },
  async senha() {
    const s = senha();
    await api(`/auth/v1/admin/users/${await idPorEmail(email)}`, {method: 'PUT', body: JSON.stringify({password: s})});
    console.log(`Nova senha de ${email}: ${s}`);
  },
  async desativar() {
    await api(`/rest/v1/perfis?id=eq.${await idPorEmail(email)}`, {method: 'PATCH', body: JSON.stringify({ativo: false})});
    console.log(`${email} desativado: não entra mais nem envia dados.`);
  },
  async ativar() {
    await api(`/rest/v1/perfis?id=eq.${await idPorEmail(email)}`, {method: 'PATCH', body: JSON.stringify({ativo: true})});
    console.log(`${email} ativado.`);
  },
  async admin() {
    await papel('admin');
  },
  async motorista() {
    await papel('motorista');
  },
};

async function papel(novo) {
  const id = await idPorEmail(email);
  if (novo === 'motorista') {
    const admins = await api('/rest/v1/perfis?select=id&papel=eq.admin&ativo=is.true');
    if (admins.length <= 1 && admins.some(a => a.id === id)) throw new Error('este e o unico admin ativo: promova outro antes de rebaixar este');
  }
  await api(`/rest/v1/perfis?id=eq.${id}`, {method: 'PATCH', body: JSON.stringify({papel: novo, ativo: true})});
  const admins = await api('/rest/v1/perfis?select=nome&papel=eq.admin&ativo=is.true');
  console.log(`${email} agora e ${novo}. Admins ativos: ${admins.map(a => a.nome).join(', ')}`);
}

if (!acoes[acao] || (acao !== 'listar' && !email)) {
  console.log(`Uso:
  npm run motoristas -- listar
  npm run motoristas -- criar email@x.com Nome do Motorista
  npm run motoristas -- senha email@x.com        (gera senha nova)
  npm run motoristas -- desativar email@x.com
  npm run motoristas -- ativar email@x.com
  npm run motoristas -- admin email@x.com        (vira administrador)
  npm run motoristas -- motorista email@x.com    (volta a ser motorista)`);
  process.exit(acao ? 1 : 0);
}
acoes[acao]().catch(e => { console.error('Erro:', e.message); process.exit(1); });

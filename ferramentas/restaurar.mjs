import {createHash, randomInt} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {ambiente, api, linhasDe, usuariosDe, TABELAS} from './banco.mjs';

const PADRAO = join(process.env.USERPROFILE || process.env.HOME || '.', 'OneDrive', 'backups', 'rota-entregas');
const alvo = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ultimoBackup();
const soConferir = process.argv.includes('--so-conferir');
const manter = process.argv.includes('--manter');
const soLimpar = process.argv.includes('--limpar');

function ultimoBackup() {
  const dias = readdirSync(PADRAO).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort();
  if (!dias.length) throw new Error('nenhum backup em ' + PADRAO);
  return join(PADRAO, dias[dias.length - 1]);
}

function ler(nome) {
  const arquivo = join(alvo, nome + '.ndjson.gz');
  if (!existsSync(arquivo)) return [];
  const texto = gunzipSync(readFileSync(arquivo)).toString('utf8');
  const resumo = JSON.parse(readFileSync(join(alvo, 'resumo.json'), 'utf8')).tabelas[nome];
  const sha = createHash('sha256').update(texto).digest('hex');
  if (resumo && resumo.sha256 !== sha) throw new Error(`${nome}: o arquivo do backup está corrompido`);
  return texto ? texto.split('\n').map(l => JSON.parse(l)) : [];
}

const senha = () => Array.from({length: 16}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[randomInt(56)]).join('') + '9Zx';

const daCasa = api(ambiente());
const doTeste = api(ambiente('_DESTINO'));

async function enviar(tabela, linhas, opcoes = '') {
  for (let i = 0; i < linhas.length; i += 500) {
    await doTeste(`/rest/v1/${tabela}${opcoes}`, {
      method: 'POST', body: JSON.stringify(linhas.slice(i, i + 500)),
      headers: {Prefer: 'return=minimal' + (opcoes.includes('on_conflict') ? ',resolution=merge-duplicates' : '')},
    });
  }
}

const TABELAS_DE_DADOS = ['pacotes', 'rotas', 'correcoes', 'observacoes', 'ruas'];

async function limpar(contas) {
  for (const t of TABELAS_DE_DADOS) {
    await doTeste(`/rest/v1/${t}?id=not.is.null`, {method: 'DELETE', headers: {Prefer: 'return=minimal'}});
  }
  const usuariosLa = await usuariosDe(doTeste);
  let apagadas = 0;
  for (const email of contas) {
    const u = usuariosLa.find(x => (x.email || '').toLowerCase() === (email || '').trim().toLowerCase());
    if (u) { await doTeste(`/auth/v1/admin/users/${u.id}`, {method: 'DELETE'}); apagadas++; }
  }
  const sobrou = [];
  for (const t of TABELAS_DE_DADOS) {
    const n = (await linhasDe(doTeste, t)).length;
    if (n) sobrou.push(`${t}: ${n}`);
  }
  console.log(sobrou.length
    ? `\n⚠️ Ainda sobrou no projeto de teste: ${sobrou.join(', ')}`
    : `\n🧹 Projeto de teste limpo: nenhum dado de cliente ficou lá${apagadas ? ` (${apagadas} conta(s) apagada(s))` : ''}.`);
}

if (soLimpar) {
  await limpar(ler('usuarios').map(u => u.email));
  process.exit(0);
}

console.log(`Restaurando ${alvo}\n`);
const usuarios = ler('usuarios');
const jaLa = await usuariosDe(doTeste);
const mapa = new Map();
const criadas = [];
for (const u of usuarios) {
  const existente = jaLa.find(x => (x.email || '').toLowerCase() === (u.email || '').toLowerCase());
  if (existente) { mapa.set(u.id, existente.id); continue; }
  if (soConferir) continue;
  const nova = senha();
  const criado = await doTeste('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({email: u.email, password: nova, email_confirm: true, user_metadata: {nome: u.nome}}),
  });
  mapa.set(u.id, criado.id);
  criadas.push(`${u.email}: ${nova}`);
}
const trocar = linha => ({...linha, motorista_id: mapa.get(linha.motorista_id) || linha.motorista_id});

if (!soConferir) {
  for (const p of ler('perfis')) {
    const id = mapa.get(p.id);
    if (id) await doTeste(`/rest/v1/perfis?id=eq.${id}`, {method: 'PATCH', body: JSON.stringify({nome: p.nome, papel: p.papel, ativo: p.ativo})});
  }
  await enviar('rotas', ler('rotas').map(trocar), '?on_conflict=id');
  await enviar('pacotes', ler('pacotes').map(({id, ...resto}) => resto), '?on_conflict=rota_id,spx_tn');
  await enviar('correcoes', ler('correcoes').map(({id, ...resto}) => trocar(resto)));
  await enviar('observacoes', ler('observacoes').map(({id, ...resto}) => trocar(resto)));
  await enviar('ruas', ler('ruas').map(({id, ...resto}) => resto), '?on_conflict=osm_id');
}

const ESSENCIA = {
  rotas: l => [l.at_id, l.dia, l.arquivo].join('|'),
  pacotes: l => [l.spx_tn, l.endereco, l.lat, l.lng, l.chave_lugar].join('|'),
  correcoes: l => [l.chave_lugar, l.lat, l.lng].join('|'),
  observacoes: l => [l.chave_lugar, l.lat, l.lng, l.precisao_m, l.rua_chave].join('|'),
  ruas: l => [l.osm_id, l.nome_chave, l.nome_chave2, l.tipo, l.bairro, l.conjunto, l.cidade].join('|'),
  perfis: l => [l.nome, l.papel, l.ativo].join('|'),
};
const digerir = (tabela, linhas) =>
  createHash('sha256').update(linhas.map(ESSENCIA[tabela]).sort().join('|')).digest('hex').slice(0, 12);

console.log('tabela        no backup   no teste   conteúdo');
let tudoIgual = true;
for (const t of ['perfis', ...TABELAS.filter(x => x !== 'perfis')]) {
  const doBackup = ler(t);
  const noTeste = await linhasDe(doTeste, t);
  const chavesLa = new Set(noTeste.map(ESSENCIA[t]));
  const faltando = doBackup.filter(l => !chavesLa.has(ESSENCIA[t](l)));
  const igual = !faltando.length;
  if (!igual) tudoIgual = false;
  const marca = igual
    ? (doBackup.length === noTeste.length ? 'igual (' + digerir(t, doBackup) + ')' : 'tudo presente, e mais ' + (noTeste.length - doBackup.length) + ' que já estavam lá')
    : `FALTAM ${faltando.length}: ` + faltando.slice(0, 2).map(ESSENCIA[t]).join(' / ').slice(0, 80);
  console.log(`${t.padEnd(14)}${String(doBackup.length).padStart(8)}${String(noTeste.length).padStart(11)}   ${marca}`);
}
const daCasaContagem = await linhasDe(daCasa, 'correcoes');
console.log(`\ncorreções no banco de verdade agora: ${daCasaContagem.length}`);
if (criadas.length) console.log('\nContas criadas no projeto de teste (senhas só valem lá):\n  ' + criadas.join('\n  '));
console.log(tudoIgual ? '\n✅ Restauração conferida: o backup volta inteiro.' : '\n❌ Faltou dado na restauração — olhe as linhas marcadas acima.');
if (manter) console.log('Os dados ficaram lá (--manter). Para apagar: npm run restaurar -- --limpar');
else await limpar(criadas.map(c => c.split(':')[0]));
process.exit(tudoIgual ? 0 : 1);

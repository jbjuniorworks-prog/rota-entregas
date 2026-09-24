// Recalcula a chave da rua já gravada no banco, a partir do nome que está lá.
//
// A chave é calculada em dois lugares: no celular (app/src/logica/texto.ts) e aqui nas
// ferramentas (chave-rua.mjs). Quando a regra muda, o celular passa a procurar por uma chave
// nova e o banco continua respondendo pela velha — a rua existe, tem nome, tem traçado, e
// simplesmente deixa de ser achada. Então mudar a regra e rodar isto são a mesma tarefa.
//
// Não reimporta nada: só reescreve `ruas.nome_chave` e `observacoes.rua_chave` a partir do
// texto que as duas tabelas já guardam. O traçado, a posição e a fonte não são tocados.
// `ruas.nome_chave2` (o apelido que veio do OpenStreetMap) fica como está — o texto do apelido
// não é guardado, então ele só se acerta no próximo `npm run ruas`. Chave velha ali não dá
// resposta errada: nenhuma busca produz mais aquela forma, ela só para de casar.
//
// Uso: npm run rechavear            (mostra o que faria, sem gravar)
//      npm run rechavear -- gravar
import {readFileSync} from 'node:fs';
import {chaveRua} from './chave-rua.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }
const cabecalho = {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`};
const gravar = process.argv.slice(2).includes('gravar');

async function tudo(tabela, campos, filtro) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${tabela}?select=${campos}${filtro}&order=id`, {
      headers: {...cabecalho, Range: `${de}-${de + 999}`},
    });
    if (!r.ok) throw new Error(`${tabela}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const linhas = await r.json();
    out.push(...linhas);
    if (linhas.length < 1000) return out;
  }
}

// Uma chamada por chave nova, não uma por linha: são centenas de linhas para poucas dezenas
// de chaves. Em pedaços, para a URL não estourar.
async function aplicar(tabela, coluna, porChave) {
  let feitas = 0;
  for (const [nova, ids] of porChave) {
    for (let i = 0; i < ids.length; i += 200) {
      const pedaco = ids.slice(i, i + 200);
      const r = await fetch(`${BASE}/rest/v1/${tabela}?id=in.(${pedaco.join(',')})`, {
        method: 'PATCH',
        headers: {...cabecalho, 'Content-Type': 'application/json', Prefer: 'return=minimal'},
        body: JSON.stringify({[coluna]: nova}),
      });
      if (!r.ok) throw new Error(`${tabela}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      feitas += pedaco.length;
    }
  }
  return feitas;
}

async function rechavear(tabela, colunaTexto, colunaChave) {
  const linhas = await tudo(tabela, `id,${colunaTexto},${colunaChave}`, `&${colunaTexto}=not.is.null`);
  const porChave = new Map();
  const exemplos = [];
  for (const l of linhas) {
    const nova = chaveRua(l[colunaTexto]);
    if (nova === (l[colunaChave] || '')) continue;
    if (!porChave.has(nova)) porChave.set(nova, []);
    porChave.get(nova).push(l.id);
    if (exemplos.length < 8) exemplos.push(`${JSON.stringify(l[colunaTexto])}  ${JSON.stringify(l[colunaChave])} -> ${JSON.stringify(nova)}`);
  }
  const quantas = [...porChave.values()].reduce((n, v) => n + v.length, 0);
  console.log(`${tabela}: ${linhas.length} com ${colunaTexto}, ${quantas} com chave diferente (${porChave.size} chaves)`);
  for (const e of exemplos) console.log('   ' + e);
  if (!quantas) return;
  if (!gravar) { console.log('   (nada gravado — rode com: npm run rechavear -- gravar)'); return; }
  console.log(`   gravando… ${await aplicar(tabela, colunaChave, porChave)} linha(s) atualizada(s).`);
}

await rechavear('ruas', 'nome', 'nome_chave');
await rechavear('observacoes', 'rua', 'rua_chave');

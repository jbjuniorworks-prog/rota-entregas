// Grava no banco a porta exata de um endereço, copiada do Google Maps, como correção da conta de
// administrador — que o `posicoes` já trata como "confirmado", então ela vale para todos os
// motoristas na mesma hora. Serve para a rua que o censo não tem e o mapa não sabe numerar.
//
//   npm run portas                      (lê portas.txt, só mostra o que faria)
//   npm run portas -- gravar            (grava)
//   npm run portas -- minhas-portas.txt gravar
//
// Cada linha do arquivo é o que o Google Maps copia, endereço e link juntos:
//   Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100 https://www.google.com/...
import {readFileSync} from 'node:fs';
import {chavesDoLugar, grafiasDaRua} from './chave-rua.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

async function api(caminho, init = {}) {
  const r = await fetch(BASE + caminho, {...init, headers: {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', Prefer: 'return=representation'}});
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// No link de lugar do Google o `!3d!4d` é a PORTA e o `@` é só o enquadramento do mapa: em links
// reais os dois chegaram a diferir 250 m. Por isso a ordem aqui não é decorativa.
// Literais de regex, não strings montadas: `'\d'` numa string JS vira só `d`, e a coordenada
// deixava de ser achada sem erro nenhum.
const PORTA = /!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/;
const CONSULTA = /[?&](?:q|query|destination|ll)=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})/i;
const ENQUADRAMENTO = /@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/;
const PAR_SOLTO = /(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/;

function coordenada(linha) {
  for (const re of [PORTA, CONSULTA, ENQUADRAMENTO]) {
    const m = linha.match(re);
    if (m) return {lat: +m[1], lng: +m[2]};
  }
  const m = linha.replace(/https?:\/\/\S+/g, ' ').match(PAR_SOLTO);
  return m ? {lat: +m[1], lng: +m[2]} : null;
}

// O título que o Google copia é regular: "<rua>, <número> - <bairro>, <cidade> - <UF>[, <CEP>]".
// Rua sem número vem sem a parte do número, e aí a porta é "sn" — que é endereço de verdade.
// "Nilton Fontes - Av. Deputado Sílvio Teixeira, 200 - Jardins…": o Google põe o nome do
// estabelecimento na frente. Sem tirar, ele entra no nome da rua e a chave não bate com nada.
const TIPO_NA_FRENTE = /^(rua|r\.|avenida|av\.?|travessa|tv\.?|trav\.?|pra[çc]a|p[çc]\.|alameda|al\.|rodovia|rod\.|estrada|estr?\.|via|largo|beco|viela|passagem|conjunto|conj\.|loteamento|lot\.)\s/i;

function semNomeDoLugar(texto) {
  const i = texto.indexOf(' - ');
  if (i < 0) return texto;
  const depois = texto.slice(i + 3);
  return !TIPO_NA_FRENTE.test(texto) && TIPO_NA_FRENTE.test(depois) ? depois : texto;
}

function partes(linha) {
  const texto = semNomeDoLugar(linha.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[\s,;]+$/, ''));
  const cep = (texto.match(/\b(\d{5})-?(\d{3})\b/) || []).slice(1).join('') || null;
  const m = texto.match(/^(.+?)(?:,\s*(\d{1,6}[a-z]?|s\/?n))?\s*-\s*([^,]+?),\s*([^,-]+?)\s*-\s*([A-Za-z]{2})\b/);
  if (!m) return null;
  const numero = m[2] ? (/^s\/?n$/i.test(m[2]) ? 'sn' : m[2]) : 'sn';
  return {rua: m[1].trim(), numero: numero.toLowerCase(), bairro: m[3].trim(), cidade: `${m[4].trim()}, ${m[5].toUpperCase()}`, cep};
}

const args = process.argv.slice(2);
const gravar = args.includes('gravar');
const arquivo = args.find(a => a !== 'gravar') || 'portas.txt';

let linhas;
try {
  linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
} catch {
  console.error(`Não achei o arquivo "${arquivo}". Ponha uma porta por linha, do jeito que o Google Maps copia.`);
  process.exit(1);
}

const admins = await api('/rest/v1/perfis?select=id,nome&papel=eq.admin&ativo=is.true&order=nome');
if (!admins.length) { console.error('Nenhum admin ativo: a porta não sairia como confirmada.'); process.exit(1); }
const dono = admins[0];

const aGravar = [];
for (const l of linhas) {
  const p = partes(l), c = coordenada(l);
  if (!p || !c) { console.log(`  ?  não entendi: ${l.slice(0, 70)}`); continue; }
  const chaves = [...new Set(grafiasDaRua(p.rua).flatMap(rua => chavesDoLugar({...p, rua})))];
  if (!chaves.length) { console.log(`  ?  sem CEP e sem bairro, não dá chave: ${p.rua} ${p.numero}`); continue; }
  console.log(`  ${p.rua}, ${p.numero} — ${p.bairro} -> ${c.lat}, ${c.lng}`);
  for (const chave of chaves) {
    console.log(`       chave ${chave}`);
    aGravar.push({chave_lugar: chave, lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), motorista_id: dono.id});
  }
}

if (!aGravar.length) { console.log('\nNada para gravar.'); process.exit(0); }
if (!gravar) {
  console.log(`\n${aGravar.length} linha(s) seriam gravadas como correção de ${dono.nome} (admin, vale como confirmada).`);
  console.log('Para gravar de verdade: npm run portas -- gravar');
  process.exit(0);
}
// apaga a correção anterior do dono para a mesma chave, senão fica uma pilha de versões
for (const chave of [...new Set(aGravar.map(x => x.chave_lugar))]) {
  await api(`/rest/v1/correcoes?chave_lugar=eq.${encodeURIComponent(chave)}&motorista_id=eq.${dono.id}`, {method: 'DELETE'});
}
await api('/rest/v1/correcoes', {method: 'POST', body: JSON.stringify(aGravar)});
console.log(`\nGravadas ${aGravar.length} linha(s) como ${dono.nome}. Os motoristas recebem na próxima busca.`);

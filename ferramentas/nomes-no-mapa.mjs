// Diz, para cada trecho de rua da nossa base que não veio do OpenStreetMap, como ele aparece no
// mapa do app (que é o OSM): 'com_nome' (o mapa já mostra este nome ali), 'sem_nome' (o mapa
// desenha a rua, com outro nome ou nenhum) ou 'fora' (o mapa não tem o trecho). O celular usa isso
// para escrever no mapa o nome da rua das entregas do dia, e desenhar o trecho que falta.
//
//   npm run nomes-no-mapa              (só mostra o que faria)
//   npm run nomes-no-mapa -- gravar    (grava; precisa da supabase/023_nome_no_mapa.sql)
//
// Roda no computador, com o mapa inteiro: no celular, buscar o mapa em volta das entregas deixava
// de fora as rodovias, que vão a 7 km do ponto guardado. Rodar de novo depois de `npm run ruas` ou
// `npm run prefeitura -- gravar`.
// Medido em 17/10: no Robalo o OSM tem o traçado de quase todas as ruas, mas com nome de projeto do
// loteamento ("Rua B" onde a prefeitura e a planilha dizem "Professora Albertina Bezerra Ribeiro").
import {pathToFileURL} from 'node:url';

const PERTO_M = 20;
// tanto do trecho em cima de uma rua do mapa para contar como "a rua está lá"
const NO_MAPA = 0.8;
// tanto em cima de uma rua do mapa com o mesmo nome para contar como "o nome está lá"
const COM_NOME = 0.6;
// a cada quantos metros o trecho é medido: um trecho reto de 200 m vem com dois pontos só, e as
// duas pontas em cima do mapa não dizem nada do meio
const PASSO_M = 10;
const CEL = 0.001;

const metros = (a, b) => 111320 * Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));

export function amostrar(linha) {
  const out = [linha[0]];
  for (let i = 1; i < linha.length; i++) {
    const [a, b] = [linha[i - 1], linha[i]];
    const n = Math.max(1, Math.ceil(metros(a, b) / PASSO_M));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

function aoSegmento(q, a, b) {
  const k = Math.cos(q[0] * Math.PI / 180);
  const ax = (a[1] - q[1]) * k, ay = a[0] - q[0], bx = (b[1] - q[1]) * k, by = b[0] - q[0];
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return 111320 * Math.hypot(ax + t * dx, ay + t * dy);
}

// Os segmentos do mapa numa grade de ~110 m. Um segmento longo entra em todas as células que ele
// atravessa (pela amostra), senão o ponto do meio de uma avenida comprida não o achava.
export function indexar(osm) {
  const grade = new Map();
  for (const r of osm) {
    if (!Array.isArray(r.linha)) continue;
    for (let i = 1; i < r.linha.length; i++) {
      const s = {a: r.linha[i - 1], b: r.linha[i], nome_chave: r.nome_chave || null};
      const celulas = new Set(amostrar([s.a, s.b]).map(q => `${Math.round(q[0] / CEL)}|${Math.round(q[1] / CEL)}`));
      for (const c of celulas) {
        if (!grade.has(c)) grade.set(c, []);
        grade.get(c).push(s);
      }
    }
  }
  return grade;
}

function vizinhos(grade, q) {
  const ci = Math.round(q[0] / CEL), cj = Math.round(q[1] / CEL), out = [];
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) out.push(...(grade.get(`${i}|${j}`) || []));
  return out;
}

export function classificar(trecho, grade) {
  const pontos = amostrar(trecho.linha);
  let naRua = 0, noNome = 0;
  for (const q of pontos) {
    const perto = vizinhos(grade, q).filter(s => aoSegmento(q, s.a, s.b) <= PERTO_M);
    if (perto.length) naRua++;
    if (trecho.nome_chave && perto.some(s => s.nome_chave === trecho.nome_chave)) noNome++;
  }
  if (noNome >= COM_NOME * pontos.length) return 'com_nome';
  // o trecho que os motoristas nomearam é uma rua do mapa sem nome: está lá, mesmo que o OSM de
  // agora não o tenha mais com esse traçado
  if (trecho.fonte === 'motorista' || naRua >= NO_MAPA * pontos.length) return 'sem_nome';
  return 'fora';
}

const ehCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehCli) {
  const {readFileSync} = await import('node:fs');
  const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
  const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }
  const api = async (caminho, init = {}) => {
    const r = await fetch(BASE + caminho, {...init, headers: {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', ...(init.headers || {})}});
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 300)}`);
    return t ? JSON.parse(t) : null;
  };
  const gravar = process.argv.includes('gravar');
  // PostgREST devolve 1000 linhas e cala: sem paginar, faltava rua do mapa e sobrava "fora"
  const ruas = [];
  for (let de = 0; ; de += 1000) {
    const parte = await api(`/rest/v1/ruas?select=id,fonte,nome,nome_chave,linha&order=id.asc&offset=${de}&limit=1000`);
    ruas.push(...parte);
    if (parte.length < 1000) break;
  }
  const grade = indexar(ruas.filter(r => r.fonte === 'osm'));
  // as das entregas ficam de fora: o traçado delas sai dos pontos das portas, não da rua
  const alvo = ruas.filter(r => (r.fonte === 'prefeitura' || r.fonte === 'motorista') && Array.isArray(r.linha) && r.linha.length >= 2);
  const porClasse = {com_nome: [], sem_nome: [], fora: []};
  for (const r of alvo) porClasse[classificar(r, grade)].push(r);
  console.log(`${ruas.length} trechos na base, ${alvo.length} da prefeitura e dos motoristas:`);
  for (const [c, rs] of Object.entries(porClasse)) console.log(`  ${c.padEnd(9)} ${rs.length}`);
  if (!gravar) {
    console.log('\nPara gravar de verdade: npm run nomes-no-mapa -- gravar');
    process.exit(0);
  }
  for (const [c, rs] of Object.entries(porClasse)) {
    for (let i = 0; i < rs.length; i += 300) {
      const ids = rs.slice(i, i + 300).map(r => r.id).join(',');
      await api(`/rest/v1/ruas?id=in.(${ids})`, {method: 'PATCH', body: JSON.stringify({no_mapa: c}), headers: {Prefer: 'return=minimal'}});
    }
  }
  console.log(`\nGravado em ${alvo.length} trechos. Os celulares usam na próxima vez que abrirem o mapa.`);
}

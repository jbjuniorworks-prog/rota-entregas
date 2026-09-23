// Traz para a nossa base as ruas que a prefeitura tem e o OpenStreetMap não.
// O cadastro de logradouros de Aracaju (BCR-2022) tem 3.273 ruas; medindo contra o que já
// tínhamos, 1.284 delas faltavam — 41% a mais de cobertura, com o traçado, não só o nome.
// Só entram as que faltam: onde o OSM já tem a rua, ele continua mandando, porque é ele que
// os motoristas corrigem e que o `nomear_ruas` melhora.
// Uso: npm run prefeitura              (mostra o que faria, sem gravar)
//      npm run prefeitura -- gravar
import {readFileSync} from 'node:fs';
import {chaveRua, tipoDaRua} from './chave-rua.mjs';
import {bairroDoPonto, baixarBairros} from './bairros.mjs';
import {meio, simplificar} from './ruas.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

const SERVICOS = {
  Aracaju: {
    ows: 'https://geoserver.fazenda.aracaju.se.gov.br/ows',
    camada: 'Transporte_e_Mobilidade:cif_trecho_logradouro_l',
    fonte: 'Prefeitura Municipal de Aracaju — cadastro de logradouros (BCR-2022)',
  },
};

// O que as OUTRAS fontes já têm. Contar as da própria prefeitura aqui faria a segunda execução
// achar que não falta nada, e o trocar() apagaria a importação inteira sem repor.
async function daNossaBase(cidade) {
  const chaves = new Set();
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${BASE}/rest/v1/ruas?select=nome_chave&cidade=eq.${encodeURIComponent(cidade)}&nome_chave=not.is.null&fonte=neq.prefeitura&order=id`, {
      headers: {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, Range: `${de}-${de + 999}`},
    });
    const linhas = await r.json();
    for (const l of linhas) chaves.add(l.nome_chave);
    if (linhas.length < 1000) return chaves;
  }
}

async function logradouros(s) {
  const url = `${s.ows}?service=WFS&version=2.0.0&request=GetFeature`
    + `&typeNames=${encodeURIComponent(s.camada)}&outputFormat=application/json&srsName=EPSG:4326`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('o serviço de logradouros respondeu ' + r.status);
  return (await r.json()).features || [];
}

// Reimportar troca tudo o que veio da prefeitura nesta cidade: apaga e põe de novo. O índice
// único de (fonte, fonte_id) é parcial, e ON CONFLICT não sabe usar índice parcial — e para
// uma carga inteira trocar é mais simples de entender do que casar linha a linha.
async function trocar(cidade, linhas) {
  const h = {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json'};
  const apagar = await fetch(`${BASE}/rest/v1/ruas?cidade=eq.${encodeURIComponent(cidade)}&fonte=eq.prefeitura`, {method: 'DELETE', headers: h});
  if (!apagar.ok) throw new Error(`apagando as antigas: ${apagar.status} ${(await apagar.text()).slice(0, 200)}`);
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await fetch(`${BASE}/rest/v1/ruas`, {
      method: 'POST', headers: {...h, Prefer: 'return=minimal'}, body: JSON.stringify(linhas.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
    process.stdout.write(`\r  enviados ${Math.min(i + 500, linhas.length)} de ${linhas.length}`);
  }
}

// "RUA SEM DENOMINAÇÃO" é o preenchimento do cadastro para trecho sem nome, e é o nome mais
// repetido dele: 1.468 trechos. Entrar como rua faria uma via fantasma cruzando a cidade inteira,
// que o escolherTrecho passaria a oferecer para qualquer endereço mal lido.
const SEM_NOME = /\bsem\s+denomina|^\s*(rua|travessa|avenida|praça)\s+projetad[ao]\s*$/i;
const nomeDeVerdade = n => !!n && !SEM_NOME.test(n.normalize('NFC'));

// o GeoJSON vem [lng, lat]; o resto da ferramenta trabalha com {lat, lon}
const comoPontos = geom => (geom.type === 'MultiLineString' ? geom.coordinates : [geom.coordinates])
  .flat().map(([lon, lat]) => ({lat, lon}));

const cidade = 'Aracaju';
const gravar = process.argv.slice(2).includes('gravar');
const s = SERVICOS[cidade];

console.log(`${cidade}: pedindo os logradouros à prefeitura…`);
const feicoes = await logradouros(s);
const nossas = await daNossaBase(cidade);
const {bairros} = await baixarBairros(cidade);
console.log(`  ${feicoes.length} trechos da prefeitura, ${nossas.size} ruas já na nossa base, ${bairros.length} bairros desenhados.`);

const linhas = [];
const ruasNovas = new Set();
let semNome = 0, jaTemos = 0, semGeometria = 0;
for (const f of feicoes) {
  const nome = (f.properties || {}).nome;
  const chave = nomeDeVerdade(nome) ? chaveRua(nome) : '';
  if (!chave) { semNome++; continue; }
  if (nossas.has(chave)) { jaTemos++; continue; }
  const pontos = f.geometry ? comoPontos(f.geometry) : [];
  if (pontos.length < 2) { semGeometria++; continue; }
  const centro = meio(pontos);
  ruasNovas.add(chave);
  linhas.push({
    osm_id: null,
    fonte_id: f.properties.id || f.id,
    nome,
    nome_chave: chave,
    tipo: tipoDaRua(nome) || null,
    nome_chave2: null,
    bairro: bairroDoPonto(bairros, centro),
    conjunto: null,
    cidade,
    ...centro,
    linha: simplificar(pontos),
    fonte: 'prefeitura',
    atualizado_em: new Date().toISOString(),
  });
}
const comBairro = linhas.filter(l => l.bairro).length;
console.log(`\n  ${jaTemos} trechos de ruas que já temos (deixados como estão)`);
console.log(`  ${semNome} sem nome de verdade (inclui "SEM DENOMINAÇÃO"), ${semGeometria} sem geometria aproveitável`);
console.log(`  ${linhas.length} trechos NOVOS, em ${ruasNovas.size} ruas que faltavam (${comBairro} com bairro identificado)`);

if (!gravar) {
  console.log('\n  amostra do que entraria:');
  for (const l of linhas.slice(0, 10)) console.log(`    ${l.nome.slice(0, 44).padEnd(44)} ${l.bairro || '(sem bairro)'}`);
  console.log('\n  nada foi gravado. Para gravar: npm run prefeitura -- gravar');
} else {
  await trocar(cidade, linhas);
  console.log(`\n  pronto: ${ruasNovas.size} ruas novas em ${cidade}.`);
}

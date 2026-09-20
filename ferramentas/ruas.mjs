import {readFileSync} from 'node:fs';
import {chaveRua, tipoDaRua} from './chave-rua.mjs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => l.split(/=(.*)/s).slice(0, 2)));
const BASE = env.SUPABASE_URL, CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env'); process.exit(1); }

const TIPOS = 'residential|unclassified|tertiary|secondary|primary|living_street|pedestrian|service|track|road';

async function overpass(cidade) {
  const consulta = `[out:json][timeout:600];area["name"="${cidade}"]["admin_level"="8"]->.a;way(area.a)["highway"~"^(${TIPOS})$"];out geom;`;
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(consulta),
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'rota-entregas/1.0'},
    });
    const texto = await r.text();
    if (r.ok && texto.startsWith('{')) return JSON.parse(texto).elements;
    console.log(`  servidor do mapa ocupado (${r.status}), tentativa ${tentativa} de 5…`);
    await new Promise(s => setTimeout(s, 20000));
  }
  throw new Error('o servidor do mapa não respondeu');
}

function outroNome(tags) {
  const outros = [tags.alt_name, tags.old_name, tags.official_name, tags.short_name]
    .flatMap(n => (n || '').split(';')).map(n => chaveRua(n.trim())).filter(Boolean);
  const principal = tags.name ? chaveRua(tags.name) : '';
  return outros.find(n => n !== principal) || null;
}

const meio = pontos => {
  const p = pontos[Math.floor(pontos.length / 2)];
  return {lat: +p.lat.toFixed(6), lng: +p.lon.toFixed(6)};
};

function simplificar(pontos, maximo = 40) {
  if (pontos.length <= maximo) return pontos.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
  const passo = (pontos.length - 1) / (maximo - 1);
  return Array.from({length: maximo}, (_, i) => pontos[Math.round(i * passo)]).map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
}

async function enviar(linhas) {
  const r = await fetch(`${BASE}/rest/v1/ruas?on_conflict=osm_id`, {
    method: 'POST',
    headers: {apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal'},
    body: JSON.stringify(linhas),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 300)}`);
}

const cidades = process.argv.slice(2);
if (!cidades.length) { console.error('uso: npm run ruas -- Aracaju "Nossa Senhora do Socorro"'); process.exit(1); }

for (const cidade of cidades) {
  console.log(`\n${cidade}: pedindo as ruas ao OpenStreetMap…`);
  const vias = await overpass(cidade);
  const linhas = vias.filter(v => v.geometry && v.geometry.length > 1).map(v => ({
    osm_id: v.id,
    nome: v.tags.name || null,
    nome_chave: v.tags.name ? chaveRua(v.tags.name) : null,
    tipo: v.tags.name ? tipoDaRua(v.tags.name) || null : null,
    nome_chave2: outroNome(v.tags),
    cidade,
    ...meio(v.geometry),
    linha: simplificar(v.geometry),
    fonte: 'osm',
    atualizado_em: new Date().toISOString(),
  }));
  const comNome = linhas.filter(l => l.nome_chave).length;
  console.log(`  ${linhas.length} trechos (${comNome} com nome, ${linhas.length - comNome} sem nome). Enviando…`);
  for (let i = 0; i < linhas.length; i += 500) {
    await enviar(linhas.slice(i, i + 500));
    process.stdout.write(`\r  enviados ${Math.min(i + 500, linhas.length)} de ${linhas.length}`);
  }
  const nomes = new Set(linhas.filter(l => l.nome_chave).map(l => l.nome_chave));
  console.log(`\n  pronto: ${nomes.size} ruas com nome diferente em ${cidade}.`);
}

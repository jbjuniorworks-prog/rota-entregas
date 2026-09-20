import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdirSync, writeFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ambiente, api, linhasDe, usuariosDe, TABELAS} from './banco.mjs';

const DESTINO = process.env.BACKUP_DIR || process.argv[2]
  || join(process.env.USERPROFILE || process.env.HOME || '.', 'OneDrive', 'backups', 'rota-entregas');
const GUARDAR_DIAS = 14;

const chamar = api(ambiente());
const hoje = new Date().toISOString().slice(0, 10);
const pasta = join(DESTINO, hoje);
mkdirSync(pasta, {recursive: true});

const resumo = {quando: new Date().toISOString(), tabelas: {}};

function gravar(nome, linhas) {
  const texto = linhas.map(l => JSON.stringify(l)).join('\n');
  const zip = gzipSync(Buffer.from(texto, 'utf8'), {level: 9});
  writeFileSync(join(pasta, nome + '.ndjson.gz'), zip);
  resumo.tabelas[nome] = {linhas: linhas.length, bytes: zip.length, sha256: createHash('sha256').update(texto).digest('hex')};
  console.log(`  ${nome.padEnd(12)} ${String(linhas.length).padStart(7)} linhas · ${(zip.length / 1e6).toFixed(2)} MB`);
}

console.log(`Backup de ${hoje} em ${pasta}`);
gravar('usuarios', await usuariosDe(chamar));
for (const t of TABELAS) gravar(t, await linhasDe(chamar, t));
writeFileSync(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2));

const limite = new Date(Date.now() - GUARDAR_DIAS * 864e5).toISOString().slice(0, 10);
const apagadas = readdirSync(DESTINO)
  .filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n) && n < limite && !n.endsWith('-01'))
  .filter(n => statSync(join(DESTINO, n)).isDirectory());
for (const n of apagadas) rmSync(join(DESTINO, n), {recursive: true, force: true});

const total = Object.values(resumo.tabelas).reduce((n, t) => n + t.bytes, 0);
console.log(`Pronto: ${(total / 1e6).toFixed(1)} MB. Guardados ${readdirSync(DESTINO).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).length} backups${apagadas.length ? `, ${apagadas.length} antigo(s) apagado(s)` : ''}.`);

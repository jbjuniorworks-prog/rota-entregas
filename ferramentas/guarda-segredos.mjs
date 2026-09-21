import {execFileSync} from 'node:child_process';
import {readFileSync, statSync} from 'node:fs';

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrY2x6bWxjZmlrc2FxcXNwcXN5Iiwicm9sZSI6ImFub24i';
const PLANILHAS_OK = /^testes\/planilhas\//;
const BINARIO = /\.(png|jpe?g|gif|webp|mp4|mov|pdf|ico|zip|gz)$/i;
const IMAGENS_OK = /^app\/public\/[^/]+\.(png|ico|svg|webp)$/i;

export function olharNome(caminho) {
  if (BINARIO.test(caminho) && !IMAGENS_OK.test(caminho)) {
    return 'imagem, vídeo ou PDF fora de app/public — a rota chega por print, e o que está dentro dele ninguém lê no diff';
  }
  if (/\.(xlsx|xls|ods|csv)$/i.test(caminho) && !PLANILHAS_OK.test(caminho)) {
    return 'planilha fora de testes/planilhas — pode ser rota de verdade';
  }
  if (/\.txt$/i.test(caminho) && !PLANILHAS_OK.test(caminho)) {
    return 'arquivo .txt solto — a Shopee manda a planilha com essa extensão';
  }
  if (/(^|[\\/])\.env|\.env$/.test(caminho)) return 'arquivo .env, onde ficam as chaves';
  if (/Downloads|Área de Trabalho|Desktop/i.test(caminho)) return 'arquivo vindo de pasta pessoal';
  return null;
}

export function olharConteudo(texto) {
  const semAnon = texto.split(/\r?\n/).filter(l => !l.includes('guarda:exemplo')).join('\n').split(ANON).join('');
  if (/"?role"?\s*:\s*"?service_role/.test(semAnon)) return 'chave service_role do Supabase';
  if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S/.test(semAnon)) return 'chave de serviço com valor';
  const jwt = semAnon.match(/eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/);
  if (jwt) return 'parece uma chave/token (' + jwt[0].slice(0, 18) + '…)';
  const email = semAnon.match(/[\w.+-]+@(gmail|hotmail|outlook|yahoo|icloud|live|uol|bol)\.com(\.br)?/i);
  if (email && !/^juniorpiks\+/.test(email[0])) return 'e-mail de pessoa real: ' + email[0];
  const tn = semAnon.match(/\bBR\d{10,}[A-Z]?\b/);
  if (tn) return 'código de pacote de verdade: ' + tn[0];
  const telefone = semAnon.match(/\+55\s?\d{2}\s?9\d{4}[- ]?\d{4}/);
  if (telefone) return 'telefone: ' + telefone[0];
  return null;
}

export function revisar(arquivos, lerTexto) {
  const achados = [];
  for (const caminho of arquivos) {
    if (/guarda-segredos/.test(caminho)) continue;
    const peloNome = olharNome(caminho);
    if (peloNome) { achados.push({caminho, motivo: peloNome}); continue; }
    if (BINARIO.test(caminho)) continue;
    const texto = lerTexto(caminho);
    if (texto == null) continue;
    const peloConteudo = olharConteudo(texto);
    if (peloConteudo) achados.push({caminho, motivo: peloConteudo});
  }
  return achados;
}

if (process.argv[1] && process.argv[1].endsWith('guarda-segredos.mjs')) {
  const staged = process.argv.includes('--staged');
  const lista = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACM'] : ['ls-files'], {encoding: 'utf8'})
    .split('\n').map(l => l.trim()).filter(Boolean);
  const ler = caminho => {
    try {
      if (statSync(caminho).size > 2e6) return null;
      return readFileSync(caminho, 'utf8');
    } catch { return null; }
  };
  const achados = revisar(lista, ler);
  if (!achados.length) {
    console.log(`guarda: ${lista.length} arquivo(s) conferido(s), nada de dado real ou chave.`);
    process.exit(0);
  }
  console.error('\n❌ NÃO COMMITAR — o repositório é público:\n');
  for (const a of achados) console.error(`  ${a.caminho}\n    ${a.motivo}`);
  console.error('\nTire o arquivo do commit (git restore --staged <arquivo>) ou apague o trecho.');
  console.error('Se for engano, rode o commit com --no-verify.\n');
  process.exit(1);
}

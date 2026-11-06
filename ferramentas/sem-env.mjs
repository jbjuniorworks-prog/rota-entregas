// Hook do Claude Code (PreToolUse, terminal): recusa comando que cite o arquivo .env. "Nunca
// imprima o conteúdo do .env" (CLAUDE.md) era só regra escrita. Pega o comando que nomeia o
// arquivo; não pega o que chega nele por outro caminho (variável, glob, script). Os scripts de
// ferramentas/ leem o .env de propósito e não passam por aqui.

// .env e .env.algo como nome de arquivo; não .envrc, não process.env
const ANTES = String.raw`(?:^|[\s'"=<>|;&(/\\])`;
const DEPOIS = String.raw`(?=$|[\s'"|;&)<>])`;
const ENV = new RegExp(ANTES + String.raw`\.env(?:\.[\w-]+)?` + DEPOIS);

export const citaEnv = comando => ENV.test(comando);

if (process.argv[1] && process.argv[1].endsWith('sem-env.mjs')) {
  let entrada = '';
  for await (const pedaco of process.stdin) entrada += pedaco;
  let comando = '';
  try { comando = JSON.parse(entrada).tool_input?.command || ''; } catch { process.exit(0); }
  if (citaEnv(comando)) {
    console.error('Recusado: o comando cita o arquivo .env, e o conteúdo dele não pode aparecer aqui. Para usar a chave, rode o script de ferramentas/ que já a lê.');
    process.exit(2);
  }
}

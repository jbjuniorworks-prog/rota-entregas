// Por que entrega feita não deixa a porta verificada: para cada rota de motorista dos dias pedidos,
// cada endereço entregue e o que a nuvem responde hoje, com o motivo provável quando não é
// "confirmado". Só lê a produção. Os exemplos são endereços de cliente: só com --exemplos, e nunca
// colados em commit, issue ou conversa.
// npm run verificados -- 2026-10-29 2026-10-30 [--exemplos]
import {ambiente, api} from './banco.mjs';

const args = process.argv.slice(2);
const comExemplos = args.includes('--exemplos');
const dias = args.filter(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
if (!dias.length) { console.error('Diga os dias: npm run verificados -- 2026-10-29 [2026-10-30 ...] [--exemplos]'); process.exit(1); }

const c = api(ambiente());
const todas = async caminho => {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const parte = await c(caminho, {headers: {Range: `${de}-${de + 999}`}});
    saida.push(...parte);
    if (parte.length < 1000) return saida;
  }
};
const perfis = await todas('/rest/v1/perfis?select=id,nome,papel,conferir&order=id');
const nome = id => (perfis.find(p => p.id === id)?.nome || '?').split(/\s+/)[0];
const exemplos = {};
for (const dia of dias) {
  const rotas = await todas(`/rest/v1/rotas?select=id,motorista_id&dia=eq.${dia}&order=id`);
  for (const r of rotas) {
    const quem = perfis.find(p => p.id === r.motorista_id);
    if (!quem || quem.papel === 'admin') continue;
    const ps = await todas(`/rest/v1/pacotes?select=chave_lugar,entregue_em&rota_id=eq.${r.id}&order=id`);
    const feitos = ps.filter(p => p.entregue_em);
    if (!feitos.length) continue;
    const obs = await todas(`/rest/v1/observacoes?select=chave_lugar,no_pino,pendente,recusada&motorista_id=eq.${r.motorista_id}&dia=eq.${dia}&order=id`);
    const cor = await todas(`/rest/v1/correcoes?select=chave_lugar,pendente&motorista_id=eq.${r.motorista_id}&criado_em=gte.${dia}T03:00:00Z&criado_em=lt.${dia}T23:59:59Z&order=id`);
    const chaves = [...new Set(feitos.map(p => p.chave_lugar).filter(Boolean))];
    const resp = new Map();
    for (let i = 0; i < chaves.length; i += 300) {
      for (const x of await c('/rest/v1/rpc/posicoes_com', {method: 'POST', body: JSON.stringify({chaves: chaves.slice(i, i + 300), incluir: null})})) resp.set(x.chave_lugar, x);
    }
    const motivo = {};
    const conta = (m, k) => { motivo[m] = (motivo[m] || 0) + 1; (exemplos[m] ||= []).length < 4 && exemplos[m].push(`${nome(r.motorista_id)} ${dia} ${k}`); };
    const semChave = feitos.filter(p => !p.chave_lugar).length;
    if (semChave) motivo['sem chave (sem CEP/número)'] = semChave;
    for (const k of chaves) {
      const n = resp.get(k);
      if (n?.situacao === 'confirmado') { conta('verificado', k); continue; }
      const daChave = x => x.chave_lugar === k || x.chave_lugar.startsWith(k + '|');
      const o = obs.filter(daChave), cs = cor.filter(daChave);
      if (o.some(x => x.pendente) || cs.some(x => x.pendente)) conta('pendente (motorista em conferência)', k);
      else if (o.some(x => x.recusada)) conta('passagem recusada no Admin', k);
      else if (!o.length && !cs.length) conta('nada gravado na entrega (sem GPS bom, longe do pino ou Entreguei sem GPS)', k);
      else if (o.length && !o.some(x => x.no_pino) && !cs.length) conta('passagem longe do pino, sem correção', k);
      else if (o.some(x => x.chave_lugar !== k) || cs.some(x => x.chave_lugar !== k)) conta('gravado com complemento (separada)', k);
      else if (cs.length && !o.length) conta('só correção, sem passagem', k);
      else if (n) conta(`nuvem: ${n.situacao} (marcas não batem entre si)`, k);
      else conta('outro', k);
    }
    const ver = motivo['verificado'] || 0;
    console.log(`${dia} ${nome(r.motorista_id)}${quem.conferir ? ' (em conferência)' : ''}: ${feitos.length} pacotes entregues, ${chaves.length} endereços com chave, ${ver} verificados`);
    for (const [m, n] of Object.entries(motivo).sort((a, b) => b[1] - a[1])) if (m !== 'verificado') console.log(`   ${n} ${m}`);
  }
}
if (comExemplos) {
  console.log('\nexemplos:');
  for (const [m, xs] of Object.entries(exemplos)) if (m !== 'verificado') console.log(' ', m, '→', xs.join(' ; '));
}

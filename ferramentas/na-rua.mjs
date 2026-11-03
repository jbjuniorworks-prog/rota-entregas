// Alguém está na rua? As rotas de hoje dos motoristas (não as de quem administra): entregues, total
// e a última entrega. Antes de publicar: a versão nova troca o app debaixo de quem está no meio de
// uma rota. Só lê a produção; imprime o primeiro nome e números, nenhum endereço.
// npm run na-rua
import {ambiente, api} from './banco.mjs';

const chamar = api(ambiente());
const todas = async caminho => {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const parte = await chamar(caminho, {headers: {Range: `${de}-${de + 999}`}});
    saida.push(...parte);
    if (parte.length < 1000) return saida;
  }
};
const hora = ms => new Date(ms).toLocaleTimeString('pt-BR', {timeZone: 'America/Maceio', hour: '2-digit', minute: '2-digit'});

const hoje = new Date().toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
const perfis = await todas('/rest/v1/perfis?select=id,nome,papel&order=id');
const nome = id => (perfis.find(p => p.id === id)?.nome || '?').split(/\s+/)[0];
const admins = new Set(perfis.filter(p => p.papel === 'admin').map(p => p.id));
const rotas = (await todas(`/rest/v1/rotas?select=id,motorista_id&dia=eq.${hoje}&order=id`)).filter(r => !admins.has(r.motorista_id));
const agora = Date.now();
console.log(`agora: ${new Date(agora).toLocaleString('pt-BR', {timeZone: 'America/Maceio'})}; rotas de motorista hoje: ${rotas.length}`);
let maisRecente = 0;
for (const r of rotas) {
  const ps = await todas(`/rest/v1/pacotes?select=entregue_em&rota_id=eq.${r.id}&order=id`);
  const feitos = ps.filter(p => p.entregue_em).map(p => Date.parse(p.entregue_em));
  const ultima = feitos.length ? Math.max(...feitos) : 0;
  maisRecente = Math.max(maisRecente, ultima);
  console.log(`  ${nome(r.motorista_id)}: ${feitos.length}/${ps.length} entregues; última ${ultima ? `${hora(ultima)} (há ${Math.round((agora - ultima) / 60000)} min)` : '-'}`);
}
console.log(`última entrega de qualquer motorista hoje: ${maisRecente ? `há ${Math.round((agora - maisRecente) / 60000)} min` : 'nenhuma'}`);

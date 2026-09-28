import {haversine} from './geo';
import {fmtKm} from './otimizacao';

// O que o administrador vê primeiro ao abrir a tela. As marcações dos motoristas ficavam no fim
// da página, depois das rotas de 14 dias, todas misturadas: quem tinha de decidir alguma coisa
// precisava procurar. Aqui elas se separam entre o que espera uma decisão dele, o que chegou
// nos últimos dias e só vale conferir, e o resto.

export interface MarcaDoLugar {
  motorista_id: string;
  nome: string;
  papel: string;
  lat: number;
  lng: number;
  criado_em: string;
}

export interface LugarParaTriar {
  chave: string;
  marcacoes: MarcaDoLugar[];
  situacao: 'confirmado' | 'sugestao' | null;
  escolhida: {lat: number; lng: number} | null;
  fonte?: string | null;
  motoristas?: number;
  entregas?: number;
}

// o mesmo raio da `posicoes` na nuvem: mais perto que isto, duas marcações são o mesmo ponto
const MESMO_PONTO = 30;
const RECENTE = 7 * 864e5;

const quando = (m: MarcaDoLugar) => Date.parse(m.criado_em);
const deles = (l: LugarParaTriar) => l.marcacoes.filter(m => m.papel !== 'admin');
const maisNova = (ms: MarcaDoLugar[]) => ms.reduce((a, b) => quando(b) > quando(a) ? b : a);
const ultimaDeles = (l: LugarParaTriar) => Math.max(0, ...deles(l).map(quando));
const ultima = (l: LugarParaTriar) => Math.max(0, ...l.marcacoes.map(quando));
const nomes = (ms: MarcaDoLugar[]) => [...new Set(ms.map(m => m.nome))].join(' e ');

export function porQuePrecisaDeVoce(l: LugarParaTriar): string | null {
  const ms = deles(l);
  if (!ms.length || !l.situacao) return null;
  if (l.situacao === 'sugestao') {
    return new Set(ms.map(m => m.motorista_id)).size === 1
      ? `Só ${nomes(ms)} marcou, e ninguém entregou nesse ponto ainda.`
      : `${nomes(ms)} marcaram em lugares diferentes, e ninguém entregou em nenhum deles.`;
  }
  // Só a palavra mais nova da rua conta: marcação velha que já perdeu para uma mais nova não é
  // pergunta. E o que ele já decidiu não volta — só o que chegou depois da última marcação dele.
  const nova = maisNova(ms);
  const suaUltima = Math.max(0, ...l.marcacoes.filter(m => m.papel === 'admin').map(quando));
  if (!l.escolhida || quando(nova) <= suaUltima) return null;
  const d = haversine(nova, l.escolhida);
  if (d <= MESMO_PONTO) return null;
  // Aqui a porta está confirmada e a marcação nova ficou de fora dela: a nuvem continua dando a
  // de antes para os outros, e a decisão de mudar é dele — pedido de 28/09, "pra não alterar
  // sem motivo". Dizer o que estava em jogo é o que separa engano de cliente que se mudou.
  const qual = l.fonte === 'admin' ? 'que você confirmou'
    : (l.motoristas || 0) >= 2 ? `confirmada por ${l.motoristas} motoristas`
    : (l.entregas || 0) >= 1 ? 'confirmada na entrega'
    : 'confirmada';
  return `${nova.nome} tentou mudar uma porta ${qual}: marcou a ${fmtKm(d)} dela. Para os outros, continua valendo a de antes.`;
}

export function situacaoDoLugar(l: LugarParaTriar): {texto: string; cor: string} {
  if (!l.situacao) return {texto: 'Não vale: motorista desativado', cor: '#6b7280'};
  if (l.situacao === 'sugestao') return {texto: 'Sugestão', cor: '#d97706'};
  if (l.fonte === 'admin') return {texto: 'Confirmada por você', cor: '#16a34a'};
  if ((l.motoristas || 0) >= 2) return {texto: `Confirmada por ${l.motoristas} motoristas`, cor: '#16a34a'};
  if ((l.entregas || 0) >= 1) return {texto: 'Confirmada na porta, com a entrega', cor: '#16a34a'};
  return {texto: 'Confirmada', cor: '#16a34a'};
}

export function triar<L extends LugarParaTriar>(lugares: L[], agora: number, visto: number | null) {
  const decidir: L[] = [], recentes: L[] = [], outras: L[] = [];
  for (const l of lugares) {
    if (porQuePrecisaDeVoce(l)) decidir.push(l);
    else if (deles(l).length && agora - ultimaDeles(l) <= RECENTE) recentes.push(l);
    else outras.push(l);
  }
  const doMaisNovo = (a: L, b: L) => ultimaDeles(b) - ultimaDeles(a);
  decidir.sort(doMaisNovo);
  recentes.sort(doMaisNovo);
  outras.sort((a, b) => ultima(b) - ultima(a));
  // sem visita anterior não há "desde a última vez": nada é novo, em vez de tudo
  const novo = (l: L) => visto != null && deles(l).length > 0 && ultimaDeles(l) > visto;
  return {decidir, recentes, outras, novo, novas: [...decidir, ...recentes].filter(novo).length};
}

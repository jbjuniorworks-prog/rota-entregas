import {analisarLinha, chaveLugar, decompor, normal, semZeroAEsquerda} from './texto';
import type {MotivoReclamacao, Parada, Reclamacao} from './tipos';

// "Cliente xarope", pedido deles em 28/09: o cliente já reclamou de pacote jogado ou deixado com
// vizinho, e o próximo que for lá tem de saber antes de chegar. Motivo fechado, sem texto livre.

export const MOTIVOS: Record<MotivoReclamacao, {marcar: string; reclamou: string; fazer: string}> = {
  jogado: {marcar: '📦 Reclamou de pacote jogado', reclamou: 'de pacote jogado', fazer: 'entregue em mãos'},
  vizinho: {marcar: '🏠 Reclamou de deixar com vizinho', reclamou: 'de deixar com vizinho', fazer: 'não deixe com vizinho'},
};

export interface ReclamacaoDaNuvem {
  chave_lugar: string;
  motivo: MotivoReclamacao;
  quando: string;
  minha: boolean;
}

// A unidade dentro do mesmo número: apartamento, bloco, torre, casa de vila, sala. Só conta o que
// identifica de verdade — "Casa" sozinho é o tipo do imóvel, e o `complementoChave` lia
// "Casa, Aeroporto" como a unidade "casa aero", separando a mesma casa em duas.
const UNIDADES: [RegExp, string][] = [
  [/\b(?:ap|apt|apto|apart|apartamento)\.?\s*(\d{1,5}[a-z]?)\b/, 'ap'],
  [/\b(?:bl|blc|bloco)\.?\s*([a-z]|\d{1,3})\b/, 'bl'],
  [/\btorre\.?\s*([a-z]|\d{1,3})\b/, 'torre'],
  [/\b(?:casa|cs)\.?\s*(\d{1,4}[a-z]?)\b/, 'casa'],
  [/\b(?:sala|loja)\.?\s*(\d{1,4}[a-z]?)\b/, 'sala'],
];

export function unidadeDoCliente(texto: string): string {
  const resto = normal(decompor(analisarLinha(texto).texto).resto.join(' '));
  return UNIDADES.map(([re, nome]) => {
    const m = resto.match(re);
    return m ? nome + semZeroAEsquerda(m[1]) : '';
  }).filter(Boolean).join('+');
}

// De quem é a reclamação (pedido de 28/09): fica no endereço, para qualquer pessoa que pedir
// dali — o nome de quem pede nem vem na planilha. Mas num condomínio é de um apartamento, não do
// prédio inteiro: com unidade, ela entra na chave. Vai para a coluna chave_lugar da 018.
export function chaveCliente(texto: string, bairro: string | undefined, cidade: string): string | null {
  const lugar = chaveLugar(texto, bairro, cidade);
  if (!lugar) return null;
  const unidade = unidadeDoCliente(texto);
  return unidade ? lugar + '#' + unidade : lugar;
}

// "Alguém que comprou neste endereço", não "este cliente": a planilha não traz o nome de quem
// compra, então o app não sabe se é a mesma pessoa ou outra que pediu dali (pedido de 28/09).
export function avisoXarope(rs: Reclamacao[] | undefined): string | null {
  if (!rs || !rs.length) return null;
  const ms = rs.map(r => MOTIVOS[r.motivo]);
  return `Cliente xarope: alguém que comprou neste endereço já reclamou ${ms.map(m => m.reclamou).join(' e ')} — ${ms.map(m => m.fazer).join(', ')}.`;
}

// Junta o que a nuvem sabe com o que já estava na parada. Só acrescenta: a marcação feita neste
// aparelho sem sinal ainda está na fila, e a consulta que voltou antes dela chegar lá não pode
// apagá-la da tela.
export function aplicarReclamacoes(
  paradas: Parada[], resultados: ReclamacaoDaNuvem[], chaveDe: (p: Parada) => string | null,
): number {
  const porChave = new Map<string, ReclamacaoDaNuvem[]>();
  for (const r of resultados) {
    if (!(r.motivo in MOTIVOS)) continue;
    porChave.set(r.chave_lugar, [...(porChave.get(r.chave_lugar) || []), r]);
  }
  let marcadas = 0;
  for (const p of paradas) {
    const k = chaveDe(p), rs = k ? porChave.get(k) : undefined;
    if (!rs) continue;
    const juntas = new Map((p.reclamacoes || []).map(r => [r.motivo, r]));
    for (const r of rs) juntas.set(r.motivo, {motivo: r.motivo, quando: r.quando, minha: r.minha || !!juntas.get(r.motivo)?.minha});
    p.reclamacoes = [...juntas.values()];
    marcadas++;
  }
  return marcadas;
}

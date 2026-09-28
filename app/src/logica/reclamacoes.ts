import type {MotivoReclamacao, Parada, Reclamacao} from './tipos';

// "Cliente xarope", pedido deles em 28/09: o cliente já reclamou de pacote jogado ou deixado com
// vizinho, e o próximo que for lá tem de saber antes de chegar. Motivo fechado, sem texto livre.

export const MOTIVOS: Record<MotivoReclamacao, {marcar: string; aviso: string}> = {
  jogado: {marcar: '📦 Reclamou de pacote jogado', aviso: 'já reclamou de pacote jogado — entregue em mãos'},
  vizinho: {marcar: '🏠 Reclamou de deixar com vizinho', aviso: 'já reclamou de deixar com vizinho — não deixe com vizinho'},
};

export interface ReclamacaoDaNuvem {
  chave_lugar: string;
  motivo: MotivoReclamacao;
  quando: string;
  minha: boolean;
}

export function avisoXarope(rs: Reclamacao[] | undefined): string | null {
  if (!rs || !rs.length) return null;
  return 'Cliente xarope: ' + rs.map(r => MOTIVOS[r.motivo].aviso).join('; ') + '.';
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

import type {Comentario, Parada} from './tipos';

// Comentário no pino (034, dono 26/11: "casa da filha", "número da casa ao lado é 500"). Texto
// curto sobre o lugar, para o próximo motorista. A mesma regra do banco, para avisar antes.
export const TAMANHO_DO_COMENTARIO = 120;
const TELEFONE = /([0-9][ .()-]*){8,}/;

export function problemaDoComentario(texto: string): string | null {
  const t = texto.trim();
  if (t.length > TAMANHO_DO_COMENTARIO) return `Até ${TAMANHO_DO_COMENTARIO} letras.`;
  if (TELEFONE.test(t)) return 'Parece telefone ou CEP: escreva sobre o lugar, não sobre a pessoa.';
  return null;
}

export interface ComentarioDaNuvem {
  id: number;
  chave_lugar: string;
  texto: string;
  quando: string;
  minha: boolean;
}

// Os da nuvem trocam os de antes. O seu, mexido neste aparelho, fica em `comentarioMeu` até a fila
// mandar: a consulta que volta antes disso traria o texto velho de volta.
export function aplicarComentarios(paradas: Parada[], resultados: ComentarioDaNuvem[], chaveDe: (p: Parada) => string | null): number {
  const porChave = new Map<string, Comentario[]>();
  for (const r of resultados) porChave.set(r.chave_lugar, [...(porChave.get(r.chave_lugar) || []), {id: r.id, texto: r.texto, quando: r.quando, minha: r.minha}]);
  let com = 0;
  for (const p of paradas) {
    const k = chaveDe(p), cs = k ? porChave.get(k) : undefined;
    if (cs) { p.comentarios = cs; com++; } else delete p.comentarios;
  }
  return com;
}

// O que o cartão mostra: o seu (o deste aparelho, se mexido aqui) e os dos outros.
export function comentariosDe(p: Parada): {meu: {texto: string; quando: string} | null; outros: Comentario[]} {
  const daNuvem = p.comentarios?.find(c => c.minha);
  const meu = p.comentarioMeu !== undefined ? p.comentarioMeu : daNuvem ? {texto: daNuvem.texto, quando: daNuvem.quando} : null;
  return {meu: meu && meu.texto ? meu : null, outros: (p.comentarios || []).filter(c => !c.minha)};
}

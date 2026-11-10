import type {Parada} from './tipos';

// Pino comercial (pedido do Luan, 07/11): lugar com horário de funcionamento, que eles adiantam.
// Três origens, que não se misturam:
// - `comercial`: o leitor do Meli achou "horário comercial" no cartão. Fica só nesta rota, neste
//   celular; não vira marca para os outros (decisão do dono, 07/11).
// - `comercialMeu`: ele marcou. Vai para a nuvem (031) e os outros motoristas veem.
// - `comercialOutros`: outro motorista ativo marcou. Tirar a minha não apaga esta.

export const ehComercial = (p: Pick<Parada, 'comercial' | 'comercialMeu' | 'comercialOutros'>) =>
  !!(p.comercial || p.comercialMeu || p.comercialOutros);

// O que a fila guarda por endereço: o último desejo dele, não cada toque. Marcar e tirar sem sinal
// viram um envio só, e o reenvio depois de falha de rede não duplica (o banco ignora a repetida).
export type DesejoComercial = 'marcar' | 'tirar' | 'tirarTodas';

export interface ComercialDaNuvem {
  chave_lugar: string;
  minha: boolean;
  outros: boolean;
}

// Junta a resposta da nuvem com o que está no celular. O que ainda espera na fila manda na minha
// marca: a consulta que voltou antes do envio chegar não pode desfazer o toque dele. Endereço que a
// nuvem não citou não tem marca de ninguém lá — a não ser a minha, se ela ainda não subiu.
export function aplicarComerciais(
  paradas: Parada[], resultados: ComercialDaNuvem[], chaveDe: (p: Parada) => string | null,
  pendentes: Record<string, DesejoComercial>, consultadas: Set<string>, tocadas: Set<string> = new Set(),
): number {
  const porChave = new Map(resultados.map(r => [r.chave_lugar, r]));
  let marcadas = 0;
  for (const p of paradas) {
    const k = chaveDe(p);
    // sem chave a marca é só deste celular; fora da consulta, a nuvem não disse nada dela
    if (!k || !consultadas.has(k)) continue;
    // tocado depois que a consulta saiu: a resposta é de antes do toque, mesmo com a fila já vazia
    if (tocadas.has(k)) continue;
    const r = porChave.get(k), desejo = pendentes[k];
    const meu = desejo ? desejo === 'marcar' : !!r?.minha;
    const outros = desejo === 'tirarTodas' ? false : !!r?.outros;
    if (meu) p.comercialMeu = true; else delete p.comercialMeu;
    if (outros) p.comercialOutros = true; else delete p.comercialOutros;
    if (meu || outros) marcadas++;
  }
  return marcadas;
}

// A linha embaixo do botão: de quem é a marca, para ele saber o que o toque vai mudar.
export function quemMarcou(p: Pick<Parada, 'comercial' | 'comercialMeu' | 'comercialOutros'>): string {
  const partes = [
    p.comercialMeu && p.comercialOutros ? 'Marcado por você e por outro motorista.'
      : p.comercialMeu ? 'Marcado por você. Os outros motoristas veem no pino.'
        : p.comercialOutros ? 'Marcado por outro motorista.' : '',
    p.comercial ? 'O Mercado Livre diz horário comercial.' : '',
  ].filter(Boolean);
  return partes.join(' ');
}

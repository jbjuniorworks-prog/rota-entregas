import {normal} from './texto';
import type {Parada} from './tipos';

// A busca de "Todos os endereços" (pedido de 02/10): quando dá B.O. numa entrega, achar logo qual
// foi, pelo que ele tiver na mão — o código do pacote, ou a rua e o número.
//
// Cada palavra digitada tem de aparecer na parada. Palavra com letra procura no endereço e no
// bairro, sem acento. Número procura de quatro jeitos: número inteiro no endereço (35 não acha o
// 135 da mesma avenida), número da parada no app, pedaço do CEP a partir de 5 dígitos, e pedaço
// do código do pacote a partir de 4 — quem tem a etiqueta digita o fim dele, e o código tem 13
// dígitos: um "35" estaria dentro de quase todos.

export interface Achado {
  // os códigos de pacote que bateram, para ele conferir com a etiqueta
  pacotes: string[];
}

const NO_CODIGO = 4;

const palavras = (busca: string) => normal(busca).replace(/[^a-z0-9# ]/g, ' ').split(' ').filter(Boolean);

export function acharNaParada(p: Parada, busca: string): Achado | null {
  const ps = palavras(busca);
  if (!ps.length) return null;
  const texto = normal([p.texto, p.bairro || ''].join(' ')).replace(/[^a-z0-9 ]/g, ' ');
  const numeros = new Set(texto.match(/\d+/g) || []);
  const cep = (p.texto.match(/\d{5}-?\d{3}/) || [''])[0].replace('-', '');
  const pacotes = (p.pacotes || []).map(c => c.toLowerCase());
  const bateram = new Set<string>();
  for (const w of ps) {
    const so = w.replace(/^#/, '');
    if (!so) continue;
    if (/^\d+$/.test(so)) {
      const doPacote = so.length < NO_CODIGO ? [] : (p.pacotes || []).filter((_, i) => pacotes[i].includes(so));
      doPacote.forEach(c => bateram.add(c));
      const achou = (!w.startsWith('#') && numeros.has(so)) || p.ml === so || p.stop === so
        || doPacote.length > 0 || (so.length >= 5 && cep.includes(so));
      if (!achou) return null;
      continue;
    }
    // palavra sem número não é código: "br" acharia todos os pacotes
    const doPacote = /\d/.test(so) ? (p.pacotes || []).filter((_, i) => pacotes[i].includes(so)) : [];
    doPacote.forEach(c => bateram.add(c));
    if (!texto.includes(so) && !doPacote.length) return null;
  }
  return {pacotes: [...bateram]};
}

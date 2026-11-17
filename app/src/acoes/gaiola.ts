import {textoDaGaiola, type ForaDaGaiola} from '../logica/gaiola';
import {status} from '../loja';
import {contar, e, mudar} from './base';

export async function copiarForaDaGaiola(fora: ForaDaGaiola[]) {
  contar('gaiola-copiar');
  try {
    await navigator.clipboard.writeText(textoDaGaiola(fora));
    status('Copiado. Cole no WhatsApp dos analistas.', 3000);
  } catch {
    status('Não consegui copiar.', 3000);
  }
}

// Ele pegou os pacotes (ou os analistas trouxeram): o aviso some até chegar outro sem número.
export function jaPegueiDaGaiola(fora: ForaDaGaiola[]) {
  contar('gaiola-ja-peguei');
  mudar(() => { e().gaiolaVistos = [...new Set([...(e().gaiolaVistos || []), ...fora.map(f => f.tn)])]; });
}

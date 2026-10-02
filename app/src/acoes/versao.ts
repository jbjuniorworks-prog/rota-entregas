import {oQueFazerComAVersao} from '../logica/versao';
import {loja} from '../loja';
import {e, ui} from './base';

const TENTADA = 'versao-tentada';
const DE_NOVO = 60000;
let perguntado = 0;

// Pergunta qual é a versão publicada quando o app abre e quando ele volta para a tela.
export async function verVersao() {
  if (!navigator.onLine || Date.now() - perguntado < DE_NOVO) return;
  perguntado = Date.now();
  let publicada: {id: string; quando: string} | null = null;
  try {
    const r = await fetch(import.meta.env.BASE_URL + 'versao.json?t=' + Date.now(), {cache: 'no-store'});
    if (r.ok) publicada = await r.json();
  } catch {}
  if (!publicada?.id) return;
  let tentada: string | null = null;
  try { tentada = sessionStorage.getItem(TENTADA); } catch {}
  // lendo a planilha conta como pendente: recarregar no meio perderia a leitura
  const pendentes = ui.ocupado ? 1 : e().paradas.filter(p => !p.entregue).length;
  const decisao = oQueFazerComAVersao(__VERSAO__.id, publicada.id, pendentes, tentada);
  if (decisao === 'recarregar') { atualizarApp(publicada.id); return; }
  ui.versaoNova = decisao === 'avisar' ? publicada : null;
  loja.mudou(false);
}

// Um endereço que o navegador nunca viu: a página vem do servidor, não do cache.
export function atualizarApp(id: string) {
  try { sessionStorage.setItem(TENTADA, id); } catch {}
  location.replace(location.pathname + '?v=' + encodeURIComponent(id));
}

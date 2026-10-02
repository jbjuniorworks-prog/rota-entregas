import {oQueFazerComAVersao} from '../logica/versao';
import {loja} from '../loja';
import {e, ui} from './base';

const TENTADA = 'versao-tentada';
const DE_NOVO = 60000;
// fora da tela por mais que isto, a volta é de quem deixou o app de lado, não de quem foi buscar um arquivo
const PARADO = 10 * 60000;
let perguntado = 0, saiuEm = 0, lendo = 0;

export function saiuDaTela() { saiuEm = Date.now(); }

// Lendo prints, vídeo ou o que foi compartilhado, recarregar perderia a leitura: o compartilhamento
// já saiu da fila do aparelho quando a leitura começa.
export async function semRecarregar<T>(trabalho: () => Promise<T>): Promise<T> {
  lendo++;
  try { return await trabalho(); } finally { lendo--; }
}

// Pergunta qual é a versão publicada quando o app abre e quando ele volta para a tela.
export async function verVersao(abrindo: boolean) {
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
  const pendentes = ui.ocupado || lendo ? 1 : e().paradas.filter(p => !p.entregue).length;
  const parado = abrindo || (saiuEm > 0 && Date.now() - saiuEm > PARADO);
  const decisao = oQueFazerComAVersao(__VERSAO__.id, publicada.id, pendentes, tentada, parado);
  if (decisao === 'recarregar') { atualizarApp(publicada.id); return; }
  ui.versaoNova = decisao === 'avisar' ? publicada : null;
  loja.mudou(false);
}

// Um endereço que o navegador nunca viu: a página vem do servidor, não do cache.
export function atualizarApp(id: string) {
  try { sessionStorage.setItem(TENTADA, id); } catch {}
  location.replace(location.pathname + '?v=' + encodeURIComponent(id));
}

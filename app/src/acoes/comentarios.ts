import {problemaDoComentario} from '../logica/comentarios';
import type {Comentario, Parada} from '../logica/tipos';
import {loja, status} from '../loja';
import {nuvem} from '../servicos/nuvem';
import {contar, enviarFila, fila, ui} from './base';
import {doMesmoEndereco} from './reclamacoes';

// Comentário no pino (034, dono 26/11): "casa da filha", "número da casa ao lado é 500". Pela chave
// do xarope (com o apartamento num condomínio), um por motorista, que vai para todos.

export function abrirComentario(p: Parada) {
  ui.comentando = ui.comentando === p.id ? null : p.id;
  loja.mudou(false);
}

function gravarOMeu(p: Parada, texto: string): boolean {
  const alvo = doMesmoEndereco(p);
  if (!alvo) { status('Este endereço veio sem CEP e sem bairro: não dá para guardar o comentário para os outros motoristas.', 6000); return false; }
  const quando = new Date().toISOString();
  for (const q of alvo.ps) q.comentarioMeu = {texto, quando};
  fila.enfileirar({tipo: 'comentario', chave: alvo.chave, texto});
  enviarFila();
  ui.comentando = null;
  loja.mudou();
  return true;
}

export function salvarComentario(p: Parada, texto: string) {
  const t = texto.trim();
  if (!t) { apagarMeuComentario(p); return; }
  const problema = problemaDoComentario(t);
  if (problema) { status(problema, 6000); return; }
  contar('comentario');
  if (gravarOMeu(p, t)) status('Comentário guardado. Quem entregar neste endereço vê no pino.', 5000);
}

export function apagarMeuComentario(p: Parada) {
  contar('comentario-apagar');
  if (gravarOMeu(p, '')) status('Comentário apagado.', 3000);
}

// Quem administra apaga o de outro motorista. Precisa de rede: é a decisão de tirar o que outra
// pessoa escreveu, e não fica numa fila esperando.
export async function apagarComentarioDeOutro(p: Parada, c: Comentario) {
  if (nuvem.perfil?.papel !== 'admin' || !nuvem.cliente) return;
  if (!confirm(`Apagar o comentário "${c.texto}"?\n\nSai para todos os motoristas.`)) return;
  const {error} = await nuvem.cliente.rpc('apagar_comentario', {id_: c.id});
  if (error) { status('Não apaguei: ' + (navigator.onLine ? error.message : 'sem internet.'), 6000); return; }
  for (const q of doMesmoEndereco(p)?.ps || [p]) {
    q.comentarios = q.comentarios?.filter(x => x.id !== c.id);
    if (!q.comentarios?.length) delete q.comentarios;
  }
  loja.mudou();
  status('Comentário apagado para todos.', 3000);
}

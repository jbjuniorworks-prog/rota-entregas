import {chaveCliente, MOTIVOS} from '../logica/reclamacoes';
import type {MotivoReclamacao, Parada} from '../logica/tipos';
import {loja, status} from '../loja';
import {e, enviarFila, fila, ui} from './base';

// Marca pelo endereço (com o apartamento, num condomínio), não pela entrega: as outras entregas
// para a mesma porta na rota de hoje têm de mostrar o mesmo aviso.
function doMesmoEndereco(p: Parada): {chave: string; ps: Parada[]} | null {
  const chave = chaveCliente(p.texto, p.bairro, e().cidade);
  if (!chave) return null;
  return {chave, ps: e().paradas.filter(q => chaveCliente(q.texto, q.bairro, e().cidade) === chave)};
}

export function abrirXarope(p: Parada) {
  ui.xarope = ui.xarope === p.id ? null : p.id;
  loja.mudou(false);
}

export function marcarXarope(p: Parada, motivo: MotivoReclamacao) {
  const alvo = doMesmoEndereco(p);
  ui.xarope = null;
  if (!alvo) { status('Este endereço veio sem CEP e sem bairro: não dá para guardar para os outros motoristas.', 6000); loja.mudou(false); return; }
  const quando = new Date().toISOString();
  for (const q of alvo.ps) q.reclamacoes = [...(q.reclamacoes || []).filter(r => r.motivo !== motivo), {motivo, quando, minha: true}];
  fila.enfileirar({tipo: 'reclamacao', chave: alvo.chave, motivo});
  enviarFila();
  loja.mudou();
  status(`Cliente xarope marcado: reclamou ${MOTIVOS[motivo].reclamou}. Quem entregar neste endereço vai ver no pino.`, 10000, () => tirarXarope(p, motivo));
}

export function tirarXarope(p: Parada, motivo: MotivoReclamacao) {
  const alvo = doMesmoEndereco(p);
  if (!alvo) return;
  for (const q of alvo.ps) {
    q.reclamacoes = (q.reclamacoes || []).filter(r => r.motivo !== motivo);
    if (!q.reclamacoes.length) delete q.reclamacoes;
  }
  fila.enfileirar({tipo: 'tirarReclamacao', chave: alvo.chave, motivo});
  enviarFila();
  loja.mudou();
  status('Marcação de cliente xarope tirada.', 3000);
}

// Enfileira o registro do que o app decidiu. Sem isso só dá para achar que o app acertou;
// com isso dá para medir, cruzando depois com onde o motorista estava ao marcar entregue.
import {itensDaRota, rotasDe} from '../logica/registro';
import {e, fila} from './base';

export function registrarComoFicou(semRuas: string | null = null) {
  const paradas = e().paradas;
  for (const rota of rotasDe(paradas)) {
    const itens = itensDaRota(paradas, rota);
    if (itens.length) fila.enfileirar({tipo: 'registro', rota, semRuas, itens});
  }
}

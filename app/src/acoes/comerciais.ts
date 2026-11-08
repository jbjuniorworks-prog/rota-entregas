import type {Parada} from '../logica/tipos';
import {loja, status} from '../loja';
import {enviarFila, fila} from './base';
import {doMesmoEndereco} from './reclamacoes';

// Uma revisão por endereço, que sobe a cada toque: a consulta que saiu antes de um toque não mexe
// naquele endereço, mesmo que o envio já tenha terminado e a fila esteja vazia (revisão de 07/11).
// Só na memória: uma consulta não sobrevive ao app fechado.
const revisoes = new Map<string, number>();
export const revisaoComercial = (chave: string) => revisoes.get(chave) || 0;
const tocar = (chave: string) => revisoes.set(chave, revisaoComercial(chave) + 1);

// Pino comercial (pedido do Luan, 07/11). `ps` são as entregas de um endereço do cartão. Como o
// "cliente xarope", a marca vai pela chave de cada uma (com a sala ou a loja), então as outras
// entregas para a mesma porta na rota de hoje mudam junto. Endereço diferente no mesmo pino tem o
// botão dele: "esse é comércio, esse não" (Luan, 07/11).
export function alternarComercial(ps: Parada[]) {
  const ligar = !ps.some(p => p.comercialMeu);
  const chaves = new Set<string>(), mudam = new Set<Parada>(ps);
  for (const p of ps) {
    const alvo = doMesmoEndereco(p);
    if (!alvo) continue;
    chaves.add(alvo.chave);
    alvo.ps.forEach(q => mudam.add(q));
  }
  for (const q of mudam) { if (ligar) q.comercialMeu = true; else delete q.comercialMeu; }
  for (const k of chaves) { tocar(k); fila.querComercial(k, ligar ? 'marcar' : 'tirar'); }
  if (chaves.size) enviarFila();
  loja.mudou();
  status(!chaves.size ? 'Este endereço veio sem CEP e sem bairro: a marca de comercial fica só neste celular.'
    : ligar ? 'Marcado como comercial. Os outros motoristas veem o pino quadrado.'
      : ps.some(p => p.comercialOutros) ? 'Sua marca de comercial foi tirada. A de outro motorista continua.' : 'Marca de comercial tirada.', 5000);
}

// Só o admin chega aqui (o botão só aparece para ele, e o banco só deixa ele apagar a dos outros).
export function tirarComercialDeTodos(ps: Parada[]) {
  const alvos = ps.map(doMesmoEndereco).filter((a): a is NonNullable<typeof a> => !!a);
  if (!alvos.length || !confirm('Tirar a marca de comercial deste endereço para todos os motoristas?')) return;
  for (const alvo of alvos) {
    for (const q of alvo.ps) { delete q.comercialMeu; delete q.comercialOutros; }
    tocar(alvo.chave);
    fila.querComercial(alvo.chave, 'tirarTodas');
  }
  enviarFila();
  loja.mudou();
  status('Marca de comercial tirada para todos os motoristas.', 4000);
}

import type {Parada} from './tipos';

// Os números de parada da Shopee de uma ou mais paradas do celular: o de cada uma e os dos pacotes
// que ela juntou. A planilha junta o mesmo endereço escrito de dois jeitos mesmo quando a Shopee pôs
// os pacotes em paradas diferentes (Luan, 18/11: a P6 e a P40 na mesma porta). Só o contador do topo
// lia as duas; o pino, o cartão e a busca mostravam a P6, e ele não sabia onde estava a P40.
export function numerosDaShopee(ps: Pick<Parada, 'stop' | 'itens'>[]): string[] {
  const todos = ps.flatMap(p => [p.stop, ...(p.itens || []).map(it => it.stop)]);
  return [...new Set(todos.filter((s): s is string => !!s))].sort((a, b) => +a - +b);
}

// "parada 6", "paradas 6 e 40", "paradas 6, 12 e 40"
export function textoDasParadas(numeros: string[]): string {
  if (numeros.length < 2) return numeros.length ? `parada ${numeros[0]}` : '';
  return `paradas ${numeros.slice(0, -1).join(', ')} e ${numeros[numeros.length - 1]}`;
}

// As paradas da Shopee do dia (a coluna "Stop" da planilha, o "P4" dos balões do mapa), feitas sobre
// o total. Luan, 17/11, pelo dono: no topo ele quer as paradas, não os verificados. Na rota de
// condomínio dele eram 117 pacotes, 13 paradas da Shopee e 81 do celular, uma por apartamento.
// - Feita só quando tudo o que é dela foi entregue: os dois endereços da P4, os dois.
// - A P4 de uma planilha não é a P4 de outra: a chave leva a planilha.
// - O pacote sem número de parada e a lista sem planilha não entram.
export function paradasDaShopee(paradas: Pick<Parada, 'rota' | 'stop' | 'itens' | 'entregue'>[]): {feitas: number; total: number} {
  const feita = new Map<string, boolean>();
  for (const p of paradas) {
    // a do celular que juntou pacotes de duas paradas da Shopee no mesmo endereço é das duas
    for (const s of numerosDaShopee([p])) {
      const k = `${p.rota ?? ''}|${s}`;
      feita.set(k, (feita.get(k) ?? true) && p.entregue);
    }
  }
  return {feitas: [...feita.values()].filter(Boolean).length, total: feita.size};
}

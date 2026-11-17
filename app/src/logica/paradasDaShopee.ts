import type {Parada} from './tipos';

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
    const stops = new Set([p.stop, ...(p.itens || []).map(it => it.stop)].filter((s): s is string => !!s));
    for (const s of stops) {
      const k = `${p.rota ?? ''}|${s}`;
      feita.set(k, (feita.get(k) ?? true) && p.entregue);
    }
  }
  return {feitas: [...feita.values()].filter(Boolean).length, total: feita.size};
}

import type {Estado} from './tipos';

export interface Guarda {
  ler<T>(chave: string, padrao: T): T;
  gravar(chave: string, valor: unknown): boolean;
}

export function guardaEm(armazem: Pick<Storage, 'getItem' | 'setItem'>): Guarda {
  return {
    ler(chave, padrao) {
      try { return JSON.parse(armazem.getItem(chave) as string) ?? padrao; } catch { return padrao; }
    },
    gravar(chave, valor) {
      try { armazem.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
    },
  };
}

export function guardaNaMemoria(): Guarda & {dados: Record<string, string>} {
  const dados: Record<string, string> = {};
  return {dados, ...guardaEm({getItem: k => dados[k] ?? null, setItem: (k, v) => { dados[k] = v; }})};
}

export const CHAVES = {
  estado: 'rota-entregas-v2',
  backup: 'rota-entregas-backup',
  memoria: 'rota-entregas-posicoes',
  fila: 'rota-entregas-fila',
  rotasNuvem: 'rota-entregas-rotas-nuvem',
  sessao: 'rota-entregas-auth',
} as const;

export function estadoVazio(id = Math.random().toString(36).slice(2, 10)): Estado {
  return {cidade: '', googleKey: '', tamTrecho: 9, inicio: null, voltar: false, areas: [{id, nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: id, areasManual: false, paradas: [], rota: null, pernas: {}};
}

export function carregarEstado(g: Guarda): Estado {
  const s = g.ler<Partial<Estado> | null>(CHAVES.estado, null);
  if (s && Array.isArray(s.paradas) && Array.isArray(s.areas) && s.areas.length) return Object.assign(estadoVazio(), s);
  return estadoVazio();
}

export const salvarEstado = (g: Guarda, e: Estado) => g.gravar(CHAVES.estado, e);

export function resetarDia(g: Guarda, e: Estado, agora = Date.now()): Estado {
  g.gravar(CHAVES.backup, {quando: agora, estado: e});
  const {cidade, googleKey, inicio, tamTrecho} = e;
  const novo = Object.assign(estadoVazio(), {cidade, googleKey, inicio, tamTrecho});
  salvarEstado(g, novo);
  return novo;
}

export function backupRecente(g: Guarda, agora = Date.now()): {quando: number; estado: Estado} | null {
  const b = g.ler<{quando: number; estado: Estado} | null>(CHAVES.backup, null);
  return b && b.estado && agora - b.quando < 600000 && (b.estado.paradas || []).length ? b : null;
}

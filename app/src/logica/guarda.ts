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
  filaDesde: 'rota-entregas-fila-desde',
  seguradas: 'rota-entregas-fila-seguradas',
  uso: 'rota-entregas-uso',
  buscas: 'rota-entregas-buscas',
  adminVisto: 'rota-entregas-admin-visto',
  dono: 'rota-entregas-dono',
} as const;

// Cada conta tem o seu dia no aparelho (auditoria da fila, 20/10). As chaves de sempre guardam só
// o dia de quem está usando, e `dono` diz de quem é. Sem isso, quem entrava depois via a rota de
// quem saiu, e a fila dele saía na sessão do outro: a rota da planilha criada no nome errado, e a
// entrega numa rota que já existia aceita pelo banco com "ok, 0 linhas" e perdida.
// Tudo é do dia, menos a sessão, que é do aparelho; chave nova entra sozinha.
export const DO_MOTORISTA: string[] = Object.values(CHAVES).filter(c => c !== CHAVES.sessao && c !== CHAVES.dono);
export const guardadaDe = (chave: string, conta: string) => `${chave}@${conta}`;

type Armazem = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Quem entra acha o seu dia; o de quem estava vai para o lado, com o nome da conta. Chave por
// chave, cada uma ocupando o dobro só enquanto é copiada. Sem dono (o aparelho de antes desta
// versão), o que está guardado fica com a primeira conta que aparece: regra de transição, para
// não perder o dia de quem atualizou o app no meio dele. Se a memória encher no meio, nada se
// perde e o dono não muda; a próxima vez termina.
export function trocarDeConta(a: Armazem, conta: string): 'mesma' | 'primeira' | 'trocada' {
  const dono = a.getItem(CHAVES.dono);
  if (!dono) { a.setItem(CHAVES.dono, conta); return 'primeira'; }
  let trocou = false;
  if (dono !== conta) {
    for (const k of DO_MOTORISTA) {
      const v = a.getItem(k);
      if (v == null) continue;
      a.setItem(guardadaDe(k, dono), v);
      a.removeItem(k);
    }
    a.setItem(CHAVES.dono, conta);
    trocou = true;
  }
  // também termina a volta que parou no meio
  for (const k of DO_MOTORISTA) {
    const v = a.getItem(guardadaDe(k, conta));
    if (v == null || a.getItem(k) != null) continue;
    a.setItem(k, v);
    a.removeItem(guardadaDe(k, conta));
    trocou = true;
  }
  return trocou ? 'trocada' : 'mesma';
}

export const donoDoAparelho = (a: Pick<Storage, 'getItem'>): string | null => {
  try { return a.getItem(CHAVES.dono); } catch { return null; }
};

export function estadoVazio(id = Math.random().toString(36).slice(2, 10)): Estado {
  return {cidade: '', regiao: null, tamTrecho: 9, inicio: null, voltar: false, ordemDoApp: false, areas: [{id, nome: 'Verde', cor: '#16a34a', prazo: ''}], areaAtual: id, areasManual: false, paradas: [], rota: null, pernas: {}};
}

export function carregarEstado(g: Guarda): Estado {
  const s = g.ler<Partial<Estado> | null>(CHAVES.estado, null);
  if (s && Array.isArray(s.paradas) && Array.isArray(s.areas) && s.areas.length) return Object.assign(estadoVazio(), s);
  return estadoVazio();
}

export const salvarEstado = (g: Guarda, e: Estado) => g.gravar(CHAVES.estado, e);

export function resetarDia(g: Guarda, e: Estado, agora = Date.now()): Estado {
  g.gravar(CHAVES.backup, {quando: agora, estado: e});
  // A saída não passa para o dia seguinte desde 16/10: ela é sempre o GPS de quando ele monta a
  // rota. A de ontem só aparecia no mapa e entrava no enquadramento, que afastava até as entregas
  // de hoje virarem um pino só.
  const {cidade, tamTrecho, ordemDoApp} = e;
  const novo = Object.assign(estadoVazio(), {cidade, tamTrecho, ordemDoApp});
  salvarEstado(g, novo);
  return novo;
}

export function backupRecente(g: Guarda, agora = Date.now()): {quando: number; estado: Estado} | null {
  const b = g.ler<{quando: number; estado: Estado} | null>(CHAVES.backup, null);
  return b && b.estado && agora - b.quando < 600000 && (b.estado.paradas || []).length ? b : null;
}

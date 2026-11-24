// O teste do caminho (24/11) guarda no IndexedDB, e não no localStorage do dia: lá ele disputaria
// os poucos MB com a rota, e memória cheia já perdeu entrega (a faixa vermelha, 24/11). Um banco por
// conta, como o dia: quem entra no celular de outro não vê o caminho dele. Nada daqui vai para a nuvem.

export type LojaDoCaminho = 'pontos' | 'marcas' | 'bateria';
const LOJAS: LojaDoCaminho[] = ['pontos', 'marcas', 'bateria'];
export const nomeDoBanco = (conta: string) => `rota-entregas-caminho@${conta}`;

let aberto: {conta: string; db: Promise<IDBDatabase>} | null = null;

function banco(conta: string): Promise<IDBDatabase> {
  if (aberto?.conta === conta) return aberto.db;
  const db = new Promise<IDBDatabase>((ok, falha) => {
    const r = indexedDB.open(nomeDoBanco(conta), 1);
    r.onupgradeneeded = () => { for (const l of LOJAS) r.result.createObjectStore(l, {autoIncrement: true}); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
  aberto = {conta, db};
  db.catch(() => { if (aberto?.db === db) aberto = null; });
  return db;
}

function feito(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, falha) => { tx.oncomplete = () => ok(); tx.onerror = () => falha(tx.error); tx.onabort = () => falha(tx.error); });
}

export async function anotar(conta: string, loja: LojaDoCaminho, valor: unknown): Promise<void> {
  const tx = (await banco(conta)).transaction(loja, 'readwrite');
  tx.objectStore(loja).add(valor);
  await feito(tx);
}

export async function lerTudo<T>(conta: string, loja: LojaDoCaminho): Promise<T[]> {
  const tx = (await banco(conta)).transaction(loja, 'readonly');
  const r = tx.objectStore(loja).getAll();
  await feito(tx);
  return r.result as T[];
}

// Duas semanas bastam para comparar dias com e sem gravar.
export async function tirarAntigos(conta: string, antesDe: number): Promise<void> {
  const tx = (await banco(conta)).transaction(LOJAS, 'readwrite');
  for (const l of LOJAS) {
    const c = tx.objectStore(l).openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return;
      if ((cur.value as {t: number}).t < antesDe) cur.delete();
      cur.continue();
    };
  }
  await feito(tx);
}

export async function apagar(conta: string): Promise<void> {
  const db = aberto?.conta === conta ? await aberto.db.catch(() => null) : null;
  db?.close();
  aberto = null;
  await new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase(nomeDoBanco(conta));
    r.onsuccess = () => ok();
    r.onerror = () => falha(r.error);
    r.onblocked = () => ok();
  });
}

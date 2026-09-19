export const dorme = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function buscarJson<T = any>(url: string | URL, ms = 15000): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {signal: AbortSignal.timeout(ms)});
  } catch (e: any) {
    throw new Error(e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? `sem resposta em ${Math.round(ms / 1000)}s (internet fraca)` : 'sem conexão');
  }
  if (!r.ok) throw new Error('o serviço respondeu ' + r.status);
  return r.json();
}

const ultimaChamada: Record<string, number> = {};
export async function espacado(chave: string, ms: number) {
  const espera = ms - (Date.now() - (ultimaChamada[chave] || 0));
  ultimaChamada[chave] = Date.now() + Math.max(0, espera);
  if (espera > 0) await dorme(espera);
}

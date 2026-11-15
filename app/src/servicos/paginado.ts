// Consultas ao banco em partes. O servidor devolve 1.000 linhas e cala: sem paginar, toda conta
// sai errada (já fez 61 ruas faltando parecerem 18). Do Admin e do motorista.

export function falhou(error: {message?: string} | null) {
  if (error) throw new Error(error.message || 'erro no servidor');
}

export async function paginado<T>(consulta: (de: number, ate: number) => PromiseLike<{data: T[] | null; error: any}>): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += 1000) {
    const {data, error} = await consulta(de, de + 999);
    falhou(error);
    saida.push(...(data || []));
    if (!data || data.length < 1000) return saida;
  }
}

export const pedacos = <T>(xs: T[], n: number) => Array.from({length: Math.ceil(xs.length / n)}, (_, i) => xs.slice(i * n, i * n + n));

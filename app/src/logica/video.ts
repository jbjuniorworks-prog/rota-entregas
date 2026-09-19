export type Perfil = ArrayLike<number>;

export function medir(a: Perfil, b: Perfil, minimo = 0.4): {s: number; erro: number} {
  const n = Math.min(a.length, b.length), limite = Math.floor(n * (1 - minimo));
  let melhor = 0, menorErro = Infinity;
  for (let s = -limite; s <= limite; s++) {
    let soma = 0, conta = 0;
    for (let i = Math.max(0, -s); i < n && i + s < n; i++) {
      soma += Math.abs(a[i + s] - b[i]);
      conta++;
    }
    const erro = soma / conta + Math.abs(s) * 1e-6;
    if (erro < menorErro) { menorErro = erro; melhor = s; }
  }
  return {s: melhor, erro: menorErro};
}

export const deslocamento = (a: Perfil, b: Perfil) => medir(a, b).s;

export interface Escolha {
  indices: number[];
  rapido: boolean;
}

export function escolherQuadros(perfis: Perfil[], passo = 0.45, erroMaximo = 20): Escolha {
  if (!perfis.length) return {indices: [], rapido: false};
  const altura = perfis[0].length, indices = [0];
  let andou = 0, rapido = false;
  for (let i = 1; i < perfis.length; i++) {
    const {s, erro} = medir(perfis[i - 1], perfis[i]);
    if (erro > erroMaximo) { rapido = true; indices.push(i); andou = 0; continue; }
    andou += Math.abs(s);
    if (andou >= altura * passo) { indices.push(i); andou = 0; }
  }
  if (indices[indices.length - 1] !== perfis.length - 1 && andou > altura * 0.1) indices.push(perfis.length - 1);
  return {indices, rapido};
}

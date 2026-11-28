// O mapa gira com o caminho (dono, 28/11, com a foto da faixa dizendo "↖ vire levemente à esquerda"
// e a linha descendo na tela: indo para o sul, a esquerda dele era a direita da tela). Gira só no
// modo de navegar; o resto do app continua com o norte para cima (Mapa.tsx).

// Abaixo disto o giro não muda: o rumo do GPS treme uns graus mesmo em linha reta.
export const MUDAR_GIRO_A_PARTIR = 10;

// O giro novo, contínuo (pode passar de 360 ou ficar negativo): de 350° para 10° anda 20°, não
// volta 340° na animação. `atual` nulo: começa no rumo.
export function proximoGiro(atual: number | null, rumo: number | null): number | null {
  if (rumo == null || !Number.isFinite(rumo)) return atual;
  if (atual == null) return ((rumo % 360) + 360) % 360;
  const delta = ((rumo - atual) % 360 + 540) % 360 - 180;
  return Math.abs(delta) < MUDAR_GIRO_A_PARTIR ? atual : atual + delta;
}

// O nome da rua acompanha a rua no mapa girado; se ficaria de cabeça para baixo na tela, vira 180°.
// `angulo`: o do nome no mapa com o norte para cima; `giro`: quanto o mapa está girado.
export function anguloLegivel(angulo: number, giro: number): number {
  const naTela = ((angulo - giro) % 360 + 540) % 360 - 180;
  return naTela > 90 || naTela <= -90 ? angulo + 180 : angulo;
}

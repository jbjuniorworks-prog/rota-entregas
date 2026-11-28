// O mapa gira com o caminho (dono, 28/11, com a foto da faixa dizendo "↖ vire levemente à esquerda"
// e a linha descendo na tela: indo para o sul, a esquerda dele era a direita da tela). Gira só no
// modo de navegar; o resto do app continua com o norte para cima (Mapa.tsx).

// Abaixo disto o giro não muda: o rumo do GPS treme uns graus mesmo em linha reta. Era 10°, e cada
// mudança era um tranco de 10° (dono, 28/11: "parece que vira dando umas pancadas"); com a animação
// quadro a quadro (suavizarGiro), mudanças menores entram sem tranco.
export const MUDAR_GIRO_A_PARTIR = 4;

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

// O mapa na tela persegue o giro de destino, quadro a quadro: a cada quadro anda uma parte do que
// falta, mais rápido longe e devagar chegando, e nunca recomeça do zero quando o destino muda no
// meio. Antes, cada leitura do GPS reiniciava uma animação de 0,6 s: os trancos.
export const GIRO_SUAVE_MS = 220;
export function suavizarGiro(naTela: number, alvo: number, dtMs: number): number {
  const novo = naTela + (alvo - naTela) * (1 - Math.exp(-Math.max(0, dtMs) / GIRO_SUAVE_MS));
  return Math.abs(alvo - novo) < 0.3 ? alvo : novo;
}

// De onde a animação parte ao começar a girar: o norte para cima, no número mais perto do destino
// (para 270°, parte de 360°, e gira 90° para a esquerda, não 270° para a direita).
export function inicioDoGiro(alvo: number): number {
  return alvo - ((((alvo % 360) + 540) % 360) - 180);
}

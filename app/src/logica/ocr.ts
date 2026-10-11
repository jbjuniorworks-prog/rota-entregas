// O selo de "verificado" do Mercado Livre vem logo depois do número da casa, e o leitor o lê
// grudado nele: "8", "68", "&8", "S&S". 501 virava 50168, 21 virava 218, 187 virava 1878 (vídeo
// de 11/10: 8 das 61 paradas). Pela posição de cada letra ele se separa: é bem mais largo que um
// algarismo (19 px contra 11 a 13, numa linha de 20) e vem depois de um vão de 8 a 10 px, contra 1
// a 4 entre os algarismos. Os números são o que importa: medidos à altura da linha, valem em
// qualquer tamanho de imagem.

export interface Caixa {x0: number; y0: number; x1: number; y1: number}
export interface SimboloOcr {text: string; bbox: Caixa}
export interface PalavraOcr {text: string; bbox: Caixa; symbols: SimboloOcr[]}
export interface LinhaOcr {text: string; bbox: Caixa; words: PalavraOcr[]}
export interface ResultadoOcr {text: string; blocks?: {paragraphs: {lines: LinhaOcr[]}[]}[] | null}

const VAO_DO_SELO = 0.3;     // da altura da linha: entre algarismos fica abaixo de 0,2
const LARGURA_DO_SELO = 0.7; // da altura da linha: um algarismo fica abaixo de 0,65
// O selo mediu de 0,75 a 1,00 nos dois vídeos. Dois algarismos já passam de 1,2: "Dom Pedro II 105"
// saiu "11105", com o vão do espaço antes do 105, e virava "11" (07/10).
const LARGURA_MAX_DO_SELO = 1.2;
const SELO_SOLTO = /^[&@©®$%S8]{1,3}$/;

const largura = (ss: SimboloOcr[]) => ss.length ? ss[ss.length - 1].bbox.x1 - ss[0].bbox.x0 : 0;
const larguraDoSelo = (ss: SimboloOcr[], altura: number) => largura(ss) >= LARGURA_DO_SELO * altura && largura(ss) <= LARGURA_MAX_DO_SELO * altura;

// A linha sem o selo, ou null quando não há selo nela.
export function linhaSemSelo(l: LinhaOcr): string | null {
  const altura = l.bbox.y1 - l.bbox.y0;
  if (altura <= 0) return null;
  const palavras = l.words.map(w => w.text);
  let mudou = false;
  for (let i = 0; i < l.words.length; i++) {
    const ss = l.words[i].symbols;
    if (!ss.length || !/^\d/.test(ss[0].text)) continue;
    // grudado: os algarismos, um vão grande e uma cauda curta e larga
    for (let k = 1; k < ss.length; k++) {
      if (!/^\d$/.test(ss[k - 1].text)) break;
      const cauda = ss.slice(k);
      if (ss[k].bbox.x0 - ss[k - 1].bbox.x1 >= VAO_DO_SELO * altura && cauda.length <= 3 && larguraDoSelo(cauda, altura)) {
        palavras[i] = ss.slice(0, k).map(s => s.text).join('');
        mudou = true;
        break;
      }
    }
    // solto: a palavra seguinte é só o selo
    const prox = l.words[i + 1];
    if (prox && /^\d+$/.test(palavras[i]) && SELO_SOLTO.test(prox.text) && larguraDoSelo(prox.symbols, altura)) {
      palavras[i + 1] = '';
      mudou = true;
    }
  }
  return mudou ? palavras.filter(Boolean).join(' ') : null;
}

// O texto do leitor com o selo tirado das linhas onde ele aparece; o resto, como veio.
export function textoSemSelo(r: ResultadoOcr): string {
  let texto = r.text, desde = 0;
  for (const b of r.blocks || []) for (const p of b.paragraphs) for (const l of p.lines) {
    const original = l.text.replace(/\s+$/, '');
    const i = texto.indexOf(original, desde);
    if (i < 0) continue;
    const limpa = linhaSemSelo(l);
    if (limpa == null) { desde = i + original.length; continue; }
    texto = texto.slice(0, i) + limpa + texto.slice(i + original.length);
    desde = i + limpa.length;
  }
  return texto;
}

import {chaveRua, decompor} from './texto';
import type {Parada, Ponto} from './tipos';

// O nome da rua no mapa (17/10, pedido do dono). O mapa é o OpenStreetMap, que no Robalo tem o
// traçado de quase todas as ruas, mas com nome de projeto do loteamento: a Professora Albertina
// Bezerra Ribeiro da planilha é "Rua B". Na cidade, 10% das portas entregues ficam numa rua que o
// mapa mostra com outro nome ou sem nenhum. Aqui, com o trecho da prefeitura para esse nome, o app
// escreve por cima o nome como vem na planilha, e desenha o trecho que o mapa não tem.
// `npm run nomes-no-mapa` diz qual trecho é qual (coluna `no_mapa`, da 023).

export interface TrechoDaBase {
  nome_chave: string;
  fonte: string;
  linha: [number, number][];
  no_mapa: string;
}

export interface NomeNoMapa {
  texto: string;
  linha: [number, number][];
  // o mapa não tem o trecho: desenha a rua, não só o nome
  traco: boolean;
}

export interface RuaDoDia {
  texto: string;
  pontos: Ponto[];
}

// Um "Rua A" ou "Rua B" existe em todo loteamento: só vale o trecho perto de uma entrega daquela rua.
const PERTO_DA_ENTREGA_M = 300;

function aoSegmento(q: Ponto, a: [number, number], b: [number, number]): number {
  const k = Math.cos(q.lat * Math.PI / 180);
  const ax = (a[1] - q.lng) * k, ay = a[0] - q.lat, bx = (b[1] - q.lng) * k, by = b[0] - q.lat;
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return 111320 * Math.hypot(ax + t * dx, ay + t * dy);
}

const ateALinha = (q: Ponto, linha: [number, number][]) =>
  Math.min(...linha.slice(1).map((b, i) => aoSegmento(q, linha[i], b)));

// As ruas das entregas, com o nome escrito como na planilha: é o que está na etiqueta do pacote.
// Com as entregues junto, a lista não muda a cada entrega, e o nome da rua já feita continua ali.
export function ruasDoDia(ps: Parada[]): Map<string, RuaDoDia> {
  const por = new Map<string, {grafias: Map<string, number>; pontos: Ponto[]}>();
  for (const p of ps) {
    if (p.lat == null || p.lng == null) continue;
    const rua = decompor(p.texto).rua.trim();
    const chave = chaveRua(rua);
    if (!rua || !chave) continue;
    if (!por.has(chave)) por.set(chave, {grafias: new Map(), pontos: []});
    const r = por.get(chave)!;
    r.grafias.set(rua, (r.grafias.get(rua) || 0) + 1);
    r.pontos.push({lat: p.lat, lng: p.lng});
  }
  // a grafia que mais aparece; empate, a mais longa ("Professora" ganha de "Prof.")
  return new Map([...por].map(([k, r]) => [k, {
    texto: [...r.grafias].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0],
    pontos: r.pontos,
  }]));
}

export function nomesNoMapa(doDia: Map<string, RuaDoDia>, trechos: TrechoDaBase[]): NomeNoMapa[] {
  return trechos.flatMap(t => {
    const r = doDia.get(t.nome_chave);
    if (!r || !Array.isArray(t.linha) || t.linha.length < 2) return [];
    if (!r.pontos.some(p => ateALinha(p, t.linha) <= PERTO_DA_ENTREGA_M)) return [];
    if (t.no_mapa !== 'sem_nome' && t.no_mapa !== 'fora') return [];
    // só a prefeitura, mesmo que a busca traga outra coisa: nome deduzido das entregas não entra
    if (t.fonte !== 'prefeitura') return [];
    return [{texto: r.texto, linha: t.linha, traco: t.no_mapa === 'fora'}];
  });
}

export interface RotuloNaTela {
  texto: string;
  x: number;
  y: number;
  angulo: number;
}

// Os pedaços seguidos da mesma rua viram um traçado só (17/10, teste no Robalo): a prefeitura corta a
// rua em trechos de ~100 m, que no zoom 17 têm 85 px, e um nome tem 150 a 250. Só emenda ponta com
// ponta; onde três pedaços do mesmo nome se encontram é ramificação, e cada ramo fica com o seu.
const MESMA_PONTA_M = 2;
const metros = (a: [number, number], b: [number, number]) =>
  111320 * Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));

export function emendar(nomes: NomeNoMapa[]): {texto: string; linha: [number, number][]}[] {
  const porNome = new Map<string, [number, number][][]>();
  for (const n of nomes) {
    if (!porNome.has(n.texto)) porNome.set(n.texto, []);
    porNome.get(n.texto)!.push(n.linha);
  }
  const out: {texto: string; linha: [number, number][]}[] = [];
  for (const [texto, linhas] of porNome) {
    const nos: [number, number][] = [];
    const no = (q: [number, number]) => {
      let i = nos.findIndex(x => metros(x, q) <= MESMA_PONTA_M);
      if (i < 0) { nos.push(q); i = nos.length - 1; }
      return i;
    };
    const pontas = linhas.map(l => [no(l[0]), no(l[l.length - 1])]);
    const grau = new Map<number, number>();
    for (const [a, b] of pontas) for (const x of [a, b]) grau.set(x, (grau.get(x) || 0) + 1);
    const passa = (x: number) => grau.get(x) === 2;
    const usado = new Set<number>();
    // começa por uma ponta solta ou de ramificação; o que sobrar é volta fechada
    const ordem = linhas.map((_, i) => i).sort((i, j) => +passa(pontas[i][0]) * +passa(pontas[i][1]) - +passa(pontas[j][0]) * +passa(pontas[j][1]));
    for (const i of ordem) {
      if (usado.has(i)) continue;
      usado.add(i);
      const pelaOutraPonta = passa(pontas[i][0]) && !passa(pontas[i][1]);
      let linha = pelaOutraPonta ? [...linhas[i]].reverse() : [...linhas[i]];
      let fim = pelaOutraPonta ? pontas[i][0] : pontas[i][1];
      for (;;) {
        if (!passa(fim)) break;
        const j = linhas.findIndex((_, k) => !usado.has(k) && (pontas[k][0] === fim || pontas[k][1] === fim));
        if (j < 0) break;
        usado.add(j);
        const direto = pontas[j][0] === fim;
        linha = [...linha, ...(direto ? linhas[j] : [...linhas[j]].reverse()).slice(1)];
        fim = direto ? pontas[j][1] : pontas[j][0];
      }
      out.push({texto, linha});
    }
  }
  return out;
}

// Só as de sempre, as que estão nas placas e nas etiquetas: abreviação inventada é outro nome.
const ABREVIACOES: [RegExp, string][] = [
  [/^Rua\b/i, 'R.'], [/^Avenida\b/i, 'Av.'], [/^Travessa\b/i, 'Tv.'], [/^Alameda\b/i, 'Al.'], [/^Rodovia\b/i, 'Rod.'],
  [/\bProfessora\b/gi, 'Profa.'], [/\bProfessor\b/gi, 'Prof.'], [/\bDoutora\b/gi, 'Dra.'], [/\bDoutor\b/gi, 'Dr.'],
  [/\bDeputad[oa]\b/gi, 'Dep.'], [/\bSenador\b/gi, 'Sen.'], [/\bGovernador\b/gi, 'Gov.'], [/\bPresidente\b/gi, 'Pres.'],
  [/\bCoronel\b/gi, 'Cel.'], [/\bPadre\b/gi, 'Pe.'], [/\bDesembargador\b/gi, 'Des.'], [/\bEngenheiro\b/gi, 'Eng.'],
  [/\bNossa Senhora\b/gi, 'N. Sra.'],
];
export const abreviar = (texto: string) => ABREVIACOES.reduce((t, [de, para]) => t.replace(de, para), texto);

// o mesmo nome não se repete mais perto que isto
const MESMO_NOME_PX = 280;
const ALTURA_PX = 18;
const FOLGA_PX = 12;
// quanto a rua pode se afastar da reta do nome, debaixo dele: mais que isso, o nome sai da rua
const CURVA_PX = 6;

function noPercurso(ps: {x: number; y: number}[], partes: number[], s: number): {x: number; y: number} {
  let k = 0, resta = Math.max(0, s);
  while (k < partes.length - 1 && resta > partes[k]) { resta -= partes[k]; k++; }
  const a = ps[k], b = ps[k + 1], f = partes[k] ? Math.min(1, resta / partes[k]) : 0;
  return {x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f};
}

// O nome no meio do traçado, na direção dele e de pé, só se couber nele, inteiro ou abreviado, e se
// a rua for reta o bastante debaixo dele: esticar o nome além da rua o punha em cima da rodovia
// (Robalo, 17/10). Sem encostar em outro; os traçados mais longos escolhem primeiro.
export function rotulosNaTela(itens: {texto: string; pixels: {x: number; y: number}[]}[], tela: {largura: number; altura: number},
  larguraDe: (texto: string) => number): RotuloNaTela[] {
  const candidatos = itens.flatMap(it => {
    const ps = it.pixels;
    if (ps.length < 2) return [];
    const partes = ps.slice(1).map((b, i) => Math.hypot(b.x - ps[i].x, b.y - ps[i].y));
    const total = partes.reduce((s, d) => s + d, 0);
    const meio = noPercurso(ps, partes, total / 2);
    if (meio.x < 0 || meio.y < 0 || meio.x > tela.largura || meio.y > tela.altura) return [];
    for (const texto of [...new Set([it.texto, abreviar(it.texto)])]) {
      const w = larguraDe(texto) + FOLGA_PX;
      if (w > total) continue;
      const a = noPercurso(ps, partes, total / 2 - w / 2), b = noPercurso(ps, partes, total / 2 + w / 2);
      const corda = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let longe = 0;
      for (let s = total / 2 - w / 2; s <= total / 2 + w / 2; s += 4) {
        const q = noPercurso(ps, partes, s);
        longe = Math.max(longe, Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / corda);
      }
      if (longe > CURVA_PX) continue;
      let angulo = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      if (angulo > 90) angulo -= 180;
      if (angulo <= -90) angulo += 180;
      return [{texto, nome: it.texto, x: meio.x, y: meio.y, angulo, total, w}];
    }
    return [];
  }).sort((a, b) => b.total - a.total);
  const postos: (RotuloNaTela & {nome: string; x0: number; x1: number; y0: number; y1: number})[] = [];
  for (const c of candidatos) {
    const r = c.angulo * Math.PI / 180;
    const bw = Math.abs(c.w * Math.cos(r)) + Math.abs(ALTURA_PX * Math.sin(r));
    const bh = Math.abs(c.w * Math.sin(r)) + Math.abs(ALTURA_PX * Math.cos(r));
    const caixa = {x0: c.x - bw / 2, x1: c.x + bw / 2, y0: c.y - bh / 2, y1: c.y + bh / 2};
    if (postos.some(p => p.x0 < caixa.x1 && caixa.x0 < p.x1 && p.y0 < caixa.y1 && caixa.y0 < p.y1)) continue;
    if (postos.some(p => p.nome === c.nome && Math.hypot(p.x - c.x, p.y - c.y) < MESMO_NOME_PX)) continue;
    postos.push({texto: c.texto, nome: c.nome, x: c.x, y: c.y, angulo: c.angulo, ...caixa});
  }
  return postos.map(({texto, x, y, angulo}) => ({texto, x, y, angulo}));
}

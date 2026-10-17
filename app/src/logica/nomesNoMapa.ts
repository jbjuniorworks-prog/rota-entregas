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
    // trecho nomeado pelos motoristas é uma rua do mapa: só o nome
    return [{texto: r.texto, linha: t.linha, traco: t.no_mapa === 'fora' && t.fonte === 'prefeitura'}];
  });
}

export interface RotuloNaTela {
  texto: string;
  x: number;
  y: number;
  angulo: number;
}

// o mesmo nome não se repete mais perto que isto: a prefeitura corta a rua em trechos de ~100 m
const MESMO_NOME_PX = 280;
const ALTURA_PX = 18;

// Onde cada nome cabe na tela: no meio do trecho, na direção da rua e de pé, sem encostar em outro.
// Os trechos mais longos escolhem primeiro.
export function rotulosNaTela(itens: {texto: string; pixels: {x: number; y: number}[]}[], tela: {largura: number; altura: number},
  larguraDe: (texto: string) => number): RotuloNaTela[] {
  const candidatos = itens.flatMap(it => {
    const ps = it.pixels;
    const partes = ps.slice(1).map((b, i) => Math.hypot(b.x - ps[i].x, b.y - ps[i].y));
    const total = partes.reduce((s, d) => s + d, 0);
    if (total < 1) return [];
    let resta = total / 2, k = 0;
    while (k < partes.length - 1 && resta > partes[k]) { resta -= partes[k]; k++; }
    const a = ps[k], b = ps[k + 1], f = partes[k] ? resta / partes[k] : 0;
    const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
    if (x < 0 || y < 0 || x > tela.largura || y > tela.altura) return [];
    let angulo = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (angulo > 90) angulo -= 180;
    if (angulo <= -90) angulo += 180;
    return [{texto: it.texto, x, y, angulo, total}];
  }).sort((a, b) => b.total - a.total);
  const postos: (RotuloNaTela & {x0: number; x1: number; y0: number; y1: number})[] = [];
  for (const c of candidatos) {
    const w = larguraDe(c.texto) + 12, r = c.angulo * Math.PI / 180;
    const bw = Math.abs(w * Math.cos(r)) + Math.abs(ALTURA_PX * Math.sin(r));
    const bh = Math.abs(w * Math.sin(r)) + Math.abs(ALTURA_PX * Math.cos(r));
    const caixa = {x0: c.x - bw / 2, x1: c.x + bw / 2, y0: c.y - bh / 2, y1: c.y + bh / 2};
    if (postos.some(p => p.x0 < caixa.x1 && caixa.x0 < p.x1 && p.y0 < caixa.y1 && caixa.y0 < p.y1)) continue;
    if (postos.some(p => p.texto === c.texto && Math.hypot(p.x - c.x, p.y - c.y) < MESMO_NOME_PX)) continue;
    postos.push({texto: c.texto, x: c.x, y: c.y, angulo: c.angulo, ...caixa});
  }
  return postos.map(({texto, x, y, angulo}) => ({texto, x, y, angulo}));
}

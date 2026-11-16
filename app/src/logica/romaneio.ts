import {haversine, mediana} from './geo';
import {chaveBairro, normal} from './texto';
import type {Ponto} from './tipos';

// O romaneio do galpão (dono, 16/11): uma linha por pacote, só com o bairro e a gaiola ("B-7").
// "Identificar já os que estão fora de rota, pra avisar aos analistas enquanto pegamos a rota logo
// cedo." O pacote que cai numa gaiola longe do bairro dele chega no meio do dia na rota de outro
// motorista, sem número de parada: em 16/11, os 6 sem número da rota do dono e os 6 da do Pedro não
// estavam na gaiola deles. Dos 6 do dono, 4 estavam em gaiolas a 13 e 16 km do bairro, e 2 a 3 km.

// O núcleo da gaiola: os bairros com pelo menos esta parte dos pacotes dela.
export const NUCLEO = 0.1;
// Mais longe que isto de todo bairro do núcleo, o pacote parece de outra rota. No romaneio de 16/11,
// com 5 km, entraram na lista uns 0,3% dos pacotes; a 3 km já entram bairros vizinhos da mesma rota.
export const LONGE_DO_NUCLEO = 5000;
// Mais que isto do mesmo bairro numa gaiola é um pedaço da rota, não um pacote perdido.
export const ATE_PACOTES = 3;
// O mesmo nome de bairro em duas cidades do censo, com os meios mais longe que isto, são dois
// lugares: o romaneio não diz a cidade. Em 16/11, dois nomes assim eram uns 5% dos pacotes.
export const AMBIGUO = 3000;

export interface PacoteDoRomaneio {
  bairro: string;
  gaiola: string;
}

const COLUNA_BAIRRO = /neighbo|bairro/i;
const COLUNA_GAIOLA = /cage|gaiola/i;

// A planilha como o leitor de xlsx entrega: uma lista de linhas, a de títulos nas primeiras.
export function pacotesDoRomaneio(linhas: unknown[][]): PacoteDoRomaneio[] {
  const iCab = linhas.slice(0, 10).findIndex(l => l.some(c => COLUNA_BAIRRO.test(String(c))) && l.some(c => COLUNA_GAIOLA.test(String(c))));
  if (iCab < 0) throw new Error('não achei as colunas de bairro e de gaiola');
  const cab = linhas[iCab].map(c => String(c));
  const b = cab.findIndex(c => COLUNA_BAIRRO.test(c)), g = cab.findIndex(c => COLUNA_GAIOLA.test(c));
  const saida: PacoteDoRomaneio[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    const bairro = String(l[b] ?? '').trim(), gaiola = String(l[g] ?? '').trim().toUpperCase();
    if (bairro && gaiola) saida.push({bairro, gaiola});
  }
  return saida;
}

// O que o censo de uma cidade tem: o bairro de cada porta e onde ela fica, em milionésimos de grau.
export interface PortasDoCenso {
  cidade: string;
  bairros: string[];
  iBairro: ArrayLike<number>;
  lats: ArrayLike<number>;
  lngs: ArrayLike<number>;
}

// O meio de cada bairro: a mediana das portas, que a porta com bairro errado não arrasta. O nome que
// existe em duas cidades com os meios longe um do outro fica com os dois, e a gaiola decide qual.
export function meiosDosBairros(cidades: PortasDoCenso[]): Map<string, Ponto[]> {
  const porCidade = new Map<string, Ponto[]>();
  for (const c of cidades) {
    const lat = new Map<number, number[]>(), lng = new Map<number, number[]>();
    for (let i = 0; i < c.lats.length; i++) {
      const k = c.iBairro[i];
      if (!lat.has(k)) { lat.set(k, []); lng.set(k, []); }
      lat.get(k)!.push(c.lats[i] / 1e6);
      lng.get(k)!.push(c.lngs[i] / 1e6);
    }
    for (const [k, la] of lat) {
      const chave = chaveBairro(c.bairros[k] || '');
      if (!chave) continue;
      porCidade.set(chave, [...(porCidade.get(chave) || []), {lat: mediana(la), lng: mediana(lng.get(k)!)}]);
    }
  }
  const meios = new Map<string, Ponto[]>();
  for (const [chave, pontos] of porCidade) {
    const lugares: Ponto[] = [];
    for (const p of pontos) if (!lugares.some(q => haversine(p, q) <= AMBIGUO)) lugares.push(p);
    meios.set(chave, lugares);
  }
  return meios;
}

const maisPerto = (de: Ponto[], ate: Ponto[]) => Math.min(...de.flatMap(p => ate.map(q => haversine(p, q))));

export interface Suspeito {
  gaiola: string;
  bairro: string;
  pacotes: number;
  metros: number;
  // as gaiolas em que esse bairro é do núcleo, da que tem mais pacotes dele para a que tem menos
  casas: string[];
}

export interface Conferencia {
  pacotes: number;
  gaiolas: number;
  suspeitos: Suspeito[];
  // pacotes que não deu para conferir: bairro que o censo não conhece, ou gaiola sem núcleo conhecido
  semConferir: number;
}

const ordemDaGaiola = (a: string, b: string) => a.localeCompare(b, 'pt-BR', {numeric: true});

export function conferirRomaneio(pacotes: PacoteDoRomaneio[], meios: Map<string, Ponto[]>): Conferencia {
  // por gaiola, cada bairro com a contagem e o nome mais escrito
  const gaiolas = new Map<string, Map<string, {n: number; nomes: Map<string, number>}>>();
  for (const p of pacotes) {
    const chave = chaveBairro(p.bairro) || normal(p.bairro);
    if (!gaiolas.has(p.gaiola)) gaiolas.set(p.gaiola, new Map());
    const g = gaiolas.get(p.gaiola)!;
    if (!g.has(chave)) g.set(chave, {n: 0, nomes: new Map()});
    const b = g.get(chave)!;
    b.n++;
    b.nomes.set(p.bairro, (b.nomes.get(p.bairro) || 0) + 1);
  }
  const nucleos = new Map<string, {chaves: string[]; pontos: Ponto[]}>();
  const casas = new Map<string, {gaiola: string; n: number}[]>();
  for (const [gaiola, g] of gaiolas) {
    const total = [...g.values()].reduce((s, b) => s + b.n, 0);
    const chaves = [...g].filter(([chave, b]) => b.n / total >= NUCLEO && meios.get(chave)?.length).map(([chave]) => chave);
    // O bairro de nome ambíguo vale onde fica mais perto dos outros do núcleo; sem nenhum de lugar
    // certo, a gaiola não tem onde se apoiar e fica sem conferir.
    const certos = chaves.filter(k => meios.get(k)!.length === 1).map(k => meios.get(k)![0]);
    const pontos = certos.length ? [...certos, ...chaves.filter(k => meios.get(k)!.length > 1)
      .map(k => meios.get(k)!.reduce((a, b) => maisPerto([a], certos) <= maisPerto([b], certos) ? a : b))] : [];
    nucleos.set(gaiola, {chaves, pontos});
    for (const chave of chaves) casas.set(chave, [...(casas.get(chave) || []), {gaiola, n: g.get(chave)!.n}]);
  }
  const suspeitos: Suspeito[] = [];
  let semConferir = 0;
  for (const [gaiola, g] of gaiolas) {
    const nucleo = nucleos.get(gaiola)!;
    if (!nucleo.pontos.length) {
      for (const b of g.values()) semConferir += b.n;
      continue;
    }
    for (const [chave, b] of g) {
      if (nucleo.chaves.includes(chave)) continue;
      const lugares = meios.get(chave);
      if (!lugares?.length) { semConferir += b.n; continue; }
      if (b.n > ATE_PACOTES) continue;
      // o nome ambíguo fica com o lugar mais perto da gaiola: na dúvida, não acusa
      const metros = maisPerto(lugares, nucleo.pontos);
      if (metros <= LONGE_DO_NUCLEO) continue;
      const nome = [...b.nomes].sort((x, y) => y[1] - x[1])[0][0];
      suspeitos.push({gaiola, bairro: nome, pacotes: b.n, metros: Math.round(metros),
        casas: (casas.get(chave) || []).sort((x, y) => y.n - x.n || ordemDaGaiola(x.gaiola, y.gaiola)).map(x => x.gaiola)});
    }
  }
  suspeitos.sort((a, b) => ordemDaGaiola(a.gaiola, b.gaiola) || b.metros - a.metros);
  return {pacotes: pacotes.length, gaiolas: gaiolas.size, suspeitos, semConferir};
}

// Para quem pega a rota da gaiola: os de fora que estão nela, e os do bairro dela parados em outras.
export function daGaiola(c: Conferencia, gaiola: string): {naGaiola: Suspeito[]; emOutras: Suspeito[]} {
  const g = gaiola.trim().toUpperCase();
  return {
    naGaiola: c.suspeitos.filter(s => s.gaiola === g),
    emOutras: c.suspeitos.filter(s => s.gaiola !== g && s.casas.includes(g)),
  };
}

const km = (metros: number) => `${Math.round(metros / 1000)} km`;

export function linhaDoSuspeito(s: Suspeito): string {
  const casa = s.casas.length ? ` Esse bairro vai ${s.casas.length > 1 ? 'nas gaiolas' : 'na gaiola'} ${s.casas.slice(0, 3).join(', ')}.` : '';
  return `${s.gaiola}: ${s.pacotes} pacote(s) de ${s.bairro}, a ${km(s.metros)} da área da gaiola.${casa}`;
}

// O texto para colar no WhatsApp dos analistas.
export function textoParaAnalistas(c: Conferencia): string {
  if (!c.suspeitos.length) return 'Romaneio conferido: nenhum pacote parece fora de rota.';
  const total = c.suspeitos.reduce((s, x) => s + x.pacotes, 0);
  return [`Romaneio: ${total} pacote(s) parecem fora de rota, pelo bairro. Para conferir:`, ...c.suspeitos.map(linhaDoSuspeito)].join('\n');
}

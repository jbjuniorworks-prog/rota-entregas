// Piso de sanidade em metros. Medido em 527 entregas reais: deixa passar 99,6% das posições boas
// e ainda pega o erro que motivou isto (6,2 km, Jabotiana lida como Cidade Nova). A distância
// entre a porta de verdade e o pino da rua que a busca costuma responder tem p99 de 1.180 m no
// censo de Aracaju, então 3 km também cobre esse uso com folga.
export const LONGE_DA_ANCORA = 3000;

import {DA_PLANILHA} from './rotulos';
import {chaveLugar, decompor, emCondominio, mesmaRua, normal, ruaGenerica} from './texto';
import type {Candidato, Parada, Ponto} from './tipos';

export const RAIO_BLOCO = 10;
export const RAIO_VISITA = 25;
export const MESMO_LUGAR = 150;
export const PERTO_A_PE = 300;
export const ISOLADA_MIN = 7000;
export const ISOLADA_FATOR = 4;

export function haversine(a: Ponto, b: Ponto): number {
  const R = 6371000, r = (x: number) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

const comPosicao = (p: Parada): p is Parada & Ponto => p.lat != null && p.lng != null;

export function marcarIsoladas(paradas: Parada[]): number {
  for (const p of paradas) if (p.precisao === 'longe') p.precisao = p.precisaoAntes || 'planilha';
  const com = paradas.filter(p => comPosicao(p) && !p.entregue) as (Parada & Ponto)[];
  if (com.length < 4) return 0;
  const centro = {lat: mediana(com.map(p => p.lat)), lng: mediana(com.map(p => p.lng))};
  const ds = com.map(p => haversine(p, centro));
  const limite = Math.max(ISOLADA_MIN, ISOLADA_FATOR * mediana(ds));
  let n = 0;
  com.forEach((p, i) => {
    if (p.precisao === 'manual' || ds[i] <= limite) return;
    p.precisaoAntes = p.precisao;
    p.precisao = 'longe';
    n++;
  });
  return n;
}

export function moverParaOBairro(p: Parada, ponto: Ponto, bairro: string) {
  const original = {lat: p.lat!, lng: p.lng!, exibido: 'Posição que veio na planilha (longe das outras entregas)', precisao: 'longe' as const, fonte: 'planilha'};
  p.candidatos = [{lat: ponto.lat, lng: ponto.lng, exibido: `Pelo bairro ${bairro}`, precisao: 'bairro', fonte: 'bairro'}, original];
  Object.assign(p, {lat: ponto.lat, lng: ponto.lng, precisao: 'bairro', fonte: 'bairro',
    exibido: `Posição pelo bairro ${bairro}: a planilha mandava para longe. Confira no local.`});
}

export function moverPeloBairro(paradas: Parada[]): Parada[] {
  const movidas: Parada[] = [];
  for (const p of paradas) {
    if (p.precisao !== 'longe' || !p.bairro || !DA_PLANILHA.has(p.precisaoAntes!)) continue;
    const vizinhos = paradas.filter(q => q !== p && comPosicao(q) && q.precisao !== 'longe' && normal(q.bairro) === normal(p.bairro)) as (Parada & Ponto)[];
    if (!vizinhos.length) continue;
    moverParaOBairro(p, {lat: mediana(vizinhos.map(q => q.lat)), lng: mediana(vizinhos.map(q => q.lng))}, p.bairro);
    movidas.push(p);
  }
  return movidas;
}

export function marcarNumerosIncoerentes(paradas: Parada[]): number {
  const porRua = new Map<string, {p: Parada & Ponto; n: number}[]>();
  for (const p of paradas) {
    if (p.precisao !== 'planilha' || !comPosicao(p)) continue;
    const d = decompor(p.texto);
    if (!d.numero) continue;
    const rua = normal(d.rua);
    if (!porRua.has(rua)) porRua.set(rua, []);
    porRua.get(rua)!.push({p, n: +d.numero});
  }
  const marcadas = new Set<Parada>();
  for (const lista of porRua.values()) for (const a of lista) for (const b of lista) {
    if (Math.abs(a.n - b.n) >= 300 && haversine(a.p, b.p) < 30) { marcadas.add(a.p); marcadas.add(b.p); }
  }
  marcadas.forEach(p => { p.precisao = 'numero'; });
  return marcadas.size;
}

// A planilha às vezes erra a porta por centenas de metros, sem nada que a denuncie: dentro do
// bairro, perto das outras entregas (Luan, 01/10: 168 m e 773 m). O censo é a segunda opinião,
// e também erra, então quem desempata é a rua: as outras portas dela no censo. Medido em 196
// portas confirmadas na entrega com o número exato no censo e a rua batendo. Com planilha e
// censo a mais de 80 m, foram 10 casos. Nos 6 em que a planilha errava (91 a 754 m da porta),
// ela estava a 71 m ou mais de qualquer porta da rua: tinha posto o pino fora dela. Em 3 dos 4 em
// que a planilha acertava, ela estava a até 50 m de uma porta da rua, e quem errava o número era o
// censo. Errado com esta regra sobra um: planilha certa a 152 m da porta mais perto no censo.
// Os dois limites saíram desses 10 casos; o ABERTO.md pede medir de novo.
// Repassado depois em 24 planilhas reais (1572 paradas), contra o GPS de cada entrega. Os que
// pioravam eram de dois tipos, e ficam de fora:
// - rua de nome genérico, como "Rua B1" ou "Rua Onze": o censo achava outra rua de mesmo nome, e
//   o pino pulava de 1,5 a 6 km;
// - condomínio de casas ou blocos: veja `emCondominio`.
export const CENSO_DISCORDA = 80;
export const FORA_DA_RUA = 60;

// Primeira metade, sem as outras portas da rua: a planilha longe da porta que o censo dá.
export function discordaDaPorta(p: Parada, porta: Candidato | null): number | null {
  if (!porta || p.precisao !== 'planilha' || p.entregue || !comPosicao(p)) return null;
  const daPlanilha = decompor(p.texto).rua;
  if (ruaGenerica(daPlanilha) || emCondominio(p.texto)) return null;
  if (!porta.rua || !mesmaRua(daPlanilha, porta.rua)) return null;
  const d = haversine(p, porta);
  return d > CENSO_DISCORDA ? d : null;
}

export function planilhaForaDaRua(p: Parada, porta: Candidato | null, rua: Ponto[]): number | null {
  const d = discordaDaPorta(p, porta);
  if (d == null || !comPosicao(p)) return null;
  return Math.min(...rua.map(x => haversine(p, x))) > FORA_DA_RUA ? d : null;
}

// A planilha fica como opção em 2. Conferir: em um caso de sete quem errava era o censo.
export function levarParaAPortaDoCenso(p: Parada & Ponto, porta: Candidato, metros: number) {
  p.candidatos = [porta, {lat: p.lat, lng: p.lng, exibido: 'A posição que veio na planilha', precisao: 'planilha', fonte: 'planilha'}];
  Object.assign(p, {lat: porta.lat, lng: porta.lng, precisao: 'censo', fonte: 'IBGE',
    exibido: `Porta do censo do IBGE: a planilha punha este pino a ${Math.round(metros)} m, fora da rua`});
}

export interface Censo {
  porta: (cep: string, numero: string, cidade: string) => Promise<Candidato | null>;
  // cara: varre o censo inteiro, então só vai para quem já discorda da porta
  rua: (rua: string, perto: Ponto, cidade: string) => Promise<Ponto[]>;
}

// O mesmo número decide junto. Com complementos diferentes (o bloco, a casa), metade num pino e
// metade no outro seria pior que qualquer um dos dois.
export async function levarParaOCenso(paradas: Parada[], cidade: string, censo: Censo): Promise<Parada[]> {
  const porLugar = new Map<string, Parada[]>();
  for (const p of paradas) {
    if (p.precisao !== 'planilha' || p.entregue) continue;
    const k = chaveLugar(p.texto, p.bairro, cidade);
    if (k) porLugar.set(k, [...(porLugar.get(k) || []), p]);
  }
  const levadas: Parada[] = [];
  for (const ps of porLugar.values()) {
    if (ps.some(p => emCondominio(p.texto))) continue;
    const d = decompor(ps[0].texto);
    if (!d.cep || !d.numero || ruaGenerica(d.rua)) continue;
    try {
      const porta = await censo.porta(d.cep, d.numero, cidade);
      if (!porta || !ps.some(p => discordaDaPorta(p, porta) != null)) continue;
      const rua = await censo.rua(d.rua, porta, cidade);
      for (const p of ps) {
        const metros = planilhaForaDaRua(p, porta, rua);
        if (metros) { levarParaAPortaDoCenso(p as Parada & Ponto, porta, metros); levadas.push(p); }
      }
    } catch {}
  }
  return levadas;
}

export function proximaAPe(feita: Parada, proxima: Parada | undefined): number | null {
  if (!proxima || !comPosicao(feita) || !comPosicao(proxima)) return null;
  const d = haversine(feita, proxima);
  return d <= RAIO_BLOCO || d > PERTO_A_PE ? null : Math.round(d / 10) * 10 || 10;
}

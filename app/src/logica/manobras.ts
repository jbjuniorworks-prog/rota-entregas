import {haversine} from './geo';
import type {Ponto} from './tipos';

// A faixa da próxima curva (dono, 27/11, com a foto do Google Maps: "30 m, Av. Principal; depois,
// à direita"). O serviço de ruas devolve, com o caminho, as manobras: onde virar, para que lado e
// em que rua. Aqui elas viram texto, e se escolhe a da vez pela posição dele.

export interface Manobra extends Ponto {
  tipo: string;
  // left, right, slight left, sharp right, straight, uturn (o que o serviço manda)
  lado: string | null;
  // a rua em que ele entra; vazia quando o mapa não tem o nome
  rua: string;
  saida?: number;
}

// O que o serviço chama de manobra mas não é virar: sair, seguir reto, a rua que só troca de nome.
const SEM_VIRAR = new Set(['depart', 'new name', 'notification']);

export function manobrasDoServico(rota: {legs?: {steps?: {maneuver: {location: [number, number]; type: string; modifier?: string; exit?: number}; name?: string}[]}[]}): Manobra[] {
  const lista: Manobra[] = [];
  for (const perna of rota.legs || []) for (const passo of perna.steps || []) {
    const {location: [lng, lat], type, modifier, exit} = passo.maneuver;
    if (SEM_VIRAR.has(type)) continue;
    if ((type === 'continue' || type === 'merge') && (!modifier || modifier === 'straight')) continue;
    lista.push({lat, lng, tipo: type, lado: modifier ?? null, rua: passo.name || '', ...(exit ? {saida: exit} : {})});
  }
  return lista;
}

const SETAS: Record<string, string> = {
  'left': '↰', 'sharp left': '↰', 'slight left': '↖', 'right': '↱', 'sharp right': '↱', 'slight right': '↗',
  'straight': '↑', 'uturn': '↶',
};
const PARA: Record<string, string> = {
  'left': 'à esquerda', 'sharp left': 'à esquerda', 'slight left': 'levemente à esquerda',
  'right': 'à direita', 'sharp right': 'à direita', 'slight right': 'levemente à direita', 'straight': 'em frente',
};

export function textoDaManobra(m: Manobra): {seta: string; frase: string} {
  const seta = m.tipo === 'arrive' ? '●' : m.tipo === 'roundabout' || m.tipo === 'rotary' ? '⟳' : SETAS[m.lado || ''] || '↑';
  const para = PARA[m.lado || ''] || '';
  if (m.tipo === 'arrive') return {seta, frase: 'Chegando'};
  if (m.lado === 'uturn') return {seta, frase: 'Faça o retorno'};
  if (m.tipo === 'roundabout' || m.tipo === 'rotary') return {seta, frase: m.saida ? `Na rotatória, ${m.saida}ª saída` : 'Na rotatória'};
  if (m.tipo === 'end of road') return {seta, frase: `No fim da rua, ${para || 'vire'}`};
  if (m.tipo === 'fork') return {seta, frase: `Na bifurcação, ${para || 'siga'}`};
  return {seta, frase: para ? `Vire ${para}` : 'Siga'};
}

export function metrosLegiveis(m: number): string {
  const dezenas = Math.max(10, Math.round(m / 10) * 10);
  // 996 m arredondava para "1000 m"
  if (dezenas >= 1000) return (Math.round(m / 100) / 10).toFixed(1).replace('.', ',') + ' km';
  return dezenas + ' m';
}

// Passou da curva: chegou a menos disto dela. O GPS bom erra uns 10 m; uma esquina tem uns 10 m.
export const PASSOU_M = 25;
// Ou já anda para a seguinte, perto desta: o GPS não chegou a 25 m, mas ele virou.
const DEPOIS_DA_CURVA_M = 60;
// A seguinte entra junto na faixa ("Depois, ↱") quando vem logo em seguida.
export const LOGO_DEPOIS_M = 150;

export interface DaVez {
  passadas: number;
  agora: Manobra;
  metros: number;
  depois: Manobra | null;
}

// `passadas`: quantas da lista ele já fez. Só anda para a frente: a curva feita não volta.
export function manobraDaVez(lista: Manobra[], passadas: number, eu: Ponto): DaVez | null {
  let i = passadas;
  while (i < lista.length) {
    const m = lista[i], d = haversine(eu, m);
    const seguinte = lista[i + 1];
    const indoParaASeguinte = seguinte && d < DEPOIS_DA_CURVA_M && haversine(eu, seguinte) < haversine(m, seguinte) - PASSOU_M;
    if (m.tipo !== 'arrive' && (d < PASSOU_M || indoParaASeguinte)) { i++; continue; }
    break;
  }
  if (i >= lista.length) return null;
  const agora = lista[i], seguinte = lista[i + 1];
  return {passadas: i, agora, metros: haversine(eu, agora), depois: seguinte && haversine(agora, seguinte) <= LOGO_DEPOIS_M ? seguinte : null};
}

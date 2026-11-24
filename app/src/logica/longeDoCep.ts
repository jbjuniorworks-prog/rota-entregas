import {haversine} from './geo';
import {DA_PLANILHA} from './rotulos';
import {decompor} from './texto';
import type {Parada, Ponto} from './tipos';

// "Já é a segunda vez, nem um aviso nem nada, simplesmente fica na rota" (dono, 23/11): os 15
// pacotes de um condomínio da Soledade vieram com o pino da planilha no meio da rota dele, a 14 km
// das portas do CEP deles, e o de 16/11 a 15 km. Nada no app olhava isso.
//
// Os dados não decidem onde está a porta: no histórico, com o pino a mais de 10 km das portas do
// próprio CEP, a porta verificada ficou perto do pino em 4 dos 5 casos (o CEP escrito é que não
// batia). Por isso avisa, sem mover: diz que a planilha e o CEP discordam, e quanto. O aviso só vale
// enquanto a posição for a da planilha; verificada ou arrumada, sai. No histórico de 62 dias, a regra
// disparou em 9 pinos, de todos os motoristas.
export const LONGE_DO_PROPRIO_CEP = 10000;

// As portas do censo, com os CEPs em ordem (servicos/ibge.ts).
export interface PortasDoCenso {
  ceps: ArrayLike<number>;
  lats: ArrayLike<number>;
  lngs: ArrayLike<number>;
}

function primeiro(ceps: ArrayLike<number>, alvo: number): number {
  let baixo = 0, alto = ceps.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (ceps[meio] < alvo) baixo = meio + 1; else alto = meio;
  }
  return baixo;
}

function maisPerto(p: Ponto, t: PortasDoCenso, de: number, ate: number): number | null {
  let m: number | null = null;
  for (let i = primeiro(t.ceps, de); i < t.ceps.length && t.ceps[i] < ate; i++) {
    const d = haversine(p, {lat: t.lats[i] / 1e6, lng: t.lngs[i] / 1e6});
    if (m == null || d < m) m = d;
  }
  return m;
}

// A distância do pino até a porta mais perto do CEP dele no censo: o CEP inteiro, ou a faixa dos 5
// primeiros dígitos quando o censo não tem o CEP (o condomínio da Soledade é mais novo que o censo).
// Nulo com o CEP genérico (o 000 cobre um pedaço grande da cidade) ou com a faixa fora do censo.
export function distanciaAoCep(p: Ponto, cep: string, t: PortasDoCenso): number | null {
  const n = +cep.replace(/\D/g, '');
  if (!Number.isFinite(n) || n < 1e7 || n % 1000 === 0) return null;
  return maisPerto(p, t, n, n + 1) ?? maisPerto(p, t, Math.floor(n / 1000) * 1000, Math.floor(n / 1000) * 1000 + 1000);
}

// Marca (e desmarca) as entregas da planilha com o pino longe do próprio CEP. Devolve as marcadas.
export function marcarLongeDoCep(paradas: Parada[], t: PortasDoCenso): Parada[] {
  const marcadas: Parada[] = [];
  for (const p of paradas) {
    const cep = decompor(p.texto).cep;
    const metros = !p.entregue && DA_PLANILHA.has(p.precisao) && p.lat != null && p.lng != null && cep
      ? distanciaAoCep(p as Ponto, cep, t) : null;
    if (metros != null && metros > LONGE_DO_PROPRIO_CEP) {
      p.longeDoCep = Math.round(metros);
      marcadas.push(p);
    } else delete p.longeDoCep;
  }
  return marcadas;
}

// As que o aviso mostra: a posição ainda é a da planilha, e ninguém entregou.
export const longeDoProprioCep = (ps: Parada[]) => ps.filter(p => p.longeDoCep && !p.entregue && DA_PLANILHA.has(p.precisao));

// O que o aviso diz: o fato (a planilha e o CEP discordam), não que o pino está errado.
export const avisoLongeDoCep = (n: number) => `${n} entrega(s) com o pino da planilha a mais de 10 km das portas do próprio CEP: veja o aviso vermelho antes de sair.`;

import {haversine} from '../logica/geo';
import {chaveRua, normal} from '../logica/texto';
import type {Candidato, Ponto} from '../logica/tipos';
import {nuvem} from './nuvem';

interface Trecho {
  nome: string | null;
  cidade: string;
  lat: number;
  lng: number;
  linha: [number, number][];
}

export function pontoDoTrecho(t: Trecho, perto: Ponto | null): Ponto {
  if (!perto || !Array.isArray(t.linha) || !t.linha.length) return {lat: t.lat, lng: t.lng};
  let melhor = {lat: t.lat, lng: t.lng}, menor = Infinity;
  for (const [lat, lng] of t.linha) {
    const d = haversine(perto, {lat, lng});
    if (d < menor) { menor = d; melhor = {lat, lng}; }
  }
  return melhor;
}

export function escolherTrecho(trechos: Trecho[], cidade: string, perto: Ponto | null): Trecho | null {
  if (!trechos.length) return null;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  const daCidade = nome ? trechos.filter(t => normal(t.cidade) === nome) : [];
  const lista = daCidade.length ? daCidade : trechos;
  if (!perto) return lista[0];
  return lista.reduce((a, b) => haversine(perto, pontoDoTrecho(b, perto)) < haversine(perto, pontoDoTrecho(a, perto)) ? b : a);
}

export async function ruaNaBase(rua: string, cidade: string, perto: Ponto | null): Promise<Candidato | null> {
  const supa = nuvem.cliente;
  const chave = chaveRua(rua);
  if (!supa || !nuvem.sessao || !chave || !navigator.onLine) return null;
  try {
    const {data, error} = await supa.from('ruas').select('nome, cidade, lat, lng, linha').eq('nome_chave', chave).limit(60);
    if (error || !data || !data.length) return null;
    const t = escolherTrecho(data as Trecho[], cidade, perto);
    if (!t) return null;
    const p = pontoDoTrecho(t, perto);
    return {...p, precisao: 'rua', rua: t.nome || rua, fonte: 'nossa base', exibido: `${t.nome || rua} — ${t.cidade} (pela nossa base de ruas)`};
  } catch {
    return null;
  }
}

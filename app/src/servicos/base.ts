import {haversine} from '../logica/geo';
import {chaveRua, normal, palavrasRua, semTipoDeArea, tipoDaRua} from '../logica/texto';
import type {Candidato, Ponto} from '../logica/tipos';
import {nuvem} from './nuvem';

interface Trecho {
  nome: string | null;
  tipo?: string | null;
  bairro?: string | null;
  conjunto?: string | null;
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

export function escolherTrecho(trechos: Trecho[], cidade: string, perto: Ponto | null, tipo = '', lugares: string[] = []): Trecho | null {
  if (!trechos.length) return null;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  const daCidade = nome ? trechos.filter(t => normal(t.cidade) === nome) : [];
  const naCidade = daCidade.length ? daCidade : trechos;
  const doTipo = tipo ? naCidade.filter(t => !t.tipo || t.tipo === tipo) : [];
  const certos = doTipo.length ? doTipo : naCidade;
  const ditos = [...new Set(lugares.map(semTipoDeArea).filter(x => x.length > 2))];
  const bate = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
  const doLugar = ditos.length
    ? certos.filter(t => ditos.some(d => bate(semTipoDeArea(t.conjunto || ''), d) || bate(semTipoDeArea(t.bairro || ''), d)))
    : [];
  const lista = doLugar.length ? doLugar : certos;
  if (!doLugar.length && ehGenerica(trechos) && certos.length > 1) return null;
  if (!perto) return lista[0];
  return lista.reduce((a, b) => haversine(perto, pontoDoTrecho(b, perto)) < haversine(perto, pontoDoTrecho(a, perto)) ? b : a);
}

export const ehGenerica = (trechos: Trecho[]): boolean =>
  trechos.some(t => palavrasRua(t.nome || '').join('').length <= 2);

export function cabeNoNome(pedido: string, achado: string): boolean {
  const pedidas = palavrasRua(pedido), tem = new Set(palavrasRua(achado));
  return pedidas.length > 0 && pedidas.every(w => tem.has(w));
}

const maiorPalavra = (rua: string) => palavrasRua(rua).sort((a, b) => b.length - a.length)[0] || '';

export async function ruaNaBase(rua: string, cidade: string, perto: Ponto | null, lugares: string[] = []): Promise<Candidato | null> {
  const supa = nuvem.cliente;
  const chave = chaveRua(rua);
  if (!supa || !nuvem.sessao || !chave || !navigator.onLine) return null;
  try {
    const campos = 'nome, tipo, bairro, conjunto, cidade, lat, lng, linha';
    const pelaChave = () => supa.from('ruas').select(campos).or(`nome_chave.eq."${chave}",nome_chave2.eq."${chave}"`);
    const ditos = [...new Set(lugares.map(semTipoDeArea).filter(x => x.length > 2))];
    let data: any[] = [];
    if (ditos.length) {
      const filtros = ditos.flatMap(l => [`bairro.ilike.*${l}*`, `conjunto.ilike.*${l}*`]).join(',');
      const r = await pelaChave().or(filtros).limit(80);
      data = r.data || [];
    }
    if (!data.length) {
      const r = await pelaChave().limit(80);
      if (r.error) return null;
      data = r.data || [];
    }
    if (!data.length) {
      const palavra = maiorPalavra(rua);
      if (palavra.length < 4) return null;
      const daCidade = normal(cidade.split(/[,\-\/]/)[0]);
      if (!daCidade) return null;
      const parecidas = await supa.from('ruas').select(campos).ilike('nome_chave', `%${palavra}%`).ilike('cidade', daCidade).limit(80);
      data = (parecidas.data || []).filter((t: any) => t.nome && cabeNoNome(rua, t.nome));
      if (!data.length) return null;
      
    }
    const t = escolherTrecho(data as Trecho[], cidade, perto, tipoDaRua(rua), lugares);
    if (!t) return null;
    const p = pontoDoTrecho(t, perto);
    const outroNome = t.nome && chaveRua(t.nome) !== chave;
    const titulo = outroNome ? `${rua} (no mapa: ${t.nome})` : (t.nome || rua);
    return {...p, precisao: 'rua', rua: t.nome || rua, fonte: 'nossa base', exibido: `${titulo} — ${[t.conjunto, t.bairro, t.cidade].filter(Boolean).join(' — ')} (pela nossa base de ruas)`};
  } catch {
    return null;
  }
}

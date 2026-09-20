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

export function escolherTrecho(trechos: Trecho[], cidade: string, perto: Ponto | null, tipo = '', bairro = '', conjunto = ''): Trecho | null {
  if (!trechos.length) return null;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  const daCidade = nome ? trechos.filter(t => normal(t.cidade) === nome) : [];
  const naCidade = daCidade.length ? daCidade : trechos;
  const doTipo = tipo ? naCidade.filter(t => !t.tipo || t.tipo === tipo) : [];
  const certos = doTipo.length ? doTipo : naCidade;
  const c = semTipoDeArea(conjunto);
  const doConjunto = c ? certos.filter(t => semTipoDeArea(t.conjunto || '') === c) : [];
  const b = semTipoDeArea(bairro);
  const doBairro = b ? certos.filter(t => semTipoDeArea(t.bairro || '') === b || semTipoDeArea(t.conjunto || '') === b) : [];
  const lista = doConjunto.length ? doConjunto : doBairro.length ? doBairro : certos;
  if (!perto) return lista[0];
  return lista.reduce((a, b) => haversine(perto, pontoDoTrecho(b, perto)) < haversine(perto, pontoDoTrecho(a, perto)) ? b : a);
}

export function cabeNoNome(pedido: string, achado: string): boolean {
  const pedidas = palavrasRua(pedido), tem = new Set(palavrasRua(achado));
  return pedidas.length > 0 && pedidas.every(w => tem.has(w));
}

const maiorPalavra = (rua: string) => palavrasRua(rua).sort((a, b) => b.length - a.length)[0] || '';

export async function ruaNaBase(rua: string, cidade: string, perto: Ponto | null, bairro = '', conjunto = ''): Promise<Candidato | null> {
  const supa = nuvem.cliente;
  const chave = chaveRua(rua);
  if (!supa || !nuvem.sessao || !chave || !navigator.onLine) return null;
  try {
    const campos = 'nome, tipo, bairro, conjunto, cidade, lat, lng, linha';
    let {data, error} = await supa.from('ruas').select(campos).or(`nome_chave.eq."${chave}",nome_chave2.eq."${chave}"`).limit(80);
    if (error) return null;
    if (!data || !data.length) {
      const palavra = maiorPalavra(rua);
      if (palavra.length < 4) return null;
      const daCidade = normal(cidade.split(/[,\-\/]/)[0]);
      if (!daCidade) return null;
      const parecidas = await supa.from('ruas').select(campos).ilike('nome_chave', `%${palavra}%`).ilike('cidade', daCidade).limit(80);
      data = (parecidas.data || []).filter((t: any) => t.nome && cabeNoNome(rua, t.nome));
      if (!data.length) return null;
    }
    const t = escolherTrecho(data as Trecho[], cidade, perto, tipoDaRua(rua), bairro, conjunto);
    if (!t) return null;
    const p = pontoDoTrecho(t, perto);
    const outroNome = t.nome && chaveRua(t.nome) !== chave;
    const titulo = outroNome ? `${rua} (no mapa: ${t.nome})` : (t.nome || rua);
    return {...p, precisao: 'rua', rua: t.nome || rua, fonte: 'nossa base', exibido: `${titulo} — ${[t.conjunto, t.bairro, t.cidade].filter(Boolean).join(' — ')} (pela nossa base de ruas)`};
  } catch {
    return null;
  }
}

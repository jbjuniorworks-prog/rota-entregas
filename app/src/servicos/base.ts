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

const bate = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));

export function escolherTrecho(trechos: Trecho[], cidade: string, perto: Ponto | null, tipo = '', lugares: string[] = []): Trecho | null {
  if (!trechos.length) return null;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  const daCidade = nome ? trechos.filter(t => normal(t.cidade) === nome) : [];
  const naCidade = daCidade.length ? daCidade : trechos;
  const doTipo = tipo ? naCidade.filter(t => !t.tipo || t.tipo === tipo) : [];
  const certos = doTipo.length ? doTipo : naCidade;
  const ditos = [...new Set(lugares.map(semTipoDeArea).filter(x => x.length > 2))];
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

export function quaseIgual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  let erros = 0;
  for (let i = 0, j = 0; j < longa.length; i++, j++) {
    if (curta[i] === longa[j]) continue;
    if (++erros > 1) return false;
    if (curta.length < longa.length) i--;
  }
  return true;
}

export function cabeNoNome(pedido: string, achado: string): boolean {
  const pedidas = palavrasRua(pedido), tem = palavrasRua(achado);
  return pedidas.length > 0 && pedidas.every(w => tem.some(t => quaseIgual(w, t)));
}

const maiorPalavra = (rua: string) => palavrasRua(rua).sort((a, b) => b.length - a.length)[0] || '';

const RAIO_DO_LUGAR = 800;
const lugaresVistos = new Map<string, {ponto: Ponto; nome: string} | null>();
const ACENTOS: Record<string, string> = {a: '[aáàâã]', e: '[eéèê]', i: '[iíì]', o: '[oóòôõ]', u: '[uúù]', c: '[cç]'};

export const comAcento = (texto: string): string => texto.replace(/[aeiouc]/g, c => ACENTOS[c]);

export function centroEJunto(pontos: Ponto[]): {ponto: Ponto; junto: boolean} {
  const ponto = {
    lat: pontos.reduce((s, p) => s + p.lat, 0) / pontos.length,
    lng: pontos.reduce((s, p) => s + p.lng, 0) / pontos.length,
  };
  return {ponto, junto: pontos.every(p => haversine(ponto, p) <= RAIO_DO_LUGAR)};
}

async function lugarNaBase(ditos: string[], cidade: string): Promise<{ponto: Ponto; nome: string} | null> {
  const supa = nuvem.cliente;
  const daCidade = normal(cidade.split(/[,\-\/]/)[0]);
  if (!supa || !daCidade) return null;
  for (const dito of ditos) {
    const palavra = dito.split(' ').filter(w => w.length >= 5).sort((a, b) => b.length - a.length)[0];
    if (!palavra) continue;
    const memoria = daCidade + '|' + dito;
    if (!lugaresVistos.has(memoria)) {
      const ehBairro = await supa.from('ruas').select('bairro').filter('bairro', 'imatch', `^${comAcento(dito)}$`).limit(1);
      const r = ehBairro.data && ehBairro.data.length
        ? {data: []}
        : await supa.from('ruas').select('conjunto, lat, lng').filter('conjunto', 'imatch', comAcento(palavra)).ilike('cidade', daCidade).limit(200);
      const linhas = (r.data || []).filter((t: {conjunto: string | null}) => bate(semTipoDeArea(t.conjunto || ''), dito));
      const {ponto, junto} = linhas.length ? centroEJunto(linhas as Ponto[]) : {ponto: null, junto: false};
      lugaresVistos.set(memoria, ponto && junto ? {ponto, nome: (linhas[0] as {conjunto: string}).conjunto} : null);
    }
    const achado = lugaresVistos.get(memoria);
    if (achado) return achado;
  }
  return null;
}

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
    const peloNome = data.filter((t: any) => chaveRua(t.nome || '') === chave);
    if (!peloNome.length) {
      const palavra = maiorPalavra(rua);
      const daCidade = normal(cidade.split(/[,\-\/]/)[0]);
      const parecidas = palavra.length >= 4 && daCidade
        ? await supa.from('ruas').select(campos).ilike('nome_chave', `%${palavra}%`).ilike('cidade', daCidade).limit(80)
        : {data: []};
      const comONome = (parecidas.data || []).filter((t: any) => t.nome && cabeNoNome(rua, t.nome));
      if (comONome.length) data = comONome;
      if (!data.length) return null;
    } else data = peloNome;
    const lugar = await lugarNaBase(ditos, cidade);
    const alvo = lugar ? lugar.ponto : perto;
    const t = escolherTrecho(data as Trecho[], cidade, alvo, tipoDaRua(rua), lugares);
    if (!t) return null;
    const p = pontoDoTrecho(t, alvo);
    const outroNome = t.nome && chaveRua(t.nome) !== chave;
    const titulo = outroNome ? `${rua} (no mapa: ${t.nome})` : (t.nome || rua);
    const onde = [t.conjunto, t.bairro, t.cidade].filter(Boolean).join(' — ');
    const pelo = lugar ? `na frente do ${lugar.nome}, pela nossa base de ruas` : 'pela nossa base de ruas';
    return {...p, precisao: 'rua', rua: t.nome || rua, fonte: 'nossa base', exibido: `${titulo} — ${onde} (${pelo})`};
  } catch {
    return null;
  }
}

import {haversine} from '../logica/geo';
import {RANK} from '../logica/rotulos';
import {decompor, mesmaRua, normal} from '../logica/texto';
import type {Candidato, Precisao} from '../logica/tipos';
import {buscarJson, espacado} from './rede';

interface Cep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  lat: number | null;
  lng: number | null;
}

function candidatoOSM(r: any): Candidato {
  const a = r.address || {};
  let precisao: Precisao = 'ruim';
  if (a.house_number) precisao = 'exato';
  else if (r.category === 'building' || r.type === 'house') precisao = 'bom';
  else if (r.category === 'highway' || r.addresstype === 'road') precisao = 'rua';
  const rua = [a.road, a.house_number].filter(Boolean).join(', ');
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || '';
  const cidade = a.city || a.town || a.village || a.municipality || '';
  return {lat: +r.lat, lng: +r.lon, exibido: [rua, bairro, cidade].filter(Boolean).join(' — ') || r.display_name, precisao, rua: a.road || (r.category === 'highway' ? r.name : ''), fonte: 'OpenStreetMap'};
}

async function nominatim(params: Record<string, string>): Promise<Candidato[]> {
  await espacado('nominatim', 1100);
  const u = new URL('https://nominatim.openstreetmap.org/search');
  const base = {format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'br', 'accept-language': 'pt-BR'};
  Object.entries({...base, ...params}).forEach(([k, v]) => u.searchParams.set(k, v));
  return (await buscarJson<any[]>(u)).map(candidatoOSM);
}

export async function centroDoBairro(bairro: string, cidade: string): Promise<{lat: number; lng: number} | null> {
  const [c] = await nominatim({q: comCidade(bairro, cidade)});
  return c ? {lat: c.lat, lng: c.lng} : null;
}

async function cepComCoordenada(cep: string): Promise<Cep | null> {
  try {
    const v = await buscarJson(`https://viacep.com.br/ws/${cep}/json/`, 8000);
    if (v && !v.erro) return {logradouro: v.logradouro || '', bairro: v.bairro || '', cidade: v.localidade, uf: v.uf, lat: null, lng: null};
  } catch {}
  return null;
}

export function comCidade(txt: string, cidade: string): string {
  if (!cidade) return txt;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  return nome && normal(txt).includes(nome) ? txt : txt + ', ' + cidade;
}

async function geoOSM(txt: string, cidade: string): Promise<Candidato[]> {
  const d = decompor(txt);
  const cep = d.cep ? await cepComCoordenada(d.cep) : null;
  const logradouro = (cep && cep.logradouro) || d.rua;
  if (cep && cep.logradouro) {
    const alvo = normal(txt), rua = normal(cep.logradouro);
    const i = alvo.indexOf(rua);
    if (i >= 0) {
      const m = alvo.slice(i + rua.length).match(/^[\s,]*(?:n[º°o.]*\s*)?(\d{1,5})\b/);
      if (m) d.numero = m[1];
    }
  }
  const cands: Candidato[] = [];
  const validar = (lista: Candidato[]) => {
    for (const c of lista) {
      const nomeOk = c.rua && mesmaRua(logradouro, c.rua);
      const pertoDoCep = !cep || cep.lat == null || haversine(c, cep as {lat: number; lng: number}) < 2500;
      if (!nomeOk || !pertoDoCep) c.precisao = 'ruim';
      cands.push(c);
    }
  };
  const bom = () => cands.some(c => c.precisao === 'exato' || c.precisao === 'bom');
  const naRua = () => cands.some(c => c.precisao === 'exato' || c.precisao === 'bom' || c.precisao === 'rua');

  if (cep && logradouro) {
    const base = {city: cep.cidade, state: cep.uf, country: 'Brasil'};
    if (d.numero) validar(await nominatim({...base, street: d.numero + ' ' + logradouro}));
    if (!bom() && cep.lat != null && cep.lng != null) {
      cands.push({lat: cep.lat, lng: cep.lng, exibido: [logradouro, d.numero].filter(Boolean).join(', ') + ' — ' + [cep.bairro, cep.cidade].filter(Boolean).join(' — ') + ' (pelo CEP)', precisao: 'rua', rua: logradouro, fonte: 'CEP'});
    }
    if (!naRua()) validar(await nominatim({...base, street: logradouro}));
  }
  if (!naRua() && logradouro) {
    const q = [logradouro, d.numero].filter(Boolean).join(' ');
    validar(await nominatim({q: cep ? `${q}, ${cep.cidade}, ${cep.uf}` : comCidade(q, cidade)}));
    if (!naRua() && d.numero) validar(await nominatim({q: cep ? `${logradouro}, ${cep.cidade}, ${cep.uf}` : comCidade(logradouro, cidade)}));
  }
  if (!cands.length && cep && cep.bairro) {
    cands.push(...(await nominatim({q: `${cep.bairro}, ${cep.cidade}, ${cep.uf}`})).map(c => ({...c, precisao: 'ruim' as Precisao})));
  }
  return cands;
}

async function geoGoogle(txt: string, cidade: string, chave: string): Promise<Candidato[]> {
  const u = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  u.searchParams.set('address', comCidade(txt, cidade));
  u.searchParams.set('region', 'br');
  u.searchParams.set('language', 'pt-BR');
  u.searchParams.set('components', 'country:BR');
  u.searchParams.set('key', chave);
  const j = await buscarJson(u);
  if (j.status === 'ZERO_RESULTS') return [];
  if (j.status !== 'OK') throw new Error('Google: ' + j.status + (j.error_message ? ' — ' + j.error_message : ''));
  return j.results.map((r: any) => {
    const t = r.geometry.location_type;
    let precisao: Precisao = t === 'ROOFTOP' ? 'exato' : t === 'RANGE_INTERPOLATED' ? 'bom' : (r.types || []).includes('route') ? 'rua' : 'ruim';
    if (r.partial_match && precisao === 'exato') precisao = 'bom';
    return {lat: r.geometry.location.lat, lng: r.geometry.location.lng, exibido: r.formatted_address, precisao, fonte: 'Google'};
  });
}

export async function geocodificar(txt: string, opcoes: {cidade: string; googleKey: string}): Promise<Candidato[]> {
  let cands = opcoes.googleKey ? await geoGoogle(txt, opcoes.cidade, opcoes.googleKey) : await geoOSM(txt, opcoes.cidade);
  const vistos = new Set<string>();
  cands = cands.filter(c => {
    const k = c.lat.toFixed(5) + ',' + c.lng.toFixed(5);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  cands.sort((a, b) => RANK[a.precisao] - RANK[b.precisao]);
  return cands.slice(0, 6);
}

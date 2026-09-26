import {haversine} from '../logica/geo';
import {RANK} from '../logica/rotulos';
import {conjuntoDoEndereco, decompor, mesmaRua, normal} from '../logica/texto';
import type {Candidato, Ponto, Precisao, Regiao} from '../logica/tipos';
import {ancoraDeCep, ruaNaBase} from './base';
import {ancoraDoIbge, bonito, enderecoDoIbge, ruaDoIbge, type Ancora} from './ibge';
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
  const nd = r.namedetails || {};
  const nomes = [a.road, r.name, nd.name, nd['alt_name'], nd['old_name'], nd['official_name'], nd['short_name']]
    .flatMap((n: string | undefined) => (n || '').split(';')).map((n: string) => n.trim()).filter(Boolean);
  return {lat: +r.lat, lng: +r.lon, exibido: [rua, bairro, cidade].filter(Boolean).join(' — ') || r.display_name, precisao, rua: a.road || (r.category === 'highway' ? r.name : ''), nomes: [...new Set(nomes)], fonte: 'OpenStreetMap'};
}

let regiaoAtual: Regiao | null = null;

export function usarRegiao(r: Regiao | null) {
  regiaoAtual = r;
}

export function foraDaRegiao(p: {lat: number; lng: number}, r: Regiao | null = regiaoAtual): boolean {
  return !!r && haversine(p, r) > r.raio;
}

function caixaDaRegiao(r: Regiao): string {
  const dLat = r.raio / 111320, dLng = r.raio / (111320 * Math.cos(r.lat * Math.PI / 180));
  return [r.lng - dLng, r.lat + dLat, r.lng + dLng, r.lat - dLat].map(v => v.toFixed(5)).join(',');
}

async function nominatim(params: Record<string, string>): Promise<Candidato[]> {
  await espacado('nominatim', 1100);
  const u = new URL('https://nominatim.openstreetmap.org/search');
  const base: Record<string, string> = {format: 'jsonv2', addressdetails: '1', namedetails: '1', limit: '5', countrycodes: 'br', 'accept-language': 'pt-BR'};
  if (regiaoAtual) { base.viewbox = caixaDaRegiao(regiaoAtual); base.bounded = '1'; }
  Object.entries({...base, ...params}).forEach(([k, v]) => u.searchParams.set(k, v));
  return (await buscarJson<any[]>(u)).map(candidatoOSM).filter(c => !foraDaRegiao(c));
}

export async function centroDoBairro(bairro: string, cidade: string): Promise<{lat: number; lng: number} | null> {
  const [c] = await nominatim({q: comCidade(bairro, cidade)});
  return c ? {lat: c.lat, lng: c.lng} : null;
}

export async function centroDaCidade(cidade: string): Promise<{lat: number; lng: number} | null> {
  const guardada = regiaoAtual;
  regiaoAtual = null;
  try {
    const [c] = await nominatim({q: cidade, limit: '1'});
    return c ? {lat: c.lat, lng: c.lng} : null;
  } finally {
    regiaoAtual = guardada;
  }
}

export function separarCidadeUf(cidade: string): {cidade: string; uf: string} | null {
  const m = cidade.match(/^\s*([^,\/-]+?)\s*[,\/-]\s*([A-Za-z]{2})\s*$/);
  return m ? {cidade: m[1], uf: m[2].toUpperCase()} : null;
}

export function bairroDeMaisCEPs(lista: {bairro?: string; logradouro?: string}[], rua: string): string {
  const iguais = lista.filter(x => x.logradouro && mesmaRua(rua, x.logradouro));
  const contagem = new Map<string, number>();
  for (const x of (iguais.length ? iguais : lista)) if (x.bairro) contagem.set(x.bairro, (contagem.get(x.bairro) || 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

async function ruaNosCorreios(rua: string, cidade: string): Promise<{bairro: string; cidade: string} | null> {
  const lugar = separarCidadeUf(cidade);
  const nome = rua.replace(/^\s*(rua|r\.?|avenida|av\.?|travessa|tv\.?|pra[çc]a)\s+/i, '').trim();
  if (!lugar || nome.length < 4) return null;
  try {
    await espacado('viacep', 400);
    const achados = await buscarJson<any[]>(`https://viacep.com.br/ws/${lugar.uf}/${encodeURIComponent(lugar.cidade)}/${encodeURIComponent(nome)}/json/`, 8000);
    const bairro = Array.isArray(achados) ? bairroDeMaisCEPs(achados, rua) : '';
    return bairro ? {bairro, cidade: lugar.cidade} : null;
  } catch {
    return null;
  }
}

async function cepComCoordenada(cep: string): Promise<Cep | null> {
  try {
    const v = await buscarJson(`https://viacep.com.br/ws/${cep}/json/`, 8000);
    // O ViaCEP diz a rua e o bairro mas não onde fica. Quem sabe onde é o censo, pelo setor do CEP.
    if (v && !v.erro) {
      const a = await ancoraDoIbge(cep, v.bairro || '', v.localidade || '');
      return {logradouro: v.logradouro || '', bairro: v.bairro || '', cidade: v.localidade, uf: v.uf, lat: a ? a.lat : null, lng: a ? a.lng : null};
    }
  } catch {}
  return null;
}

export function comCidade(txt: string, cidade: string): string {
  if (!cidade) return txt;
  const nome = normal(cidade.split(/[,\-\/]/)[0]);
  return nome && normal(txt).includes(nome) ? txt : txt + ', ' + cidade;
}

async function geoOSM(txt: string, cidade: string, perto: Ponto | null, bairro: string): Promise<Candidato[]> {
  const d = decompor(txt);
  // Número exato no censo: o IBGE já traz rua, bairro e coordenada, então não precisamos
  // perguntar nada para fora — nem o CEP, nem o mapa. É o caminho que funciona sem sinal.
  // Só o casamento exato passa na frente da nossa base; o aproximado espera a vez lá embaixo.
  if (d.cep && d.numero) {
    const ibge = await enderecoDoIbge(d.cep, d.numero, cidade, true);
    if (ibge && !foraDaRegiao(ibge)) return [ibge];
  }
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
      const conhecidos = c.nomes && c.nomes.length ? c.nomes : (c.rua ? [c.rua] : []);
      const casou = conhecidos.find(n => mesmaRua(logradouro, n));
      const nomeOk = !!casou;
      if (casou && c.rua && !mesmaRua(logradouro, c.rua)) c.exibido = `${logradouro} (no mapa: ${c.rua}) — ${c.exibido.split(' — ').slice(1).join(' — ')}`;
      const pertoDoCep = !cep || cep.lat == null || haversine(c, cep as {lat: number; lng: number}) < 2500;
      if (!nomeOk || !pertoDoCep) c.precisao = 'ruim';
      cands.push(c);
    }
  };
  const lugares = [bairro, cep ? cep.bairro : '', conjuntoDoEndereco(txt, bairro), ...d.resto].filter(Boolean);
  // Sem CEP e sem nenhuma pista de bairro ou condomínio, a nossa base escolhe às cegas entre as
  // ruas de mesmo nome — "Rua Vinte e Cinco" está em quatro bairros. O censo sabe em qual delas
  // o número da porta existe, e isso não custa rede nenhuma.
  if (!d.cep && d.numero && d.rua && !lugares.length) {
    const doCenso = await ruaDoIbge(d.rua, d.numero, cidade, perto);
    if (doCenso && !foraDaRegiao(doCenso)) return [doCenso];
  }
  // Rua que nenhum mapa tem, mas onde já entregamos: o CEP aprendido chega mais perto que
  // qualquer chute pelo nome. Só entra confirmado por mais de uma marcação e se for apertado.
  const doCep = ancoraDeCep(d.cep);
  if (doCep && doCep.marcas >= 2 && doCep.raio <= 400) {
    const c: Candidato = {lat: doCep.lat, lng: doCep.lng, precisao: 'rua', fonte: 'entregas',
      exibido: `${logradouro || d.rua}${d.numero ? ', ' + d.numero : ''} — pelas entregas já feitas neste CEP. Confira o número na porta.`};
    if (!foraDaRegiao(c)) cands.push(c);
  }
  // Porta vizinha no mesmo CEP, medida pelo recenseador, vale mais que um ponto qualquer da rua:
  // a nossa base responde "a rua" e devolve o MESMO ponto para todo número dela — o trecho mais
  // perto do meio da rota. Foi assim que a Oviêdo Teixeira 935 (o censo tem o 949) foi parar no
  // cruzamento junto com cinco entregas da Sílvio Teixeira, num pino só.
  // O número aqui já pode ter sido corrigido pelo CEP, logo acima.
  if (d.cep && d.numero) {
    const ibge = await enderecoDoIbge(d.cep, d.numero, cep ? cep.cidade : cidade);
    if (ibge && !foraDaRegiao(ibge)) return [ibge];
  }
  const naBase = logradouro ? await ruaNaBase(logradouro, cep ? `${cep.cidade}, ${cep.uf}` : cidade, perto, lugares) : null;
  // A base vem antes do CEP solto; o CEP vai junto como opção. Se a base cair fora do bairro,
  // a trava lá em cima rebaixa ela e quem assume é o CEP.
  if (naBase && !foraDaRegiao(naBase)) return [naBase, ...cands];
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
  if (!naRua() && logradouro) {
    const lugar = cep && cep.bairro ? {bairro: cep.bairro, cidade: cep.cidade} : await ruaNosCorreios(logradouro, cidade);
    const centro = lugar ? await centroDoBairro(lugar.bairro, lugar.cidade) : null;
    if (centro) {
      cands.unshift({...centro, precisao: 'bairro', rua: logradouro, fonte: 'CEP',
        exibido: `${logradouro}${d.numero ? ', ' + d.numero : ''} — o mapa não tem esta rua: posição pelo bairro ${lugar!.bairro}`});
    }
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
  return j.results.filter((r: any) => !foraDaRegiao({lat: r.geometry.location.lat, lng: r.geometry.location.lng})).map((r: any) => {
    const t = r.geometry.location_type;
    let precisao: Precisao = t === 'ROOFTOP' ? 'exato' : t === 'RANGE_INTERPOLATED' ? 'bom' : (r.types || []).includes('route') ? 'rua' : 'ruim';
    if (r.partial_match && precisao === 'exato') precisao = 'bom';
    return {lat: r.geometry.location.lat, lng: r.geometry.location.lng, exibido: r.formatted_address, precisao, fonte: 'Google'};
  });
}

// Piso de sanidade. Medido em 527 entregas reais: deixa passar 99,6% das posições boas e ainda
// pega o erro que motivou isto (6,2 km, Jabotiana lida como Cidade Nova).
export const LONGE_DA_ANCORA = 3000;

export const limiteDaAncora = (a: Ancora) => Math.max(LONGE_DA_ANCORA, a.raio * 2);

export async function ancoraDoEndereco(txt: string, cidade: string, bairro: string): Promise<Ancora | null> {
  const d = decompor(txt);
  // O que os motoristas já marcaram neste CEP vale mais que o centro do bairro: 80 m contra 600 m.
  const aprendida = ancoraDeCep(d.cep);
  if (aprendida) return {lat: aprendida.lat, lng: aprendida.lng, raio: aprendida.raio, nome: `CEP ${d.cep!.slice(0, 5)}-${d.cep!.slice(5)}`};
  const dito = await ancoraDoIbge(d.cep, bairro, cidade);
  if (dito) return dito;
  for (const parte of d.resto) {
    const a = await ancoraDoIbge(null, parte, cidade);
    if (a) return a;
  }
  return null;
}

export async function geocodificar(txt: string, opcoes: {cidade: string; googleKey: string; perto?: Ponto | null; bairro?: string}): Promise<Candidato[]> {
  let cands = opcoes.googleKey ? await geoGoogle(txt, opcoes.cidade, opcoes.googleKey) : await geoOSM(txt, opcoes.cidade, opcoes.perto || null, opcoes.bairro || '');
  const vistos = new Set<string>();
  cands = cands.filter(c => {
    const k = c.lat.toFixed(5) + ',' + c.lng.toFixed(5);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  // Nada pode cair longe do bairro do endereço. O que fugiu vira opção, não resposta, e no lugar
  // dela entra o bairro: errar por algumas quadras é conferível, errar de bairro manda o dia embora.
  const ancora = await ancoraDoEndereco(txt, opcoes.cidade, opcoes.bairro || '');
  if (ancora) {
    const limite = limiteDaAncora(ancora);
    // O que o motorista mesmo arrumou não se discute; o resto responde à âncora.
    const dele = new Set<Precisao>(['manual', 'lembrado', 'confirmado']);
    const fugiu = (c: Candidato) => !dele.has(c.precisao) && haversine(c, ancora) > limite;
    if (cands.every(fugiu)) {
      for (const c of cands) if (fugiu(c)) c.precisao = 'ruim';
      cands.unshift({lat: ancora.lat, lng: ancora.lng, precisao: 'bairro', fonte: 'IBGE',
        exibido: `${decompor(txt).rua || txt} — posição pelo bairro ${bonito(ancora.nome)}: o que achamos caía longe demais. Confira no local.`});
    } else {
      for (const c of cands) if (fugiu(c)) c.precisao = 'ruim';
    }
  }
  cands.sort((a, b) => RANK[a.precisao] - RANK[b.precisao]);
  return cands.slice(0, 6);
}

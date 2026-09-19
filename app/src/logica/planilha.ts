import {normal} from './texto';

const COLUNAS = {
  endereco: /endere[cç]o|address|logradouro/i,
  bairro: /bairro|neighbou?rhood|district/i,
  cidade: /^(cidade|city|munic)/i,
  cep: /\bcep\b|zip|postal/i,
  lat: /^lat/i,
  lng: /^(lng|lon)/i,
  ordem: /^(sequence|sequ[eê]ncia|seq|ordem)$/i,
  parada: /^(stop|parada)$/i,
  tn: /spx\s*tn|tracking|rastreio/i,
  at: /^at\s*id$/i,
};
type Coluna = keyof typeof COLUNAS;

export interface ItemPlanilha {
  texto: string;
  lat: number | null;
  lng: number | null;
  aproximada: boolean;
  ml: string | null;
  cidade: string;
  bairro: string;
  endereco: string;
  cep: string | null;
  tn: string | null;
  at: string | null;
  parada: string;
  arquivo: string;
  linha: Record<string, unknown>;
}

const numeroDe = (v: unknown) => typeof v === 'number' ? v : parseFloat(String(v ?? '').trim().replace(',', '.'));
const casasDecimais = (v: number) => (String(v).split('.')[1] || '').length;
const noBrasil = (lat: number, lng: number) => lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28;

export function coordenadaDaPlanilha(latBruta: unknown, lngBruta: unknown): {lat: number; lng: number; aproximada: boolean} | null {
  let lat = numeroDe(latBruta), lng = numeroDe(lngBruta);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !lat || !lng) return null;
  if (!noBrasil(lat, lng) && noBrasil(lng, lat)) [lat, lng] = [lng, lat];
  if (!noBrasil(lat, lng)) return null;
  return {lat, lng, aproximada: Math.min(casasDecimais(lat), casasDecimais(lng)) <= 2};
}

export function ehArquivoZip(inicio: Uint8Array): boolean {
  return inicio[0] === 0x50 && inicio[1] === 0x4b && inicio[2] === 0x03 && inicio[3] === 0x04;
}

export function pareceNomeDePlanilha(nome: string, tipo: string): boolean | null {
  if (/\.(xlsx|xls|ods|csv)$/i.test(nome) || /sheet|excel|csv/i.test(tipo)) return true;
  if (tipo.startsWith('image/') || tipo.includes('pdf')) return false;
  return null;
}

export function itensDaPlanilha(linhas: unknown[][], arquivo: string): ItemPlanilha[] {
  const iCab = linhas.slice(0, 10).findIndex(l => l.some(c => COLUNAS.endereco.test(String(c))));
  if (iCab < 0) throw new Error('não achei a coluna de endereço');
  const cab = linhas[iCab].map(c => String(c).trim());
  const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, re]) => [k, cab.findIndex(c => re.test(c))])) as Record<Coluna, number>;
  const campo = (l: unknown[], k: Coluna) => col[k] < 0 ? '' : String(l[col[k]] ?? '').trim();
  const itens: ItemPlanilha[] = [];
  for (const l of linhas.slice(iCab + 1)) {
    let texto = campo(l, 'endereco');
    if (!texto) continue;
    const bairro = campo(l, 'bairro'), cep = campo(l, 'cep').replace(/\D/g, '');
    if (bairro && !normal(texto).includes(normal(bairro))) texto += ', ' + bairro;
    if (cep.length === 8 && !texto.replace(/\D/g, '').includes(cep)) texto += `, CEP ${cep.slice(0, 5)}-${cep.slice(5)}`;
    const coord = col.lat >= 0 && col.lng >= 0 ? coordenadaDaPlanilha(l[col.lat], l[col.lng]) : null;
    const ordem = campo(l, 'ordem');
    itens.push({
      texto, lat: coord ? coord.lat : null, lng: coord ? coord.lng : null, aproximada: !!coord?.aproximada, ml: /^\d{1,4}$/.test(ordem) ? ordem : null,
      cidade: campo(l, 'cidade'), bairro, endereco: campo(l, 'endereco'), cep: cep || null,
      tn: campo(l, 'tn') || null, at: campo(l, 'at') || null, parada: campo(l, 'parada'), arquivo,
      linha: Object.fromEntries(cab.map((h, i) => [h || `coluna ${i + 1}`, l[i] ?? ''])),
    });
  }
  return itens;
}

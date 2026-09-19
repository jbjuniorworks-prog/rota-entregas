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
    const lat = numeroDe(l[col.lat]), lng = numeroDe(l[col.lng]);
    const temCoord = col.lat >= 0 && col.lng >= 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !!lat && !!lng;
    const ordem = campo(l, 'ordem');
    itens.push({
      texto, lat: temCoord ? lat : null, lng: temCoord ? lng : null, ml: /^\d{1,4}$/.test(ordem) ? ordem : null,
      cidade: campo(l, 'cidade'), bairro, endereco: campo(l, 'endereco'), cep: cep || null,
      tn: campo(l, 'tn') || null, at: campo(l, 'at') || null, parada: campo(l, 'parada'), arquivo,
      linha: Object.fromEntries(cab.map((h, i) => [h || `coluna ${i + 1}`, l[i] ?? ''])),
    });
  }
  return itens;
}

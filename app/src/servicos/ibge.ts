// Endereços do CNEFE/IBGE (Censo 2022) guardados no próprio app: CEP + número -> coordenada.
// Vale menos que a correção do motorista e mais que o mapa aberto, e funciona sem internet.
// O arquivo é gerado por `npm run cnefe`.
import {normal} from '../logica/texto';
import type {Candidato} from '../logica/tipos';

const ARQUIVO = 'aracaju-v1.bin';

export interface AchadoIbge {
  lat: number;
  lng: number;
  bairro: string;
  rua: string;
  numero: number;
  predio: boolean;
  salto: number;
}

interface Tabela {
  cidade: string;
  saltoMaximo: number;
  bairros: string[];
  ruas: string[];
  ceps: Uint32Array;
  numeros: Uint32Array;
  lats: Int32Array;
  lngs: Int32Array;
  iBairro: Uint16Array;
  iRua: Uint16Array;
  predios: Uint8Array;
}

let carregando: Promise<Tabela | null> | null = null;

export function lerTabela(bruto: Uint8Array): Tabela {
  const quebra = bruto.indexOf(10);
  if (quebra < 0) throw new Error('arquivo sem cabeçalho');
  const cabeca = JSON.parse(new TextDecoder().decode(bruto.subarray(0, quebra)));
  const n: number = cabeca.enderecos;
  const t: Tabela = {
    cidade: normal(cabeca.cidade || ''),
    saltoMaximo: cabeca.saltoMaximo || 20,
    bairros: cabeca.bairros || [],
    ruas: cabeca.ruas || [],
    ceps: new Uint32Array(n), numeros: new Uint32Array(n),
    lats: new Int32Array(n), lngs: new Int32Array(n),
    iBairro: new Uint16Array(n), iRua: new Uint16Array(n), predios: new Uint8Array(n),
  };
  let p = quebra + 1;
  const proximo = () => {
    let v = 0, deslocamento = 0, b = 0;
    do {
      b = bruto[p++];
      v |= (b & 0x7f) << deslocamento;
      deslocamento += 7;
    } while (b & 0x80);
    return (v >>> 1) ^ -(v & 1);
  };
  let cep = 0, numero = 0, lat = 0, lng = 0;
  for (let i = 0; i < n; i++) {
    const passo = proximo();
    cep += passo;
    const cru = proximo();
    numero = passo === 0 ? numero + cru : cru;
    lat += proximo();
    lng += proximo();
    t.ceps[i] = cep;
    t.numeros[i] = numero;
    t.lats[i] = lat;
    t.lngs[i] = lng;
    t.iBairro[i] = proximo();
    t.iRua[i] = proximo();
    t.predios[i] = proximo();
  }
  return t;
}

// o censo vem todo em maiúsculas; o motorista lê isso na tela
const MIUDAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em']);
export function bonito(texto: string): string {
  return texto.toLocaleLowerCase('pt-BR').split(/\s+/).filter(Boolean)
    .map((p, i) => (i && MIUDAS.has(p)) || /^\d/.test(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1))
    .join(' ');
}

// primeiro índice cujo CEP é >= alvo
function primeiro(ceps: Uint32Array, alvo: number): number {
  let baixo = 0, alto = ceps.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if (ceps[meio] < alvo) baixo = meio + 1; else alto = meio;
  }
  return baixo;
}

export function procurar(t: Tabela, cep: string, numero: number): AchadoIbge | null {
  const chave = +cep;
  if (!Number.isFinite(chave) || !Number.isFinite(numero) || numero <= 0) return null;
  let melhor = -1, salto = Infinity;
  for (let i = primeiro(t.ceps, chave); i < t.ceps.length && t.ceps[i] === chave; i++) {
    const d = Math.abs(t.numeros[i] - numero);
    if (d < salto) { salto = d; melhor = i; }
    if (!d) break;
  }
  if (melhor < 0 || salto > t.saltoMaximo) return null;
  return {
    lat: t.lats[melhor] / 1e6, lng: t.lngs[melhor] / 1e6,
    bairro: t.bairros[t.iBairro[melhor]] || '', rua: t.ruas[t.iRua[melhor]] || '',
    numero: t.numeros[melhor], predio: !!t.predios[melhor], salto,
  };
}

export function tabela(): Promise<Tabela | null> {
  if (!carregando) {
    carregando = (async () => {
      const r = await fetch(import.meta.env.BASE_URL + ARQUIVO);
      if (!r.ok) throw new Error('não baixou (' + r.status + ')');
      return lerTabela(new Uint8Array(await r.arrayBuffer()));
    })().catch(() => {
      // sem sinal na primeira tentativa não pode condenar a sessão inteira: tenta de novo depois
      carregando = null;
      return null;
    });
  }
  return carregando;
}

export async function enderecoDoIbge(cep: string, numero: string, cidade: string,
  soExato = false): Promise<Candidato | null> {
  const t = await tabela();
  if (!t) return null;
  const daCidade = normal(String(cidade || '').split(/[,\-\/]/)[0]);
  if (daCidade && daCidade !== t.cidade) return null;
  const pedido = parseInt(numero, 10);
  const achado = procurar(t, cep, pedido);
  if (!achado || (soExato && achado.salto)) return null;
  const rua = bonito(achado.rua);
  const ressalva = achado.salto ? ` (o IBGE tem o nº ${achado.numero}, o mais perto daqui)` : '';
  return {
    lat: achado.lat, lng: achado.lng,
    exibido: `${rua}, ${pedido} — ${bonito(achado.bairro)}${ressalva}`,
    precisao: 'bom', rua, fonte: 'IBGE',
  };
}

// Endereços do CNEFE/IBGE (Censo 2022) guardados no próprio app: CEP + número -> coordenada.
// Vale menos que a correção do motorista e mais que o mapa aberto, e funciona sem internet.
// O arquivo é gerado por `npm run cnefe`.
import {haversine} from '../logica/geo';
import {chaveBairro, chaveRua, jeitosDeLerBairro, normal, tipoDaRua} from '../logica/texto';
import type {Candidato, Ponto} from '../logica/tipos';

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

// A mesma rua se repete em vários bairros de Aracaju ("Rua Vinte e Cinco" está em quatro).
// Sem CEP, o que separa uma da outra é o número da porta e a distância das outras entregas.
const chavesDeRua = new WeakMap<Tabela, Map<string, number[]>>();

function indicePorNome(t: Tabela): Map<string, number[]> {
  let m = chavesDeRua.get(t);
  if (!m) {
    m = new Map();
    t.ruas.forEach((nome, i) => {
      const k = chaveRua(nome);
      if (!k) return;
      const lista = m!.get(k);
      if (lista) lista.push(i); else m!.set(k, [i]);
    });
    chavesDeRua.set(t, m);
  }
  return m;
}

export interface AchadoDeRua extends AchadoIbge {
  bairros: number;
}

export function procurarRua(t: Tabela, rua: string, numero: number, perto: Ponto | null, bairro = ''): AchadoDeRua | null {
  // A chave ignora o tipo, então "Rua Principal" casa com "Avenida Principal": são ruas diferentes.
  const tipo = tipoDaRua(rua);
  const mesmos = (indicePorNome(t).get(chaveRua(rua)) || []).filter(i => !tipo || tipoDaRua(t.ruas[i]) === tipo);
  const iRuas = new Set(mesmos);
  if (!iRuas.size || !Number.isFinite(numero) || numero <= 0) return null;
  const melhorNoBairro = new Map<number, {i: number; salto: number}>();
  for (let i = 0; i < t.iRua.length; i++) {
    if (!iRuas.has(t.iRua[i])) continue;
    const salto = Math.abs(t.numeros[i] - numero), atual = melhorNoBairro.get(t.iBairro[i]);
    if (!atual || salto < atual.salto) melhorNoBairro.set(t.iBairro[i], {i, salto});
  }
  const ponto = (x: {i: number}) => ({lat: t.lats[x.i] / 1e6, lng: t.lngs[x.i] / 1e6});
  const cabem = [...melhorNoBairro.values()].filter(x => x.salto <= t.saltoMaximo);
  const dito = normal(bairro);
  const doBairro = dito ? cabem.filter(x => normal(t.bairros[t.iBairro[x.i]]) === dito) : [];
  const lista = doBairro.length ? doBairro : cabem;
  if (!lista.length) return null;
  // Sem o bairro e sem saber onde a rota está, chutar entre trechos distantes erra mais do que não responder.
  if (lista.length > 1 && !perto) return null;
  const achado = lista.length === 1 ? lista[0]
    : lista.reduce((a, b) => haversine(perto!, ponto(b)) < haversine(perto!, ponto(a)) ? b : a);
  return {
    ...ponto(achado), bairro: t.bairros[t.iBairro[achado.i]] || '', rua: t.ruas[t.iRua[achado.i]] || '',
    numero: t.numeros[achado.i], predio: !!t.predios[achado.i], salto: achado.salto, bairros: melhorNoBairro.size,
  };
}

export async function ruaDoIbge(rua: string, numero: string, cidade: string,
  perto: Ponto | null, bairro = ''): Promise<Candidato | null> {
  const t = await tabela();
  if (!t) return null;
  const daCidade = normal(String(cidade || '').split(/[,\-\/]/)[0]);
  if (daCidade && daCidade !== t.cidade) return null;
  const pedido = parseInt(numero, 10);
  const achado = procurarRua(t, rua, pedido, perto, bairro);
  // Nome que só existe num bairro a nossa base resolve sozinha, e ela aprende com os motoristas.
  // O censo só entra onde ela não tem como saber: o mesmo nome de rua em bairros diferentes.
  if (!achado || achado.bairros < 2) return null;
  const nome = bonito(achado.rua);
  const ressalva = achado.salto ? ` (o IBGE tem o nº ${achado.numero}, o mais perto daqui)` : '';
  return {
    lat: achado.lat, lng: achado.lng,
    exibido: `${nome}, ${pedido} — ${bonito(achado.bairro)}${ressalva}`,
    precisao: achado.salto ? 'rua' : 'bom', rua: nome, fonte: 'IBGE',
  };
}

// Âncora: onde fica, grosso modo, o bairro (ou o setor do CEP) daquele endereço. Serve de piso —
// nenhuma resposta pode cair longe demais dela. Sai do mesmo arquivo do censo, sem rede.
export interface Ancora {
  lat: number;
  lng: number;
  raio: number;
  nome: string;
}

interface Ancoras {
  porBairro: Map<string, Ancora>;
  porPrefixo: Map<number, Ancora>;
}

const ancorasDaTabela = new WeakMap<Tabela, Ancoras>();

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function juntar(pontos: Ponto[], nome: string): Ancora {
  const centro = {lat: mediana(pontos.map(p => p.lat)), lng: mediana(pontos.map(p => p.lng))};
  const ds = pontos.map(p => haversine(centro, p)).sort((a, b) => a - b);
  // p99, não a média: bairro espalhado (Zona de Expansão) precisa de mais folga que bairro miúdo.
  return {...centro, raio: ds[Math.floor(ds.length * 0.99)] || 0, nome};
}

function ancoras(t: Tabela): Ancoras {
  let a = ancorasDaTabela.get(t);
  if (!a) {
    const porB = new Map<number, Ponto[]>(), porP = new Map<number, Ponto[]>();
    for (let i = 0; i < t.ceps.length; i++) {
      const p = {lat: t.lats[i] / 1e6, lng: t.lngs[i] / 1e6};
      const b = t.iBairro[i], pref = Math.floor(t.ceps[i] / 1000);
      (porB.get(b) || porB.set(b, []).get(b)!).push(p);
      (porP.get(pref) || porP.set(pref, []).get(pref)!).push(p);
    }
    a = {porBairro: new Map(), porPrefixo: new Map()};
    for (const [b, g] of porB) {
      const nome = t.bairros[b] || '';
      const chave = chaveBairro(nome);
      if (chave) a.porBairro.set(chave, juntar(g, nome));
    }
    for (const [pref, g] of porP) a.porPrefixo.set(pref, juntar(g, String(pref)));
    ancorasDaTabela.set(t, a);
  }
  return a;
}

// O campo do bairro chega sujo e com número por extenso; tenta as formas da mais específica
// para a mais geral, e aceita o nome do censo que aparece inteiro dentro do que foi dito.
export function acharAncoraDoBairro(t: Tabela, bairro: string): Ancora | null {
  const {porBairro} = ancoras(t);
  for (const jeito of jeitosDeLerBairro(bairro)) {
    const certa = porBairro.get(jeito);
    if (certa) return certa;
    let melhor: Ancora | null = null, tamanho = 0;
    for (const [chave, a] of porBairro) {
      const dentro = jeito === chave || jeito.startsWith(chave + ' ') || jeito.endsWith(' ' + chave) || jeito.includes(' ' + chave + ' ');
      if (dentro && chave.length > tamanho) { melhor = a; tamanho = chave.length; }
    }
    if (melhor) return melhor;
  }
  return null;
}

export async function ancoraDoIbge(cep: string | null, bairro: string, cidade: string): Promise<Ancora | null> {
  const t = await tabela();
  if (!t) return null;
  const daCidade = normal(String(cidade || '').split(/[,\-\/]/)[0]);
  if (daCidade && daCidade !== t.cidade) return null;
  const pelaRua = bairro ? acharAncoraDoBairro(t, bairro) : null;
  if (pelaRua) return pelaRua;
  const n = cep ? parseInt(cep, 10) : NaN;
  return Number.isFinite(n) ? ancoras(t).porPrefixo.get(Math.floor(n / 1000)) || null : null;
}

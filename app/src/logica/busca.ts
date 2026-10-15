import {normal} from './texto';
import type {Parada} from './tipos';

// A busca de "Todos os endereços" (pedido de 02/10): quando dá B.O. numa entrega, achar logo qual
// foi, pelo que ele tiver na mão — o código do pacote, ou a rua e o número.
//
// Cada palavra digitada tem de aparecer na parada. Palavra com letra procura no endereço e no
// bairro, sem acento. Número procura de quatro jeitos: número inteiro no endereço (35 não acha o
// 135 da mesma avenida), número da parada no app, pedaço do CEP a partir de 5 dígitos, e pedaço
// do código do pacote a partir de 4 — quem tem a etiqueta digita o fim dele, e o código tem 13
// dígitos: um "35" estaria dentro de quase todos.

export interface Achado {
  // os códigos de pacote que bateram, para ele conferir com a etiqueta
  pacotes: string[];
}

const NO_CODIGO = 4;

const palavras = (busca: string) => normal(busca).replace(/[^a-z0-9# ]/g, ' ').split(' ').filter(Boolean);

// A peneira da busca nos dias anteriores, no formato do PostgREST. O banco não tira acento, então
// vogal e "c" viram "_" (qualquer letra) e a peneira só estreita: quem decide é o acharNaParada,
// no celular, com a mesma regra da rota de hoje. Cada palavra tem de aparecer em algum campo.
export function peneiraDaNuvem(busca: string): string | null {
  const ps = palavras(busca).map(w => w.replace(/^#/, '')).filter(Boolean);
  if (!ps.length) return null;
  return `and(${ps.map(w => {
    const solto = w.replace(/[aeiouc]/g, '_');
    const campos = [`endereco.ilike.*${solto}*`, `bairro.ilike.*${solto}*`];
    if (/^\d+$/.test(w)) campos.push(`cep.ilike.*${w}*`);
    if (/\d/.test(w) && (/[a-z]/.test(w) || w.length >= NO_CODIGO)) campos.push(`spx_tn.ilike.*${w}*`);
    return `or(${campos.join(',')})`;
  }).join(',')})`;
}

export function acharNaParada(p: Parada, busca: string): Achado | null {
  const ps = palavras(busca);
  if (!ps.length) return null;
  const texto = normal([p.texto, p.bairro || ''].join(' ')).replace(/[^a-z0-9 ]/g, ' ');
  const numeros = new Set(texto.match(/\d+/g) || []);
  const cep = (p.texto.match(/\d{5}-?\d{3}/) || [''])[0].replace('-', '');
  const pacotes = (p.pacotes || []).map(c => c.toLowerCase());
  const bateram = new Set<string>();
  for (const w of ps) {
    const so = w.replace(/^#/, '');
    if (!so) continue;
    if (/^\d+$/.test(so)) {
      const doPacote = so.length < NO_CODIGO ? [] : (p.pacotes || []).filter((_, i) => pacotes[i].includes(so));
      doPacote.forEach(c => bateram.add(c));
      const achou = (!w.startsWith('#') && numeros.has(so)) || p.ml === so || p.stop === so
        || doPacote.length > 0 || (so.length >= 5 && cep.includes(so));
      if (!achou) return null;
      continue;
    }
    // palavra sem número não é código: "br" acharia todos os pacotes
    const doPacote = /\d/.test(so) ? (p.pacotes || []).filter((_, i) => pacotes[i].includes(so)) : [];
    doPacote.forEach(c => bateram.add(c));
    if (!texto.includes(so) && !doPacote.length) return null;
  }
  return {pacotes: [...bateram]};
}

// "Procurar um endereço" do Admin (15/10): a porta que o Pedro verificou no lugar errado só se
// achava carregando a planilha dele. Marcações e passagens guardam só a chave do lugar: com CEP,
// "CEP|número", sem o nome da rua; sem CEP, "r|rua|número|bairro|cidade". Rota lida de vídeo não
// sobe pacote, então a porta dela só se acha pela chave.

const CEP_NA_BUSCA = /\b(\d{5})-?(\d{3})\b/;

export interface LugarDaBusca {
  chave: string;
  endereco: string;
  bairro: string;
}

// o tipo da rua e o "dos" estão em quase toda chave: peneirar por eles não estreita nada
const NAO_ESTREITA = new Set(['rua', 'avenida', 'travessa', 'trav', 'praca', 'alameda', 'rodovia', 'estrada', 'via', 'dos', 'das']);

// A peneira das chaves no banco (padrão do ilike), pela palavra mais comprida do nome. Sem CEP nem
// nome, um número sozinho traria metade das portas.
export function peneiraDeChave(busca: string): string | null {
  const cep = busca.match(CEP_NA_BUSCA);
  if (cep) return `${cep[1]}${cep[2]}|%`;
  const nome = palavras(busca.replace(CEP_NA_BUSCA, ' ')).filter(w => /^[a-z]{3,}$/.test(w) && !NAO_ESTREITA.has(w))
    .sort((a, b) => b.length - a.length)[0];
  return nome ? `%${nome}%` : null;
}

// Número tem de ser o da porta, não um pedaço. A chave com CEP não tem o nome da rua: ali só o CEP
// e o número decidem.
export function bateNaChave(chave: string, busca: string): boolean {
  const cep = busca.match(CEP_NA_BUSCA);
  const ps = palavras(busca.replace(CEP_NA_BUSCA, ' ')).map(w => w.replace(/^#/, '')).filter(Boolean);
  const partes = chave.split('|');
  const comRua = partes[0] === 'r';
  const numero = comRua ? partes[2] : partes[1];
  if (comRua ? !!cep : !cep || partes[0] !== cep[1] + cep[2]) return false;
  const texto = partes.slice(1).join(' ');
  return ps.every(w => /^\d+$/.test(w) ? w === numero : !comRua || texto.includes(w));
}

export function textoDaChave(chave: string): {endereco: string; bairro: string} {
  const partes = chave.split('|');
  const numero = (n: string) => n === 'sn' ? 'S/N' : n;
  if (partes[0] === 'r') return {endereco: `${partes[1]}, ${numero(partes[2])}`, bairro: partes[3] || ''};
  return {endereco: `CEP ${partes[0].slice(0, 5)}-${partes[0].slice(5)}, nº ${numero(partes[1])}`, bairro: ''};
}

// Um lugar por chave. O endereço escrito vem do pacote mais novo, quando há; sem pacote, sai da
// própria chave.
export function lugaresDaBusca(busca: string, pacotes: {chave_lugar: string | null; endereco: string; bairro: string | null; cep: string | null}[],
  chaves: string[], limite = 20): LugarDaBusca[] {
  const lugares = new Map<string, LugarDaBusca>();
  for (const p of pacotes) {
    if (!p.chave_lugar || lugares.has(p.chave_lugar)) continue;
    const comoParada = {texto: p.endereco + (p.cep ? `, CEP ${p.cep}` : ''), bairro: p.bairro || '', pacotes: [], ml: null, stop: null} as unknown as Parada;
    if (acharNaParada(comoParada, busca)) lugares.set(p.chave_lugar, {chave: p.chave_lugar, endereco: p.endereco, bairro: p.bairro || ''});
  }
  for (const k of chaves) if (!lugares.has(k) && bateNaChave(k, busca)) lugares.set(k, {chave: k, ...textoDaChave(k)});
  return [...lugares.values()].slice(0, limite);
}

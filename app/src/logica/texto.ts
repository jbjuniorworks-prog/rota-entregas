export const normal = (s: unknown): string =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const RUA = /^(rua|r[.,:]?|avenida|av\.?|travessa|tv\.?|trav\.?|pra[çc]a|p[çc]\.|alameda|al\.|rodovia|rod\.|estrada|estr?\.|via|largo|beco|viela|passagem|conjunto|conj\.|loteamento|lot\.|residencial|quadra|qd\.?)\s/i;
const COMPLEMENTO = /^(condom[ií]nio|cond\.|edif[ií]cio|ed\.|apto?\.?|apartamento|bloco|bl\.|casa|lote|sala|loja|fundos|bairro|cep\b|pr[oó]ximo|perto|ao lado|em frente|refer[eê]ncia)/i;
export const TEM_CEP = /\b\d{5}-?\d{3}\b/;
const RUA_EM = new RegExp('^(.{0,6}?)\\s*(?<![a-zà-ÿ])(' + RUA.source.slice(1) + '.*)$', 'i');
const RUA_COMPLEMENTO = /^(conjunto|conj\.|loteamento|lot\.|residencial|quadra|qd\.?)\s/i;
// "Avenida Governador Paulo Barreto de" / "Menezes, 1500, …": o nome da rua quebrou de linha no print.
const RESTO_DA_RUA = /^[a-zà-ÿ][a-zà-ÿ .'-]*[,\s]\s*\d{1,5}\b/i;
export const TIPOS_RUA = /^(rua|r|avenida|av|travessa|tv|trav|praca|pc|alameda|al|rodovia|rod|estrada|est|via|largo|beco|viela|passagem)\b\.?\s*/;
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'doutor', 'dr', 'professor', 'prof', 'presidente', 'pres', 'governador', 'gov', 'ministro', 'min', 'senador', 'sen', 'deputado', 'dep', 'coronel', 'cel', 'general', 'gen', 'padre', 'pe', 'sao', 'santa', 'santo']);
const ABREVIACOES: Record<string, string> = {poe: 'poeta', eng: 'engenheiro', des: 'desembargador', alm: 'almirante', mal: 'marechal', cap: 'capitao', ten: 'tenente', sgt: 'sargento', mons: 'monsenhor', pref: 'prefeito', jorn: 'jornalista', ver: 'vereador'};
const TIPO_VIA: Record<string, string> = {r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa', al: 'alameda', alameda: 'alameda', pc: 'praca', praca: 'praca', rod: 'rodovia', rodovia: 'rodovia', est: 'estrada', estrada: 'estrada'};

export const limparRuido = (l: string): string =>
  l.replace(/[|©®✔✓]/g, ' ').replace(/\s+/g, ' ').trim().replace(/(\d)\s+[^\s\d,]{1,2}$/, '$1');

export interface LinhaAnalisada {
  ml: string | null;
  texto: string;
  unidades: number | null;
  comercial: boolean;
}

export function analisarLinha(linha: string): LinhaAnalisada {
  let texto = limparRuido(linha), ml: string | null = null, unidades: number | null = null, comercial = false;
  const mu = texto.match(/\s·\s*(\d+)\s*unid/i);
  if (mu) unidades = +mu[1];
  if (/\s·\s*comercial\b/i.test(texto)) comercial = true;
  texto = texto.replace(/\s·\s.*$/, '').trim().replace(/(\d)\s+[^\s\d,]{1,2}$/, '$1').replace(/(\d)\s+[^\s\d,]{1,2}(?=,)/, '$1');
  const m = (texto + ' ').match(RUA_EM);
  if (m && m[1]) {
    const d = m[1].match(/\d{1,3}(?!.*\d)/);
    if (d) ml = d[0];
    texto = m[2].trim();
  }
  return {ml, texto, unidades, comercial};
}

export interface Decomposto {
  rua: string;
  numero: string | null;
  cep: string | null;
  resto: string[];
}

const NUMERO_SOLTO = /^(?:n[º°o.]*\s*)?\d{1,5}[a-z]?\b/i;
const UNIDADE = 'casas?|cs|ap|apt|apto|apartamento|bl|blc|bloco|lote|lt|quadra|qd';
// "…- Casa 03", "… Bloco D Apto 303": numeração de dentro do condomínio grudada no nome da rua.
// Só casa como unidade o que vem colado no fim: "Rua Casa Forte 100" continua sendo a casa 100 da rua.
const CAUDA_UNIDADE = new RegExp(`\\s*[-–]?\\s*\\b(?:${UNIDADE})\\b\\.?(?:\\s+(?:(?:${UNIDADE})|[a-z0-9]{1,4})\\b\\.?)*\\s*$`, 'i');
// "08" e "8" são a mesma porta; "Casa 03" e "Casa 3" são a mesma casa.
export const semZeroAEsquerda = (n: string) => n.replace(/^0+(?=\d)/, '');

export function decompor(txt: string): Decomposto {
  const mc = txt.match(/\b(\d{5})-?(\d{3})\b/);
  const cep = mc ? mc[1] + mc[2] : null;
  let limpo = mc ? txt.replace(mc[0], ' ') : txt;
  limpo = limpo.replace(/\bCEP\b:?/ig, ' ');
  const seg = limpo.split(',').map(s => s.trim()).filter(Boolean);
  let rua = seg[0] || '', numero: string | null = null, resto = seg.slice(1);
  // "… 2082(3)": o print cola a contagem no número da porta; o número continua sendo o 2082.
  const fim = rua.match(/^(.*\D)\s+(?:n[º°o.]*\s*)?(\d{1,5})[a-z]?(?:\s*\(\d{1,3}\))?$/i);
  const cauda = fim ? fim[1].match(CAUDA_UNIDADE) : null;
  const semCauda = cauda ? fim![1].slice(0, cauda.index).trim() : '';
  const unidadeNaRua = !!cauda && /[a-zà-ÿ]{2}/i.test(semCauda);
  const tirarCauda = () => { resto = [rua.slice(semCauda.length).replace(/^[\s\-–]+/, '').trim(), ...resto]; rua = semCauda; };
  if (resto.length && NUMERO_SOLTO.test(resto[0])) {
    numero = resto[0].match(/\d{1,5}/)![0];
    resto = resto.slice(1);
    if (unidadeNaRua) tirarCauda();
  }
  // Sem número da rua, o que sobrou é a unidade do condomínio: melhor ficar sem número do que
  // mandar a entrega para a casa de mesmo número na rua.
  else if (unidadeNaRua) tirarCauda();
  else if (fim) { rua = fim[1].trim(); numero = fim[2]; }
  else {
    const meio = rua.match(/^((?:\S+\s+){1,7}?\S*[a-zà-ÿ])\s+(?:n[º°o.]*\s*)?(\d{1,5})[a-z]?(?:\s+(.*))?$/i);
    if (meio) { rua = meio[1].trim(); numero = meio[2]; if (meio[3]) resto = [meio[3].trim(), ...resto]; }
  }
  rua = rua.replace(/\s+n[º°o.]*$/i, '').trim();
  return {rua, numero: numero && semZeroAEsquerda(numero), cep, resto};
}

export function complementoChave(resto: string[]): string {
  const txt = normal((resto || []).join(' '));
  const partes: string[] = [];
  for (const re of [/\bap(?:to|artamento)?\.?\s*(\w{1,6})/, /\bbl(?:oco|c)?\.?\s*(\w{1,4})/, /\bcasa\s*(\w{1,4})/, /\b(?:sala|loja|lote|lt)\.?\s*(\w{1,4})/, /\bqu?a?d?r?a?\.?\s*(\d{1,4})/]) {
    const m = txt.match(re);
    if (m) partes.push(m[0].replace(/\s+/g, '').replace(/(\D)0+(?=\d)/, '$1'));
  }
  return partes.join('+');
}

export function chaveEndereco(linha: string): string {
  const d = decompor(analisarLinha(linha).texto);
  return [normal(d.rua).replace(TIPOS_RUA, ''), d.numero || '', d.cep || '', complementoChave(d.resto)].join('|');
}

export function mesmoEndereco(textos: string[]): boolean {
  const chaves = new Set(textos.map(t => chaveEndereco(t).split('|').slice(0, 2).join('|')));
  return textos.length > 1 && chaves.size === 1 && !/^\|*$/.test([...chaves][0]);
}

export function pareceEndereco(texto: string): boolean {
  if (/[=?@*<>~^{}\\]/.test(texto)) return false;
  const semTipo = texto.replace(RUA, '').trim();
  const primeira = semTipo.split(/[\s,]+/)[0] || '';
  const letras = (texto.match(/[a-zà-ÿ]/gi) || []).length;
  if (RUA.test(texto + ' ') && /^[A-Z]\d?$/.test(primeira)) return letras >= 3 && letras / texto.length > 0.25;
  if (!/^[a-zà-ÿ]{3,}$|^[a-zà-ÿ]{3,}/i.test(primeira) && !/^\d+º?$/.test(primeira)) return false;
  return letras >= 8 && letras / texto.length > 0.45;
}

interface Aberto {
  ml: string | null;
  texto: string;
  unidades?: number;
  comercial?: boolean;
}

const DE_COMANDA = /(id do pedido|localizador|c[oó]digo de coleta|entrega para [aà]s|pedido\s*#?\s*\d|documento fiscal|taxa de entrega|goomer|itens\s*\(=\)|\(\+\))/i;
const ANTES_DO_ENDERECO = /^(telefone|localizador|id do pedido|cliente)\b|\(\d{2}\)\s*\d{4,5}-?\d{4}|^\w{0,4}:\s*\(?\d{2}\)?\s*\d{4,5}-\d{4}/i;
const LIXO_DA_COMANDA = /^(obs|bandeira|pago|fidelidade|c[oó]digo|telefone|entrega para|qt|quantidade|total|taxa|desconto|cliente|www|pedido|itens|valor|forma|pagamento|n[aã]o [eé] documento)\b/i;
const CIDADE_BAIRRO = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .]{2,30})\s*[-–]\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9' .]{2,40})$/;
const REFERENCIA = /^ref\s*[.:]/i;

function pareceEnderecoDeComanda(l: string): boolean {
  if (/\b(telefone|localizador|pedido|cnpj|cliente|desconto|coleta|fidelidade)\b/i.test(l)) return false;
  const letras = (l.match(/[a-zà-ÿ]/gi) || []).length;
  if (!/\d/.test(l) || letras < 12) return false;
  return RUA.test(l + ' ') ? pareceEndereco(l) : /^[a-zà-ÿ][a-zà-ÿ' .-]{4,}[,\s]+\d{1,5}\b/i.test(l);
}

const parenteseAberto = (s: string) => (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;

function juntarQuebra(atual: string, proxima: string): string | null {
  const complementoSemNumero = /\b(apt|apto|ap|bloco|bl|casa|sala|loja|lote|quadra|qd)\.?$/i;
  const soNumero = proxima.match(/^(\d{1,5}[a-z]?)\b/i);
  if (soNumero && complementoSemNumero.test(atual)) return atual + ' ' + soNumero[1];
  const letras = (proxima.match(/[a-zà-ÿ]/gi) || []).length;
  if (letras < 3 || letras / proxima.length < 0.35) return null;
  if (/[a-zà-ÿ]$/.test(atual) && /^[a-zà-ÿ]/.test(proxima) && atual.length > 25) return atual + proxima;
  if (/[,\-]$/.test(atual) || /^[a-zà-ÿ0-9]/.test(proxima)) return atual + ' ' + proxima;
  if (parenteseAberto(atual) && /^[A-Za-zÀ-Ý]/.test(proxima)) return atual + ' ' + proxima;
  return null;
}

const cepIncompleto = (s: string) => s.replace(/[,\s]*cep\s*[:.]?\s*\d{0,7}[:.]?\s*$/i, '');

export interface Comanda {
  pedido: string | null;
  endereco: string;
  bairro: string;
  referencia: string;
}

const semSujeiraNaFrente = (l: string) => l.replace(/^[^0-9A-Za-zÀ-ÿ(]+/, '');

export function partesDaComanda(bruto: string, forcar = false): Comanda | null {
  const linhas = bruto.split('\n').map(l => semSujeiraNaFrente(limparRuido(l))).filter(Boolean);
  if (!forcar && !linhas.some(l => DE_COMANDA.test(l))) return null;
  const pedido = linhas.map(l => l.match(/pedido:?\s*#?\s*(\d{1,4})\b/i)).find(Boolean);

  const comeco = linhas.findIndex(l => ANTES_DO_ENDERECO.test(l));
  let endereco = '', bairro = '', referencia = '', dentro = false;
  for (const [i, l] of linhas.entries()) {
    if (!dentro && (i < comeco || (LIXO_DA_COMANDA.test(l) && !pareceEnderecoDeComanda(l)))) continue;
    if (!dentro) {
      if (!pareceEnderecoDeComanda(l)) continue;
      endereco = l;
      dentro = true;
      continue;
    }
    if (REFERENCIA.test(l)) { referencia = l.replace(REFERENCIA, '').trim(); continue; }
    if (LIXO_DA_COMANDA.test(l) || /^[-=_.\s]+$/.test(l)) break;
    const cb = l.match(CIDADE_BAIRRO);
    if (cb) { bairro = cb[2].trim(); continue; }
    if (bairro || referencia) break;
    const junto = TEM_CEP.test(endereco) ? null : juntarQuebra(endereco, l);
    if (junto) endereco = junto;
    else break;
  }
  endereco = cepIncompleto(endereco.replace(/[\s,]+$/, ''));
  const numero = pedido ? String(+pedido[1]) : null;
  if (!endereco || !pareceEndereco(endereco)) {
    return forcar && numero ? {pedido: numero, endereco: '', bairro: '', referencia: ''} : null;
  }
  return {pedido: numero, endereco, bairro, referencia};
}

function textoDaComanda(c: Comanda): string {
  const partes = [c.endereco];
  if (c.bairro && !normal(c.endereco).includes(normal(c.bairro))) partes.push(c.bairro);
  if (c.referencia) partes.push('ref: ' + c.referencia);
  return (c.pedido ? c.pedido + ' ' : '') + partes.join(', ');
}

export function enderecoDaComanda(bruto: string): string[] {
  const c = partesDaComanda(bruto);
  return c ? [textoDaComanda(c)] : [];
}

export const pareceComanda = (bruto: string): boolean =>
  bruto.split('\n').map(limparRuido).some(l => DE_COMANDA.test(l));

export function juntarComandas(leituras: (Comanda | null)[]): string[] {
  const boas = leituras.filter((c): c is Comanda => !!c);
  if (!boas.some(c => c.endereco)) return [];
  const melhor = (pegar: (c: Comanda) => string | null) => {
    const vezes = new Map<string, number>();
    for (const c of boas) {
      const v = pegar(c);
      if (v) vezes.set(v, (vezes.get(v) || 0) + 1);
    }
    return [...vezes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || '';
  };
  return [textoDaComanda({
    pedido: melhor(c => c.pedido) || null,
    endereco: boas.map(c => c.endereco).reduce((a, b) => (b.length > a.length ? b : a)),
    bairro: melhor(c => c.bairro),
    referencia: melhor(c => c.referencia),
  })];
}

const ROTULO_ENDERECO = /^ende?re[çcgq]o\s*[:;.]?\s+/i;
const ROTULO_REFERENCIA = /^ponto de refer[eê]ncia\s*[:;.]?\s+/i;
const FIM_DO_ENDERECO = /^(nome|pedido|itens?|valor|pago|troco|taxa|voucher|desconto|forma|observa|obs|ver mais|status|cliente|telefone|entregador|hor[aá]rio|dist[aâ]ncia|tempo|total|sub ?total|retirada|entrega)\b/i;

export function enderecosDaLista(bruto: string): string[] {
  const linhas = bruto.split('\n').map(limparRuido).filter(Boolean);
  const saida: string[] = [];
  let pedido: string | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const mp = linhas[i].match(/^pedido\s*#?\s*(\d{1,5})\b/i);
    if (mp) { pedido = String(+mp[1]); continue; }
    if (!ROTULO_ENDERECO.test(linhas[i])) continue;
    let endereco = linhas[i].replace(ROTULO_ENDERECO, '').trim(), referencia = '';
    while (i + 1 < linhas.length) {
      const l = linhas[i + 1];
      if (ROTULO_REFERENCIA.test(l)) { referencia = l.replace(ROTULO_REFERENCIA, '').trim(); i++; break; }
      if (FIM_DO_ENDERECO.test(l) || ROTULO_ENDERECO.test(l) || !/[a-zà-ÿ]{3}/i.test(l)) break;
      endereco = endereco.replace(/\s+$/, '') + ' ' + l;
      i++;
    }
    endereco = cepIncompleto(endereco.replace(/[\s,]+$/, ''));
    if (pareceEndereco(endereco)) {
      saida.push((pedido ? pedido + ' ' : '') + endereco + (referencia ? ', ref: ' + referencia : ''));
      pedido = null;
    }
  }
  return saida;
}

export function extrairEnderecos(bruto: string): string[] {
  const daLista = enderecosDaLista(bruto);
  if (daLista.length) return daLista;
  const daComanda = enderecoDaComanda(bruto);
  if (daComanda.length) return daComanda;
  const linhas = bruto.split('\n').map(limparRuido).filter(Boolean);
  const out: Aberto[] = [];
  let numeroSolto: string | null = null, aberto: Aberto | null = null;
  for (const l of linhas) {
    const {ml, texto} = analisarLinha(l);
    const complementoDoAnterior = aberto && !TEM_CEP.test(aberto.texto) && /\d/.test(aberto.texto) && RUA_COMPLEMENTO.test(texto + ' ');
    if (RUA.test(texto + ' ') && !complementoDoAnterior) {
      aberto = {ml: ml || numeroSolto, texto};
      out.push(aberto);
      numeroSolto = null;
      continue;
    }
    const ultimo = out[out.length - 1];
    if (!/\d/.test(l) && l.replace(/[^a-zà-ÿ]/gi, '').length <= 2) continue;
    const etiqueta = l.match(/EB\s*-\s*(\d{1,3})/i);
    if (ultimo && /hor[aá]rio\s+comercial/i.test(l)) { ultimo.comercial = true; aberto = null; continue; }
    const mu = l.match(/entrega\s+(\d+)\s+unidade/i);
    if (ultimo && mu) { ultimo.unidades = +mu[1]; if (etiqueta) ultimo.ml = etiqueta[1]; aberto = null; continue; }
    if (ultimo && etiqueta && /^.{0,5}EB\s*-/i.test(l)) { ultimo.ml = etiqueta[1]; aberto = null; continue; }
    if (aberto && !/\d/.test(aberto.texto) && /^\d{1,5}\b/.test(l)) { aberto.texto += ' ' + l; continue; }
    if (aberto && !/\d/.test(aberto.texto) && !COMPLEMENTO.test(l) && RESTO_DA_RUA.test(l)) { aberto.texto += ' ' + l; continue; }
    if (aberto && !TEM_CEP.test(aberto.texto) && (COMPLEMENTO.test(l) || TEM_CEP.test(l) || complementoDoAnterior)) { aberto.texto = aberto.texto.replace(/[\s,]+$/, '') + ', ' + l.replace(/[\s,]+$/, ''); continue; }
    aberto = null;
    const mn = l.match(/^[#(]?(\d{1,3})(?:[).:\]\-]|\s|$)/);
    numeroSolto = mn && !TEM_CEP.test(l) && !/^\d{1,2}:\d{2}/.test(l) ? mn[1] : null;
  }
  return out
    .filter(e => (/\s\d{1,5}\b/.test(e.texto) || TEM_CEP.test(e.texto)) && pareceEndereco(e.texto))
    .map(e => (e.ml ? e.ml + ' ' : '') + e.texto.replace(/\s[O0](?=\s)/g, '') + (e.unidades ? ` · ${e.unidades} unid` : '') + (e.comercial ? ' · comercial' : ''));
}

export function juntarQuadros(quadros: string[][]): string[] {
  const vistos = new Map<string, {e: string; n: number}>();
  for (const q of quadros) {
    for (const e of new Set(q)) {
      const k = chaveEndereco(e), v = vistos.get(k);
      if (!v) vistos.set(k, {e, n: 1});
      else { v.n++; if (e.length > v.e.length) v.e = e; }
    }
  }
  const itens = [...vistos.values()].map(v => ({...v, d: decompor(analisarLinha(v.e).texto)}));
  return itens.filter(x => !itens.some(y => y !== x && x.d.numero && y.d.numero && y.n >= x.n
    && y.d.numero.length > x.d.numero.length && y.d.numero.startsWith(x.d.numero) && normal(y.d.rua) === normal(x.d.rua))).map(x => x.e);
}

const quantasDiferentes = (lista: string[]) => new Set(lista.map(chaveEndereco)).size;

export function juntarLeituras(leituras: string[], apoio: string[] = []): string[] {
  const principais = quantasDiferentes(leituras);
  if (principais <= 1 && quantasDiferentes(apoio) > principais) [leituras, apoio] = [apoio, leituras];
  const porChave = new Map<string, string>();
  for (const e of leituras) {
    const k = chaveEndereco(e), antigo = porChave.get(k);
    if (!antigo || e.length > antigo.length) porChave.set(k, e);
  }
  const decomposto = (e: string) => ({e, d: decompor(analisarLinha(e).texto)});
  const itens = [...porChave.values()].map(decomposto);
  const referencias = [...itens, ...apoio.map(decomposto)];
  const fora = new Set<number>();
  itens.forEach((x, i) => {
    const y = referencias.find((r, j) => j !== i && !fora.has(j) && r.d.numero && x.d.numero && normal(r.d.rua) === normal(x.d.rua)
      && x.d.numero.length === r.d.numero.length + 1 && x.d.numero.startsWith(r.d.numero));
    if (!y) return;
    const j = itens.indexOf(y);
    if (j >= 0 && y.e.length > x.e.length) { fora.add(i); return; }
    x.e = x.e.replace(new RegExp(`\\b${x.d.numero}\\b`), y.d.numero!);
    if (j >= 0) fora.add(j);
  });
  const sobraram = itens.filter((_, i) => !fora.has(i));
  const juntas: typeof sobraram = [];
  for (const x of sobraram) {
    const parecida = juntas.find(y => y.d.numero && x.d.numero === y.d.numero && mesmaRua(x.d.rua, y.d.rua) && mesmaRua(y.d.rua, x.d.rua));
    if (!parecida) { juntas.push(x); continue; }
    if (x.e.length > parecida.e.length) parecida.e = x.e;
  }
  return juntas.map(x => x.e);
}

// "Rua 25" na planilha do Mercado Livre, "Rua Vinte e Cinco" no OSM e no censo: é a mesma rua da
// Jabotiana, e não era achada porque a chave saía diferente. Número é a forma que não tem duas
// grafias — o bairro já fazia isso desde o chaveBairro, a rua ficou para trás.
export function palavrasRua(nome: string): string[] {
  return comNumeros(normal(nome).replace(TIPOS_RUA, '').replace(/[^a-z0-9 ]/g, ' ').split(' ')
    .map(w => ABREVIACOES[w] || w).filter(w => w && !PALAVRAS_VAZIAS.has(w)));
}

export const chaveRua = (nome: string): string => palavrasRua(nome).join(' ');

const AREA = /^(conjunto|conj|loteamento|lot|residencial|resid|condom[ií]nio|cond|vila|parque|jardim|quadra|qd)\b\.?\s*/i;

export function conjuntoDoEndereco(texto: string, bairro = ''): string {
  const d = decompor(analisarLinha(texto).texto);
  const partes = [...d.resto, bairro].map(x => (x || '').trim()).filter(Boolean);
  const achado = partes.find(x => AREA.test(x));
  if (!achado) return '';
  return achado.replace(/\s+\b(ap(to|artamento)?|bl(oco|c)?|casa|sala|loja)\b.*$/i, '').replace(/[,;].*$/, '').trim();
}

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

const LUGAR_GENERICO = new Set([
  'condominio', 'condominios', 'cond', 'cdm', 'conj', 'conjunto', 'residencial', 'residence', 'residencia', 'resid',
  'edificio', 'edificios', 'edif', 'apartamento', 'apart', 'apto', 'bloco', 'casa', 'torre', 'predio', 'portaria',
  'porteira', 'entrada', 'fundos', 'frente', 'proximo', 'perto', 'referencia', 'quadra', 'lote', 'sala', 'loja',
  'galpao', 'bairro', 'pousada', 'hotel', 'motel', 'mercado', 'mercadinho', 'supermercado', 'padaria', 'farmacia', 'escola',
  'colegio', 'igreja', 'posto', 'praca', 'esquina', 'numero', 'andar', 'terreo', 'cobertura', 'recepcao', 'portao',
  'entregar', 'receber', 'falar', 'ligar', 'telefone', 'whatsapp', 'obrigado', 'favor',
  'comercio', 'comercial', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo', 'feriado',
  'horario', 'horas', 'manha', 'tarde', 'noite', 'entrega', 'entregas', 'entregue', 'recebe', 'morador',
  'moradora', 'inquilino', 'proprietario', 'vizinho', 'vizinha', 'deixar', 'contato', 'celular', 'interfone',
  'campainha', 'aberto', 'fechado', 'funciona', 'atende', 'atendimento', 'apenas', 'somente', 'depois', 'antes',
  'urgente', 'antiga', 'antigo', 'novo', 'nova', 'lado', 'esquerda', 'direita',
  'mercearia', 'quitanda', 'lanchonete', 'restaurante', 'pizzaria', 'oficina', 'salao', 'barbearia', 'academia',
  'clinica', 'consultorio', 'laboratorio', 'loterica', 'correios', 'borracharia', 'deposito', 'distribuidora',
  'sorveteria', 'papelaria', 'floricultura', 'petshop', 'conveniencia', 'estacionamento', 'condominios',
]);

const SO_REFERENCIA = /(perto|proxim[oa]|frente|defronte|atras|referencia|ref|depois|antes|fica)/;

export function pistasDeLugar(texto: string, bairro = ''): string[] {
  const d = decompor(analisarLinha(texto).texto);
  const fora = new Set(normal(bairro).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean));
  const dele = d.resto.filter(s => !SO_REFERENCIA.test(normal(s)));
  const palavras = normal(dele.join(' ')).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/);
  return [...new Set(palavras.filter(w => w.length >= 5 && !/\d/.test(w)
    && !LUGAR_GENERICO.has(w) && !PALAVRAS_VAZIAS.has(w) && !fora.has(w)))];
}

const ROMANOS: Record<string, string> = {i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6'};

export function blocoDoLugar(texto: string, nome: string): string {
  const m = normal(texto).replace(/[^a-z0-9 ]/g, ' ').match(new RegExp(`\\b${nome}\\w*\\s+(\\d{1,2}|i{1,3}|iv|vi?)\\b`));
  return m ? (ROMANOS[m[1]] || m[1]) : '';
}

export function nomeDoLugar(texto: string, bairro = ''): {chave: string; nome: string} | null {
  const pistas = pistasDeLugar(texto, bairro);
  if (pistas.length < 2 && !pistas.some(w => w.length >= 8)) return null;
  const d = decompor(analisarLinha(texto).texto);
  const seg = d.resto.find(s => pistas.some(w => normal(s).includes(w))) || '';
  const nome = seg.replace(/\s*\b(ap(to|artamento)?|bl(oco|c)?|casa|sala|loja)\b.*$/i, '')
    .replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {chave: [...pistas].sort().join(' '), nome: nome.length >= 2 ? nome : pistas.join(' ')};
}

export const chaveCidade = (cidade: string) => normal(String(cidade || '').split(/[,\-\/]/)[0]);

export function pistasBatem(pa: string[], pb: string[]): string[] {
  if (!pa.length || !pb.length) return [];
  const iguais = pa.filter(x => pb.some(y => quaseIgual(x, y)));
  return iguais.length >= 2 || iguais.some(w => w.length >= 8) ? iguais : [];
}

export function mesmoLugarNomeado(a: {texto: string; bairro?: string}, b: {texto: string; bairro?: string}): boolean {
  const iguais = pistasBatem(pistasDeLugar(a.texto, a.bairro), pistasDeLugar(b.texto, b.bairro));
  if (!iguais.length) return false;
  return iguais.every(w => {
    const na = blocoDoLugar(a.texto, w), nb = blocoDoLugar(b.texto, w);
    return !na || !nb || na === nb;
  });
}

export const semTipoDeArea = (nome: string): string => normal(nome).replace(AREA, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const tipoDaRua = (nome: string): string => TIPO_VIA[normal(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ')[0]] || '';

export function mesmaRua(procurada: string, achada: string): boolean {
  const a = palavrasRua(procurada), b = new Set(palavrasRua(achada));
  if (!a.length || !b.size) return false;
  return a.filter(w => b.has(w)).length / a.length >= 0.6;
}

export function ruaCompleta(rua: string): string {
  const w = normal(rua).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean);
  if (w.length && TIPO_VIA[w[0]]) w[0] = TIPO_VIA[w[0]];
  return w.join(' ');
}

export function chaveLugar(texto: string, bairro: string | undefined, cidade: string): string | null {
  const d = decompor(analisarLinha(texto).texto);
  if (!d.numero) return null;
  if (d.cep && !/000$/.test(d.cep)) return d.cep + '|' + d.numero;
  const rua = ruaCompleta(d.rua), b = normal(bairro || '');
  if (!rua || !b) return null;
  return ['r', rua, d.numero, b, normal(cidade)].join('|');
}

// Os bairros e as ruas de Aracaju aparecem dos dois jeitos: a planilha escreve "17 de Março"
// e o censo "DEZESSETE DE MARCO". Vira tudo número, que é a forma que não tem duas grafias.
const UNIDADES: Record<string, number> = {um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9};
const ATE_DEZENOVE: Record<string, number> = {dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19};
const DEZENAS: Record<string, number> = {vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90};

const CENTENAS: Record<string, number> = {cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900};

// Lê um número inteiro escrito por extenso a partir de `i` ("cento e vinte e cinco", "vinte
// cinco", "dez"), e diz quantas palavras ele ocupou. O "e" no meio é opcional porque nem sempre
// chega aqui: quem monta a chave da rua já tirou as palavras vazias antes.
function numeroEm(p: string[], i: number): {valor: number; comeu: number} | null {
  let valor = 0, comeu = 0, achou = false;
  const depois = () => (comeu > 0 && p[i + comeu] === 'e' ? i + comeu + 1 : i + comeu);
  if (CENTENAS[p[i]] != null) { valor = CENTENAS[p[i]]; comeu = 1; achou = true; }
  let j = depois();
  if (DEZENAS[p[j]] != null) {
    valor += DEZENAS[p[j]]; comeu = j - i + 1; achou = true;
    j = depois();
    if (UNIDADES[p[j]] != null) { valor += UNIDADES[p[j]]; comeu = j - i + 1; }
  } else {
    const solto = ATE_DEZENOVE[p[j]] ?? UNIDADES[p[j]];
    if (solto != null) { valor += solto; comeu = j - i + 1; achou = true; }
  }
  return achou ? {valor, comeu} : null;
}

export function comNumeros(palavras: string[]): string[] {
  const saida: string[] = [];
  for (let i = 0; i < palavras.length; i++) {
    const lido = numeroEm(palavras, i);
    if (!lido) { saida.push(palavras[i]); continue; }
    saida.push(String(lido.valor));
    i += lido.comeu - 1;
  }
  return saida;
}

// O bairro chega sujo: "Aruana - Condomínio Vistaruana", "17 de Março Bl 04 Ap 403",
// "São José dos Náufragos/Robalo", "Zona de Expansão (Robalo)".
const CAUDA_DO_BAIRRO = /\s+\b(?:bl|bloco|ap|apt|apto|apartamento|casa|cond|condominio|lot|loteamento|cj|conjunto|qd|quadra|lote)\b.*$/i;

export function chaveBairro(nome: string): string {
  const limpo = normal(nome).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').replace(CAUDA_DO_BAIRRO, '').trim();
  return comNumeros(limpo.split(/\s+/).filter(w => w && !PALAVRAS_VAZIAS.has(w))).join(' ');
}

// Formas alternativas de ler o mesmo campo, da mais específica para a mais geral.
export function jeitosDeLerBairro(nome: string): string[] {
  const cru = normal(nome);
  const dentroDosParenteses = (cru.match(/\(([^)]{2,})\)/) || [])[1] || '';
  const partes = [dentroDosParenteses, cru.split(/[/,]/)[0], cru.split(/\s+-\s+/)[0], cru];
  return [...new Set(partes.map(chaveBairro).filter(Boolean))];
}

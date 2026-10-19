export const normal = (s: unknown): string =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const RUA = /^(rua|r[.,:]?|avenida|av\.?|travessa|tv\.?|trav\.?|pra[çc]a|p[çc]\.|alameda|al\.|rodovia|rod\.|estrada|estr?\.|via|largo|beco|viela|passagem|conjunto|conj\.|loteamento|lot\.|residencial|quadra|qd\.?)\s/i;
const COMPLEMENTO = /^(condom[ií]nio|cond\.|edif[ií]cio|ed\.|apto?\.?|apartamento|bloco|bl\.|casa|lote|sala|loja|fundos|bairro|cep\b|pr[oó]ximo|perto|ao lado|em frente|refer[eê]ncia)/i;
export const TEM_CEP = /\b\d{5}-?\d{3}\b/;
const RUA_EM = new RegExp('^(.{0,6}?)\\s*(?<![a-zà-ÿ])(' + RUA.source.slice(1) + '.*)$', 'i');
const RUA_COMPLEMENTO = /^(conjunto|conj\.|loteamento|lot\.|residencial|quadra|qd\.?)\s/i;
// "Avenida Governador Paulo Barreto de" / "Menezes, 1500, …": o nome da rua quebrou de linha no print.
const RESTO_DA_RUA = /^[a-zà-ÿ][a-zà-ÿ .'-]*[,\s]\s*\d{1,5}\b/i;
// "Rua F Quadra B Lot Jardim" / "Esperança Lot.Planalto SN": o nome quebrou de linha e a segunda
// parte não tem número nenhum. Endereço rural é assim — o número da porta é "SN", sem número.
const CONTINUA_O_NOME = /^[a-zà-ÿ][a-zà-ÿ0-9 .'/-]{2,}$/i;
// "Sem N" e "sem número" são o S/N por extenso. Pedro, 19/10: a planilha escreveu "Sem N", a
// parada ficou sem chave, e a porta que ele marcou valeu só para aquele dia.
export const SEM_NUMERO = /\bs[/\s.]?n[º°o]?\b|\bsem\s+n(?:[º°o]|[uú]m(?:ero)?|[uú]mera[cç][aã]o)?\.?(?![\wà-ÿ])/i;
export const TIPOS_RUA = /^(rua|r|avenida|av|travessa|tv|trav|praca|pc|alameda|al|rodovia|rod|estrada|est|via|largo|beco|viela|passagem)\b\.?\s*/;
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'doutor', 'dr', 'professor', 'prof', 'presidente', 'pres', 'governador', 'gov', 'ministro', 'min', 'senador', 'sen', 'deputado', 'dep', 'coronel', 'cel', 'general', 'gen', 'padre', 'pe', 'sao', 'santa', 'santo']);
const ABREVIACOES: Record<string, string> = {poe: 'poeta', eng: 'engenheiro', des: 'desembargador', alm: 'almirante', mal: 'marechal', cap: 'capitao', ten: 'tenente', sgt: 'sargento', mons: 'monsenhor', pref: 'prefeito', jorn: 'jornalista', ver: 'vereador'};
const TIPO_VIA: Record<string, string> = {r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa', al: 'alameda', alameda: 'alameda', pc: 'praca', praca: 'praca', rod: 'rodovia', rodovia: 'rodovia', est: 'estrada', estrada: 'estrada'};

// A janela de horário do Mercado Livre ("10:15h a 13:20h", "Habilita as 14:25 h"). Numa parada de
// cartão fechado ela fica na mesma altura da rua e sai colada no endereço — e colada vira parte do
// nome da rua, que então não casa com nada e a parada fica sem posição nenhuma.
const FAIXA_DE_HORARIO = /\b(?:habilita\s+[àa]s\s+)?\d{1,2}:\d{2}\s*h?\s*(?:a|[àa]s)\s*\d{1,2}:\d{2}\s*h?|\bhabilita\s+[àa]s\s+\d{1,2}:\d{2}\s*h?/gi;

export const limparRuido = (l: string): string => {
  const limpo = l.replace(/[|©®✔✓]/g, ' ').replace(/\s+/g, ' ').trim();
  const semHorario = limpo.replace(FAIXA_DE_HORARIO, ' ').replace(/\s+/g, ' ').trim();
  // A tarja "🔒 Habilita as 11:45 h" sai do leitor com o cadeado virado dígito: "8 Habilita as
  // 11:45 h". Tirado o horário sobra só o 8, que o app tomava como o número da parada seguinte —
  // e seis paradas de uma gravação saíram com o mesmo "#8", que entra na ordenação da rota.
  // Linha que era só a tarja não é linha.
  if (semHorario !== limpo && !/[a-zà-ÿ]/i.test(semHorario)) return '';
  return semHorario
    .replace(/(\d)\s+[^\s\d,]{1,2}$/, '$1')
    // o selo de "verificado" do app de entrega sai como um símbolo solto no fim do nome da rua
    .replace(/([a-zà-ÿ])\s+[^\sa-zà-ÿ\d]{1,2}$/i, '$1');
};

// Coordenada colada junto com o endereço: link do Google Maps, link de compartilhar, ou o par
// solto. A ordem importa. No link de lugar do Google o `!3d!4d` é a PORTA e o `@` é só o
// enquadramento do mapa — em dois links reais da Sílvio Teixeira os dois diferiam 250 m, então o
// `@` só entra quando não há mais nada.
const COORD = /(-?\d{1,3}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/;
const PORTA_DO_GOOGLE = /!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/g;
const CONSULTA = /[?&](?:q|query|destination|ll)=(-?\d{1,3}\.\d{4,})(?:,|%2C)(-?\d{1,3}\.\d{4,})/i;
const ENQUADRAMENTO = /@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/;
const LINK = /https?:\/\/\S+/g;

export function coordenadaNoTexto(texto: string): {lat: number; lng: number} | null {
  // O lugar aberto a partir de outro (a avenida, por exemplo) traz os dois pares: o do lugar de
  // antes primeiro e o do lugar do link por último. No link do Poesia Art Home (13/10) o primeiro
  // era o meio da Av. Augusto Franco, a 1,8 km da porta.
  const portas = [...texto.matchAll(PORTA_DO_GOOGLE)];
  if (portas.length) {
    const m = portas[portas.length - 1];
    return {lat: +m[1], lng: +m[2]};
  }
  for (const re of [CONSULTA, ENQUADRAMENTO]) {
    const m = texto.match(re);
    if (m) return {lat: +m[1], lng: +m[2]};
  }
  // par solto só fora de link, senão pega pedaço de URL
  const m = texto.replace(LINK, ' ').match(COORD);
  return m ? {lat: +m[1], lng: +m[2]} : null;
}

export const semLink = (texto: string): string =>
  texto.replace(LINK, ' ').replace(COORD, ' ').replace(/\s*[,;]\s*(?=[,;]|$)/g, '').replace(/\s+/g, ' ').trim().replace(/[\s,;]+$/, '');

// Com ou sem o https da frente: "maps.app.goo.gl/..." copiado da barra também é link.
const PARECE_LINK = /https?:\/\/|\bwww\.|\b(?:maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]+|waze\.com)\//i;

export type Edicao =
  | {tipo: 'nada'}
  | {tipo: 'posicao'; lat: number; lng: number}
  | {tipo: 'link sem posicao'}
  | {tipo: 'endereco'; texto: string};

// O que fazer com o que ele confirmou no Editar. O link do "Compartilhar" do Maps no celular
// (maps.app.goo.gl) não traz a coordenada, e virava o endereço da parada: o nome mudou em vez de o
// pino ir para o lugar (14/10). Link nenhum é endereço. E OK sem mudar nada buscava de novo, e a
// busca passava por cima da porta verificada que estava ali.
export function lerEdicao(antes: string, novo: string | null): Edicao {
  const t = (novo || '').trim();
  const igual = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (!t || igual(t) === igual(antes)) return {tipo: 'nada'};
  const c = coordenadaNoTexto(t);
  if (c) return {tipo: 'posicao', ...c};
  if (PARECE_LINK.test(t)) return {tipo: 'link sem posicao'};
  return {tipo: 'endereco', texto: t};
}

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
  // "Rua Q7 120": o nome da rua acaba em dígito, e sem o [a-z]\d a porta não saía de lugar
  // nenhum. Só ganha número quem não tinha nenhum.
  const fim = rua.match(/^(.*(?:\D|[a-zà-ÿ]\d))\s+(?:n[º°o.]*\s*)?(\d{1,5})[a-z]?(?:\s*\(\d{1,3}\))?$/i);
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

// "85A" é outra porta que a 85. O decompor guarda só os dígitos, que é o que a busca precisa; a
// chave precisa da letra, senão a 85, a 85A e a 85B de uma gravação viravam uma parada só (07/10).
// Medido em 3.269 linhas de planilha: 20 têm letra, e só 2 endereços misturam com e sem.
export function letraDaPorta(texto: string, numero: string | null): string {
  if (!numero) return '';
  const m = texto.match(new RegExp(`(?:^|[\\s,])0*${numero}([a-z])\\b`, 'i'));
  return m ? m[1].toLowerCase() : '';
}

export function chaveEndereco(linha: string): string {
  const t = analisarLinha(linha).texto, d = decompor(t);
  return [normal(d.rua).replace(TIPOS_RUA, ''), (d.numero || '') + letraDaPorta(t, d.numero), d.cep || '', complementoChave(d.resto)].join('|');
}

export function mesmoEndereco(textos: string[]): boolean {
  const chaves = new Set(textos.map(t => chaveEndereco(t).split('|').slice(0, 2).join('|')));
  return textos.length > 1 && chaves.size === 1 && !/^\|*$/.test([...chaves][0]);
}

export function pareceEndereco(texto: string): boolean {
  if (/[=?@*<>~^{}\\]/.test(texto)) return false;
  // "Estrada da Tal", "Rua do Sol": a palavra de duas letras na frente do nome fazia a linha
  // parecer sujeira, e as quatro paradas de uma estrada assim sumiram de uma gravação (07/10).
  // Só quando vem um nome depois: "Rua E" continua sendo a rua de uma letra.
  const semTipo = texto.replace(RUA, '').trim().replace(/^(?:d[aeo]s?|e)\s+(?=[a-zà-ÿ]{3})/i, '');
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
  // o cartão acabou na faixa de horário do seguinte: está inteiro, não foi cortado pela borda
  inteiro?: boolean;
}

// A faixa de horário ("08:15h a 12:15h", "Habilita as 13:50 h") é o alto de cada cartão do
// Mercado Livre: o que vem antes dela é do cartão anterior. O cabeçalho do grupo ("ÁREA 3 | 14:15
// a 17:40 hs") também: sem isso a rua só com nome, sem número, levava "ÁREA 3" como fim do nome (11/10).
const FAIXA = '\u0000faixa';
const CABECALHO_DA_AREA = /^\W*[áa]rea\s+\d{1,2}\b/i;
const soFaixa = (l: string) => (!limparRuido(l) || CABECALHO_DA_AREA.test(l)) && new RegExp(FAIXA_DE_HORARIO.source, 'i').test(l);

const DE_COMANDA = /(id do pedido|localizador|c[oó]digo de coleta|entrega para [aà]s|pedido\s*#?\s*\d|documento fiscal|taxa de entrega|goomer|itens\s*\(=\)|\(\+\))/i;
// "Pedido: #12", "Pedido #0004 - Entrega": o "#" sai lido como "H".
const LINHA_DO_PEDIDO = /^pedido\s*[:.]?\s*[#hH*]?\s*\d/i;
// Marcas que só a comanda tem. Uma sozinha aparece em print de outro app; duas juntas, não. "fiscal"
// sem o resto porque o leitor cola as palavras ("DOCUMENT&UFISCAL").
const MARCAS_DA_COMANDA = [/d[o0] pedido/i, /localizador/i, /c[oó]digo de coleta/i, /entrega para [aà]s/i, /^\W*pedido\s*[:.]?\s*[#hH*]?\s*\d/im, /fiscal/i, /goomer/i, /\bcnpj\b/i, /cliente\s*:/i, /taxa de ent/i, /forma de pagamento/i, /sub ?total/i];
// O leitor come a primeira letra quando o dedo ou a borda passa por cima ("D do pedido", "1D do
// pedido", "lefone: 0800…"). Com o rótulo procurado só no começo da linha, o endereço começava no
// segundo telefone, que no iFood vem depois dele, e a comanda saía sem endereço (19/10).
const ANTES_DO_ENDERECO = /^(telefone|localizador|id do pedido|cliente)\b|\bd[o0] pedido\b|\blocalizador\b|fone\s*:|\(\d{2}\)\s*\d{4,5}-?\d{4}|^\w{0,4}:\s*\(?\d{2}\)?\s*\d{4,5}-\d{4}/i;
// O cabeçalho do iFood traz o endereço do restaurante no mesmo molde do cliente ("Rua Tal, 101" e
// "Aracaju - Atalaia"), e a rua do restaurante entrava como parada (19/10). O do cliente vem depois
// do "ENTREGA" ou da linha do pedido; o CNPJ, quando sai, marca o cabeçalho também.
const TITULO_DA_COMANDA = new RegExp(`^entreg[a-z]?\\W*$|${LINHA_DO_PEDIDO.source}`, 'i');
const CNPJ = /\bcnpj\b|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/i;
// Daqui para baixo vêm observações, itens e pagamento, e o endereço do cliente já passou.
const FIM_DO_BLOCO = /^(obs\b|qtd?\b|qt\s*\.|n[aã]o [eé] documento|forma de pagamento|sub ?total|total\b|entrega para)/i;
const LIXO_DA_COMANDA = /^(obs|bandeira|pago|fidelidade|c[oó]digo|telefone|entrega para|qt|quantidade|total|taxa|desconto|cliente|www|pedido|itens|valor|forma|pagamento|n[aã]o [eé] documento)\b/i;
const CIDADE_BAIRRO = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .]{2,30})\s*[-–]\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9' .]{2,40})$/;
const REFERENCIA = /^ref\s*[.:]/i;

function pareceEnderecoDeComanda(l: string): boolean {
  // "Entrega para às 21:25" tem palavra e número como um endereço, e era a linha que ficava quando
  // o do cliente não saía (19/10)
  if (/\b(telefone|localizador|pedido|cnpj|cliente|desconto|coleta|fidelidade)\b|\bentrega\s+para\b/i.test(l)) return false;
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

// "CEP: 49000" e "CEP: 49000-": o resto ficou numa linha que não veio
const cepIncompleto = (s: string) => s.replace(/[,\s]*cep\s*[:.]?\s*(?:\d{0,7}|\d{5}-\d{0,2})[:.]?\s*$/i, '');

export interface Comanda {
  endereco: string;
  bairro: string;
  referencia: string;
}

const semSujeiraNaFrente = (l: string) => l.replace(/^[^0-9A-Za-zÀ-ÿ(]+/, '');

export function partesDaComanda(bruto: string, forcar = false): Comanda | null {
  const linhas = bruto.split('\n').map(l => semSujeiraNaFrente(limparRuido(l))).filter(Boolean);
  if (!forcar && !linhas.some(l => DE_COMANDA.test(l))) return null;

  const cabecalho = Math.max(linhas.findIndex(l => TITULO_DA_COMANDA.test(l)), ...linhas.flatMap((l, i) => (CNPJ.test(l) ? [i + 2] : [])));
  const fim = linhas.findIndex((l, i) => i > cabecalho && FIM_DO_BLOCO.test(l));
  // Com o título lido, o cliente vem depois dele, e o leitor às vezes põe a linha do endereço antes
  // da do telefone (19/10). Sem o título, o começo é o primeiro rótulo do cliente.
  const comeco = cabecalho >= 0 ? -1 : linhas.findIndex((l, i) => (fim < 0 || i < fim) && ANTES_DO_ENDERECO.test(l));
  let endereco = '', bairro = '', referencia = '', dentro = false;
  for (const [i, l] of linhas.entries()) {
    if (!dentro) {
      if (i <= cabecalho || i < comeco) continue;
      if (FIM_DO_BLOCO.test(l)) break;
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
    // "CEP: 49000-" e "100" logo abaixo: a coluna estreita parte o CEP. Só a linha que começa pelos
    // três que faltam, ainda dentro do endereço.
    if (/\bcep\s*[:.]?\s*\d{5}-?$/i.test(endereco) && /^\d{3}\b/.test(l)) { endereco += l; continue; }
    const junto = TEM_CEP.test(endereco) ? null : juntarQuebra(endereco, l);
    if (junto) endereco = junto;
    else break;
  }
  endereco = cepIncompleto(endereco.replace(/[\s,]+$/, ''));
  return endereco && pareceEndereco(endereco) ? {endereco, bairro, referencia} : null;
}

// Só o endereço. O número do pedido ia na frente, e lido errado virava o de outra parada (o 13 saiu
// 3, o 79 saiu 19); o dono pediu a comanda sem ele (19/10).
function textoDaComanda(c: Comanda): string {
  const partes = [c.endereco];
  if (c.bairro && !normal(c.endereco).includes(normal(c.bairro))) partes.push(c.bairro);
  if (c.referencia) partes.push('ref: ' + c.referencia);
  return partes.join(', ');
}

export function enderecoDaComanda(bruto: string): string[] {
  const c = partesDaComanda(bruto);
  return c ? [textoDaComanda(c)] : [];
}

export const pareceComanda = (bruto: string): boolean =>
  bruto.split('\n').map(limparRuido).some(l => DE_COMANDA.test(l));

export const ehComanda = (textos: string[]): boolean =>
  textos.some(t => MARCAS_DA_COMANDA.filter(re => re.test(t)).length >= 2);

export interface LeituraDaComanda {
  linhas: string[];
  avisos: string[];
  // alguma passada achou o endereço do cliente, mesmo sem certeza
  achou: boolean;
}

// "Rua Tal, 120, …": o tipo da rua na frente, o nome só com letras e números e a porta sozinha entre
// vírgulas, como as duas comandas imprimem. Leitura fora desse molde não serve de prova da porta:
// "Travessa Tal, 3 5" e "Ã. Sen. Fulano. TERRA NANDA 10" saíram de comandas fotografadas (19/10).
const MOLDE_DA_PORTA = new RegExp(`^${RUA.source.slice(1, -2)}\\s+([a-zà-ÿ0-9º°ª][a-zà-ÿ0-9º°ª .'-]*?)\\s*,\\s*(\\d{1,5})[a-z]?\\s*(?:[,(]|$)`, 'i');
const UNIDADE_DA_COMANDA = /\b(ap(?:to|artamento)?|bl(?:oco)?|casa|sala|lote|qd|quadra)\.?\s*(\d{1,5})\b/gi;

function portaDaComanda(endereco: string): string | null {
  const m = endereco.match(MOLDE_DA_PORTA);
  const rua = m ? chaveRua(`${m[1]} ${m[2]}`) : '';
  return m && rua ? `${rua}|${semZeroAEsquerda(m[3])}` : null;
}

const tipoDaUnidade = (t: string) => normal(t).replace(/^ap.*/, 'ap').replace(/^bl.*/, 'bloco').replace(/^quadra$/, 'qd');
const NOME_DA_UNIDADE: Record<string, string> = {ap: 'o apartamento', bloco: 'o bloco', casa: 'o número da casa', sala: 'a sala', lote: 'o lote', qd: 'a quadra'};

// Os números de apartamento, bloco ou casa que cada leitura deu diferente: "ap 203" e "ap 103".
function unidadesQueDivergem(enderecos: string[]): Map<string, string[]> {
  const lidas = new Map<string, Set<string>>();
  for (const e of enderecos) {
    for (const m of e.matchAll(UNIDADE_DA_COMANDA)) {
      const tipo = tipoDaUnidade(m[1]);
      lidas.set(tipo, (lidas.get(tipo) || new Set()).add(semZeroAEsquerda(m[2])));
    }
  }
  return new Map([...lidas].filter(([, v]) => v.size > 1).map(([k, v]) => [k, [...v]]));
}

const resumoDaPorta = (endereco: string) => endereco.split(/\s*\(/)[0].split(',').slice(0, 2).join(',').trim().slice(0, 60);

// As passadas do leitor sobre a mesma comanda são uma entrega só. Sem maioria: duas leituras no molde
// que dão porta diferente ficam para ele conferir, porque numa comanda de 19/10 duas passadas
// concordaram no 181 e a porta era a 151.
export function juntarComandas(leituras: (Comanda | null)[], corrigir: (linhas: string[]) => string[] = x => x): LeituraDaComanda {
  const boas = leituras.filter((c): c is Comanda => !!c);
  if (!boas.length) return {linhas: [], avisos: [], achou: false};
  const firmes = boas.flatMap(c => {
    if (!portaDaComanda(c.endereco)) return [];
    const corrigido = corrigir([c.endereco])[0];
    return [{...c, endereco: corrigido, porta: portaDaComanda(corrigido) || portaDaComanda(c.endereco)!}];
  });
  if (new Set(firmes.map(f => f.porta)).size !== 1) {
    // o texto foi lido; o que falhou foi confirmar a porta, e ele precisa ver o que foi lido
    const lidas = [...new Set((firmes.length ? firmes : boas).map(c => resumoDaPorta(c.endereco)))].slice(0, 3);
    return {
      linhas: [],
      avisos: ['Não deu para confirmar o endereço. Confira as leituras abaixo ou fotografe novamente.', ...lidas.map(l => `"${l}"`)],
      achou: true,
    };
  }
  let endereco = firmes.map(f => f.endereco).reduce((a, b) => (b.length > a.length ? b : a));
  const avisos: string[] = [];
  // O apartamento que cada leitura deu diferente sai do texto: está no papel, e escolher um mandaria
  // para a porta errada do prédio.
  const divergentes = unidadesQueDivergem(firmes.map(f => f.endereco));
  if (divergentes.size) {
    endereco = endereco.replace(UNIDADE_DA_COMANDA, (m, tipo) => (divergentes.has(tipoDaUnidade(tipo)) ? '' : m))
      .replace(/\(\s*\)/g, '').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s*,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').trim();
    // A entrega entra sem o número: o aviso tem de dizer isso, para a leitura não parecer completa.
    avisos.push(`O endereço entrou sem ${[...divergentes.keys()].map(t => NOME_DA_UNIDADE[t] || t).join(' e ')}: as leituras deram `
      + `${[...divergentes].map(([t, v]) => v.map(n => `${t} ${n}`).join(' e ')).join(', ')}. Confira no papel antes de entregar.`);
  }
  const melhor = (pegar: (c: Comanda) => string) => {
    const vezes = new Map<string, number>();
    for (const c of boas) {
      const v = pegar(c);
      if (v) vezes.set(v, (vezes.get(v) || 0) + 1);
    }
    return [...vezes.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] || '';
  };
  return {linhas: [textoDaComanda({endereco, bairro: melhor(c => c.bairro), referencia: melhor(c => c.referencia)})], avisos, achou: true};
}

// Duas comandas na mesma foto: pelas passadas não dá para saber qual endereço é de qual.
const maisDeUmaComanda = (t: string) =>
  t.split('\n').map(l => semSujeiraNaFrente(limparRuido(l))).filter(l => LINHA_DO_PEDIDO.test(l)).length > 1
  || t.split('\n').filter(l => CNPJ.test(l)).length > 1;

export function lerComanda(textos: string[], corrigir: (linhas: string[]) => string[] = x => x): LeituraDaComanda {
  if (textos.some(maisDeUmaComanda)) return {linhas: [], avisos: ['A foto tem mais de uma comanda. Fotografe uma de cada vez.'], achou: true};
  const r = juntarComandas(textos.map(t => partesDaComanda(t, true)), corrigir);
  if (!r.achou) r.avisos.push('Não achei o endereço na comanda. Fotografe de novo, mais perto e sem sombra.');
  return r;
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

// Coluna estreita parte o CEP em duas linhas: "Área Rural de São Cristóvão, CEP" e "49109899".
function juntarCepQuebrado(linhas: string[]): string[] {
  const saida: string[] = [];
  for (const l of linhas) {
    const anterior = saida[saida.length - 1];
    if (anterior && /\bcep\s*:?\s*$/i.test(anterior) && /^\d{5}-?\d{0,3}\b/.test(l)) {
      saida[saida.length - 1] = anterior + ' ' + l;
      continue;
    }
    saida.push(l);
  }
  return saida;
}

export function extrairEnderecos(bruto: string): string[] {
  const daLista = enderecosDaLista(bruto);
  if (daLista.length) return daLista;
  const daComanda = enderecoDaComanda(bruto);
  if (daComanda.length) return daComanda;
  const linhas = juntarCepQuebrado(bruto.split('\n').map(l => soFaixa(l) ? FAIXA : limparRuido(l)).filter(Boolean));
  const out: Aberto[] = [];
  let numeroSolto: string | null = null, aberto: Aberto | null = null, semDono = false;
  for (const l of linhas) {
    // O número solto antes da faixa é o fim do cartão de cima, cortado pela borda do quadro: um
    // "306" da porta de lá virou o número de parada da rua de baixo (07/10).
    if (l === FAIXA) {
      if (aberto) aberto.inteiro = true;
      aberto = null;
      numeroSolto = null;
      semDono = true;
      continue;
    }
    const {ml, texto} = analisarLinha(l);
    const complementoDoAnterior = aberto && !TEM_CEP.test(aberto.texto) && /\d/.test(aberto.texto) && RUA_COMPLEMENTO.test(texto + ' ');
    if (RUA.test(texto + ' ') && !complementoDoAnterior) {
      aberto = {ml: ml || numeroSolto, texto};
      out.push(aberto);
      numeroSolto = null;
      semDono = false;
      continue;
    }
    // Depois da faixa, até aparecer a rua, o que vier é de um cartão cuja rua não foi lida: as
    // unidades e a etiqueta dele não são da parada de cima.
    const ultimo = semDono ? undefined : out[out.length - 1];
    // Sujeira curta no meio de um endereço que já tem número não fecha ele: o selo de
    // "verificado" sai como "2" ou "[2" numa linha só dele, entre a rua e o bairro, e encerrar a
    // parada ali levava o CEP embora. Fora daí vale a regra velha — uma linha curta com número
    // ainda pode ser o número da parada no app, que abre a próxima.
    const curta = l.replace(/[^a-zà-ÿ]/gi, '').length <= 2 && (l.match(/\d/g) || []).length <= 2;
    if (curta && aberto && /\d/.test(aberto.texto)) continue;
    if (!/\d/.test(l) && l.replace(/[^a-zà-ÿ]/gi, '').length <= 2) continue;
    // A etiqueta do pacote ("#AZ-24...", "EB-40") traz o número da parada, e é mais fácil de ler
    // que o escudo colorido: o leitor tira "67" do escudo da 57 em cinco quadros seguidos (07/10).
    // O prefixo muda de rota para rota, de uma ou duas letras ("V-11"). Número com letra no meio
    // ("AZ-2A4") não vale.
    const etiqueta = l.match(/(\S*?)[A-Z]{1,2}\s*-\s*(\d{1,3})([.\s]\d)?(?=[.\s]|$)/);
    // "##AZ-25.1" é pacote dividido: os dois # saem "HH", "4H" ou "AH", e sem o ponto (ou o
    // espaço que o leitor põe no lugar dele) o número vira "251" ou "91", que é outra parada.
    // Sem o ponto, fica sem número (07/10 e 26/09).
    const daEtiqueta = !etiqueta ? null
      : (etiqueta[1].match(/[H4A#]/g) || []).length < 2 || etiqueta[3] ? '#' + etiqueta[2] : null;
    if (ultimo && /hor[aá]rio\s+comercial/i.test(l)) { ultimo.comercial = true; aberto = null; continue; }
    const mu = l.match(/entrega\s+(\d+)\s+unidade/i);
    if (ultimo && mu) { ultimo.unidades = +mu[1]; if (daEtiqueta) ultimo.ml = daEtiqueta; aberto = null; continue; }
    if (ultimo && etiqueta && /^.{0,5}[A-Z]{1,2}\s*-/.test(l)) { if (daEtiqueta) ultimo.ml = daEtiqueta; aberto = null; continue; }
    if (aberto && !/\d/.test(aberto.texto) && /^\d{1,5}\b/.test(l)) { aberto.texto += ' ' + l; continue; }
    // O resto do nome tem palavra. Os ícones da barra de baixo do app ("O 8 O =") passavam como
    // resto do nome com número, e o cartão cortado pela borda virava "Avenida Tal 8 O" (07/10).
    if (aberto && !/\d/.test(aberto.texto) && !COMPLEMENTO.test(l) && /[a-zà-ÿ]{3}/i.test(l) && (RESTO_DA_RUA.test(l) || CONTINUA_O_NOME.test(l))) { aberto.texto += ' ' + l; continue; }
    if (aberto && !TEM_CEP.test(aberto.texto) && (COMPLEMENTO.test(l) || TEM_CEP.test(l) || complementoDoAnterior)) { aberto.texto = aberto.texto.replace(/[\s,]+$/, '') + ', ' + l.replace(/[\s,]+$/, ''); continue; }
    aberto = null;
    const mn = l.match(/^[#(]?(\d{1,3})(?:[).:\]\-]|\s|$)/);
    numeroSolto = mn && !TEM_CEP.test(l) && !/^\d{1,2}:\d{2}/.test(l) ? mn[1] : null;
  }
  for (const e of out) e.texto = portaLegivel(e.texto);
  return out
    // Sem número e sem CEP normalmente é sobra de leitura. Mas "S/N" é endereço de verdade — o
    // Mercado Livre manda assim — e sumir com a parada é pior que mostrá-la só com a rua: some
    // da tela e ninguém procura o que não sabe que existe. Pelo mesmo motivo fica o cartão
    // inteiro que só tem a rua: o Meli manda assim, e uma rua de nome comprido sem número sumiu
    // de uma gravação (07/10). O cortado pela borda acaba na barra de baixo, não na faixa do
    // cartão seguinte, e continua de fora.
    .filter(e => (/\s\d{1,5}[a-z]?\b/i.test(e.texto) || TEM_CEP.test(e.texto) || SEM_NUMERO.test(e.texto)
      || (e.inteiro && palavrasRua(e.texto).length >= 3)) && pareceEndereco(e.texto))
    .map(e => (e.ml ? e.ml + ' ' : '') + e.texto.replace(/\s[Oo0](?=\s)/g, '') + (e.unidades ? ` · ${e.unidades} unid` : '') + (e.comercial ? ' · comercial' : ''));
}

// Na linha da rua do Meli a porta vem por último. Duas leituras a tiravam de lá (11/10): o zero da
// frente lido como letra ("Itajaí O5"), e a rua que acaba em número ("Rua Projetada 3 262"), em que
// o 3 do nome ficava sendo a porta e as duas portas da Projetada 3 viravam uma parada só. A vírgula
// separa a porta do nome; só depois da palavra que costuma levar número, para "Avenida Tal 1500
// 302" (porta e apartamento) continuar como está.
function portaLegivel(texto: string): string {
  return texto
    .replace(/^([^,]*[a-zà-ÿ]{3,}\s+[^,\s]*[a-zà-ÿ]{3,}\s+)[Oo](\d{1,4})(?=\s*(?:,|$))/i, (_, antes: string, n: string) => antes + '0' + n)
    .replace(/^([^,]*\b(?:projetada|rua|travessa|avenida|alameda|quadra|beco|via)\s+\d{1,3})\s+(\d{1,5}[a-z]?)(?=\s*(?:,|$))/i, '$1, $2');
}

// Tira do fim do nome da rua a letra solta que sobrou onde o número estava tapado. Só quando
// ainda resta nome depois dela: "Rua A" é uma rua de verdade, "Rua dos Ipês O" não é.
function semLetraTapada(rua: string): string {
  const p = palavrasRua(rua);
  return (p.length > 1 && /^[o0]$/i.test(p[p.length - 1]) ? p.slice(0, -1) : p).join(' ');
}

export function juntarQuadros(quadros: string[][]): string[] {
  const separadas = vistasJuntas(quadros);
  const vezes = vezesNumaLeitura(quadros);
  const vistos = new Map<string, {e: string; n: number; ks: string[]}>();
  for (const q of quadros) {
    for (const e of new Set(q)) {
      const k = chaveDaLeitura(e), v = vistos.get(k);
      if (!v) vistos.set(k, {e, n: 1, ks: [k]});
      else { v.n++; v.e = melhorLeitura(v.e, e); }
    }
  }
  const itens = [...vistos.values()].map(v => ({...v, d: decompor(analisarLinha(v.e).texto)}));
  const sn = (x: typeof itens[number]) => !x.d.numero && SEM_NUMERO.test(analisarLinha(x.e).texto);
  const complementoDe = (x: typeof itens[number]) => complementoNormal(x.d.resto);
  const restantes = itens.filter(x => !itens.some(y => y !== x && (
    // "37" que na verdade era "37A": o número saiu cortado num quadro e inteiro em outro
    (!!x.d.numero && !!y.d.numero && y.n >= x.n && y.d.numero.length > x.d.numero.length
      && y.d.numero.startsWith(x.d.numero) && normal(y.d.rua) === normal(x.d.rua))
    // O botão flutuante do mapa fica em cima do número da porta e sobra uma letra solta. Num
    // quadro seguinte, com a lista rolada, o mesmo endereço aparece inteiro — e virava uma
    // segunda parada, no mesmo lugar, que o motorista ia tentar entregar.
    || (!x.d.numero && !!y.d.numero && !SEM_NUMERO.test(x.e) && !!x.d.cep && x.d.cep === y.d.cep
      && semLetraTapada(x.d.rua) === semLetraTapada(y.d.rua))
    // O cartão cortado pela borda do quadro dá só "Rua Tal 680"; no quadro seguinte ele aparece
    // inteiro, com o condomínio e o CEP. É a mesma porta, e a versão pelada virava uma parada a
    // mais, sem posição. Duas entregas de verdade na mesma porta vêm com os dois cartões
    // completos — e, se vierem iguais, já viram uma só lá em cima, pela chave.
    || (!!x.d.numero && x.d.numero === y.d.numero && !x.d.cep && !!y.d.cep && !x.d.resto.length
      && semLetraTapada(x.d.rua) === semLetraTapada(y.d.rua))
    // Só a rua, de um cartão que o Meli manda sem número: se a mesma rua aparece com número em
    // outro quadro, era esse cartão com o número escondido, não outra parada.
    || (!x.d.numero && !x.d.cep && !SEM_NUMERO.test(x.e) && !!y.d.numero && mesmaRua(x.d.rua, y.d.rua) && mesmaRua(y.d.rua, x.d.rua))
    // O cartão SN cortado pela borda: sem CEP, com o começo do complemento do inteiro ("Rua Tal SN,
    // Condomínio Tal" e, no quadro seguinte, "..., torre 1 apt 104, CEP ..."). Sem complemento
    // nenhum é o cartão fechado, que pode ser outra entrega, e fica.
    || (sn(x) && sn(y) && !x.d.cep && !!y.d.cep && y.n >= x.n && !!complementoDe(x) && complementoDe(y).startsWith(complementoDe(x))
      && !separadas(x.ks, y.ks) && mesmaRua(x.d.rua, y.d.rua) && mesmaRua(y.d.rua, x.d.rua))
  )));
  // A mesma porta lida de dois jeitos em quadros diferentes ("Fulano Andrade 50" e "Fulano de
  // Andrade 50", "Côrtes 100" e "cones É 100") virava duas paradas (07/10). A
  // regra é a que já junta as duas leituras de um quadro, com a mesma unidade e sem CEP
  // contrário. Fica a que mais quadros leram.
  const juntas: typeof restantes = [];
  for (const x of restantes) {
    // SN conta como porta (a Quirino SN de 14/10 saía em três linhas). Mas duas entregas SN da mesma
    // rua podem ser dois lugares: só com o mesmo complemento, ou um começo do outro.
    const portaIgual = (y: typeof x) => sn(x) && sn(y)
      ? complementoDe(x) === complementoDe(y) || (!!complementoDe(x) && !!complementoDe(y) && (complementoDe(x).startsWith(complementoDe(y)) || complementoDe(y).startsWith(complementoDe(x))))
      : !!x.d.numero && y.d.numero === x.d.numero;
    const par = juntas.find(y => portaIgual(y) && !separadas(x.ks, y.ks)
      && letraDaPorta(analisarLinha(x.e).texto, x.d.numero) === letraDaPorta(analisarLinha(y.e).texto, y.d.numero)
      && (!x.d.cep || !y.d.cep || x.d.cep === y.d.cep) && complementoChave(x.d.resto) === complementoChave(y.d.resto)
      && mesmaRua(x.d.rua, y.d.rua) && mesmaRua(y.d.rua, x.d.rua));
    if (!par) { juntas.push(x); continue; }
    // a etiqueta é a da leitura que fica, e a da outra só quando esta não tem: com a #36 e a #30 da
    // mesma parada, a que mais quadros leram
    const fica = x.n > par.n || (x.n === par.n && maisLimpa(x.e, par.e));
    const certo = (fica ? [x.e, par.e] : [par.e, x.e]).map(e => e.match(NUMERO_CERTO)?.[0]).find(Boolean);
    const ks = [...par.ks, ...x.ks];
    if (fica) Object.assign(par, x);
    par.ks = ks;
    if (certo && !par.e.startsWith(certo + ' ')) par.e = certo + ' ' + par.e.replace(/^#?\d{1,3}\s+/, '');
  }
  const saida = juntas.flatMap(x => cartoes(x.e, x.ks, vezes));
  // Número de parada repetido não é número de parada: no app do Meli ele é único. Quando o mesmo
  // sai em duas paradas diferentes, foi o leitor errando o crachá — e esse número vira o rótulo
  // do cartão e entra na ordenação da rota. Sem ele, a parada fica com a posição na leitura, que
  // é a ordem da lista do Meli e não depende de ler escudo colorido nenhum.
  // O da etiqueta fica quando é o único certo com aquele número: o escudo que o leitor errou é
  // que perde o número, não a parada que tinha a etiqueta. Na saída, o "#" sai.
  const quantas = new Map<string, number>(), certas = new Map<string, number>();
  for (const e of saida) {
    const m = analisarLinha(e).ml;
    if (!m) continue;
    quantas.set(m, (quantas.get(m) || 0) + 1);
    if (NUMERO_CERTO.test(e)) certas.set(m, (certas.get(m) || 0) + 1);
  }
  // Número de três dígitos sem nenhum vizinho até a metade dele não é desta lista: a etiqueta
  // "##AZ-25.1" de pacote dividido sai "254" sem o ponto, numa rota que vai até 69 (07/10).
  const numeros = [...quantas.keys()].map(Number);
  const foraDaLista = (m: string) => +m >= 100 && !numeros.some(x => x !== +m && x * 2 >= +m);
  return saida.map(e => {
    const m = analisarLinha(e).ml;
    const fica = !m || (!foraDaLista(m) && (quantas.get(m) === 1 || (NUMERO_CERTO.test(e) && certas.get(m) === 1)));
    return (fica ? e : e.replace(/^#?\d{1,3}\s+/, '')).replace(/^#(?=\d)/, '');
  });
}

// "#24 Rua Tal": o número da parada veio da etiqueta, não do escudo. Entre duas leituras da mesma
// parada fica o texto mais comprido e, se uma delas tem, o número da etiqueta.
const NUMERO_CERTO = /^#\d{1,3}(?=\s)/;
const etiquetaDe = (e: string) => e.match(NUMERO_CERTO)?.[0] || '';
// Duas linhas da mesma porta que a mesma leitura viu, cada uma no seu cartão, são duas paradas: a 48
// e a 49 da gravação de 11/10 (condomínio e 9 unidades, bairro e 1 unidade) viravam uma, com o texto
// de uma e a etiqueta da outra. Nas 472 leituras gravadas (seis vídeos, dois prints), sempre que a
// mesma leitura trouxe duas linhas da mesma porta eram dois cartões. Vindas de leituras diferentes,
// a diferença sozinha não separa: no print de 07/10 o 6 lido como 0 fazia da mesma parada a #36 e a
// #30, e a junção segue pelos critérios de sempre. A chave leva a etiqueta para isso.
// Entre os quadros, cada quadro já juntou as suas leituras: duas linhas da mesma porta que sobraram
// no mesmo quadro foram vistas juntas numa leitura. Por isso o nome torto é corrigido antes de
// juntar o quadro (servicos/arquivos.ts), senão as duas leituras do mesmo cartão sobravam separadas.
const chaveDaLeitura = (e: string) => chaveEndereco(e) + etiquetaDe(e);
function vistasJuntas(leituras: string[][]): (a: string[], b: string[]) => boolean {
  const pares = new Set<string>();
  for (const l of leituras) {
    const ks = [...new Set(l.map(chaveDaLeitura))];
    for (const a of ks) for (const b of ks) if (a !== b) pares.add(a + '\n' + b);
  }
  return (a, b) => a.some(x => b.some(y => pares.has(x + '\n' + y)));
}
// O botão azul do mapa por cima do fim da linha deixa sujeira na rua: "Hermes Fontes Õ 2022",
// "Dias da costo (E) 430" (14/10). No quadro seguinte a mesma linha sai limpa, e no empate ficava a
// mais comprida, que é a suja. Conta o que na rua e na porta não é nome nem número: símbolo solto,
// parêntese, letra sozinha. Medido em 14/10 nas sete gravações: as duas certas e "2082(3)" virando
// "2082", sem nenhuma perda.
function sujeira(e: string): number {
  return analisarLinha(e).texto.split(',')[0].split(/\s+/).slice(1)
    .filter(w => /[()[\]{}|&]/.test(w) || /^[^\p{L}\d]+$/u.test(w) || /^\p{L}$/u.test(w)).length;
}
// a e b são a mesma parada: fica a mais limpa e, igualando, a mais comprida
const maisLimpa = (a: string, b: string) => sujeira(a) !== sujeira(b) ? sujeira(a) < sujeira(b) : a.length > b.length;

function melhorLeitura(a: string, b: string): string {
  const texto = maisLimpa(b, a) ? b : a;
  const certo = [a, b].map(e => e.match(NUMERO_CERTO)?.[0]).find(Boolean);
  return certo && !texto.startsWith(certo + ' ') ? certo + ' ' + texto.replace(/^#?\d{1,3}\s+/, '') : texto;
}

const quantasDiferentes = (lista: string[]) => new Set(lista.map(chaveEndereco)).size;

// `leituras`: as linhas de cada leitura principal da imagem, à parte. Uma lista só conta como uma
// leitura para separar, mas não para multiplicar cartões: não se sabe de que leitura veio cada linha.
export function juntarLeituras(leituras: string[] | string[][], apoio: string[] = []): string[] {
  const aParte = !!leituras.length && Array.isArray(leituras[0]);
  let porLeitura = (aParte ? leituras : [leituras]) as string[][];
  if (apoio.length) porLeitura = porLeitura.map(l => l.map(e => portaDoApoio(e, apoio, l)));
  let principais = porLeitura.flat();
  let contar = aParte;
  if (quantasDiferentes(principais) <= 1 && quantasDiferentes(apoio) > quantasDiferentes(principais)) {
    [principais, porLeitura, apoio] = [apoio, [apoio], principais];
    contar = true;
  }
  const separadas = vistasJuntas(porLeitura);
  const vezes = contar ? vezesNumaLeitura(porLeitura) : null;
  const porChave = new Map<string, string>();
  for (const e of principais) {
    const k = chaveDaLeitura(e), antigo = porChave.get(k);
    porChave.set(k, antigo ? melhorLeitura(antigo, e) : e);
  }
  const decomposto = ([k, e]: [string, string]) => {
    const t = analisarLinha(e).texto, d = decompor(t);
    return {e, d, letra: letraDaPorta(t, d.numero), ks: [k]};
  };
  // O selo grudado no número sai pela posição das letras (logica/ocr.ts). A regra que tirava o
  // algarismo a mais comparando com outra leitura ("21518" e "2151") saiu em 12/10: nas seis
  // gravações e nos 73 quadros lidos como print ela só disparou entre dois cartões da mesma rua, e
  // nunca acertou. Trocava o 19 da parada 10 pelo "1" da parada 9 (11/10).
  const itens = [...porChave].map(decomposto);
  const juntas: typeof itens = [];
  for (const x of itens) {
    // 85 e 85B são portas diferentes, mesmo com a rua e os dígitos iguais
    const parecida = juntas.find(y => y.d.numero && x.d.numero === y.d.numero && !separadas(x.ks, y.ks) && x.letra === y.letra && mesmaRua(x.d.rua, y.d.rua) && mesmaRua(y.d.rua, x.d.rua));
    if (!parecida) { juntas.push(x); continue; }
    parecida.e = melhorLeitura(parecida.e, x.e);
    parecida.ks.push(...x.ks);
  }
  return juntas.flatMap(x => vezes ? cartoes(x.e, x.ks, vezes) : [x.e]);
}

// "Avenida Tal 3/53 8": a porta saiu torta na leitura principal (o 7 lido como barra, o selo como 8)
// e a de apoio, da imagem sem tratar, leu "3753" no mesmo cartão (14/10). A do apoio entra só se é o
// mesmo cartão: a mesma rua, a porta a um algarismo da torta (o símbolo vale por qualquer
// algarismo), o mesmo complemento quando os dois têm, e uma candidata só. Pedir só a mesma rua, o CEP
// e o complemento pegava a linha de outro cartão: o 370 virou 300 e sumiu (medido em 14/10 nas sete
// gravações; assim, 2 acertos e nenhum erro). E não pode ser uma linha que a própria leitura já
// trouxe, que aí é outro cartão e viraria uma parada a mais.
function portaDoApoio(e: string, apoio: string[], leitura: string[]): string {
  const a = nomeEPorta(e);
  if (!a || PORTA_LIMPA.test(a.porta)) return e;
  const d = decompor(analisarLinha(e).texto), ra = complementoNormal(d.resto);
  const candidatas = apoio.filter(o => {
    const b = nomeEPorta(o);
    if (!b || !PORTA_LIMPA.test(b.porta) || !mesmaRua(a.nome, b.nome) || !mesmaRua(b.nome, a.nome)) return false;
    const db = decompor(analisarLinha(o).texto), rb = complementoNormal(db.resto);
    return (!d.cep || !db.cep || d.cep === db.cep) && (!ra || !rb || ra === rb) && distanciaCuringa(a.porta, b.porta) <= 1;
  });
  if (candidatas.length !== 1 || leitura.some(x => chaveEndereco(x) === chaveEndereco(candidatas[0]))) return e;
  const numero = numeroDaLinha(e), nova = candidatas[0];
  return numero && !numeroDaLinha(nova) ? numero + ' ' + nova : nova;
}

const PORTA_LIMPA = /^\d{1,5}[a-z]?$/i;
// a rua e o que vem depois dela, até a vírgula: "Avenida Tal" e "3/53 8"
function nomeEPorta(e: string): {nome: string; porta: string} | null {
  const seg = analisarLinha(e).texto.split(',')[0].trim().split(/\s+/);
  const i = seg.findIndex((w, k) => k > 0 && /\d/.test(w));
  return i < 1 ? null : {nome: seg.slice(0, i).join(' '), porta: seg.slice(i).join(' ')};
}
const complementoNormal = (resto: string[]) => normal(resto.join(' ')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Letras a trocar, pôr ou tirar da porta torta até a limpa, com o símbolo da torta valendo por
// qualquer algarismo: "3/53 8" fica a 1 de "3753".
function distanciaCuringa(torta: string, limpa: string): number {
  const a = torta.replace(/\s+/g, ''), b = limpa;
  const v = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = v[0];
    v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const acima = v[j], igual = a[i - 1] === b[j - 1] || (!/\d/.test(a[i - 1]) && /\d/.test(b[j - 1]));
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, diagonal + (igual ? 0 : 1));
      diagonal = acima;
    }
  }
  return v[b.length];
}

// Cartões iguais, sem nada que os diferencie, são entregas diferentes na mesma porta: a Augusto
// Franco 2000 de 07/10 tinha cinco cartões e saíam dois, a 3500 tinha dois e saía um (medido em
// 14/10 nas sete gravações, conferido nos quadros, sem nenhuma parada a mais). Quantas vezes UMA
// leitura viu a linha é quantas paradas ela é; leituras e quadros diferentes não se somam, ficam
// com a que viu mais, senão a mesma parada vista em dois quadros viraria duas.
interface Vezes {n: number; linhas: string[]; numeros: Map<string, string>}
// o número da parada na frente da linha, como veio ("43" do crachá, "#43" da etiqueta)
const numeroDaLinha = (e: string) => (analisarLinha(e).ml && e.match(/^#?\d{1,3}(?=\s)/)?.[0]) || '';
const comNumero = (linhas: string[]) => linhas.filter(numeroDaLinha).length;
function vezesNumaLeitura(leituras: string[][]): Map<string, Vezes> {
  const vezes = new Map<string, Vezes>();
  for (const l of leituras) {
    const desta = new Map<string, string[]>();
    for (const e of l) { const k = chaveDaLeitura(e); desta.set(k, [...(desta.get(k) || []), e]); }
    for (const [k, linhas] of desta) {
      const v = vezes.get(k), numeros = new Map(v?.numeros);
      for (const x of linhas) { const n = numeroDaLinha(x); if (n && !numeros.has(n.replace('#', ''))) numeros.set(n.replace('#', ''), n); }
      // no empate, a leitura que trouxe mais números de parada
      if (!v || linhas.length > v.n || (linhas.length === v.n && comNumero(linhas) > comNumero(v.linhas))) vezes.set(k, {n: linhas.length, linhas, numeros});
      else v.numeros = numeros;
    }
  }
  return vezes;
}

// Os cartões saem como a leitura que mais os viu trouxe, cada um com o seu texto, as suas unidades
// e o seu número: copiar a melhor leitura em todos punha o condomínio e a unidade de um cartão nos
// outros. Com um cartão só, fica a melhor leitura de todas, como sempre.
function cartoes(e: string, ks: string[], vezes: Map<string, Vezes>): string[] {
  const grupo = ks.map(k => vezes.get(k)).filter((v): v is Vezes => !!v);
  const mais = grupo.reduce<Vezes | undefined>((a, b) => a && (a.n > b.n || (a.n === b.n && comNumero(a.linhas) >= comNumero(b.linhas))) ? a : b, undefined);
  if (!mais || mais.n <= 1) return [e];
  const linhas = [...mais.linhas];
  // Os números de parada lidos em outras leituras vão para os cartões que ficaram sem, só quando
  // esses são idênticos (aí não importa qual leva qual) e não sobram números a mais que cartões.
  const usados = new Set(linhas.map(x => numeroDaLinha(x).replace('#', '')).filter(Boolean));
  const outros = new Map<string, string>();
  for (const [d, n] of [...grupo.flatMap(v => [...v.numeros]), ...(numeroDaLinha(e) ? [[numeroDaLinha(e).replace('#', ''), numeroDaLinha(e)] as [string, string]] : [])]) {
    if (!usados.has(d) && !outros.has(d)) outros.set(d, n);
  }
  const vazios = linhas.flatMap((x, i) => numeroDaLinha(x) ? [] : [i]);
  if (outros.size && outros.size <= vazios.length && new Set(vazios.map(i => linhas[i])).size === 1) {
    [...outros].sort((a, b) => +a[0] - +b[0]).forEach(([, n], j) => { linhas[vazios[j]] = n + ' ' + linhas[vazios[j]]; });
  }
  return linhas;
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

// Quantas letras trocar, pôr ou tirar para ir de um texto ao outro.
export function distanciaDeEdicao(a: string, b: string): number {
  const v = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = v[0];
    v[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const acima = v[j];
      v[j] = Math.min(v[j] + 1, v[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = acima;
    }
  }
  return v[b.length];
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

// Até 29/09 os dois \b estavam gravados como o caractere de controle backspace, e a expressão não
// casava com nada: "próximo ao cond. X" contava como morar no X, e juntava pinos de ruas diferentes.
// "Prox." abreviado e "ao lado" entraram em 11/10, com o "Prox. ao cond. Vista Aruana" real.
const SO_REFERENCIA = /\b(perto|prox\w*|frente|defronte|atras|referencia|ref|depois|antes|fica|ao lado)\b/;

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

// O nome junta a porta só com o mesmo número. Com número igual e rua diferente é o prédio de
// esquina, ou a rua que mudou de nome (São Lourenço 3548, Champs Elysees 1500). Com número
// diferente é outra casa do mesmo conjunto ou loteamento, que aqui tem ruas e é quase um bairro:
// o Pedro arrumou a Francisco Rollemberg 22 e o mapa a desenhou de volta na Gerson Martins 284,
// as duas "Conjunto Orlando Dantas" a 106 m (29/09). Medido nas planilhas de 20 a 29/09: das 60
// junções pelo nome, as de número igual eram todas o mesmo prédio.
export function mesmaPortaPeloNome(a: {texto: string; bairro?: string}, b: {texto: string; bairro?: string}): boolean {
  const na = decompor(analisarLinha(a.texto).texto).numero, nb = decompor(analisarLinha(b.texto).texto).numero;
  if (na && nb && na.replace(/\D/g, '') !== nb.replace(/\D/g, '')) return false;
  return mesmoLugarNomeado(a, b);
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

// Rua e número, sem CEP e sem bairro. É a única parte do endereço que não muda entre um dia e
// outro: o CEP aparece ou não conforme o cartão do Meli esteja aberto, e o bairro vem de quem
// respondeu a busca — a mesma avenida voltou "Grageru" num número e "Jardins" no outro.
export function chavePorta(texto: string): string | null {
  const d = decompor(analisarLinha(texto).texto);
  const rua = ruaCompleta(d.rua);
  if (!d.numero || !rua) return null;
  // Nome que não identifica rua nenhuma não serve de identidade: "Rua A" e "sem denominação" se
  // repetem por conjuntos vizinhos, e a trava de distância não separa dois conjuntos a 1 km.
  // Medido no censo de Aracaju: a mesma rua e número em dois lugares de 200 m a 3 km são 1,09%
  // das portas, e tirando os nomes genéricos caem para 0,55%.
  if (ruaGenerica(d.rua)) return null;
  return rua + '|' + d.numero;
}

export const ruaGenerica = (rua: string): boolean => palavrasRua(rua).join('').length <= 2 || /denomina[cç]/i.test(rua);

// Condomínio de casas ou de blocos: a entrega é na portaria, e o censo põe o número lá dentro
// (Cond. São Lourenço, a 150 m da portaria). Prédio sozinho ("Ed.", "apto") fica de fora: o censo
// marca o prédio.
const CONDOMINIO = /\b(cond\w*|cdm|cd|resid\w*|bloc\w*|blc|bl|bl\d+\w*|torre|casa \d+|cs \d+)\b/;
// "Perto do condomínio X" é referência: a casa fica fora dele, e a porta do censo vale (Pedro, 11/10:
// a 6 m de onde ele entregou, com a planilha a 742 m). Corta cada trecho na referência, e não o
// joga fora inteiro: "Cond. Solar casa 18 perto da padaria" continua sendo condomínio.
const semReferencia = (trecho: string) => { const n = normal(trecho), m = SO_REFERENCIA.exec(n); return m ? n.slice(0, m.index) : n; };
export const emCondominio = (texto: string): boolean =>
  CONDOMINIO.test(decompor(analisarLinha(texto).texto).resto.map(semReferencia).join(' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' '));

// A rua de verdade às vezes vem no complemento, com o nome de um conjunto no lugar dela
// ("Recanto das Mangueiras, 24, Rua M atrás do mercado"). Corta na referência, como o condomínio,
// e recusa o que é frase e não nome: "Rua da Assembleia", "rua sem saída", "rua próx. ao X". Recusa
// também "Rua das Flores", que é nome: perder um caso custa menos que procurar a rua errada.
const RUA_NO_COMPLEMENTO = /^(rua|r|travessa|tv|avenida|av|alameda|al)\s+([a-z0-9][a-z0-9 ]*)$/;
const TIPO_POR_EXTENSO: Record<string, string> = {r: 'rua', tv: 'travessa', av: 'avenida', al: 'alameda'};
const NAO_E_NOME = new Set(['da', 'do', 'das', 'dos', 'de', 'sem', 'que', 'e', 'em', 'no', 'na', 'a', 'o', 'ao', 'principal']);
export function ruaDoComplemento(texto: string): string | null {
  for (const s of decompor(analisarLinha(texto).texto).resto) {
    const m = RUA_NO_COMPLEMENTO.exec(semReferencia(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim());
    if (!m || NAO_E_NOME.has(m[2].split(' ')[0])) continue;
    return `${TIPO_POR_EXTENSO[m[1]] || m[1]} ${m[2]}`;
  }
  return null;
}

export function chaveLugar(texto: string, bairro: string | undefined, cidade: string): string | null {
  const d = decompor(analisarLinha(texto).texto);
  // "S/N" é endereço de verdade, e justamente o que fonte nenhuma acha — é o que mais precisa
  // ficar guardado depois que alguém marca. Antes ele caía fora por não ter número, e a marcação
  // valia só para o dia. Chave nova onde não havia nenhuma: não mexe no que já está gravado.
  const numero = d.numero || (SEM_NUMERO.test(texto) ? 'sn' : null);
  if (!numero) return null;
  if (d.cep && !/000$/.test(d.cep)) return d.cep + '|' + numero;
  // sem número, o "S/N" fica grudado no nome da rua: tira, senão "SN" e "S/N" viram chaves
  // diferentes para a mesma porta
  // do "Sem N" o decompor já tirou o "N", como um "nº" sem número, e sobra o "Sem"
  const rua = ruaCompleta(numero === 'sn' ? d.rua.replace(SEM_NUMERO, ' ').replace(/\s+sem$/i, '') : d.rua), b = normal(bairro || '');
  if (!rua || !b) return null;
  return ['r', rua, numero, b, normal(cidade)].join('|');
}

// O que faltou para a chave, para o aviso não culpar o CEP de quem tem CEP (Pedro, 19/10).
export const faltaNaChave = (texto: string): string =>
  decompor(analisarLinha(texto).texto).numero || SEM_NUMERO.test(texto) ? 'Sem CEP nem bairro' : 'Sem número da porta';

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

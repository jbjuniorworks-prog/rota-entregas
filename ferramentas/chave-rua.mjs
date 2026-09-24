const TIPOS = /^(rua|r|avenida|av|travessa|tv|trav|praca|pc|alameda|al|rodovia|rod|estrada|est|via|largo|beco|viela|passagem)\b\.?\s*/;
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'doutor', 'dr', 'professor', 'prof', 'presidente', 'pres', 'governador', 'gov', 'ministro', 'min', 'senador', 'sen', 'deputado', 'dep', 'coronel', 'cel', 'general', 'gen', 'padre', 'pe', 'sao', 'santa', 'santo']);

export const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const ABREVIACOES = {poe: 'poeta', eng: 'engenheiro', des: 'desembargador', alm: 'almirante', mal: 'marechal', cap: 'capitao', ten: 'tenente', sgt: 'sargento', mons: 'monsenhor', pref: 'prefeito', jorn: 'jornalista', ver: 'vereador'};

// Mesma regra do app (logica/texto.ts): "Rua 25" e "Rua Vinte e Cinco" são a mesma rua, e a
// chave gravada no banco tem de bater com a que o celular calcula. O teste
// app/src/logica/texto.test.ts compara as duas implementações nome por nome.
const UNIDADES = {um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9};
const ATE_DEZENOVE = {dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezassete: 17, dezoito: 18, dezenove: 19, dezanove: 19};
const DEZENAS = {vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90};

const CENTENAS = {cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900};

// Lê um número inteiro escrito por extenso a partir de `i` ("cento e vinte e cinco", "vinte
// cinco", "dez"), e diz quantas palavras ele ocupou. O "e" no meio é opcional porque nem sempre
// chega aqui: quem monta a chave da rua já tirou as palavras vazias antes.
function numeroEm(p, i) {
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

export function comNumeros(palavras) {
  const saida = [];
  for (let i = 0; i < palavras.length; i++) {
    const lido = numeroEm(palavras, i);
    if (!lido) { saida.push(palavras[i]); continue; }
    saida.push(String(lido.valor));
    i += lido.comeu - 1;
  }
  return saida;
}

export const chaveRua = nome => comNumeros(normal(nome).replace(TIPOS, '').replace(/[^a-z0-9 ]/g, ' ').split(' ')
  .map(w => ABREVIACOES[w] || w).filter(w => w && !VAZIAS.has(w))).join(' ');

const TIPO_VIA = {r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa', al: 'alameda', alameda: 'alameda', pc: 'praca', praca: 'praca', rod: 'rodovia', rodovia: 'rodovia', est: 'estrada', estrada: 'estrada', viela: 'viela', beco: 'beco', largo: 'largo', passagem: 'passagem', conjunto: 'conjunto', loteamento: 'loteamento'};

export const tipoDaRua = nome => TIPO_VIA[normal(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ')[0]] || '';

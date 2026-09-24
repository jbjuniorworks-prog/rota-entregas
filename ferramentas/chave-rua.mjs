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

export function comNumeros(palavras) {
  const saida = [];
  for (let i = 0; i < palavras.length; i++) {
    const w = palavras[i];
    if (DEZENAS[w] != null) {
      const comE = palavras[i + 1] === 'e';
      const proxima = comE ? palavras[i + 2] : palavras[i + 1];
      if (proxima && UNIDADES[proxima] != null) {
        saida.push(String(DEZENAS[w] + UNIDADES[proxima]));
        i += comE ? 2 : 1;
        continue;
      }
      saida.push(String(DEZENAS[w]));
      continue;
    }
    const n = UNIDADES[w] ?? ATE_DEZENOVE[w];
    saida.push(n != null ? String(n) : w);
  }
  return saida;
}

export const chaveRua = nome => comNumeros(normal(nome).replace(TIPOS, '').replace(/[^a-z0-9 ]/g, ' ').split(' ')
  .map(w => ABREVIACOES[w] || w).filter(w => w && !VAZIAS.has(w))).join(' ');

const TIPO_VIA = {r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa', al: 'alameda', alameda: 'alameda', pc: 'praca', praca: 'praca', rod: 'rodovia', rodovia: 'rodovia', est: 'estrada', estrada: 'estrada', viela: 'viela', beco: 'beco', largo: 'largo', passagem: 'passagem', conjunto: 'conjunto', loteamento: 'loteamento'};

export const tipoDaRua = nome => TIPO_VIA[normal(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ')[0]] || '';

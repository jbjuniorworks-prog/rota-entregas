const TIPOS = /^(rua|r|avenida|av|travessa|tv|trav|praca|pc|alameda|al|rodovia|rod|estrada|est|via|largo|beco|viela|passagem)\b\.?\s*/;
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'doutor', 'dr', 'professor', 'prof', 'presidente', 'pres', 'governador', 'gov', 'ministro', 'min', 'senador', 'sen', 'deputado', 'dep', 'coronel', 'cel', 'general', 'gen', 'padre', 'pe', 'sao', 'santa', 'santo']);

export const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const ABREVIACOES = {poe: 'poeta', eng: 'engenheiro', des: 'desembargador', alm: 'almirante', mal: 'marechal', cap: 'capitao', ten: 'tenente', sgt: 'sargento', mons: 'monsenhor', pref: 'prefeito', jorn: 'jornalista', ver: 'vereador'};

export const chaveRua = nome => normal(nome).replace(TIPOS, '').replace(/[^a-z0-9 ]/g, ' ').split(' ')
  .map(w => ABREVIACOES[w] || w).filter(w => w && !VAZIAS.has(w)).join(' ');

const TIPO_VIA = {r: 'rua', rua: 'rua', av: 'avenida', avenida: 'avenida', tv: 'travessa', trav: 'travessa', travessa: 'travessa', al: 'alameda', alameda: 'alameda', pc: 'praca', praca: 'praca', rod: 'rodovia', rodovia: 'rodovia', est: 'estrada', estrada: 'estrada', viela: 'viela', beco: 'beco', largo: 'largo', passagem: 'passagem', conjunto: 'conjunto', loteamento: 'loteamento'};

export const tipoDaRua = nome => TIPO_VIA[normal(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ')[0]] || '';

import {textoDaLinha} from './planilha';
import {chaveDaParada, chaveLugar, complementoDaParada} from './texto';

// "Separar como outra porta" (dono, 21/11): dois clientes no mesmo número (Chico Mendes 100 e 15,
// Matapoã 42) dividiam a porta, e a entrega certa de um virava disputa com a do outro. O Admin
// grava a marca do motorista como a porta do complemento daquele pacote. A porta geral não muda, e
// ao ler a planilha o celular já procura a do complemento antes (`separarAsConhecidas`).
//
// A chave tem de ser a mesma que o celular monta: o texto do pacote é remontado como a planilha o
// monta (`textoDaLinha`), e a chave sai de `chaveDaParada`, como a de uma parada separada.
export interface PacoteDaMarca {
  endereco: string;
  bairro: string | null;
  cep: string | null;
}

export type OutraPorta =
  | {chave: string; complemento: string}
  | {motivo: 'sem complemento' | 'outro endereço' | 'várias entradas'; complementos: string[]};

// `pacotes`: os do motorista naquele número, na rota da marca. A marca não diz de qual pacote ela
// é: com entradas diferentes ali (ou uma sem complemento), escolher uma seria chute.
export function outraPorta(pacotes: PacoteDaMarca[], chaveGeral: string, cidade: string): OutraPorta {
  const lidos = pacotes.map(p => {
    const bairro = p.bairro || '';
    const texto = textoDaLinha(p.endereco, bairro, (p.cep || '').replace(/\D/g, ''));
    const geral = chaveLugar(texto, bairro, cidade);
    const chave = chaveDaParada({texto, bairro, separada: true}, cidade);
    return {geral, chave: chave === geral ? null : chave, complemento: complementoDaParada(texto, bairro, cidade)};
  });
  const complementos = [...new Set(lidos.map(l => l.complemento).filter(Boolean))];
  if (!lidos.length || lidos.some(l => l.geral !== chaveGeral)) return {motivo: 'outro endereço', complementos};
  const chaves = new Set(lidos.map(l => l.chave));
  if (chaves.size > 1) return {motivo: 'várias entradas', complementos};
  const [chave] = chaves;
  if (!chave) return {motivo: 'sem complemento', complementos};
  return {chave, complemento: lidos[0].complemento};
}

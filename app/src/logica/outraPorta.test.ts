import {itensDaPlanilha} from './planilha';
import {outraPorta} from './outraPorta';
import {chaveDaParada, chaveLugar} from './texto';

const CAB = ['Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code'];
const CIDADE = 'Aracaju';
// a linha como a planilha traz, e o pacote como ele fica gravado na nuvem depois de lido
function lida(endereco: string, bairro: string, cep: string) {
  const [it] = itensDaPlanilha([CAB, [1, 1, 'BRTESTE0001', endereco, bairro, 'Cidade Teste', cep]], 'teste.xlsx');
  return {it, pacote: {endereco: it.endereco, bairro: it.bairro || null, cep: it.cep}, geral: chaveLugar(it.texto, it.bairro, CIDADE)!};
}
// a chave que o celular procura ao ler a planilha (separarAsConhecidas)
const doCelular = (it: {texto: string; bairro: string}) => chaveDaParada({texto: it.texto, bairro: it.bairro, separada: true}, CIDADE);
const BAR = ['Avenida Teste Costa, 42, Bar Teste ou depósito', 'Bairro Março Teste', '49098-232'] as const;

describe('separar como outra porta', () => {
  it('com CEP genérico, a porta do Admin é a chave que o celular procura ao ler a planilha', () => {
    const {it, pacote, geral} = lida('Rodovia Teste Ecológica, 67, Por trás do condomínio Portal Teste', 'Bairro Areia Teste', '49099-000');
    expect(outraPorta([pacote], geral, CIDADE)).toMatchObject({chave: doCelular(it)});
  });

  it('com CEP próprio, a porta do Admin é a chave que o celular procura ao ler a planilha', () => {
    const {it, pacote, geral} = lida(...BAR);
    expect(outraPorta([pacote], geral, CIDADE)).toMatchObject({chave: doCelular(it)});
  });

  it('a porta separada fica ligada ao endereço-base, e diz qual é a entrada', () => {
    const {pacote, geral} = lida(...BAR);
    expect(outraPorta([pacote], geral, CIDADE)).toEqual({chave: `${geral}|bar teste ou deposito`, complemento: 'bar teste ou deposito'});
  });

  it('dois pacotes da mesma entrada separam juntos', () => {
    const {pacote, geral} = lida(...BAR);
    expect(outraPorta([pacote, {...pacote}], geral, CIDADE)).toMatchObject({complemento: 'bar teste ou deposito'});
  });

  it('sem complemento não há outra porta', () => {
    const {pacote, geral} = lida('Avenida Teste Costa, 42', 'Bairro Março Teste', '49098-232');
    expect(outraPorta([pacote], geral, CIDADE)).toEqual({motivo: 'sem complemento', complementos: []});
  });

  // a marca não diz de qual pacote ela é: com duas entradas no número, escolher uma seria chute
  it('com pacotes de entradas diferentes no número, não escolhe nenhuma', () => {
    const bar = lida(...BAR), casa = lida('Avenida Teste Costa, 42, Casa dos fundos', 'Bairro Março Teste', '49098-232');
    expect(outraPorta([bar.pacote, casa.pacote], bar.geral, CIDADE)).toMatchObject({motivo: 'várias entradas'});
  });

  it('com um pacote sem complemento junto de um com, não escolhe nenhuma', () => {
    const bar = lida(...BAR), sem = lida('Avenida Teste Costa, 42', 'Bairro Março Teste', '49098-232');
    expect(outraPorta([sem.pacote, bar.pacote], bar.geral, CIDADE)).toMatchObject({motivo: 'várias entradas'});
  });

  // o pacote achado é de outro endereço-base (a chave da disputa não é a dele): não separa no chute
  it('com o pacote de outro endereço-base, não separa', () => {
    const {pacote} = lida(...BAR);
    expect(outraPorta([pacote], '49098232|44', CIDADE)).toMatchObject({motivo: 'outro endereço'});
  });
});

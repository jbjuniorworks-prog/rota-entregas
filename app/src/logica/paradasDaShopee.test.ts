import {describe, expect, it} from 'vitest';
import {estadoVazio} from './guarda';
import {adicionarDaPlanilha} from './importar';
import {numerosDaShopee, paradasDaShopee, textoDasParadas} from './paradasDaShopee';
import {itensDaPlanilha} from './planilha';
import type {Estado} from './tipos';

// Planilhas no molde da Shopee, com endereços e códigos inventados, pela mesma importação do app.
// "-" na sequência e na parada é o pacote que veio sem número.
const CAB = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];
const linha = (at: string, seq: number | '-', stop: number | '-', numero: number) =>
  [at, seq, stop, `BR${at}${seq}${numero}`, `Rua Inventada, ${numero}`, 'Bairro Alfa', 'Aracaju', '49000-000', -10.95 + numero / 1e4, -37.05];
const carregar = (e: Estado, linhas: unknown[][]) => {
  adicionarDaPlanilha(e, itensDaPlanilha([CAB, ...linhas], 'rota.xlsx'), () => false);
  return e;
};
const doEndereco = (e: Estado, numero: number) => e.paradas.find(p => p.texto.includes(`Inventada, ${numero}`))!;

describe('as paradas da Shopee no topo', () => {
  it('conta as paradas da planilha, não as do celular', () => {
    const e = carregar(estadoVazio(), [
      linha('AT1', 1, 1, 10), linha('AT1', 2, 1, 20),
      linha('AT1', 3, 2, 30), linha('AT1', 4, 2, 40), linha('AT1', 5, 2, 50),
      linha('AT1', 6, 3, 60),
    ]);
    expect(e.paradas).toHaveLength(6);
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 3});
  });

  it('a parada só está feita quando todos os endereços dela foram entregues', () => {
    const e = carregar(estadoVazio(), [linha('AT1', 1, 1, 10), linha('AT1', 2, 1, 20), linha('AT1', 3, 2, 30)]);
    doEndereco(e, 10).entregue = true;
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 2});
    doEndereco(e, 20).entregue = true;
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 1, total: 2});
  });

  it('o mesmo endereço em duas paradas da Shopee: entregue, faz as duas', () => {
    const e = carregar(estadoVazio(), [linha('AT1', 1, 4, 10), linha('AT1', 2, 5, 10), linha('AT1', 3, 6, 30)]);
    // os dois pacotes juntos numa parada só do celular
    expect(e.paradas).toHaveLength(2);
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 3});
    doEndereco(e, 10).entregue = true;
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 2, total: 3});
  });

  it('a P9 de uma planilha não é a P9 da outra', () => {
    const e = carregar(estadoVazio(), [linha('AT1', 1, 9, 10)]);
    carregar(e, [linha('AT2', 1, 9, 90)]);
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 2});
    doEndereco(e, 10).entregue = true;
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 1, total: 2});
  });

  it('o pacote sem número de parada não é parada', () => {
    const e = carregar(estadoVazio(), [linha('AT1', 1, 1, 10), linha('AT1', '-', '-', 70)]);
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 1});
    doEndereco(e, 10).entregue = true;
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 1, total: 1});
  });

  it('sem planilha da Shopee, nenhuma parada', () => {
    const e = carregar(estadoVazio(), [linha('AT1', '-', '-', 70), linha('AT1', '-', '-', 80)]);
    expect(paradasDaShopee(e.paradas)).toEqual({feitas: 0, total: 0});
  });
});

// Luan, 18/11: a P6 e a P40 da Shopee, mesma porta com o complemento escrito de dois jeitos, viram
// uma parada do celular. O pino, o cartão e a busca só falavam da P6.
describe('os números da Shopee de uma parada juntada', () => {
  const linhaDe = (seq: number, stop: number, complemento: string) =>
    ['AT1', seq, stop, `BRAT1${seq}`, `Rua Inventada, 106, ${complemento}`, 'Bairro Alfa', 'Aracaju', '49000-084', -10.95, -37.05];

  it('a parada juntada tem os números de todos os pacotes, em ordem de número', () => {
    const e = carregar(estadoVazio(), [linhaDe(6, 6, 'R: lado do Restaurante Teste'), linhaDe(60, 40, 'Próximo rest. Restaurante Teste')]);
    expect(e.paradas).toHaveLength(1);
    expect(numerosDaShopee(e.paradas)).toEqual(['6', '40']);
  });

  it('em ordem de número, não de texto: a 9 vem antes da 10', () => {
    expect(numerosDaShopee([{stop: '10', itens: undefined}, {stop: '9', itens: undefined}])).toEqual(['9', '10']);
  });

  it('o texto do cartão diz uma, duas ou mais paradas', () => {
    expect(textoDasParadas([])).toBe('');
    expect(textoDasParadas(['6'])).toBe('parada 6');
    expect(textoDasParadas(['6', '40'])).toBe('paradas 6 e 40');
    expect(textoDasParadas(['6', '12', '40'])).toBe('paradas 6, 12 e 40');
  });
});

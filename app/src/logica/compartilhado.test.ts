import {describe, expect, it} from 'vitest';
import {estadoVazio} from './guarda';
import {adicionarLinhas, entregaDoEndereco} from './importar';
import {ehLocalizacao} from './texto';
import type {Parada} from './tipos';

// 12/11, dono, sobre o Luan: "só queria arrumar uma localização", e apareceu outra parada. O Compartilhar do Maps
// manda junto o nome que o Google dá ao ponto, e esse nome é um endereço. Com a rota aberta, o que
// tem link do mapa é localização, para arrumar uma entrega. Endereços e links inventados.
const CURTO = 'https://maps.app.goo.gl/AbCdEf123Inventado';

describe('o que chegou pelo Compartilhar é localização ou lista', () => {
  it('o nome do lugar com o link, sem endereço, é localização (como já era)', () => {
    expect(ehLocalizacao('LOJA INVENTADA\n' + CURTO)).toBe(true);
    expect(ehLocalizacao('https://maps.google.com/maps?q=-10.9436218%2C-37.0527487&z=17&hl=pt-BR')).toBe(true);
  });

  it('o endereço que o Google dá ao ponto, com o link do mapa, é localização', () => {
    expect(ehLocalizacao('Av. Inventada, 149 - Bairro Inventado, Cidade Teste - SE, 49000-999\n' + CURTO)).toBe(true);
    expect(ehLocalizacao('Rua Inventada, 10 - Bairro Inventado, Cidade Teste - SE https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x0:0x1')).toBe(true);
    expect(ehLocalizacao('Rua Inventada, 10 - Bairro Inventado\n-10.943622, -37.052749')).toBe(true);
  });

  it('endereços sem link do mapa continuam sendo lista', () => {
    expect(ehLocalizacao('Rua Inventada, 10, Bairro Inventado')).toBe(false);
    expect(ehLocalizacao('Rua Inventada, 10 - Bairro Inventado\nhttps://rastreio.inventado.com/BR000')).toBe(false);
  });

  it('dois endereços ou mais são lista, mesmo com link', () => {
    expect(ehLocalizacao('Rua Inventada, 10\nRua Outra Inventada, 20\n' + CURTO)).toBe(false);
  });

  it('texto sem endereço e sem link não é nada', () => {
    expect(ehLocalizacao('ok, chego em 5 min')).toBe(false);
  });
});

const parada = (texto: string, entregue = false) => ({id: texto, texto, entregue}) as Parada;

describe('a entrega que o endereço da localização nomeia', () => {
  const paradas = [parada('Rua das Flores, 900, Bairro Norte, 49000-106'), parada('Avenida Central, 1500, Bairro Norte'), parada('Rua dos Ipês, 300, Bloco A ap 101', true)];

  it('mesma rua e mesmo número, com bairro e CEP diferentes do título do Google', () => {
    expect(entregaDoEndereco(paradas, 'Rua das Flores, 900 - Bairro Inventado, Cidade Teste - SE, 49000-999')?.id).toBe(paradas[0].id);
  });

  it('outro número da mesma rua não é a entrega', () => {
    expect(entregaDoEndereco(paradas, 'Rua das Flores, 149 - Bairro Norte')).toBeUndefined();
  });

  // a rua inteira tem a mesma chave sem número: não é uma porta
  it('sem número não nomeia entrega nenhuma, nem a sem número da mesma rua', () => {
    expect(entregaDoEndereco([...paradas, parada('Rua das Flores, Bairro Norte')], 'Rua das Flores, S/N - Bairro Norte, Cidade Teste - SE')).toBeUndefined();
  });

  it('a já entregue não conta', () => {
    expect(entregaDoEndereco(paradas, 'Rua dos Ipês, 300 - Bairro Norte')).toBeUndefined();
  });
});

// 12/11, teste do dono sem rota aberta: o nome do lugar e o link curto viraram duas paradas "Não
// encontrado", e o link apareceu depois como "entrega" na faixa do "É de qual entrega?". Link nenhum
// é endereço (14/10): a linha que só tem link não vira parada, venha de onde vier.
describe('linha que só tem link não vira parada', () => {
  it('o link curto, com ou sem o https, e o longo do Google ficam de fora; o endereço entra', () => {
    const e = estadoVazio();
    expect(adicionarLinhas(e, ['https://maps.app.goo.gl/AbCdEf123Inventado', 'maps.app.goo.gl/AbCdEf123Inventado',
      'https://www.google.com/maps/place/Lugar+Inventado/data=!4m2!3m1!1s0x0:0x1', 'Rua Inventada, 10'])).toMatchObject({novas: 1});
    expect(e.paradas.map(p => p.texto)).toEqual(['Rua Inventada, 10']);
  });
});

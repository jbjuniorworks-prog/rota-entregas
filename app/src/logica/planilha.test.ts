import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {ehArquivoZip, itensDaPlanilha, pareceNomeDePlanilha} from './planilha';

function linhasDe(caminho: string): unknown[][] {
  const wb = XLSX.read(readFileSync(caminho), {type: 'buffer'});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true});
}

describe('planilha da Shopee', () => {
  const itens = itensDaPlanilha(linhasDe('testes/planilhas/rota-a.txt'), 'rota-a.txt');

  it('lê todas as linhas com rastreio, rota, ordem e a linha inteira', () => {
    expect(itens).toHaveLength(12);
    expect(itens[1]).toMatchObject({tn: 'BRTESTA0002', at: 'ATTESTE0001', ml: '1', parada: '1', bairro: 'Bairro Norte', cep: '49000101', lat: -10.961, lng: -37.045, arquivo: 'rota-a.txt'});
    expect(Object.keys(itens[0].linha)).toHaveLength(10);
  });
  it('acrescenta bairro e CEP ao texto e deixa sem ordem quem vem com "-"', () => {
    expect(itens[0].texto).toBe('Rua das Acácias, 10, Bairro Norte, CEP 49000-101');
    expect(itens[0].ml).toBeNull();
  });
  it('recusa planilha sem coluna de endereço', () => {
    expect(() => itensDaPlanilha([['nome', 'telefone'], ['a', '1']], 'x.xlsx')).toThrow('coluna de endereço');
  });
  it('reconhece planilha pelo conteúdo, mesmo com extensão .txt', () => {
    expect(ehArquivoZip(new Uint8Array(readFileSync('testes/planilhas/rota-a.txt')).slice(0, 4))).toBe(true);
    expect(pareceNomeDePlanilha('rota.txt', 'text/plain')).toBeNull();
    expect(pareceNomeDePlanilha('rota.xlsx', '')).toBe(true);
    expect(pareceNomeDePlanilha('print.png', 'image/png')).toBe(false);
  });
  it('coordenada inválida vira "sem posição"', () => {
    const [it0] = itensDaPlanilha([['Endereço', 'Latitude', 'Longitude'], ['Rua A, 1', 'abc', '0']], 'x');
    expect([it0.lat, it0.lng]).toEqual([null, null]);
  });
});

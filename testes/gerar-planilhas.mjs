import {mkdirSync, writeFileSync} from 'node:fs';
import XLSX from 'xlsx';

const CAB = ['AT ID', 'Sequence', 'Stop', 'SPX TN', 'Destination Address', 'Bairro', 'City', 'Zipcode/Postal code', 'Latitude', 'Longitude'];

const rotaA = [
  ['-', '-', 'Rua das Acácias, 10', 'Bairro Norte', '49000-101', -10.9600, -37.0450],
  [1, 1, 'Rua das Acácias, 120', 'Bairro Norte', '49000-101', -10.9610, -37.0450],
  [2, 2, 'Rua dos Ipês, 300, Bloco A ap 101', 'Bairro Norte', '49000-102', -10.9620, -37.0440],
  [3, 2, 'Rua dos Ipês, 300, Bloco A ap 101', 'Bairro Norte', '49000-102', -10.9620, -37.0440],
  [4, 2, 'Rua dos Ipês, 300, Bloco A ap 101', 'Bairro Norte', '49000-102', -10.9620, -37.0440],
  [5, 2, 'Rua dos Ipês, 300, Bloco B ap 202', 'Bairro Norte', '49000-102', -10.9620, -37.0440],
  [6, 3, 'Avenida Central, 1500', 'Bairro Norte', '49000-103', -10.9650, -37.0420],
  [7, 4, 'Travessa Um, 45', 'Bairro Norte', '49000-104', -10.9580, -37.0480],
  ['-', '-', 'Rua das Palmeiras, 77', 'Bairro Norte', '49000-105', -10.9570, -37.0430],
  [8, 5, 'Rua D, 49, Perto do Vale', 'Bairro Sul', '49000-199', -10.8500, -37.0745],
  [9, 6, 'Rua das Flores, 900', 'Bairro Norte', '49000-106', -10.9630, -37.0470],
  [10, 7, 'Alameda dos Coqueiros, 12', 'Bairro Norte', '49000-107', -10.9660, -37.0460],
];

const rotaB = [
  [1, 1, 'Rua Oeste, 1', 'Bairro Linha', '49000-201', -10.9300, -37.1000],
  [2, 2, 'Rua Oeste, 150', 'Bairro Linha', '49000-202', -10.9313, -37.1000],
  [3, 3, 'Rua Centro Oeste, 2', 'Bairro Linha', '49000-203', -10.9300, -37.0900],
  [4, 4, 'Rua Centro, 3', 'Bairro Linha', '49000-204', -10.9300, -37.0800],
  [5, 5, 'Rua Centro Leste, 4', 'Bairro Linha', '49000-205', -10.9300, -37.0700],
  [6, 6, 'Rua Leste, 5', 'Bairro Linha', '49000-206', -10.9300, -37.0600],
];

function planilha(at, prefixo, linhas) {
  const dados = linhas.map(([seq, stop, end, bairro, cep, lat, lng], i) =>
    [at, seq, stop, `${prefixo}${String(i + 1).padStart(4, '0')}`, end, bairro, 'Cidade Teste', cep, lat, lng]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB, ...dados]), 'Sheet1');
  return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
}

const pasta = new URL('./planilhas/', import.meta.url);
mkdirSync(pasta, {recursive: true});
writeFileSync(new URL('rota-a.txt', pasta), planilha('ATTESTE0001', 'BRTESTA', rotaA));
writeFileSync(new URL('rota-b.xlsx', pasta), planilha('ATTESTE0002', 'BRTESTB', rotaB));
console.log('planilhas geradas em testes/planilhas/');

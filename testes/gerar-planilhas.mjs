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

const rotaC = [
  ['-', '-', 'Rua do Robalo Errado, 301, em frente a casa 318', 'Bairro Robalo Teste', '49004-360', -10.92654, -37.073115],
  [1, 1, 'Rua Norte do Robalo, 331', 'Bairro Robalo Teste', '49004-390', -11.03983, -37.09465],
  [2, 2, 'Rua Norte do Robalo, 455', 'Bairro Robalo Teste', '49004-390', -11.039879, -37.095616],
  [3, 3, 'Rua Sul do Robalo, 90', 'Bairro Robalo Teste', '49004-391', -11.041394, -37.094318],
  [4, 4, 'Rua dos Náufragos Teste, 10', 'Bairro Vizinho Teste', '49005-323', -11.0368361, -37.0999195],
  [5, 5, 'Rua Arredondada, 280', 'Bairro Vizinho Teste', '49005-324', -11.04, -37.10, 'crua'],
  [6, 6, 'Avenida Numeração, 7', 'Bairro Vizinho Teste', '49005-325', -11.0380, -37.0990],
  [7, 7, 'Avenida Numeração, 1928', 'Bairro Vizinho Teste', '49005-325', -11.03801, -37.09901],
  [8, 8, 'Rua Trocada, 15', 'Bairro Vizinho Teste', '49005-326', -37.0985, -11.0375],
  [9, 9, 'Rua Fora do Mapa, 20', 'Bairro Vizinho Teste', '49005-327', 48.85, 2.35],
];

// Rota grande e sintética, para a tela poder ser testada com o tamanho que ela tem de verdade:
// numa lista de 80 cartões, ruído que se repete por cartão é o que torna a tela cansativa.
const RUAS = ['Rua das Acácias', 'Avenida Central', 'Travessa Um', 'Rua das Palmeiras', 'Rua das Flores',
  'Alameda dos Coqueiros', 'Rua dos Ipês', 'Avenida do Norte', 'Rua do Meio', 'Travessa Dois'];
const rotaD = Array.from({length: 80}, (_, i) => {
  const rua = RUAS[i % RUAS.length];
  const numero = 10 + (i % 8) * 25;                    // repete a porta de vez em quando, para juntar pacotes
  const bairro = i % 3 === 0 ? 'Bairro Norte' : i % 3 === 1 ? 'Bairro Sul' : 'Bairro Leste';
  return [i + 1, Math.floor(i / 2) + 1, `${rua}, ${numero}`, bairro,
    `49000-${String(100 + (i % 9)).padStart(3, '0')}`,
    -10.95 - (i % 20) * 0.0012, -37.05 - Math.floor(i / 20) * 0.0015];
});

function planilha(at, prefixo, linhas) {
  const realista = (v, crua) => crua ? v : +(v - 0.0000013).toFixed(7);
  const dados = linhas.map(([seq, stop, end, bairro, cep, lat, lng, crua], i) =>
    [at, seq, stop, `${prefixo}${String(i + 1).padStart(4, '0')}`, end, bairro, 'Cidade Teste', cep, realista(lat, crua), realista(lng, crua)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CAB, ...dados]), 'Sheet1');
  return XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'});
}

const pasta = new URL('./planilhas/', import.meta.url);
mkdirSync(pasta, {recursive: true});
writeFileSync(new URL('rota-a.txt', pasta), planilha('ATTESTE0001', 'BRTESTA', rotaA));
writeFileSync(new URL('rota-b.xlsx', pasta), planilha('ATTESTE0002', 'BRTESTB', rotaB));
writeFileSync(new URL('rota-c.xlsx', pasta), planilha('ATTESTE0003', 'BRTESTC', rotaC));
writeFileSync(new URL('rota-d.xlsx', pasta), planilha('ATTESTE0004', 'BRTESTD', rotaD));
console.log('planilhas geradas em testes/planilhas/');

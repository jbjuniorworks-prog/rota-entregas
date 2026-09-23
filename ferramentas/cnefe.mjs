// Gera o arquivo de endereços de uma cidade a partir do CNEFE do IBGE (Censo 2022):
// CEP, número e coordenada de cada porta — dado público, aberto, que fica dentro do app.
// Uso: npm run cnefe                                  (Aracaju)
//      npm run cnefe -- "Nossa Senhora do Socorro"    (qualquer município de Sergipe)
//      npm run cnefe -- arquivo.csv Aracaju           (usa um CSV já baixado)
import {createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos'
  + '/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/28_SE/';

// o mesmo apelido que o app usa para achar o arquivo da cidade
export const apelido = nome => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/[,\/]/)[0].trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// o mesmo que o normal() do app: é assim que o cabeçalho guarda o nome da cidade
const normalizado = nome => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/[,\/]/)[0].replace(/\s+/g, ' ').trim();

// o IBGE nomeia o arquivo pelo código do município; pergunta a ele em vez de chutar
async function arquivoDoIbge(cidade) {
  const r = await fetch(PASTA);
  if (!r.ok) throw new Error('o IBGE respondeu ' + r.status + ' ao listar os municípios');
  const nomes = [...(await r.text()).matchAll(/(\d{7}_[A-Z0-9_ÀÁÂÃÇÉÊÍÓÔÕÚ]+)\.zip/g)].map(m => m[1]);
  const querida = apelido(cidade);
  const achado = nomes.find(n => apelido(n.slice(8)) === querida);
  if (!achado) throw new Error(`não achei "${cidade}" em Sergipe. Tem ${nomes.length} municípios lá.`);
  return {url: PASTA + achado + '.zip', codigo: achado.slice(0, 7)};
}
// O vizinho só serve de resposta até esta distância em números: medido com 108 mil casos,
// até 20 o erro fica em 19 m na mediana; de 21 a 50 pula para 42 m e piora rápido.
export const SALTO_MAXIMO = 20;

function descompactar(zip) {
  const fim = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fim < 0) throw new Error('não parece um zip');
  const central = zip.readUInt32LE(fim + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50) throw new Error('diretório do zip ilegível');
  const metodo = zip.readUInt16LE(central + 10);
  const comprimido = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const dados = zip.subarray(inicio, inicio + comprimido);
  return metodo === 0 ? dados : inflateRawSync(dados);
}

async function pegarCsv(cidade) {
  const {url, codigo} = await arquivoDoIbge(cidade);
  process.stdout.write(`Baixando o CNEFE de ${cidade} (IBGE ${codigo})... `);
  const r = await fetch(url);
  if (!r.ok) throw new Error('o IBGE respondeu ' + r.status);
  const zip = Buffer.from(await r.arrayBuffer());
  console.log((zip.length / 1048576).toFixed(1) + ' MB');
  return descompactar(zip).toString('utf8');
}

function varint(saida, v) {
  v = (v << 1) ^ (v >> 31);
  do {
    const b = v & 0x7f;
    v >>>= 7;
    saida.push(v ? b | 0x80 : b);
  } while (v);
}

export function montar(csv, cidade = 'Aracaju') {
  const linhas = csv.split(/\r?\n/);
  const col = linhas[0].split(';');
  const ix = n => {
    const i = col.indexOf(n);
    if (i < 0) throw new Error('o CNEFE mudou: falta a coluna ' + n);
    return i;
  };
  const iCep = ix('CEP'), iNum = ix('NUM_ENDERECO'), iLat = ix('LATITUDE'), iLng = ix('LONGITUDE');
  const iBairro = ix('DSC_LOCALIDADE'), iTipo = ix('NOM_TIPO_SEGLOGR');
  const iTitulo = ix('NOM_TITULO_SEGLOGR'), iRua = ix('NOM_SEGLOGR');
  const comp = [1, 2, 3, 4, 5].map(k => ix('NOM_COMP_ELEM' + k));

  const juntos = new Map();
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(';');
    if (c.length < 20) continue;
    const cep = c[iCep], numero = parseInt(c[iNum], 10), lat = +c[iLat], lng = +c[iLng];
    if (!/^\d{8}$/.test(cep) || !Number.isFinite(numero) || numero <= 0) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const chave = cep + '|' + numero;
    const g = juntos.get(chave) || juntos.set(chave, {
      lat: 0, lng: 0, vezes: 0, unidades: 0,
      bairro: c[iBairro] || '', rua: [c[iTipo], c[iTitulo], c[iRua]].filter(Boolean).join(' '),
    }).get(chave);
    g.lat += lat;
    g.lng += lng;
    g.vezes++;
    if (comp.some(k => c[k] === 'APARTAMENTO' || c[k] === 'BLOCO')) g.unidades++;
  }

  const regs = [...juntos].map(([chave, g]) => {
    const [cep, numero] = chave.split('|');
    return {
      cep: +cep, numero: +numero,
      lat: Math.round(g.lat / g.vezes * 1e6), lng: Math.round(g.lng / g.vezes * 1e6),
      bairro: g.bairro, rua: g.rua, predio: g.unidades >= 3,
    };
  }).sort((a, b) => a.cep - b.cep || a.numero - b.numero);
  if (!regs.length) throw new Error('nenhum endereço aproveitável no CSV');

  const bairros = [...new Set(regs.map(r => r.bairro))];
  const ruas = [...new Set(regs.map(r => r.rua))];
  const nB = new Map(bairros.map((b, i) => [b, i])), nR = new Map(ruas.map((r, i) => [r, i]));
  const corpo = [];
  let cep = 0, numero = 0, lat = 0, lng = 0;
  for (const r of regs) {
    const passo = r.cep - cep;
    varint(corpo, passo);
    varint(corpo, passo === 0 ? r.numero - numero : r.numero);
    varint(corpo, r.lat - lat);
    varint(corpo, r.lng - lng);
    varint(corpo, nB.get(r.bairro));
    varint(corpo, nR.get(r.rua));
    varint(corpo, r.predio ? 1 : 0);
    cep = r.cep; numero = r.numero; lat = r.lat; lng = r.lng;
  }
  const cabeca = JSON.stringify({
    v: 1, fonte: 'CNEFE/IBGE Censo 2022', cidade: normalizado(cidade),
    enderecos: regs.length, saltoMaximo: SALTO_MAXIMO, bairros, ruas,
  });
  return {
    arquivo: Buffer.concat([Buffer.from(cabeca + '\n', 'utf8'), Buffer.from(corpo)]),
    enderecos: regs.length, predios: regs.filter(r => r.predio).length,
    bairros: bairros.length, ruas: ruas.length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const local = args[0] && /\.csv$/i.test(args[0]) ? args.shift() : null;
  const cidade = args.join(' ').trim() || 'Aracaju';
  const csv = local ? readFileSync(local, 'utf8') : await pegarCsv(cidade);
  const {arquivo, enderecos, predios, bairros, ruas} = montar(csv, cidade);
  const destino = join(RAIZ, 'app', 'public', `${apelido(cidade)}-v1.bin`);
  mkdirSync(dirname(destino), {recursive: true});
  writeFileSync(destino, arquivo);
  console.log(`${enderecos} endereços (${predios} prédios), ${ruas} ruas, ${bairros} bairros`);
  console.log(`${(arquivo.length / 1024).toFixed(0)} KB em ${destino.replace(RAIZ, '.')}`);
}

// Gera o arquivo de endereços de Aracaju a partir do CNEFE do IBGE (Censo 2022).
// São 307 mil endereços com CEP, número e coordenada — dado público, aberto.
// Uso: npm run cnefe            (baixa do IBGE e gera app/public/aracaju-v1.bin)
//      npm run cnefe -- arquivo.csv   (usa um CSV já baixado)
import {createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'app', 'public', 'aracaju-v1.bin');
const FONTE = 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos'
  + '/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/28_SE/2800308_ARACAJU.zip';
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

async function pegarCsv(argumento) {
  if (argumento) return readFileSync(argumento, 'utf8');
  process.stdout.write('Baixando o CNEFE do IBGE... ');
  const r = await fetch(FONTE);
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

export function montar(csv) {
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
    v: 1, fonte: 'CNEFE/IBGE Censo 2022', cidade: 'aracaju',
    enderecos: regs.length, saltoMaximo: SALTO_MAXIMO, bairros, ruas,
  });
  return {
    arquivo: Buffer.concat([Buffer.from(cabeca + '\n', 'utf8'), Buffer.from(corpo)]),
    enderecos: regs.length, predios: regs.filter(r => r.predio).length,
    bairros: bairros.length, ruas: ruas.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const csv = await pegarCsv(process.argv[2]);
  const {arquivo, enderecos, predios, bairros, ruas} = montar(csv);
  mkdirSync(dirname(DESTINO), {recursive: true});
  writeFileSync(DESTINO, arquivo);
  console.log(`${enderecos} endereços (${predios} prédios), ${ruas} ruas, ${bairros} bairros`);
  console.log(`${(arquivo.length / 1024).toFixed(0)} KB em ${DESTINO.replace(RAIZ, '.')}`);
}

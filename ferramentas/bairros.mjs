// Os bairros desenhados (polígono) do GeoServer da prefeitura.
// Medido antes de embarcar no app, e não vale a pena lá: a âncora do censo já cai dentro do
// polígono nos 46 bairros, e exigir que a entrega esteja dentro rejeitaria 12% das boas —
// o campo "bairro" da planilha não é confiável a esse ponto. A trava por raio fica como está.
// Serve aqui, na hora de importar: é assim que a rua nova ganha o bairro a que pertence,
// porque o serviço de logradouros da prefeitura não traz esse campo.
// Uso: npm run bairros            (mostra um resumo)
import {pathToFileURL} from 'node:url';
import {apelido} from './cnefe.mjs';

// Só as prefeituras que publicam os bairros num serviço aberto. Cidade que não está aqui
// continua com o círculo do censo, que funciona em qualquer lugar.
const SERVICOS = {
  aracaju: {
    ows: 'https://geoserver.fazenda.aracaju.se.gov.br/ows',
    camada: 'Limites_Municipais:bairros_2023',
    campo: 'bairro',
    fonte: 'Prefeitura Municipal de Aracaju — bairros 2023 (BCR-2022)',
  },
};

const CASAS = 5; // ~1 metro, mais que suficiente para dizer de que lado da rua o bairro acaba

export function empacotar(geojson, campo, fonte, cidade) {
  const bairros = [];
  for (const f of geojson.features || []) {
    const nome = (f.properties || {})[campo];
    const g = f.geometry;
    if (!nome || !g) continue;
    const poligonos = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
    // só o anel de fora: buraco dentro de bairro não muda a resposta que a gente faz
    const aneis = poligonos.map(p => p[0]).filter(a => a && a.length >= 4);
    if (!aneis.length) continue;
    let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180;
    const limpos = aneis.map(a => a.map(([lng, lat]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      return [+lat.toFixed(CASAS), +lng.toFixed(CASAS)];
    }));
    bairros.push({
      nome,
      caixa: [minLat, minLng, maxLat, maxLng].map(v => +v.toFixed(CASAS)),
      aneis: limpos,
    });
  }
  bairros.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {v: 1, cidade, fonte, bairros};
}

export async function baixarBairros(cidade = 'Aracaju') {
  const chave = apelido(cidade);
  const s = SERVICOS[chave];
  if (!s) throw new Error(`não conheço serviço de bairros para "${cidade}". Tem para: ${Object.keys(SERVICOS).join(', ')}.`);
  const url = `${s.ows}?service=WFS&version=2.0.0&request=GetFeature`
    + `&typeNames=${encodeURIComponent(s.camada)}&outputFormat=application/json&srsName=EPSG:4326`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('o serviço de bairros respondeu ' + r.status);
  return empacotar(await r.json(), s.campo, s.fonte, chave);
}

const naCaixa = (b, p) => p.lat >= b.caixa[0] && p.lat <= b.caixa[2] && p.lng >= b.caixa[1] && p.lng <= b.caixa[3];

export function dentro(b, p) {
  if (!naCaixa(b, p)) return false;
  let sim = false;
  for (const anel of b.aneis) {
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const [lat1, lng1] = anel[i], [lat2, lng2] = anel[j];
      if ((lat1 > p.lat) !== (lat2 > p.lat)
        && p.lng < (lng2 - lng1) * (p.lat - lat1) / (lat2 - lat1) + lng1) sim = !sim;
    }
  }
  return sim;
}

export const bairroDoPonto = (bairros, p) => (bairros.find(b => dentro(b, p)) || {}).nome || null;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cidade = process.argv.slice(2).join(' ').trim() || 'Aracaju';
  process.stdout.write(`Baixando os bairros de ${cidade}... `);
  const pacote = await baixarBairros(cidade);
  const pontos = pacote.bairros.reduce((n, b) => n + b.aneis.reduce((m, a) => m + a.length, 0), 0);
  console.log(`${pacote.bairros.length} bairros, ${pontos} pontos`);
  console.log(pacote.bairros.map(b => b.nome).join(', '));
}

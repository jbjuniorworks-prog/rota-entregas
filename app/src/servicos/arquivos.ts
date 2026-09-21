import {ehArquivoZip, itensDaPlanilha, pareceNomeDePlanilha, type ItemPlanilha} from '../logica/planilha';
import {ehComanda, extrairEnderecos, juntarLeituras, juntarQuadros, melhorComanda} from '../logica/texto';
import {escolherQuadros} from '../logica/video';

type Arquivo = Blob & {name?: string};
type Aviso = (msg: string) => void;

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

export async function ehPlanilha(f: Arquivo): Promise<boolean> {
  const pelo = pareceNomeDePlanilha(f.name || '', f.type || '');
  if (pelo !== null) return pelo;
  return ehArquivoZip(new Uint8Array(await f.slice(0, 4).arrayBuffer()));
}

export async function separarPlanilhas(files: Arquivo[]) {
  const planilhas: Arquivo[] = [], outros: Arquivo[] = [];
  for (const f of files) (await ehPlanilha(f) ? planilhas : outros).push(f);
  return {planilhas, outros};
}

export async function lerPlanilhas(files: Arquivo[]): Promise<ItemPlanilha[]> {
  const XLSX = await import('xlsx');
  const itens: ItemPlanilha[] = [];
  for (const f of files) {
    const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), {type: 'array'});
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true});
    itens.push(...itensDaPlanilha(linhas, f.name || 'planilha'));
  }
  return itens;
}

function carregarScript(src: string, erro: string): Promise<void> {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => falha(new Error(erro));
    document.head.appendChild(s);
  });
}

export const ehVideo = (f: Arquivo) => (f.type || '').startsWith('video/') || /\.(mp4|webm|3gp|mkv|mov)$/i.test(f.name || '');

const PERFIL_LARGURA = 32, PERFIL_ALTURA = 240;

export async function quadrosDoVideo(f: Blob, aviso: Aviso, cada: (q: Blob, i: number, total: number) => Promise<void>): Promise<{rapido: boolean}> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  const url = URL.createObjectURL(f);
  try {
    v.src = url;
    await new Promise((ok, falha) => {
      v.onloadeddata = ok;
      v.onerror = () => falha(new Error('este celular não abre esse formato de vídeo. Tente gravar de novo ou mande prints'));
    });
    const ir = (t: number) => new Promise<void>(ok => { v.onseeked = () => ok(); v.currentTime = t; });
    const dur = Number.isFinite(v.duration) ? v.duration : 120;
    const pequeno = document.createElement('canvas');
    pequeno.width = PERFIL_LARGURA; pequeno.height = PERFIL_ALTURA;
    const cp = pequeno.getContext('2d', {willReadFrequently: true})!;
    const topo = Math.round(PERFIL_ALTURA * 0.1), base = Math.round(PERFIL_ALTURA * 0.86);
    const tempos: number[] = [], perfis: Float32Array[] = [];
    for (let t = 0; t < dur; t += 0.25) {
      await ir(t);
      if (v.currentTime + 0.01 < t && tempos.length) break;
      cp.drawImage(v, 0, 0, PERFIL_LARGURA, PERFIL_ALTURA);
      const d = cp.getImageData(0, topo, PERFIL_LARGURA, base - topo).data;
      const perfil = new Float32Array(base - topo);
      for (let y = 0; y < perfil.length; y++) {
        let soma = 0;
        for (let x = 2; x < PERFIL_LARGURA - 6; x++) {
          const k = (y * PERFIL_LARGURA + x) * 4;
          soma += 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2];
        }
        perfil[y] = soma / (PERFIL_LARGURA - 8);
      }
      tempos.push(t); perfis.push(perfil);
      aviso(`Olhando o vídeo… ${Math.min(99, Math.round(t / dur * 100))}%`);
    }
    const {indices, rapido} = escolherQuadros(perfis, 0.5);
    const grande = document.createElement('canvas');
    grande.width = v.videoWidth; grande.height = v.videoHeight;
    const cg = grande.getContext('2d')!;
    for (const [n, i] of indices.entries()) {
      await ir(tempos[i]);
      cg.drawImage(v, 0, 0);
      const quadro = await new Promise<Blob>((ok, falha) => grande.toBlob(b => b ? ok(b) : falha(new Error('quadro vazio')), 'image/png'));
      await cada(quadro, n + 1, indices.length);
    }
    grande.width = grande.height = 0;
    pequeno.width = pequeno.height = 0;
    return {rapido};
  } finally {
    v.src = '';
    v.load();
    URL.revokeObjectURL(url);
  }
}

function textoDaPagina(itens: any[]): string {
  const porLinha = new Map<number, {x: number; s: string}[]>();
  for (const it of itens) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 4);
    if (!porLinha.has(y)) porLinha.set(y, []);
    porLinha.get(y)!.push({x: it.transform[4], s: it.str});
  }
  return [...porLinha.entries()].sort((a, b) => b[0] - a[0])
    .map(([, its]) => its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim())
    .join('\n');
}

async function paginaComoImagem(pagina: any): Promise<Blob> {
  const viewport = pagina.getViewport({scale: 2});
  const cv = document.createElement('canvas');
  cv.width = viewport.width; cv.height = viewport.height;
  const cx = cv.getContext('2d')!;
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pagina.render({canvasContext: cx, viewport}).promise;
  return new Promise(r => cv.toBlob(b => r(b!), 'image/png'));
}

async function lerPdf(file: Arquivo, aviso: Aviso) {
  const w = window as any;
  if (!w.pdfjsLib) {
    const mod = await import(/* @vite-ignore */ PDFJS + 'pdf.min.mjs');
    mod.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    w.pdfjsLib = mod;
  }
  const doc = await w.pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
  const linhas: string[] = [], imagens: Blob[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    aviso(`Lendo o PDF… página ${n} de ${doc.numPages}`);
    const pagina = await doc.getPage(n);
    const texto = textoDaPagina((await pagina.getTextContent()).items);
    if (texto.replace(/\s/g, '').length > 20) linhas.push(...extrairEnderecos(texto));
    else imagens.push(await paginaComoImagem(pagina));
  }
  return {linhas, imagens};
}

async function prepararImagem(file: Blob, alvoLargura = 1700, contraste = true): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(3, Math.max(1, alvoLargura / bmp.width));
    const w = Math.round(bmp.width * escala), h = Math.round(bmp.height * escala);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', {willReadFrequently: true})!;
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const img = cx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = contraste ? (g <= 105 ? 0 : g >= 195 ? 255 : (g - 105) * 255 / 90) : g;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    cx.putImageData(img, 0, 0);
    const saida = await new Promise<Blob>(r => cv.toBlob(b => r(b || file), 'image/png'));
    cv.width = cv.height = 0;
    return saida;
  } catch {
    return file;
  }
}

interface Imagem {
  blob: Blob;
  doVideo: boolean;
}

async function abrirLeitor() {
  const w = window as any;
  if (!w.Tesseract) await carregarScript(TESSERACT, 'sem internet para o leitor');
  return w.Tesseract.createWorker('por');
}

async function lerUma(worker: any, {blob, doVideo}: Imagem, aviso: Aviso, rotulo: string): Promise<string[]> {
  aviso(`Lendo os endereços…${rotulo}`);
  const tratada = await prepararImagem(blob, doVideo ? 1000 : 1700);
  const tentativas = doVideo
    ? [{imagem: tratada, psm: '4'}, {imagem: blob, psm: '3'}]
    : [{imagem: tratada, psm: '4'}, {imagem: await prepararImagem(blob, 1700, false), psm: '6'}, {imagem: blob, psm: '3'}];
  const leituras: string[] = [], apoio: string[] = [], comandas: string[][] = [];
  for (const t of tentativas) {
    await worker.setParameters({tessedit_pageseg_mode: t.psm, preserve_interword_spaces: '1'});
    const {data} = await worker.recognize(t.imagem);
    const achados = extrairEnderecos(data.text);
    if (ehComanda(achados)) comandas.push(achados);
    else (t.imagem === blob ? apoio : leituras).push(...achados);
  }
  if (comandas.length) return melhorComanda([...comandas, leituras, apoio]);
  return juntarLeituras(leituras, apoio);
}

export async function lerArquivos(files: Arquivo[], aviso: Aviso): Promise<string[] & {avisos: string[]}> {
  const imagens: Imagem[] = [], grupos: string[][] = [], avisos: string[] = [];
  const videos: Arquivo[] = [];
  for (const f of files) {
    if ((f.type || '').includes('pdf') || /\.pdf$/i.test(f.name || '')) {
      const r = await lerPdf(f, aviso);
      grupos.push(r.linhas);
      imagens.push(...r.imagens.map(blob => ({blob, doVideo: false})));
    } else if ((f.type || '').startsWith('text/') || /\.txt$/i.test(f.name || '')) {
      grupos.push(extrairEnderecos(await f.text()));
    } else if (ehVideo(f)) {
      videos.push(f);
    } else imagens.push({blob: f, doVideo: false});
  }
  if (imagens.length || videos.length) {
    let worker = await abrirLeitor(), lidas = 0;
    const descansar = async () => {
      if (++lidas % 8) return;
      await worker.terminate();
      worker = await abrirLeitor();
    };
    try {
      for (let i = 0; i < imagens.length; i++) {
        grupos.push(await lerUma(worker, imagens[i], aviso, imagens.length > 1 ? ` (${i + 1} de ${imagens.length})` : ''));
        await descansar();
      }
      for (const f of videos) {
        const {rapido} = await quadrosDoVideo(f, aviso, async (quadro, n, total) => {
          grupos.push(await lerUma(worker, {blob: quadro, doVideo: true}, aviso, ` (parte ${n} de ${total})`));
          await descansar();
        });
        if (rapido) avisos.push('Parte do vídeo rolou rápido demais: confira se faltou alguma parada.');
      }
    } finally {
      await worker.terminate();
    }
  }
  return Object.assign(juntarQuadros(grupos), {avisos});
}

import {ehArquivoZip, itensDaPlanilha, pareceNomeDePlanilha, type ItemPlanilha} from '../logica/planilha';
import {chaveEndereco, extrairEnderecos} from '../logica/texto';

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

async function prepararImagem(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(3, Math.max(1, 1700 / bmp.width));
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
      const v = g <= 105 ? 0 : g >= 195 ? 255 : (g - 105) * 255 / 90;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    cx.putImageData(img, 0, 0);
    return await new Promise(r => cv.toBlob(b => r(b || file), 'image/png'));
  } catch {
    return file;
  }
}

async function lerImagens(files: Blob[], aviso: Aviso): Promise<string[]> {
  const w = window as any;
  if (!w.Tesseract) await carregarScript(TESSERACT, 'sem internet para o leitor');
  const worker = await w.Tesseract.createWorker('por');
  const achados: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const rotulo = files.length > 1 ? ` (print ${i + 1} de ${files.length})` : '';
      aviso(`Preparando a imagem…${rotulo}`);
      const tratada = await prepararImagem(files[i]);
      const tentativas = [{imagem: tratada, psm: '4'}, {imagem: tratada, psm: '6'}, {imagem: files[i], psm: '3'}];
      const doPrint = new Map<string, string>();
      for (const t of tentativas) {
        aviso(`Lendo os endereços…${rotulo}`);
        await worker.setParameters({tessedit_pageseg_mode: t.psm, preserve_interword_spaces: '1'});
        const {data} = await worker.recognize(t.imagem);
        for (const e of extrairEnderecos(data.text)) {
          const k = chaveEndereco(e), antigo = doPrint.get(k);
          if (!antigo || e.length > antigo.length) doPrint.set(k, e);
        }
        if (t !== tentativas[0] && doPrint.size) break;
      }
      achados.push(...doPrint.values());
    }
  } finally {
    await worker.terminate();
  }
  return [...new Set(achados)];
}

export async function lerArquivos(files: Arquivo[], aviso: Aviso): Promise<string[]> {
  const imagens: Blob[] = [], linhas: string[] = [];
  for (const f of files) {
    if ((f.type || '').includes('pdf') || /\.pdf$/i.test(f.name || '')) {
      const r = await lerPdf(f, aviso);
      linhas.push(...r.linhas);
      imagens.push(...r.imagens);
    } else if ((f.type || '').startsWith('text/') || /\.txt$/i.test(f.name || '')) {
      linhas.push(...extrairEnderecos(await f.text()));
    } else imagens.push(f);
  }
  if (imagens.length) linhas.push(...await lerImagens(imagens, aviso));
  const unicos = new Map<string, string>();
  for (const l of linhas) {
    const k = chaveEndereco(l), antigo = unicos.get(k);
    if (!antigo || l.length > antigo.length) unicos.set(k, l);
  }
  return [...unicos.values()];
}

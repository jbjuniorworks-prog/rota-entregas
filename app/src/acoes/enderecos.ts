import {operacoesDaPlanilha} from '../logica/fila';
import {haversine, marcarIsoladas, mediana, moverParaOBairro} from '../logica/geo';
import {adicionarDaPlanilha, adicionarLinhas, novoId, resumoPlanilha} from '../logica/importar';
import {CORES, DA_PLANILHA} from '../logica/rotulos';
import {decompor, extrairEnderecos} from '../logica/texto';
import type {Parada} from '../logica/tipos';
import {loja, status} from '../loja';
import {lerArquivos, lerPlanilhas, separarPlanilhas} from '../servicos/arquivos';
import {carregarAncorasDeCep} from '../servicos/base';
import {centroDaCidade, centroDoBairro, geocodificar, usarRegiao} from '../servicos/geocodificacao';
import {e, enviarFila, fila, invalidarRota, irPara, memoria, ui} from './base';
import {avisoCompartilhadas, consultarCompartilhadas, focar} from './posicoes';
import {registrarComoFicou} from './registro';
import {montarRota} from './rota';

export const RAIO_REGIAO = 100000;

export async function garantirRegiao(): Promise<void> {
  const est = e(), cidade = est.cidade.trim();
  if (est.regiao && est.regiao.nome === (cidade || 'entregas')) { usarRegiao(est.regiao); return; }
  if (cidade) {
    try {
      const c = await centroDaCidade(cidade);
      if (c) est.regiao = {nome: cidade, lat: c.lat, lng: c.lng, raio: RAIO_REGIAO};
    } catch {}
  }
  if (!cidade && (!est.regiao || est.regiao.nome !== 'entregas')) {
    const comLocal = est.paradas.filter(p => p.lat != null && p.lng != null);
    const base = comLocal.length >= 3
      ? {lat: mediana(comLocal.map(p => p.lat!)), lng: mediana(comLocal.map(p => p.lng!))}
      : est.inicio;
    est.regiao = base ? {nome: 'entregas', lat: base.lat, lng: base.lng, raio: RAIO_REGIAO} : null;
  }
  usarRegiao(est.regiao || null);
  loja.mudou();
}

export function centroDasEntregas() {
  const comLocal = e().paradas.filter(p => p.lat != null && p.lng != null);
  if (comLocal.length) return {lat: mediana(comLocal.map(p => p.lat!)), lng: mediana(comLocal.map(p => p.lng!))};
  const r = e().regiao;
  return r ? {lat: r.lat, lng: r.lng} : null;
}

export async function buscarParada(p: Parada) {
  if (memoria.aplicar(p)) return;
  await garantirRegiao();
  try {
    const cands = await geocodificar(p.texto, {cidade: e().cidade, googleKey: e().googleKey, perto: centroDasEntregas(), bairro: p.bairro || ''});
    p.candidatos = cands;
    if (cands.length) Object.assign(p, {lat: cands[0].lat, lng: cands[0].lng, exibido: cands[0].exibido, precisao: cands[0].precisao, fonte: cands[0].fonte});
    else Object.assign(p, {lat: null, lng: null, exibido: '', precisao: 'nao', fonte: 'nao achou'});
  } catch (err) {
    p.precisao = 'pendente';
    throw err;
  }
}

export async function buscarPendentes(resumoAntes = '') {
  if (ui.ocupado) return;
  const alvo = e().paradas.filter(p => p.precisao === 'pendente');
  if (!alvo.length) return;
  ui.ocupado = true;
  await garantirRegiao();
  // Uma consulta só, antes de começar: onde ficam os CEPs desta rota, pelo que já foi entregue.
  await carregarAncorasDeCep(alvo.map(p => decompor(p.texto).cep || '').filter(Boolean));
  let erro: Error | null = null;
  for (let i = 0; i < alvo.length; i++) {
    status(`Buscando endereços… ${i + 1} de ${alvo.length}`);
    try { await buscarParada(alvo[i]); } catch (err) { erro = err as Error; }
    loja.mudou();
  }
  ui.ocupado = false;
  const longe = marcarIsoladas(e().paradas);
  ui.enquadrar++;
  loja.mudou();
  const resultado = erro ? 'Alguns falharam (' + erro.message + '). Toque em "Buscar pendentes".'
    : longe ? `Pronto! ⚠️ ${longe} parada(s) longe das outras entregas: confira o pino.` : 'Pronto! Confira os laranja e os vermelhos, se houver.';
  const comp = avisoCompartilhadas(await consultarCompartilhadas());
  registrarComoFicou();
  enviarFila();
  status((resumoAntes ? `${resumoAntes} Busca dos sem posição: ${resultado}` : resultado) + comp, resumoAntes || comp ? 15000 : longe ? 8000 : 4000);
}

async function levarAoBairroPeloMapa(): Promise<number> {
  const perto = e().paradas.filter(p => p.lat != null && p.lng != null && p.precisao !== 'longe');
  const sozinhas = e().paradas.filter(p => p.precisao === 'longe' && p.bairro && DA_PLANILHA.has(p.precisaoAntes!));
  if (!perto.length || !sozinhas.length) return 0;
  const centro = {lat: mediana(perto.map(p => p.lat!)), lng: mediana(perto.map(p => p.lng!))};
  let n = 0;
  for (const p of sozinhas) {
    status(`Procurando o bairro ${p.bairro} no mapa…`);
    try {
      const c = await centroDoBairro(p.bairro!, e().cidade);
      if (c && haversine(c, centro) < 20000) { moverParaOBairro(p, c, p.bairro!); n++; }
    } catch {}
  }
  if (n) invalidarRota();
  return n;
}

async function importarPlanilhas(files: Blob[]) {
  const itens = await lerPlanilhas(files);
  const {resumo, rotaDe} = adicionarDaPlanilha(e(), itens, p => memoria.aplicar(p));
  fila.enfileirar(...operacoesDaPlanilha(itens, rotaDe, e().cidade));
  enviarFila();
  resumo.noBairro += await levarAoBairroPeloMapa();
  const comp = await consultarCompartilhadas();
  resumo.confirmadas = comp.confirmadas;
  resumo.sugestoes = comp.sugestoes;
  return resumo;
}

export async function lerPrints(files: File[], textoAtual: string): Promise<string | null> {
  const {planilhas, outros} = await separarPlanilhas(files);
  if (planilhas.length) {
    status('Lendo a planilha…');
    try {
      const r = await importarPlanilhas(planilhas);
      if (outros.length) r.novas += adicionarLinhas(e(), await lerArquivos(outros, m => status(m))).novas;
      ui.aba = 'conferir';
      ui.enquadrar++;
      loja.mudou();
      const resumo = resumoPlanilha(r);
      status(resumo, r.longe ? 12000 : 5000);
      await buscarPendentes(resumo);
    } catch (err) {
      status('Não consegui ler a planilha: ' + (err as Error).message, 6000);
    }
    return null;
  }
  status('Carregando leitor de texto (a primeira vez demora)…');
  try {
    const unicos = await lerArquivos(files, m => status(m));
    status(unicos.length
      ? `${unicos.length} endereço(s) lido(s). Confira o texto e toque em "Adicionar".${unicos.avisos.map(a => ' ⚠️ ' + a).join('')}`
      : 'Não achei endereços. Use o print ou a gravação da LISTA de paradas, onde os endereços aparecem escritos. Print do mapa não serve.', 8000);
    return (textoAtual.trim() ? textoAtual.trim() + '\n' : '') + unicos.join('\n');
  } catch (err) {
    status('Não consegui ler a imagem: ' + (err as Error).message, 5000);
    return null;
  }
}

export async function processarCompartilhado() {
  const files: Blob[] = [];
  let texto = '';
  try {
    const cache = await caches.open('compartilhado');
    for (const req of await cache.keys()) {
      const r = (await cache.match(req))!;
      if (req.url.endsWith('/texto')) texto += await r.text();
      else files.push(await r.blob());
      await cache.delete(req);
    }
  } catch {}
  history.replaceState(null, '', location.pathname);
  if (!files.length && !texto.trim()) return;
  try {
    const {planilhas, outros} = await separarPlanilhas(files);
    const daPlanilha = planilhas.length ? await importarPlanilhas(planilhas) : null;
    const linhas: string[] = outros.length ? await lerArquivos(outros, m => status(m)) : [];
    if (texto.trim()) {
      const doTexto = extrairEnderecos(texto);
      linhas.push(...(doTexto.length ? doTexto : texto.split('\n').map(l => l.trim()).filter(Boolean)));
    }
    if (!linhas.length && !(daPlanilha && daPlanilha.novas + daPlanilha.juntas)) {
      irPara('enderecos');
      status('Não achei endereços. Compartilhe a planilha da rota ou o print da LISTA de paradas, onde os endereços aparecem escritos. Print do mapa não serve.', 8000);
      return;
    }
    const {novas, repetidas} = adicionarLinhas(e(), linhas);
    status(daPlanilha ? resumoPlanilha(daPlanilha) : `${novas} parada(s) nova(s)${repetidas ? `, ${repetidas} já existia(m)` : ''}. Buscando no mapa…`);
    irPara('conferir');
    await buscarPendentes();
    await montarRota();
  } catch (err) {
    status('Não consegui processar: ' + (err as Error).message, 6000);
  }
}

export async function adicionarTexto(texto: string) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (!linhas.length) { status('Cole pelo menos um endereço.', 2500); return false; }
  const {novas, repetidas} = adicionarLinhas(e(), linhas);
  ui.aba = 'conferir';
  loja.mudou();
  status(`${novas} adicionada(s)${repetidas ? `, ${repetidas} repetida(s) ignorada(s)` : ''}.`, 2500);
  await buscarPendentes();
  return true;
}

export async function editar(p: Parada) {
  const novo = prompt('Corrija o endereço:', p.texto);
  if (novo == null || !novo.trim()) return;
  p.texto = novo.trim();
  p.precisao = 'pendente';
  invalidarRota();
  loja.mudou();
  status('Buscando…');
  try { await buscarParada(p); status('Pronto.', 1500); } catch (err) { status('Falhou: ' + (err as Error).message, 4000); }
  loja.mudou();
  focar(p.id);
}

export function remover(p: Parada) {
  if (!confirm('Remover esta parada?')) return;
  e().paradas = e().paradas.filter(x => x.id !== p.id);
  invalidarRota();
  loja.mudou();
}

async function localPorTexto(pergunta: string, atual: string | undefined, naoAchou: string) {
  const t = prompt(pergunta, atual || '');
  if (!t || !t.trim()) return null;
  status('Buscando…');
  try {
    const c = (await geocodificar(t.trim(), {cidade: e().cidade, googleKey: e().googleKey}))[0];
    if (!c) { status(naoAchou, 3000); return null; }
    return {texto: t.trim(), lat: c.lat, lng: c.lng, exibido: c.exibido};
  } catch (err) {
    status('Falhou: ' + (err as Error).message, 4000);
    return null;
  }
}

export async function saidaPorEndereco() {
  const l = await localPorTexto('Endereço de saída (ex.: ponto de coleta):', e().inicio?.texto, 'Endereço de saída não encontrado.');
  if (!l) return;
  e().inicio = {id: 'inicio', ...l};
  invalidarRota();
  ui.enquadrar++;
  loja.mudou();
  status('Saída definida.', 2000);
}

export async function fimPorEndereco() {
  const l = await localPorTexto('Onde você quer terminar? (ex.: Ponto Novo, ou um endereço)', e().fim?.texto, 'Lugar não encontrado. Tente "Marcar no mapa".');
  if (!l) return;
  e().fim = {id: 'fim', ...l};
  invalidarRota();
  ui.enquadrar++;
  loja.mudou();
  status('Ponto final definido. Confira o F no mapa.', 3000);
}

export function novaArea() {
  const usadas = new Set(e().areas.map(a => a.cor));
  const [nome, cor] = CORES.find(c => !usadas.has(c[1])) || CORES[e().areas.length % CORES.length];
  const nova = {id: novoId(), nome, cor, prazo: ''};
  e().areas.push(nova);
  e().areaAtual = nova.id;
  loja.mudou();
}

export function corDaArea(cor: string, nome: string) {
  const a = loja.area(e().areaAtual);
  const nomePadrao = CORES.some(c => c[0] === a.nome);
  a.cor = cor;
  if (nomePadrao) a.nome = nome;
  loja.mudou();
}

export function removerArea() {
  const a = loja.area(e().areaAtual);
  const n = e().paradas.filter(x => x.area === a.id).length;
  if (!confirm(`Apagar a área ${a.nome}${n ? ` e as ${n} parada(s) dela` : ''}?`)) return;
  e().paradas = e().paradas.filter(x => x.area !== a.id);
  e().areas = e().areas.filter(x => x.id !== a.id);
  e().areaAtual = e().areas[0].id;
  invalidarRota();
  loja.mudou();
}

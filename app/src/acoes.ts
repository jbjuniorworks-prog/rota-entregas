import {criarFila, operacoesDaPlanilha} from './logica/fila';
import {haversine, marcarIsoladas, mediana, moverParaOBairro, proximaAPe} from './logica/geo';
import {DA_PLANILHA} from './logica/rotulos';
import {backupRecente, CHAVES, estadoVazio, resetarDia} from './logica/guarda';
import {adicionarDaPlanilha, adicionarLinhas, novoId, resumoPlanilha} from './logica/importar';
import {avisoGuardou, criarMemoria} from './logica/memoria';
import {montarRota as calcularRota} from './logica/montagem';
import {CORES} from './logica/rotulos';
import {aplicarCompartilhadas} from './logica/compartilhadas';
import {chaveLugar, chaveRua, decompor, extrairEnderecos} from './logica/texto';
import type {Parada} from './logica/tipos';
import {guarda, loja, status} from './loja';
import {lerArquivos, lerPlanilhas, separarPlanilhas} from './servicos/arquivos';
import {centroDaCidade, centroDoBairro, foraDaRegiao, geocodificar, usarRegiao} from './servicos/geocodificacao';
import {clienteNuvem, entrar as entrarNaNuvem, iniciarNuvem, sair as sairDaNuvem} from './servicos/nuvem';
import {linhaDaRota, matriz} from './servicos/ruas';
import {linkWaze} from './logica/otimizacao';

const e = () => loja.e;
const ui = loja.ui;

export const fila = criarFila(guarda);
export const memoria = criarMemoria(guarda, () => e().cidade, (chave, lat, lng) => {
  fila.enfileirar({tipo: 'correcao', chave, lat, lng});
  enviarFila();
});

export async function enviarFila() {
  await fila.enviar(clienteNuvem());
  loja.mudou(false);
}

export async function iniciar() {
  usarRegiao(e().regiao || null);
  await iniciarNuvem();
  loja.mudou(false);
  enviarFila();
  window.addEventListener('online', enviarFila);
  setInterval(enviarFila, 60000);
  if (new URLSearchParams(location.search).has('compartilhado')) processarCompartilhado();
}

export async function entrar(email: string, senha: string) {
  status('Entrando…');
  const msg = await entrarNaNuvem(email, senha);
  loja.mudou(false);
  status(msg + avisoCompartilhadas(await consultarCompartilhadas()), 8000);
  enviarFila();
}

export async function sair() {
  if (!confirm('Sair da conta? Para usar o app de novo, vai precisar do e-mail e da senha. O que ainda não foi enviado fica guardado neste celular.')) return;
  await sairDaNuvem();
  if (ui.aba === 'admin') ui.aba = 'enderecos';
  loja.mudou(false);
}

export function invalidarRota() {
  marcarIsoladas(e().paradas);
  e().rota = null;
  e().pernas = {};
}

export function irPara(aba: typeof ui.aba) {
  ui.aba = aba;
  ui.posicionando = null;
  loja.mudou(false);
}

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
    if (cands.length) Object.assign(p, {lat: cands[0].lat, lng: cands[0].lng, exibido: cands[0].exibido, precisao: cands[0].precisao});
    else Object.assign(p, {lat: null, lng: null, exibido: '', precisao: 'nao'});
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
  status((resumoAntes ? `${resumoAntes} Busca dos sem posição: ${resultado}` : resultado) + comp, resumoAntes || comp ? 15000 : longe ? 8000 : 4000);
}

export function gps(): Promise<void> {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) { status('Este navegador não dá acesso ao GPS.', 3000); falha(new Error('sem GPS')); return; }
    status('Pegando sua localização…');
    navigator.geolocation.getCurrentPosition(pos => {
      e().inicio = {id: 'inicio', lat: pos.coords.latitude, lng: pos.coords.longitude, exibido: `Minha localização (±${Math.round(pos.coords.accuracy)} m)`};
      invalidarRota();
      ui.enquadrar++;
      loja.mudou();
      status('Localização definida.', 2000);
      ok();
    }, err => {
      status('Não consegui o GPS: ' + (err.code === 1 ? 'permissão negada. Libere a localização para este site.' : err.message), 5000);
      falha(err);
    }, {enableHighAccuracy: true, timeout: 20000});
  });
}

export async function montarRota() {
  if (ui.ocupado) return;
  if (!e().paradas.some(p => !p.entregue && p.lat != null)) { status('Nenhuma parada com local encontrado.', 3000); return; }
  ui.ocupado = true;
  try {
    if (!e().inicio || !e().inicio!.texto) {
      try { await gps(); } catch { e().inicio = null; }
    }
    const rota = await calcularRota(e(), {matriz, linha: linhaDaRota}, m => status(m));
    status(rota.porRuas ? 'Rota pronta!' : 'Rota pronta (sem acesso às ruas: usei distância aproximada).', 3500);
  } catch (err) {
    status('Erro ao montar rota: ' + (err as Error).message, 5000);
  }
  ui.ocupado = false;
  ui.aba = 'rota';
  ui.enquadrar++;
  loja.mudou();
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

export async function consultarCompartilhadas(): Promise<{confirmadas: number; sugestoes: number}> {
  const zero = {confirmadas: 0, sugestoes: 0};
  const c = clienteNuvem();
  if (!c) return zero;
  const chaveDe = (p: Parada) => chaveLugar(p.texto, p.bairro, e().cidade);
  const chaves = [...new Set(e().paradas.filter(p => !p.entregue).map(chaveDe).filter((k): k is string => !!k))];
  if (!chaves.length) return zero;
  try {
    const r = aplicarCompartilhadas(e().paradas, await c.posicoes(chaves), chaveDe);
    if (r.confirmadas) invalidarRota();
    loja.mudou();
    return r;
  } catch {
    return zero;
  }
}

function avisoCompartilhadas(r: {confirmadas: number; sugestoes: number}): string {
  return (r.confirmadas ? ` 🤝 ${r.confirmadas} com posição confirmada por outros motoristas.` : '')
    + (r.sugestoes ? ` 💡 ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '');
}

export function usarSugestao(p: Parada) {
  const s = p.sugestao;
  if (!s) return;
  corrigirPosicao(p, s.lat, s.lng, 'Local do outro motorista usado');
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

async function processarCompartilhado() {
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

export const GPS_PASSAGEM = 40;

function guardarPassagem(p: Parada) {
  if (!navigator.geolocation) return;
  const chave = chaveLugar(p.texto, p.bairro, e().cidade);
  if (!chave) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const {latitude, longitude, accuracy} = pos.coords;
    if (accuracy > GPS_PASSAGEM || foraDaRegiao({lat: latitude, lng: longitude})) return;
    const rua = decompor(p.texto).rua;
    fila.enfileirar({
      tipo: 'observacao', chave, lat: +latitude.toFixed(6), lng: +longitude.toFixed(6), precisao: Math.round(accuracy),
      endereco: p.texto.slice(0, 300), rua: rua.slice(0, 200), ruaChave: chaveRua(rua).slice(0, 200),
    });
    enviarFila();
  }, () => {}, {enableHighAccuracy: true, timeout: 10000, maximumAge: 5000});
}

export function marcarEntregue(p: Parada, entregue: boolean) {
  p.entregue = entregue;
  p.entregueEm = entregue ? Date.now() : null;
  loja.mudou();
  if (entregue && e().rota) {
    const proxima = e().rota!.areas.flatMap(a => a.ordem).map(loja.parada).find(x => x && !x.entregue && x.lat != null);
    const d = proximaAPe(p, proxima);
    if (d && proxima) {
      status(`📍 Próxima a ~${d} m: ${proxima.texto.split(',').slice(0, 2).join(',')}. Dá para ir a pé.`, 7000);
      try { navigator.vibrate?.(200); } catch {}
    }
  }
  if (entregue) guardarPassagem(p);
  if (p.rota && p.pacotes && p.pacotes.length) {
    fila.enfileirar({tipo: 'entregue', rota: p.rota, tns: p.pacotes, quando: entregue ? new Date(p.entregueEm!).toISOString() : null});
    enviarFila();
  }
}

export function posicionar(alvo: string) {
  ui.posicionando = ui.posicionando === alvo ? null : alvo;
  loja.mudou(false);
  if (ui.posicionando) {
    status(alvo === 'fim' ? 'Toque no mapa, onde você quer terminar.' : 'Toque no mapa, no local da entrega.', 4000);
    if (window.innerWidth < 900) window.scrollTo(0, 0);
  }
}

export function tocouNoMapa(lat: number, lng: number) {
  const alvo = ui.posicionando;
  if (!alvo) return;
  ui.posicionando = null;
  if (alvo === 'fim') {
    e().fim = {id: 'fim', lat, lng, exibido: 'Local marcado no mapa'};
    invalidarRota();
    loja.mudou();
    status('Ponto final definido. Toque em "Montar melhor sequência".', 3000);
    return;
  }
  const p = loja.parada(alvo);
  if (!p) return;
  corrigirPosicao(p, lat, lng, 'Local definido');
}

function prepararDesfazer(p: Parada): () => void {
  const antes = {lat: p.lat, lng: p.lng, precisao: p.precisao, precisaoAntes: p.precisaoAntes, exibido: p.exibido};
  const foto = memoria.fotografar(p);
  return () => {
    if (foto && p.lat != null && p.lng != null) {
      fila.desfazerCorrecao(foto.chave, +p.lat.toFixed(6), +p.lng.toFixed(6));
      memoria.restaurar(foto);
      enviarFila();
    }
    Object.assign(p, antes);
    if (p.adiada) marcarIsoladas(e().paradas);
    else invalidarRota();
    loja.mudou();
    status('Posição anterior de volta.', 3000);
  };
}

export function corrigirPosicao(p: Parada, lat: number, lng: number, prefixo = 'Local corrigido', exibido = 'Posição marcada no mapa') {
  const desfazer = prepararDesfazer(p);
  delete p.sugestao;
  Object.assign(p, {lat, lng, precisao: 'manual', exibido});
  const guardou = memoria.lembrar(p);
  if (p.adiada) marcarIsoladas(e().paradas);
  else invalidarRota();
  loja.mudou();
  status(prefixo + avisoGuardou(guardou) + (p.adiada ? ' Quando quiser, toque em "Voltar para a rota".' : prefixo === 'Local corrigido' ? ' Monte a rota de novo.' : ''), 10000, desfazer);
}

export const GPS_PRECISO = 50;

export function estouAqui(p: Parada) {
  if (!navigator.geolocation) { status('Este navegador não dá acesso ao GPS.', 4000); return; }
  status('Pegando sua localização…');
  navigator.geolocation.getCurrentPosition(pos => {
    const margem = Math.round(pos.coords.accuracy);
    if (margem > GPS_PRECISO && !confirm(`O GPS está impreciso agora (±${margem} m). Usar mesmo assim como posição desta entrega?

Se puder, espere uns segundos ao ar livre e tente de novo.`)) {
      status('Posição não alterada.', 3000);
      return;
    }
    corrigirPosicao(p, pos.coords.latitude, pos.coords.longitude, 'Local corrigido pela sua localização', `Sua localização na porta (±${margem} m)`);
  }, err => {
    status('Não consegui o GPS: ' + (err.code === 1 ? 'permissão negada. Libere a localização para este site.' : err.message), 5000);
  }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
}

export function deixarParaDepois(p: Parada) {
  p.adiada = true;
  if (e().rota) for (const ra of e().rota!.areas) ra.ordem = ra.ordem.filter(id => id !== p.id);
  if (ui.selecionada === p.id) ui.selecionada = null;
  loja.mudou();
  status('Deixada para depois. Ela está no fim da tela, em "Deixadas para depois", para você arrumar a localização.', 5000);
}

export function voltarParaARota(p: Parada) {
  p.adiada = false;
  loja.mudou();
  status('De volta. Toque em "Refazer rota" para ela entrar na sequência.', 4000);
}

export function focar(id: string) {
  ui.selecionada = id;
  ui.focar = {id, vez: (ui.focar?.vez || 0) + 1};
  if (window.innerWidth < 900) window.scrollTo(0, 0);
  loja.mudou(false);
}

export function escolherCandidato(p: Parada, k: number) {
  const c = p.candidatos[k];
  const desfazer = prepararDesfazer(p);
  Object.assign(p, {lat: c.lat, lng: c.lng, exibido: c.exibido, precisao: c.precisao});
  status('Local escolhido' + avisoGuardou(memoria.lembrar(p)), 10000, desfazer);
  invalidarRota();
  loja.mudou();
  focar(p.id);
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

export function resetar() {
  if (!confirm('Quer resetar mesmo?\n\nTodas as paradas e a rota de hoje serão apagadas, para você carregar a planilha, o PDF ou os prints de novo. As posições que você corrigiu continuam guardadas.')) return;
  ui.aba = 'enderecos';
  ui.posicionando = null;
  loja.trocarEstado(resetarDia(guarda, e()));
  status('Rota resetada. Carregue a planilha, o PDF ou os prints. Dá para desfazer nos próximos 10 minutos.', 7000);
}

export function desfazerReset() {
  const b = backupRecente(guarda);
  if (!b) { status('O prazo para desfazer passou.', 3000); return; }
  localStorage.removeItem(CHAVES.backup);
  ui.enquadrar++;
  loja.trocarEstado(Object.assign(estadoVazio(), b.estado));
  status('Rota restaurada.', 3000);
}

export function esquecerPosicoes() {
  if (!confirm('Esquecer todas as posições que você corrigiu? As paradas de hoje continuam como estão.')) return;
  memoria.esquecer();
  loja.mudou(false);
  status('Posições esquecidas.', 2500);
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

export function mudar(f: () => void, refazer = false) {
  f();
  if (refazer) invalidarRota();
  loja.mudou();
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

export async function moverArea(id: string, delta: number) {
  const ordem = e().rota!.areas.map(ra => ra.id);
  const i = ordem.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ordem.length) return;
  [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  e().areas = ordem.map(loja.area).concat(e().areas.filter(a => !ordem.includes(a.id)));
  e().areasManual = true;
  await montarRota();
}

export async function copiarRota() {
  let texto = '';
  for (const ra of e().rota!.areas) {
    const a = loja.area(ra.id);
    const ps = ra.ordem.map(loja.parada).filter((p): p is Parada => !!p && !p.entregue);
    if (!ps.length) continue;
    const emoji = (CORES.find(c => c[1] === a.cor) || ['', '', '⚪'])[2];
    texto += `${emoji} *${a.nome}*${a.prazo ? ' (até ' + a.prazo + ')' : ''}\n`;
    texto += ps.map((p, i) => `${i + 1}. ${p.ml ? '#' + p.ml + ' ' : ''}${p.texto}\n${linkWaze(p as any)}`).join('\n') + '\n\n';
  }
  try {
    await navigator.clipboard.writeText(texto.trim());
    status('Rota copiada! Cole no WhatsApp.', 3000);
  } catch {
    status('Não consegui copiar.', 3000);
  }
}

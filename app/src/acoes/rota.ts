import {proximaAPe} from '../logica/geo';
import {backupRecente, CHAVES, estadoVazio, resetarDia} from '../logica/guarda';
import {montarRota as calcularRota} from '../logica/montagem';
import {linkWaze} from '../logica/otimizacao';
import {CORES} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {guarda, loja, status} from '../loja';
import {linhaDaRota, matriz} from '../servicos/ruas';
import {e, enviarFila, fila, invalidarRota, ui} from './base';
import {guardarPassagem} from './posicoes';

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

import {aplicarCompartilhadas} from '../logica/compartilhadas';
import {marcarIsoladas} from '../logica/geo';
import {avisoGuardou} from '../logica/memoria';
import {chaveLugar, chaveRua, decompor} from '../logica/texto';
import type {Parada} from '../logica/tipos';
import {loja, status} from '../loja';
import {foraDaRegiao} from '../servicos/geocodificacao';
import {clienteNuvem} from '../servicos/nuvem';
import {e, enviarFila, fila, invalidarRota, memoria, ui} from './base';

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

export function avisoCompartilhadas(r: {confirmadas: number; sugestoes: number}): string {
  return (r.confirmadas ? ` 🤝 ${r.confirmadas} com posição confirmada por outros motoristas.` : '')
    + (r.sugestoes ? ` 💡 ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '');
}

export function usarSugestao(p: Parada) {
  const s = p.sugestao;
  if (!s) return;
  corrigirPosicao(p, s.lat, s.lng, 'Local do outro motorista usado');
}

export const GPS_PASSAGEM = 40;

export function guardarPassagem(p: Parada) {
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

export function esquecerPosicoes() {
  if (!confirm('Esquecer todas as posições que você corrigiu? As paradas de hoje continuam como estão.')) return;
  memoria.esquecer();
  loja.mudou(false);
  status('Posições esquecidas.', 2500);
}

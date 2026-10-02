import {aplicarCompartilhadas} from '../logica/compartilhadas';
import {aplicarReclamacoes, chaveCliente} from '../logica/reclamacoes';
import {haversine, marcarIsoladas} from '../logica/geo';
import {avisoGuardou} from '../logica/memoria';
import {chaveCidade, chaveLugar, chaveRua, decompor, mesmoEndereco, nomeDoLugar} from '../logica/texto';
import type {Parada, Ponto} from '../logica/tipos';
import {loja, status} from '../loja';
import {foraDaRegiao} from '../servicos/geocodificacao';
import {clienteNuvem} from '../servicos/nuvem';
import {desatualizarRota, e, enviarFila, fila, memoria, ui} from './base';

export async function consultarCompartilhadas(): Promise<{confirmadas: number; sugestoes: number; minhas: number; xaropes: number}> {
  const saida = {confirmadas: 0, sugestoes: 0, minhas: 0, xaropes: 0};
  const c = clienteNuvem();
  if (!c) return saida;
  const chaveDe = (p: Parada) => chaveLugar(p.texto, p.bairro, e().cidade);
  const chaves = [...new Set(e().paradas.filter(p => !p.entregue).map(chaveDe).filter((k): k is string => !!k))];
  if (!chaves.length) return saida;
  try {
    Object.assign(saida, aplicarCompartilhadas(e().paradas, await c.posicoes(chaves), chaveDe));
    if (saida.confirmadas || saida.minhas) desatualizarRota();
  } catch {}
  // Separada da de cima: sem a 018 rodada ela falha, e as posições têm de chegar mesmo assim.
  // Chave própria: num condomínio a reclamação é do apartamento, não do prédio.
  try {
    const clienteDe = (p: Parada) => chaveCliente(p.texto, p.bairro, e().cidade);
    const clientes = [...new Set(e().paradas.filter(p => !p.entregue).map(clienteDe).filter((k): k is string => !!k))];
    if (clientes.length) saida.xaropes = aplicarReclamacoes(e().paradas, await c.reclamacoes(clientes), clienteDe);
  } catch {}
  loja.mudou();
  return saida;
}

export function avisoCompartilhadas(r: {confirmadas: number; sugestoes: number; minhas?: number; xaropes?: number}): string {
  return (r.confirmadas ? ` ✓ ${r.confirmadas} com endereço verificado por outros motoristas.` : '')
    + (r.minhas ? ` ✍️ ${r.minhas} com a posição que você mesmo já arrumou.` : '')
    + (r.sugestoes ? ` 💡 ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '')
    + (r.xaropes ? ` ⚠️ ${r.xaropes} de cliente xarope: veja o pino antes de entregar.` : '');
}

export function usarSugestao(p: Parada) {
  const s = p.sugestao;
  if (!s) return;
  corrigirPosicao(p, s.lat, s.lng, 'Local do outro motorista usado');
}

export const GPS_PASSAGEM = 40;

export function guardarNome(p: Parada, lat: number, lng: number) {
  const n = nomeDoLugar(p.texto, p.bairro), cidade = chaveCidade(e().cidade);
  if (!n || !cidade) return;
  fila.enfileirar({
    tipo: 'lugar', nomeChave: n.chave, nome: n.nome, cidade,
    lat: +lat.toFixed(6), lng: +lng.toFixed(6), endereco: p.texto.slice(0, 300),
  });
}

// Entrega marcada com o GPS a até isto do pino que ele seguia: o pino estava certo, e a nuvem
// dá o endereço como verificado com essa entrega só (017). É o mesmo raio de "mesmo ponto" dela.
export const NO_PINO = 30;

function enfileirarPassagem(p: Parada, chave: string, lat: number, lng: number, precisao: number) {
  const rua = decompor(p.texto).rua;
  const noPino = p.lat != null && p.lng != null && haversine(p as Ponto, {lat, lng}) <= NO_PINO;
  fila.enfileirar({
    tipo: 'observacao', chave, lat: +lat.toFixed(6), lng: +lng.toFixed(6), precisao: Math.round(precisao),
    endereco: p.texto.slice(0, 300), rua: rua.slice(0, 200), ruaChave: chaveRua(rua).slice(0, 200),
    ...(noPino ? {noPino: true} : {}),
  });
}

export function guardarPassagens(ps: Parada[]) {
  const alvos = ps.map(p => ({p, chave: chaveLugar(p.texto, p.bairro, e().cidade)})).filter((x): x is {p: Parada; chave: string} => !!x.chave);
  if (!alvos.length) return;
  // Pela mesma porta do "Estou aqui": com o mapa da Rota aberto o GPS já está sendo seguido, e um
  // pedido novo pode ficar sem resposta até estourar o prazo. Pedindo sempre de novo, a passagem
  // de quem entregava com o mapa aberto se perdia calada — achado no teste do "no pino", 28/09.
  // Sem aviso de "Pegando sua localização": o da próxima entrega é que importa agora.
  comMinhaPosicao((lat, lng, precisao) => {
    if (precisao > GPS_PASSAGEM || foraDaRegiao({lat, lng})) return;
    for (const {p, chave} of alvos) {
      guardarNome(p, lat, lng);
      enfileirarPassagem(p, chave, lat, lng, precisao);
    }
    enviarFila();
  }, () => {}, '');
}

export const guardarPassagem = (p: Parada) => guardarPassagens([p]);

// Pedido deles, 28/09: porta confirmada só se arruma de propósito. E não é só o toque errado
// com a mão ocupada: a correção nova de um motorista substitui a anterior dele na nuvem, então
// quem confirmou a porta na entrega e depois arruma sem querer tira a confirmação de todo mundo.
// Cliente que se muda não passa por aqui: o endereço novo é outra chave e chega sem confirmação
// (lembrete do Luan). Arrumar uma confirmada é só para porta que está errada.
export function podeMexer(p: Parada): boolean {
  if (p.precisao !== 'confirmado') return true;
  return confirm(`Este endereço já está verificado:

${p.exibido}

Tem certeza que quer arrumar? Faça isso só se a porta estiver errada. Quem administra vai ver a mudança.`);
}

export function posicionar(alvo: string) {
  const p = alvo === 'fim' || ui.posicionando === alvo ? null : loja.parada(alvo);
  if (p && !podeMexer(p)) return;
  ui.posicionando = ui.posicionando === alvo ? null : alvo;
  loja.mudou(false);
  // O aviso de "toque no mapa" sai do próprio ui.posicionando (main.tsx), e fica enquanto o modo
  // estiver armado: como aviso de 4 s, o modo continuava valendo sem nada na tela.
  if (ui.posicionando && window.innerWidth < 900) window.scrollTo(0, 0);
}

export function pararDePosicionar() {
  ui.posicionando = null;
  loja.mudou(false);
}

export function tocouNoMapa(lat: number, lng: number) {
  const alvo = ui.posicionando;
  if (!alvo) return;
  ui.posicionando = null;
  if (alvo === 'fim') {
    e().fim = {id: 'fim', lat, lng, exibido: 'Local marcado no mapa'};
    desatualizarRota();
    loja.mudou();
    status('Ponto final definido. ' + (e().rota ? 'Toque em "Refazer rota" para a sequência terminar por aqui.' : 'Toque em "Montar melhor sequência".'), 4000);
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
    else desatualizarRota();
    loja.mudou();
    status('Posição anterior de volta.', 3000);
  };
}

const JUNTO_DAQUI = 300;
const COLAR_ATE = 25;
// pino que andou mais do que isto não é ajuste de porta: a sequência pode ter deixado de valer
const MUDOU_MUITO = 300;
const CONFIAVEL: ReadonlySet<string> = new Set(['manual', 'lembrado', 'confirmado']);

export function irmasDoMesmoEndereco(p: Parada): Parada[] {
  if (p.lat == null || p.lng == null) return [];
  return e().paradas.filter(q => q !== p && !q.entregue && q.lat != null && q.lng != null
    && mesmoEndereco([q.texto, p.texto]) && haversine(q as Ponto, p as Ponto) <= JUNTO_DAQUI);
}

// Duas entregas de endereços diferentes que já estão no mesmo pino não têm o que juntar: quem
// mexe numa delas está separando as duas. Perguntar "virarem uma parada só" ali é o contrário do
// que ele pediu — e prendia o par, porque a zero metro a pergunta voltava a cada tentativa.
const JA_NO_MESMO_PINO = 5;

export function vizinhaJaMarcada(p: Parada, lat: number, lng: number): {q: Parada; metros: number; forte: boolean} | null {
  const empilhada = (q: Parada) => p.lat != null && p.lng != null && haversine(p as Ponto, q as Ponto) <= JA_NO_MESMO_PINO;
  const perto = e().paradas
    .filter(q => q !== p && !q.entregue && q.lat != null && q.lng != null
      && !mesmoEndereco([q.texto, p.texto]) && !empilhada(q))
    .map(q => ({q, metros: haversine({lat, lng}, q as Ponto), forte: CONFIAVEL.has(q.precisao)}))
    .filter(x => x.metros > 0 && x.metros <= COLAR_ATE)
    .sort((a, b) => a.metros - b.metros);
  return perto[0] || null;
}

export function corrigirPosicao(p: Parada, lat: number, lng: number, prefixo = 'Local corrigido', exibido = 'Posição marcada no mapa') {
  const vizinha = vizinhaJaMarcada(p, lat, lng);
  const daVizinha = vizinha ? vizinha.q.texto.split(',').slice(0, 3).join(',') : '';
  const juntas: Parada[] = [];
  if (vizinha && vizinha.forte && confirm(`Tem outra entrega já marcada a ${Math.round(vizinha.metros)} m daqui:

${daVizinha}

Pôr esta no mesmo ponto, para as duas virarem uma parada só?`)) {
    lat = vizinha.q.lat!;
    lng = vizinha.q.lng!;
  } else if (vizinha && !vizinha.forte && confirm(`Tem outra entrega a ${Math.round(vizinha.metros)} m daqui, ainda no lugar que veio da planilha:

${daVizinha}

Levar as duas para o ponto que você marcou, para virarem uma parada só?`)) {
    juntas.push(vizinha.q);
  }
  const irmas = irmasDoMesmoEndereco(p);
  if (irmas.length && confirm(`Outras ${irmas.length} entrega(s) deste mesmo endereço estão no lugar antigo.

Levar todas para o ponto novo junto com esta?`)) juntas.push(...irmas);
  const longe = [p, ...juntas].some(x => x.lat != null && x.lng != null && haversine(x as Ponto, {lat, lng}) > MUDOU_MUITO);
  const desfazers = [p, ...juntas].map(prepararDesfazer);
  const desfazer = () => desfazers.forEach(f => f());
  let guardou = false;
  for (const x of [p, ...juntas]) {
    delete x.sugestao;
    Object.assign(x, {lat, lng, precisao: 'manual', exibido, fonte: 'motorista'});
    guardou = memoria.lembrar(x) || guardou;
    guardarNome(x, lat, lng);
  }
  if (p.adiada) marcarIsoladas(e().paradas);
  else desatualizarRota(longe);
  loja.mudou();
  const quantas = juntas.length ? ` (${juntas.length + 1} entregas deste endereço)` : '';
  const depois = p.adiada ? ' Quando quiser, toque em "Voltar para a rota".'
    : e().rota ? ' A sequência continua de pé: só o tempo e a distância ficaram velhos.'
    : prefixo === 'Local corrigido' ? ' Monte a rota de novo.' : '';
  status(prefixo + quantas + avisoGuardou(guardou) + depois, 10000, desfazer);
}

export const GPS_PRECISO = 50;

// Na porta, posição de dez segundos atrás ainda é a porta. Mais velha que isso, não.
const NA_PORTA = 10000;

function marcarNaPorta(p: Parada, lat: number, lng: number, precisao: number) {
  const margem = Math.round(precisao);
  if (margem > GPS_PRECISO && !confirm(`O GPS está impreciso agora (±${margem} m). Usar mesmo assim como posição desta entrega?

Se puder, espere uns segundos ao ar livre e tente de novo.`)) {
    status('Posição não alterada.', 3000);
    return;
  }
  corrigirPosicao(p, lat, lng, 'Local corrigido pela sua localização', `Sua localização na porta (±${margem} m)`);
}

export function comMinhaPosicao(
  usar: (lat: number, lng: number, precisao: number) => void,
  semGps: (motivo: string) => void = motivo => status('Não consegui o GPS: ' + motivo, 5000),
  esperando = 'Pegando sua localização…',
) {
  // Com o mapa da Rota aberto a posição já vem chegando sozinha: aproveitar a que acabou de
  // chegar poupa o motorista de esperar o GPS de novo na porta — e, com uma vigia ligada, um
  // pedido novo pode ficar sem resposta até estourar o prazo.
  const meu = ui.euAqui;
  if (meu && Date.now() - meu.quando < NA_PORTA) { usar(meu.lat, meu.lng, meu.precisao); return; }
  if (!navigator.geolocation) { semGps('este navegador não dá acesso ao GPS.'); return; }
  if (esperando) status(esperando);
  navigator.geolocation.getCurrentPosition(
    pos => usar(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    err => semGps(err.code === 1 ? 'permissão negada. Libere a localização para este site.' : err.message),
    {enableHighAccuracy: true, timeout: 20000, maximumAge: 0});
}

export function estouAqui(p: Parada) {
  if (!podeMexer(p)) return;
  comMinhaPosicao((lat, lng, precisao) => marcarNaPorta(p, lat, lng, precisao));
}

// A porta vista por quem acabou de entregar nela. Correção e passagem saem da MESMA leitura, e é
// esse par no mesmo ponto que a `posicoes` da nuvem aceita como confirmação: o próximo motorista
// já recebe a porta confirmada, sem esperar um segundo motorista passar lá. Sem as perguntas de
// juntar do `corrigirPosicao`: estas já saíram da rota, não há parada para juntar com elas.
export function portaDaEntrega(ps: Parada[], lat: number, lng: number, precisao: number): {guardou: boolean; desfazer: () => void} {
  const longe = ps.some(x => x.lat != null && x.lng != null && haversine(x as Ponto, {lat, lng}) > MUDOU_MUITO);
  const desfazers = ps.map(prepararDesfazer);
  let guardou = false;
  for (const p of ps) {
    delete p.sugestao;
    Object.assign(p, {lat, lng, precisao: 'manual', exibido: `Sua localização na porta (±${Math.round(precisao)} m)`, fonte: 'motorista'});
    guardou = memoria.lembrar(p) || guardou;
    guardarNome(p, lat, lng);
    const chave = chaveLugar(p.texto, p.bairro, e().cidade);
    if (chave) enfileirarPassagem(p, chave, lat, lng, precisao);
  }
  if (ps.some(p => p.adiada)) marcarIsoladas(e().paradas);
  else desatualizarRota(longe);
  enviarFila();
  loja.mudou();
  return {guardou, desfazer: () => desfazers.forEach(f => f())};
}

// O rumo só vale quando ele está andando: parado, o GPS devolve lixo ou nada, e uma seta que
// gira sozinha na esquina é pior do que seta nenhuma.
const ANDANDO = 0.8;

export function seguirMinhaPosicao(): () => void {
  if (!navigator.geolocation) return () => {};
  const vigia = navigator.geolocation.watchPosition(pos => {
    const {latitude, longitude, accuracy, heading, speed} = pos.coords;
    ui.euAqui = {
      lat: latitude, lng: longitude, precisao: accuracy, quando: Date.now(),
      rumo: heading != null && Number.isFinite(heading) && (speed || 0) > ANDANDO ? heading : (ui.euAqui?.rumo ?? null),
    };
    loja.mudou(false);
  }, () => {}, {enableHighAccuracy: true, maximumAge: 5000, timeout: 20000});
  return () => navigator.geolocation.clearWatch(vigia);
}

export function centralizarEmMim() {
  if (!ui.euAqui) { status('Ainda não sei onde você está. Deixe o GPS pegar uns segundos.', 4000); return; }
  ui.irParaMim++;
  loja.mudou(false);
}

export function focar(id: string) {
  ui.selecionada = id;
  ui.focar = {id, vez: (ui.focar?.vez || 0) + 1};
  if (window.innerWidth < 900) window.scrollTo(0, 0);
  loja.mudou(false);
}

export function escolherCandidato(p: Parada, k: number) {
  if (!podeMexer(p)) return;
  const c = p.candidatos[k];
  const longe = p.lat != null && p.lng != null && haversine(p as Ponto, c) > MUDOU_MUITO;
  const desfazer = prepararDesfazer(p);
  // Escolher a posição da planilha contra o censo (ou contra o bairro) é decisão dele: como
  // 'planilha', o censo a levaria de novo na próxima vez que o app abrisse.
  Object.assign(p, {lat: c.lat, lng: c.lng, exibido: c.exibido, precisao: c.fonte === 'planilha' ? 'manual' : c.precisao, fonte: 'escolhida na lista'});
  const guardou = memoria.lembrar(p, Date.now(), false);
  status('Local escolhido' + (guardou
    ? ' e guardado neste celular. Para valer para os outros motoristas, arraste o pino ou toque em "📍 Estou aqui" na porta.'
    : '. Sem CEP nem bairro, não deu para guardar para as próximas rotas.'), 10000, desfazer);
  desatualizarRota(longe);
  loja.mudou();
  focar(p.id);
}

export function esquecerPosicoes() {
  if (!confirm('Esquecer todas as posições que você corrigiu? As paradas de hoje continuam como estão.')) return;
  memoria.esquecer();
  loja.mudou(false);
  status('Posições esquecidas.', 2500);
}

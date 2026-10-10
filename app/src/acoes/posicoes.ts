import {aplicarCompartilhadas} from '../logica/compartilhadas';
import {aplicarReclamacoes, chaveCliente} from '../logica/reclamacoes';
import {haversine, marcarIsoladas, noPino} from '../logica/geo';
import type {Operacao} from '../logica/fila';
import {avisoGuardou} from '../logica/memoria';
import {chaveCidade, chaveLugar, chaveRua, decompor, mesmoEndereco, nomeDoLugar} from '../logica/texto';
import type {Parada, PortaAntes, Ponto} from '../logica/tipos';
import {loja, MINIMIZADO, status} from '../loja';
import {foraDaRegiao} from '../servicos/geocodificacao';
import {clienteNuvem} from '../servicos/nuvem';
import {contar, desatualizarRota, e, enviarFila, ESPERA_DA_PORTA, fila, memoria, ui} from './base';
import {abrir, alturaAgora, voltar} from './navegacao';

export async function consultarCompartilhadas(): Promise<{confirmadas: number; sugestoes: number; minhas: number; lembradasVerificadas: number; xaropes: number}> {
  const saida = {confirmadas: 0, sugestoes: 0, minhas: 0, lembradasVerificadas: 0, xaropes: 0};
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
  return (r.confirmadas ? ` ${r.confirmadas} com endereço verificado.` : '')
    + (r.minhas ? ` ${r.minhas} com a posição que você mesmo já arrumou.` : '')
    + (r.sugestoes ? ` ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '')
    + (r.xaropes ? ` ${r.xaropes} de cliente xarope: veja o pino antes de entregar.` : '');
}

export function usarSugestao(p: Parada) {
  const s = p.sugestao;
  if (!s) return;
  corrigirPosicao(p, s.lat, s.lng, 'Local do outro motorista usado');
}

export const GPS_PASSAGEM = 40;

function opDoLugar(p: Parada, lat: number, lng: number): Operacao | null {
  const n = nomeDoLugar(p.texto, p.bairro), cidade = chaveCidade(e().cidade);
  if (!n || !cidade) return null;
  return {
    tipo: 'lugar', nomeChave: n.chave, nome: n.nome, cidade,
    lat: +lat.toFixed(6), lng: +lng.toFixed(6), endereco: p.texto.slice(0, 300),
  };
}

export function guardarNome(p: Parada, lat: number, lng: number) {
  const op = opDoLugar(p, lat, lng);
  if (op) fila.enfileirar(op);
}

// `seguia` é o pino de antes de qualquer mudança: é ele que diz se a entrega foi "no pino"
function opDaPassagem(p: Parada, chave: string, lat: number, lng: number, precisao: number, seguia: {lat?: number | null; lng?: number | null}): Operacao {
  const rua = decompor(p.texto).rua;
  return {
    tipo: 'observacao', chave, lat: +lat.toFixed(6), lng: +lng.toFixed(6), precisao: Math.round(precisao),
    endereco: p.texto.slice(0, 300), rua: rua.slice(0, 200), ruaChave: chaveRua(rua).slice(0, 200),
    ...(noPino(seguia, {lat, lng}) ? {noPino: true} : {}),
  };
}

// A passagem e o lugar de uma entrega esperam o prazo de desfazer antes de entrar na fila.
function segurarPorta(p: Parada, chave: string, lat: number, lng: number, precisao: number, seguia: {lat?: number | null; lng?: number | null}) {
  const lugar = opDoLugar(p, lat, lng);
  fila.segurar(p.id, [opDaPassagem(p, chave, lat, lng, precisao, seguia), ...(lugar ? [lugar] : [])], Date.now() + ESPERA_DA_PORTA);
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
    // desfeita enquanto o GPS respondia: não há porta desta entrega para guardar
    for (const {p, chave} of alvos) if (p.entregue && loja.parada(p.id) === p) segurarPorta(p, chave, lat, lng, precisao, p);
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

// Arrumar é no mapa: de outra tela (a Conferir, o ponto de chegada, a lista), vai para ele, e
// marcado ou cancelado, volta sozinho para onde estava, para seguir conferindo a próxima. Só se
// ainda estiver no passo que abriu: quem já voltou sozinho levaria um voltar a mais.
let voltarDe = -1;

export function posicionar(alvo: string) {
  const p = alvo === 'fim' || ui.posicionando === alvo ? null : loja.parada(alvo);
  if (p && !podeMexer(p)) return;
  ui.posicionando = ui.posicionando === alvo ? null : alvo;
  // O aviso de "toque no mapa" sai do próprio ui.posicionando (main.tsx), e fica enquanto o modo
  // estiver armado: como aviso de 4 s, o modo continuava valendo sem nada na tela.
  voltarDe = -1;
  if (ui.posicionando && (ui.tela !== 'rota' || ui.folha === 'lista')) {
    abrir({tela: 'rota', pino: null, folha: 'proxima'});
    voltarDe = alturaAgora();
  } else loja.mudou(false);
}

function terminouDePosicionar() {
  const ali = voltarDe === alturaAgora();
  voltarDe = -1;
  if (ali) voltar();
}

export function pararDePosicionar() {
  ui.posicionando = null;
  loja.mudou(false);
  terminouDePosicionar();
}

export function tocouNoMapa(lat: number, lng: number) {
  const alvo = ui.posicionando;
  if (!alvo) return;
  ui.posicionando = null;
  if (alvo === 'fim') {
    e().fim = {id: 'fim', lat, lng, exibido: 'Local marcado no mapa'};
    desatualizarRota();
    loja.mudou();
    status('Ponto final definido. ' + (e().rota ? 'Toque em "Refazer a rota" para a sequência terminar por aqui.' : 'Toque em "Montar a rota".'), 4000);
    terminouDePosicionar();
    return;
  }
  const p = loja.parada(alvo);
  if (!p) return;
  corrigirPosicao(p, lat, lng, 'Local definido');
  terminouDePosicionar();
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
export function portaDaEntrega(ps: Parada[], lat: number, lng: number, precisao: number): {guardou: boolean} {
  const longe = ps.some(x => x.lat != null && x.lng != null && haversine(x as Ponto, {lat, lng}) > MUDOU_MUITO);
  // todas antes de lembrar qualquer uma: as do mesmo endereço dividem a mesma memória
  const antes: PortaAntes[] = ps.map(p => ({
    lat: p.lat, lng: p.lng, exibido: p.exibido, precisao: p.precisao, precisaoAntes: p.precisaoAntes, fonte: p.fonte,
    ...(p.sugestao ? {sugestao: p.sugestao} : {}), porta: {lat, lng}, memoria: memoria.fotografar(p),
  }));
  let guardou = false;
  ps.forEach((p, i) => {
    const seguia = {lat: p.lat, lng: p.lng};
    delete p.sugestao;
    Object.assign(p, {lat, lng, precisao: 'manual', exibido: `Sua localização na porta (±${Math.round(precisao)} m)`, fonte: 'motorista', portaAntes: antes[i]});
    guardou = memoria.lembrar(p) || guardou;
    const chave = chaveLugar(p.texto, p.bairro, e().cidade);
    if (chave) segurarPorta(p, chave, lat, lng, precisao, seguia);
  });
  if (ps.some(p => p.adiada)) marcarIsoladas(e().paradas);
  else desatualizarRota(longe);
  enviarFila();
  loja.mudou();
  return {guardou};
}

// Todo desfazer da entrega passa aqui, do aviso ou da lista, e a porta que o "aqui" marcou volta
// junto: a correção sai da fila (ou é apagada na nuvem) e o pino volta para onde estava. Antes, só
// o aviso de 10 s voltava a porta, e pela lista o pino errado ficava (05/10).
export function desfazerPorta(p: Parada) {
  const a = p.portaAntes;
  if (!a) return;
  delete p.portaAntes;
  // mexido depois do "aqui" (Arrumar, Estou aqui): é outra decisão dele, e fica
  if (p.lat !== a.porta.lat || p.lng !== a.porta.lng) return;
  if (a.memoria) {
    fila.desfazerCorrecao(a.memoria.chave, +a.porta.lat.toFixed(6), +a.porta.lng.toFixed(6));
    memoria.restaurar(a.memoria);
    enviarFila();
  }
  const {porta: _, memoria: __, sugestao, ...posicao} = a;
  Object.assign(p, posicao, sugestao ? {sugestao} : {});
  if (p.adiada) marcarIsoladas(e().paradas);
  else desatualizarRota();
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

// A mira: volta a seguir, e leva o mapa até ele já.
export function centralizarEmMim() {
  ui.seguindo = true;
  if (!ui.euAqui) { status('Ainda não sei onde você está. Deixe o GPS pegar uns segundos.', 4000); loja.mudou(false); return; }
  ui.irParaMim++;
  loja.mudou(false);
}

// Ele arrastou o mapa: o mapa para de andar sozinho, senão briga com o dedo.
export function pararDeSeguir() {
  if (!ui.seguindo) return;
  ui.seguindo = false;
  loja.mudou(false);
}

// O cartão da próxima vira uma linha e o mapa fica com a tela; um toque na linha traz de volta.
export function minimizarCartao(sim: boolean) {
  ui.minimizado = sim;
  try { if (sim) localStorage.setItem(MINIMIZADO, '1'); else localStorage.removeItem(MINIMIZADO); } catch {}
  // para saber no Admin se alguém usa
  if (sim) contar('minimizar');
  loja.mudou(false);
}

// Mostra a entrega no mapa, com o cartão dela embaixo. De outra tela, vai para a Rota.
export function focar(id: string) {
  // olhar uma entrega é parar de seguir: o mapa vai até ela e fica lá
  ui.seguindo = false;
  ui.selecionada = id;
  ui.focar = {id, vez: (ui.focar?.vez || 0) + 1};
  abrir({tela: 'rota', pino: [id], folha: 'proxima'});
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
    ? ' e guardado neste celular. Para valer para os outros motoristas, use "Marcar no mapa" ou toque em "Estou aqui" na porta.'
    : '. Sem CEP nem bairro, não deu para guardar para as próximas rotas.'), 10000, desfazer);
  desatualizarRota(longe);
  loja.mudou();
  focar(p.id);
}

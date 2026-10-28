import {aplicarCompartilhadas, separarAsQueMovem} from '../logica/compartilhadas';
import {aplicarReclamacoes, chaveCliente} from '../logica/reclamacoes';
import {haversine, longeDaPorta, marcarIsoladas, noPino, passaDaPorta} from '../logica/geo';
import type {Operacao} from '../logica/fila';
import {avisoGuardou} from '../logica/memoria';
import {medidor} from '../logica/telemetria';
import {chaveCidade, chaveDaParada, chaveLugar, chaveRua, decompor, mesmoEndereco, nomeDoLugar, posicaoColada} from '../logica/texto';
import {separarParada} from '../logica/importar';
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
  const chaveDe = (p: Parada) => chaveDaParada(p, e().cidade);
  const chaves = [...new Set(e().paradas.filter(p => !p.entregue).map(chaveDe).filter((k): k is string => !!k))];
  if (!chaves.length) return saida;
  try {
    Object.assign(saida, aplicarCompartilhadas(e().paradas, await medidor.medir('banco', () => c.posicoes(chaves)), chaveDe));
    if (saida.confirmadas || saida.minhas) desatualizarRota();
    // o que a barra oferecia acabou de entrar
    ui.pinosNovos = null;
  } catch {}
  // Separada da de cima: sem a 018 rodada ela falha, e as posições têm de chegar mesmo assim.
  // Chave própria: num condomínio a reclamação é do apartamento, não do prédio.
  try {
    const clienteDe = (p: Parada) => chaveCliente(p.texto, p.bairro, e().cidade);
    const clientes = [...new Set(e().paradas.filter(p => !p.entregue).map(clienteDe).filter((k): k is string => !!k))];
    if (clientes.length) saida.xaropes = aplicarReclamacoes(e().paradas, await medidor.medir('banco', () => c.reclamacoes(clientes)), clienteDe);
  } catch {}
  loja.mudou();
  return saida;
}

// "Se está verificado, já deveria estar separadas" e "o que adiantou ele corrigir o pino?" (dono,
// 26/10): a planilha nova juntava de novo o que o Pedro tinha separado e arrumado. Porta com o
// complemento na chave só existe porque alguém separou aquele endereço, então qualquer uma
// (verificada, sugestão ou a dele mesmo) basta para a parada chegar separada. A porta de cada uma
// segue a regra de sempre. Os condomínios não entram: ninguém separa apartamento por apartamento.
export async function separarAsConhecidas(): Promise<number> {
  const c = clienteNuvem();
  if (!c) return 0;
  const cidade = e().cidade;
  const juntadas = e().paradas.filter(p => !p.entregue && (p.itens?.length || 0) > 1);
  const doItem = (p: Parada, texto: string) => chaveDaParada({texto, bairro: p.bairro, separada: true}, cidade);
  const proprias = (p: Parada) => p.itens!.map(it => doItem(p, it.texto)).filter((k): k is string => !!k && k !== chaveLugar(p.texto, p.bairro, cidade));
  const chaves = [...new Set(juntadas.flatMap(proprias))];
  if (!chaves.length) return 0;
  let marcadas: Set<string>;
  try { marcadas = new Set((await c.posicoes(chaves)).map(r => r.chave_lugar)); } catch { return 0; }
  const separar = juntadas.filter(p => proprias(p).some(k => marcadas.has(k)));
  for (const p of separar) separarParada(e(), p);
  if (separar.length) loja.mudou();
  return separar.length;
}

// As portas da nuvem só chegavam ao ler planilha, buscar ou entrar na conta. Em 13/10 o dono
// arrumou no computador um condomínio que a planilha pôs a 4 km, e o Luan, com a rota carregada
// antes, ia lá sem saber. Agora o app pergunta ao abrir e ao voltar para a tela, como faz com a
// versão nova; o que mexe em pino espera ele tocar em Atualizar.
const PINOS_DE_NOVO = 60000;
let pinosPerguntados = 0;

export async function verPinosNovos() {
  if (!navigator.onLine || Date.now() - pinosPerguntados < PINOS_DE_NOVO) return;
  const c = clienteNuvem();
  if (!c) return;
  const chaveDe = (p: Parada) => chaveDaParada(p, e().cidade);
  const chaves = [...new Set(e().paradas.filter(p => !p.entregue).map(chaveDe).filter((k): k is string => !!k))];
  if (!chaves.length) return;
  pinosPerguntados = Date.now();
  let resultados;
  try { resultados = await c.posicoes(chaves); } catch { return; }
  const {movem, ficam, entregas} = separarAsQueMovem(e().paradas, resultados, chaveDe);
  if (ficam.length) aplicarCompartilhadas(e().paradas, ficam, chaveDe);
  ui.pinosNovos = movem.length ? {resultados: movem, entregas} : null;
  loja.mudou(ficam.length > 0);
}

export function atualizarPinos() {
  const novos = ui.pinosNovos;
  if (!novos) return;
  const chaveDe = (p: Parada) => chaveDaParada(p, e().cidade);
  const r = aplicarCompartilhadas(e().paradas, novos.resultados, chaveDe);
  const movidas = r.confirmadas + r.minhas;
  ui.pinosNovos = null;
  if (movidas) desatualizarRota();
  loja.mudou();
  status(movidas
    ? `${movidas === 1 ? '1 pino foi' : movidas + ' pinos foram'} para o endereço verificado.${e().rota ? ' A ordem da rota não mudou: refaça quando quiser.' : ''}`
    : 'Os pinos já estavam atualizados.', 6000);
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
  const alvos = ps.map(p => ({p, chave: chaveDaParada(p, e().cidade)})).filter((x): x is {p: Parada; chave: string} => !!x.chave);
  if (!alvos.length) return;
  // Pela mesma porta do "Estou aqui": com o mapa da Rota aberto o GPS já está sendo seguido, e um
  // pedido novo pode ficar sem resposta até estourar o prazo. Pedindo sempre de novo, a passagem
  // de quem entregava com o mapa aberto se perdia calada — achado no teste do "no pino", 28/09.
  // Sem aviso de "Pegando sua localização": o da próxima entrega é que importa agora.
  comMinhaPosicao((lat, lng, precisao) => {
    if (precisao > GPS_PASSAGEM || foraDaRegiao({lat, lng})) return;
    // desfeita enquanto o GPS respondia: não há porta desta entrega para guardar
    // longe demais do pino, o GPS não é a porta: a entrega vale, a passagem não (26/10)
    for (const {p, chave} of alvos) if (p.entregue && loja.parada(p.id) === p && !longeDaPorta(p, {lat, lng})) segurarPorta(p, chave, lat, lng, precisao, p);
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

// "Marcar como admin" (15/10): a porta de um endereço sem ter a parada no celular. O toque é no
// mapa do próprio Admin.
export function marcarLugar(alvo: NonNullable<typeof ui.marcandoLugar>) {
  ui.marcandoLugar = alvo;
  loja.mudou(false);
}

export function pararDeMarcarLugar() {
  ui.marcandoLugar = null;
  loja.mudou(false);
}

async function gravarLugar(lat: number, lng: number) {
  const alvo = ui.marcandoLugar;
  // desarma antes de perguntar: o segundo toque no mapa não grava de novo
  ui.marcandoLugar = null;
  loja.mudou(false);
  if (!alvo) return;
  if (!confirm(`Gravar este ponto como a porta de ${alvo.endereco}?\n\nPassa a valer para todos os motoristas, na frente das entregas e das marcações de antes.`)) {
    status('Nada gravado.', 3000);
    return;
  }
  try {
    await alvo.gravar(+lat.toFixed(6), +lng.toFixed(6));
    status('Porta gravada: vale para todos os motoristas. Os celulares recebem ao abrir o app ou voltar para ele.', 6000);
  } catch (err) {
    status('Não gravou: ' + (err as Error).message, 6000);
  }
}

export function tocouNoMapa(lat: number, lng: number) {
  if (ui.marcandoLugar) { gravarLugar(lat, lng); return; }
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

// "Uma forma mais rápida de arrumar assim" (dono, 28/10, com o link que o cliente da Curva do Rio
// mandou): o link copiado no WhatsApp leva o pino direto, sem procurar o lugar no mapa. Só existia
// no Editar da Conferir, e quase ninguém chegava lá. Lê o que ele copiou; sem permissão ou sem link
// copiado, pede para colar.
export const SEM_POSICAO = 'Esse link não traz a posição (é o link curto do Compartilhar do Maps). No Maps, toque e segure no lugar e copie os números que aparecem, ou toque aqui no mapa, no lugar certo.';

async function posicaoDoLink(): Promise<Ponto | null> {
  let copiado = '';
  try { copiado = await navigator.clipboard.readText(); } catch {}
  let lido = posicaoColada(copiado);
  if (lido.tipo === 'nada') lido = posicaoColada(prompt('Cole aqui o link do mapa:'));
  if (lido.tipo === 'posicao') return {lat: lido.lat, lng: lido.lng};
  if (lido.tipo === 'link sem posicao') status(SEM_POSICAO, 10000);
  return null;
}

// Um link velho esquecido na área de transferência levaria o pino para o lugar de outra entrega.
// Até 3 km é ajuste de porta; mais longe, ele confirma.
function linkLonge(p: Parada, ali: Ponto): boolean {
  if (p.lat == null || p.lng == null) return false;
  const metros = haversine(p as Ponto, ali);
  return passaDaPorta(metros) && !confirm(`O link fica a ${(metros / 1000).toFixed(1).replace('.', ',')} km do pino de agora.\n\nLevar o pino para lá?`);
}

async function linkPara(p: Parada): Promise<Ponto | null> {
  const ali = await posicaoDoLink();
  return !ali || linkLonge(p, ali) ? null : ali;
}

const levarAoLink = (p: Parada, ali: Ponto) => corrigirPosicao(p, ali.lat, ali.lng, 'Pino no local do link', 'Local do link do mapa');

// Do cartão da próxima, sem passar pelo Arrumar.
export async function colarLinkDoMapa(p: Parada) {
  contar('colar-link');
  if (!podeMexer(p)) return;
  const ali = await linkPara(p);
  if (!ali) return;
  levarAoLink(p, ali);
  focar(p.id);
}

// Da faixa do Arrumar o pino: no lugar de tocar no mapa. O podeMexer já foi perguntado ao armar.
// Sem link, o modo continua armado: ele ainda pode tocar no mapa ou cancelar.
export async function colarLinkNoArrumar() {
  contar('colar-link');
  const p = ui.posicionando && ui.posicionando !== 'fim' ? loja.parada(ui.posicionando) : null;
  if (!p) return;
  const ali = await linkPara(p);
  // o toque no mapa pode ter resolvido enquanto ele colava
  if (!ali || ui.posicionando !== p.id) return;
  // como o toque no mapa: desarma antes de mexer, e o desenho que sai já é sem a faixa
  ui.posicionando = null;
  levarAoLink(p, ali);
  terminouDePosicionar();
}

// "Eles recebem assim pelo WhatsApp" (dono, 28/10): a localização do cliente, compartilhada para o
// app. Ela não diz de qual entrega é; a faixa mostra as que faltam, da mais perto para a mais longe.
export function escolherEntregaDoLocal(ali: Ponto) {
  ui.localRecebido = ali;
  loja.mudou(false);
}

export function esquecerLocalRecebido() {
  ui.localRecebido = null;
  loja.mudou(false);
}

export function levarAoLocalRecebido(p: Parada) {
  const ali = ui.localRecebido;
  ui.localRecebido = null;
  loja.mudou(false);
  if (!ali) return;
  contar('local-recebido');
  if (!podeMexer(p)) return;
  corrigirPosicao(p, ali.lat, ali.lng, 'Pino no local recebido', 'Local recebido pelo Compartilhar');
  focar(p.id);
}

// Da faixa do "Marcar como admin": a porta de todos no ponto do link, com a mesma pergunta do toque.
export async function colarLinkNoLugar() {
  contar('colar-link');
  const ali = await posicaoDoLink();
  if (ali) await gravarLugar(ali.lat, ali.lng);
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
  // separada, irmã é só a de mesmo complemento: levar as outras junto desfaria o que ele separou
  const mesmo = p.separada
    ? (q: Parada) => chaveDaParada(q, e().cidade) === chaveDaParada(p, e().cidade)
    : (q: Parada) => mesmoEndereco([q.texto, p.texto]);
  return e().paradas.filter(q => q !== p && !q.entregue && q.lat != null && q.lng != null
    && mesmo(q) && haversine(q as Ponto, p as Ponto) <= JUNTO_DAQUI);
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
  status(prefixo + quantas + avisoGuardou(guardou, p.texto) + depois, 10000, desfazer);
}

export const GPS_PRECISO = 50;

// Na porta, posição de dez segundos atrás ainda é a porta. Mais velha que isso, não.
const NA_PORTA = 10000;

// O GPS longe demais do pino (26/10): o aviso diz quanto, e o caminho para arrumar de onde ele está.
// No cartão da próxima não há "Arrumar o pino": ele mora no cartão do pino.
export const longeDemais = (p: Ponto, gps: Ponto) =>
  `Você está a ${(haversine(p, gps) / 1000).toFixed(1).replace('.', ',')} km do pino, longe demais para ser a porta.`;
export const ARRUMAR_DE_LONGE = 'Para arrumar daqui, toque no pino e em "Arrumar o pino".';

function marcarNaPorta(p: Parada, lat: number, lng: number, precisao: number) {
  // o "Estou aqui" também leva o pino para o GPS: da base, levava para a base
  if (longeDaPorta(p, {lat, lng})) { status(`${longeDemais(p as Ponto, {lat, lng})} O pino ficou onde estava. ${ARRUMAR_DE_LONGE}`, 8000); return; }
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
    const chave = chaveDaParada(p, e().cidade);
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
  // Não desliga o seguir: o cartão do pino aberto já o pausa, e ao fechar o mapa volta para ele.
  // Desligado, só a mira trazia o mapa de volta, e quem trabalha pela Lista via o mapa parado na
  // última parada que olhou (relato do dono, 15/10).
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
    : avisoGuardou(false, p.texto)), 10000, desfazer);
  desatualizarRota(longe);
  loja.mudou();
  focar(p.id);
}

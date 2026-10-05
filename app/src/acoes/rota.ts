import {proximaAPe} from '../logica/geo';
import {backupRecente, CHAVES, estadoVazio, resetarDia} from '../logica/guarda';
import {montarRota as calcularRota} from '../logica/montagem';
import {linkWaze} from '../logica/otimizacao';
import {CORES} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {guarda, loja, status} from '../loja';
import {foraDaRegiao} from '../servicos/geocodificacao';
import {linhaDaRota, matriz} from '../servicos/ruas';
import {desatualizarRota, e, enviarFila, fila, ui} from './base';
import {irPara} from './navegacao';
import {comMinhaPosicao, desfazerPorta, GPS_PASSAGEM, guardarPassagem, guardarPassagens, portaDaEntrega} from './posicoes';
import {registrarComoFicou} from './registro';

// Quando vale a posição que o mapa já vem seguindo, em vez de pedir uma nova ao GPS.
const RECENTE = 30000;
// Num computador o navegador se localiza pela rede, não por satélite, e erra quilômetros. Isso
// não é defeito nosso — calar sobre o tamanho do erro é. Recusar a posição grosseira e pedir
// outra também não resolve: vem da mesma fonte, e com a vigia ligada o pedido novo fica sem
// resposta até estourar o prazo. Então usa e diz de quanto foi o erro.
const SAIDA_RUIM = 1000;

const saidaRuim = (m: number) =>
  `A sua localização veio com ±${m >= 2000 ? Math.round(m / 100) / 10 + ' km' : m + ' m'} de margem — esse aparelho se localizou pela internet, não por satélite. Num computador é assim mesmo. Se o ponto de saída ficou longe, use "Sair de outro endereço", em Ponto de saída e de chegada.`;

function saidaDefinida(precisao: number) {
  const m = Math.round(precisao);
  if (m > SAIDA_RUIM) {
    status(saidaRuim(m), 14000);
    return;
  }
  const naTela = !!e().rota && !ui.ocupado;
  status(naTela
    ? `Localização definida (±${m} m). A rota continua na tela; toque em "Refazer a rota" para a sequência sair daqui.`
    : `Localização definida (±${m} m).`, naTela ? 8000 : 3000);
}

// Devolve a margem da posição usada, ou null quando ela chegou tarde demais para valer.
export function gps(aindaVale: () => boolean = () => true): Promise<number | null> {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) { status('Este navegador não dá acesso ao GPS.', 3000); falha(new Error('sem GPS')); return; }
    // Com o mapa da Rota aberto a posição já está chegando sozinha: pedir de novo faz o motorista
    // esperar o GPS à toa — e, com uma vigia ligada, o pedido novo pode nem ser respondido.
    const meu = ui.euAqui;
    if (meu && Date.now() - meu.quando < RECENTE && aindaVale()) {
      e().inicio = {id: 'inicio', lat: meu.lat, lng: meu.lng, exibido: `Minha localização (±${Math.round(meu.precisao)} m)`};
      desatualizarRota();
      ui.enquadrar++;
      loja.mudou();
      saidaDefinida(meu.precisao);
      ok(meu.precisao);
      return;
    }
    status('Pegando sua localização…');
    navigator.geolocation.getCurrentPosition(pos => {
      if (!aindaVale()) {
        status('A localização chegou depois que a rota ficou pronta. Toque em "Refazer a rota" para ela sair de onde você está.', 8000);
        ok(null);
        return;
      }
      e().inicio = {id: 'inicio', lat: pos.coords.latitude, lng: pos.coords.longitude, exibido: `Minha localização (±${Math.round(pos.coords.accuracy)} m)`};
      desatualizarRota();
      ui.enquadrar++;
      loja.mudou();
      saidaDefinida(pos.coords.accuracy);
      ok(pos.coords.accuracy);
    }, err => {
      status('Não consegui o GPS: ' + (err.code === 1 ? 'permissão negada. Libere a localização para este site.' : err.message), 5000);
      falha(err);
    }, {enableHighAccuracy: true, timeout: 20000});
  });
}

const PRAZO_DO_GPS = 20000;

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promessa, new Promise<T>((_, falha) => setTimeout(() => falha(new Error('o GPS não respondeu')), ms))]);
}

export async function montarRota() {
  if (ui.ocupado) return;
  if (!e().paradas.some(p => !p.entregue && p.lat != null)) { status('Nenhuma parada com local encontrado.', 3000); return; }
  ui.ocupado = true;
  // Refazer não pode piorar: sem rede a sequência sai em linha reta e, até aqui, não tinha volta.
  const antes = e().rota ? {rota: e().rota!, pernas: e().pernas} : null;
  // A saída é onde ele está, pega aqui na hora: não há botão para isso antes (02/10, "todas as
  // respostas são onde você está"). Margem grande avisa no fim, senão o "Rota pronta" apagava.
  let margem: number | null = null;
  try {
    if (!e().inicio || !e().inicio!.texto) {
      let noPrazo = true;
      try { margem = await comPrazo(gps(() => noPrazo), PRAZO_DO_GPS); } catch { noPrazo = false; e().inicio = null; }
    }
    const ruim = margem != null && margem > SAIDA_RUIM ? ' ' + saidaRuim(Math.round(margem)) : '';
    const rota = await calcularRota(e(), {matriz, linha: linhaDaRota}, m => status(m));
    // fica registrado se a rota saiu com as ruas de verdade ou em linha reta, e por quê:
    // rota em linha reta parece rota ruim, e até agora só dava para descobrir perguntando ao motorista
    registrarComoFicou(rota.porRuas ? null : rota.motivoSemRuas || 'sem motivo anotado');
    enviarFila();
    if (antes && antes.rota.porRuas && !rota.porRuas) {
      status('Rota pronta, mas sem acesso às ruas: usei distância em linha reta. A de antes saiu pelas ruas.' + ruim, 15000, () => {
        e().rota = antes.rota;
        e().pernas = antes.pernas;
        loja.mudou();
        status('A rota de antes voltou. O tempo e a distância dela são de antes das suas correções.', 5000);
      });
    } else status((rota.porRuas ? 'Rota pronta!' : 'Rota pronta (sem acesso às ruas: usei distância aproximada).') + ruim, ruim ? 14000 : 3500);
  } catch (err) {
    // a montagem zera as pernas antes de começar: se ela falhou no meio, a rota de antes ficava
    // na tela sem os tempos de trecho. As estimativas voltam junto com ela.
    if (antes && e().rota === antes.rota) e().pernas = antes.pernas;
    status('Erro ao montar rota: ' + (err as Error).message, 5000);
  }
  ui.ocupado = false;
  // rota nova: o mapa volta a mostrar ele e a primeira entrega
  ui.seguindo = true;
  // De outra tela (Ponto de saída, Áreas), vai para a Rota. Já nela, fica onde está: a lista que
  // ele abriu enquanto a rota era refeita fechava sozinha quando ela ficava pronta.
  if (ui.tela !== 'rota') irPara('rota');
  ui.enquadrar++;
  loja.mudou();
}

export function marcarEntregue(p: Parada, entregue: boolean, avisarProxima = true, comGps = true) {
  p.entregue = entregue;
  p.entregueEm = entregue ? Date.now() : null;
  // Tocou em Arrumar e entregou sem tocar no mapa: o modo ficava armado, e o toque seguinte no
  // mapa, até para fechar o balão, levava o pino da entrega feita para onde o dedo caiu. Com a
  // Leudy, 29/09: a porta que o GPS guardou na entrega foi para o mato meio minuto depois.
  if (entregue && ui.posicionando === p.id) ui.posicionando = null;
  // Desfeita, por aviso ou pela lista: a porta que esperava o prazo não vai mais, e a que o
  // "aqui" marcou volta. Nesta ordem, já não entregue: a volta da posição recalcula as isoladas,
  // e parada entregue não entra na conta — o aviso de "longe" sumia de quem voltou para a lista.
  if (!entregue) { fila.soltar(p.id); desfazerPorta(p); }
  // um pulso curto confirma o toque sem olhar a tela; o de 200 ms é o de "próxima a pé"
  if (entregue) { try { navigator.vibrate?.(35); } catch {} }
  loja.mudou();
  if (entregue && avisarProxima) {
    const proxima = e().rota?.areas.flatMap(a => a.ordem).map(loja.parada).find(x => x && !x.entregue && x.lat != null);
    const d = proximaAPe(p, proxima);
    // Uma mensagem só: o aviso tem uma vaga, e o do desfazer apagaria o de "dá para ir a pé".
    const aPe = d && proxima ? ` Próxima a ~${d} m: ${proxima.texto.split(',').slice(0, 2).join(',')}. Dá para ir a pé.` : '';
    status('Entregue.' + aPe, aPe ? 7000 : 6000, () => {
      marcarEntregue(p, false, false, false);
      status('Entrega desfeita.', 3000);
    });
    if (aPe) { try { navigator.vibrate?.(200); } catch {} }
  }
  if (entregue && comGps) guardarPassagem(p);
  if (p.rota && p.pacotes && p.pacotes.length) {
    fila.enfileirar({tipo: 'entregue', rota: p.rota, tns: p.pacotes, quando: entregue ? new Date(p.entregueEm!).toISOString() : null});
    enviarFila();
  }
}

export function entregarTodas(ps: Parada[]) {
  const faltando = ps.filter(p => !p.entregue);
  if (!faltando.length) return;
  const pacotes = faltando.reduce((n, p) => n + (p.unidades || 1), 0);
  if (!confirm(`Marcar como entregue tudo desta parada?

${faltando.length} entrega(s), ${pacotes} pacote(s).`)) return;
  faltando.forEach(p => marcarEntregue(p, true, false, false));
  guardarPassagens(faltando);
  status(`${faltando.length} entrega(s) marcada(s) aqui. Se sobrou alguma, desfaça na lista.`, 6000, () => {
    faltando.forEach(p => marcarEntregue(p, false, false, false));
    status('Entregas desfeitas.', 3000);
  });
}

// O botão da porta, no balão do pino. Eram dois toques em lugares diferentes — "Estou aqui" no
// cartão, "Entreguei" no outro — e cada um lia o GPS de novo: bastava a segunda leitura vir ruim
// para a porta chegar nos outros motoristas só como sugestão.
export function entregueAqui(ps: Parada[]) {
  const alvo = ps.filter(p => !p.entregue);
  if (!alvo.length) return;
  const pacotes = alvo.reduce((n, p) => n + (p.unidades || 1), 0);
  if (alvo.length > 1 && !confirm(`Marcar como entregue tudo deste endereço, com a porta aqui onde você está?

${alvo.length} entrega(s), ${pacotes} pacote(s).`)) return;
  // A entrega é fato e não espera o GPS, que parado na porta pode levar uns segundos.
  alvo.forEach(p => marcarEntregue(p, true, false, false));
  const quantas = alvo.length > 1 ? ` as ${alvo.length}` : '';
  const desfazerEntrega = () => alvo.forEach(p => marcarEntregue(p, false, false, false));
  const soEntregue = (motivo: string) => status(`Entregue${quantas}. ${motivo} O pino ficou onde estava.`, 8000, () => {
    desfazerEntrega();
    status('Entrega desfeita.', 3000);
  });
  comMinhaPosicao((lat, lng, precisao) => {
    // desfeita ou resetada enquanto o GPS respondia: a porta já não é desta entrega
    const vivas = alvo.filter(p => p.entregue && loja.parada(p.id) === p);
    if (!vivas.length) return;
    const margem = Math.round(precisao);
    // Com margem maior que a da passagem, a nuvem fica só com a correção, e correção sozinha chega
    // nos outros como sugestão. Mexer no pino assim não é o que o botão promete.
    if (precisao > GPS_PASSAGEM) { soEntregue(`O GPS está impreciso agora (±${margem} m).`); return; }
    if (foraDaRegiao({lat, lng})) { soEntregue('O GPS deu um ponto fora da região das entregas.'); return; }
    const {guardou} = portaDaEntrega(vivas, lat, lng, precisao);
    status(`Entregue${quantas}, com a porta marcada aqui (±${margem} m).` + (guardou
      ? ' Vai para os outros motoristas como porta confirmada.'
      : ' Sem CEP nem bairro, a porta vale só para hoje.'), 10000, () => {
      // desfazer a entrega volta a porta junto (desfazerPorta, em marcarEntregue)
      desfazerEntrega();
      status('Desfeito: a entrega voltou para a lista e o pino para onde estava.', 4000);
    });
  }, motivo => soEntregue(`Não consegui o GPS: ${motivo}`), `Entregue${quantas}. Marcando a porta pelo GPS…`);
}

// Do cartão da próxima vêm todas as do endereço: adiando só a primeira, o cartão voltava com o
// mesmo endereço, e "Depois" parecia não ter funcionado.
export function deixarParaDepois(...ps: Parada[]) {
  const ids = new Set(ps.map(p => p.id));
  const rota = e().rota;
  // onde cada uma estava: o desfazer devolve ao mesmo lugar da sequência, sem refazer a rota
  const lugares = new Map(rota ? rota.areas.map(ra => [ra.id, ra.ordem.flatMap((id, i) => ids.has(id) ? [[id, i] as const] : [])]) : []);
  ps.forEach(p => { p.adiada = true; });
  if (rota) for (const ra of rota.areas) ra.ordem = ra.ordem.filter(id => !ids.has(id));
  if (ui.selecionada && ids.has(ui.selecionada)) ui.selecionada = null;
  loja.mudou();
  status(`${ps.length > 1 ? `Deixadas para depois as ${ps.length}. Estão` : 'Deixada para depois. Ela está'} no fim da lista, em "Deixadas para depois", para você arrumar a localização.`, 6000, () => {
    ps.forEach(p => { p.adiada = false; });
    // "Voltar para a rota" pede Refazer; isto é desfazer um toque errado, então volta de onde saiu
    if (rota && e().rota === rota) for (const ra of rota.areas) {
      for (const [id, i] of lugares.get(ra.id) || []) if (!ra.ordem.includes(id)) ra.ordem.splice(Math.min(i, ra.ordem.length), 0, id);
    }
    loja.mudou();
    status('De volta ao mesmo lugar da sequência.', 3000);
  });
}

export function voltarParaARota(p: Parada) {
  p.adiada = false;
  loja.mudou();
  status('De volta. Toque em "Refazer a rota" para ela entrar na sequência.', 4000);
}

export function resetar() {
  if (!confirm('Quer resetar mesmo?\n\nTodas as paradas e a rota de hoje serão apagadas, para você carregar a planilha, o PDF ou os prints de novo. As posições que você corrigiu continuam guardadas.')) return;
  ui.posicionando = null;
  loja.trocarEstado(resetarDia(guarda, e()));
  irPara('inicio');
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

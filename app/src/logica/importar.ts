import {marcarIsoladas, marcarNumerosIncoerentes, marcarPontoGenerico, moverPeloBairro} from './geo';
import type {ItemPlanilha} from './planilha';
import {analisarLinha, chaveDaParada, chaveEndereco, chaveLugar, coordenadaNoTexto, semLink} from './texto';
import type {Estado, ItemDaParada, Parada, Precisao} from './tipos';

export const novoId = () => Math.random().toString(36).slice(2, 10);

export const numeroDaParada = (valor: string | null | undefined): string | null =>
  /^\d{1,4}$/.test(String(valor ?? '').trim()) ? String(valor).trim() : null;

export const ehAdicional = (valor: string | null | undefined): boolean => String(valor ?? '').trim() === '-';

export interface ResumoPlanilha {
  novas: number;
  juntas: number;
  repetidas: number;
  semPosicao: number;
  longe: number;
  lembradas: number;
  noBairro: number;
  aproximadas: number;
  numeros: number;
  confirmadas: number;
  sugestoes: number;
  // juntadas pela planilha e separadas sozinhas: alguém já tinha separado e marcado um complemento
  separadas?: number;
  // endereços de cliente que já reclamou (018), vindos da nuvem depois da busca
  xaropes?: number;
  // levadas para a porta do censo do IBGE: a planilha punha o pino a mais de 80 m dela
  censo?: number;
  // rua de nome genérico que a planilha punha longe das portas do próprio CEP, levadas para a porta
  foraDoCep?: number;
  // com o ponto que a planilha repete para vários bairros, e quantas o app já pôs no lugar
  genericas: number;
  genericasNoLugar?: number;
}

export function adicionarDaPlanilha(
  e: Estado, itens: ItemPlanilha[], aplicarMemoria: (p: Parada) => boolean, agora = Date.now(),
): {resumo: ResumoPlanilha; rotaDe: (it: ItemPlanilha) => string} {
  const existentes = new Set(e.paradas.map(x => chaveEndereco(x.texto)));
  // O código do pacote não muda quando o endereço muda. Só pelo texto, a parada editada (ou a que
  // o link colado deixava sem texto) não achava par na releitura e entrava de novo: dois pinos da
  // mesma entrega, e ele teve de apagar um (29/09).
  const pacotesNaRota = new Set(e.paradas.flatMap(x => x.pacotes || []));
  const desta = new Map<string, Parada>();
  // A linha que abriu cada parada: a primeira só vira item quando a segunda chega.
  const primeira = new Map<Parada, ItemPlanilha>();
  const itemDe = (it: ItemPlanilha): ItemDaParada => ({tn: it.tn, texto: it.texto, ml: it.ml, stop: numeroDaParada(it.parada), adicional: ehAdicional(it.parada)});
  const r: ResumoPlanilha = {novas: 0, juntas: 0, repetidas: 0, semPosicao: 0, longe: 0, lembradas: 0, noBairro: 0, aproximadas: 0, numeros: 0, confirmadas: 0, sugestoes: 0, genericas: 0};
  const rotaDe = (it: ItemPlanilha) => it.at || `${it.arquivo}:${agora}`;
  for (const it of itens) {
    if (it.tn && pacotesNaRota.has(it.tn)) { r.repetidas++; continue; }
    const chave = chaveEndereco(it.texto);
    const ja = desta.get(chave);
    if (ja) {
      ja.unidades = (ja.unidades || 1) + 1;
      if (it.tn) ja.pacotes!.push(it.tn);
      ja.itens = [...(ja.itens || [itemDe(primeira.get(ja)!)]), itemDe(it)];
      if (!ja.stop) ja.stop = numeroDaParada(it.parada);
      if (ehAdicional(it.parada)) ja.adicional = true;
      r.juntas++;
      continue;
    }
    if (existentes.has(chave)) { r.repetidas++; continue; }
    const temCoord = it.lat != null;
    const p: Parada = {
      id: novoId(), area: e.areaAtual, ml: it.ml, stop: numeroDaParada(it.parada), adicional: ehAdicional(it.parada), texto: it.texto, bairro: it.bairro, rota: rotaDe(it), pacotes: it.tn ? [it.tn] : [],
      unidades: null, comercial: false, lat: temCoord ? it.lat : null, lng: temCoord ? it.lng : null,
      exibido: !temCoord ? '' : it.aproximada ? 'Posição da planilha com poucas casas decimais: pode errar em até 1 km' : 'Posição da planilha',
      precisao: !temCoord ? 'pendente' : it.aproximada ? 'aproximada' : 'planilha', candidatos: [], entregue: false,
      fonte: temCoord ? 'planilha' : undefined,
      ...(it.cidade.trim() ? {cidade: it.cidade.trim()} : {}),
    };
    const lembrada = aplicarMemoria(p);
    if (!lembrada && p.precisao === 'aproximada') r.aproximadas++;
    e.paradas.push(p);
    desta.set(chave, p);
    primeira.set(p, it);
    r.novas++;
    if (lembrada) r.lembradas++;
    else if (!temCoord) r.semPosicao++;
  }
  if (!e.cidade) { const c = itens.find(i => i.cidade); if (c) e.cidade = c.cidade; }
  r.genericas = marcarPontoGenerico(e.paradas);
  r.numeros = marcarNumerosIncoerentes(e.paradas);
  r.longe = marcarIsoladas(e.paradas);
  r.noBairro = moverPeloBairro(e.paradas).length;
  // Parada nova não tira ninguém do lugar na sequência: ela entra na conta de "fora da rota",
  // e o segundo lote do dia deixa de custar a rota que o motorista já está fazendo.
  if (e.rota && (r.novas || r.juntas || r.noBairro)) {
    e.rota.desatualizada = true;
    if (r.noBairro) e.rota.mudouMuito = true;
  }
  return {resumo: r, rotaDe};
}

const HERDADA: ReadonlySet<Precisao> = new Set<Precisao>(['confirmado', 'lembrado', 'manual']);

// "Separar" (Pedro e Luan, 26/10): a planilha junta pacotes de clientes diferentes que têm o
// mesmo endereço escrito, e um pino só não serve a uma mercearia e a um condomínio a 1,4 km um do
// outro. Cada pacote vira uma entrega, no mesmo ponto e logo depois dela na sequência, que continua
// de pé. A primeira fica com o id: o pino aberto e o cartão da próxima continuam apontando para ela.
export function separarParada(e: Estado, p: Parada): Parada[] {
  const itens = p.itens;
  if (p.entregue || !itens || itens.length < 2) return [];
  const doItem = (it: ItemDaParada) => ({texto: it.texto, ml: it.ml, stop: it.stop, adicional: it.adicional, pacotes: it.tn ? [it.tn] : [], unidades: null, separada: true});
  const novas = itens.slice(1).map(it => {
    const {itens: _, reclamacoes: __, ...resto} = p;
    return {...resto, id: novoId(), candidatos: [...p.candidatos], ...doItem(it)} as Parada;
  });
  Object.assign(p, doItem(itens[0]));
  delete p.itens;
  for (const q of [p, ...novas]) herdouDaGeral(q, e.cidade);
  e.paradas.splice(e.paradas.indexOf(p) + 1, 0, ...novas);
  for (const ra of e.rota?.areas || []) {
    const i = ra.ordem.indexOf(p.id);
    if (i >= 0) ra.ordem.splice(i + 1, 0, ...novas.map(q => q.id));
  }
  return novas;
}

// A porta confirmada (ou arrumada) que a entrega trazia é a do endereço geral: no "Chico Mendes,
// 67" de 26/10, a da mercearia, que o Pedro marcou para os cinco. Ela não é a porta do condomínio,
// e "verificado" escondia dele o Arrumar e o Entreguei aqui de cada uma. A sem complemento
// continua com a chave geral, e com ela.
function herdouDaGeral(q: Parada, cidade: string) {
  if (!HERDADA.has(q.precisao) || chaveDaParada(q, cidade) === chaveLugar(q.texto, q.bairro, cidade)) return;
  Object.assign(q, {precisaoAntes: q.precisao, precisao: 'vizinha', exibido: 'Na porta geral deste endereço, marcada para outra entrega de mesmo número. Confira na porta'});
}

export function marcarSeparada(q: Parada, cidade: string) {
  q.separada = true;
  herdouDaGeral(q, cidade);
}

// "Precisa ter como separar" (dono, 29/10, com a rota do Pedro): a planilha não junta pacotes de
// complementos diferentes, mas as entregas do mesmo número dividiam a porta. Num número com cinco
// lugares (blocos e ruas projetadas), cada Entreguei aqui levava as outras para lá, e o cartão só
// entregava todas juntas. Separadas, cada uma fica com o seu pino e a porta do seu complemento.
// Quem decide é ele, como no Separar dos pacotes: num prédio, os apartamentos dividem a porta.
export function separarEntregas(e: Estado, ps: Parada[]): Parada[] {
  const abertas = ps.filter(p => !p.entregue);
  const mudam = abertas.filter(p => !p.separada);
  if (abertas.length < 2 || !mudam.length) return [];
  for (const q of mudam) marcarSeparada(q, e.cidade);
  return mudam;
}

// O desfazer do "Separar as entregas", se nenhuma foi entregue: cada uma volta a ser como era.
export function juntarEntregas(mudadas: Parada[], antes: Parada[]): boolean {
  if (mudadas.some(q => q.entregue)) return false;
  mudadas.forEach((q, i) => {
    for (const k of Object.keys(q) as (keyof Parada)[]) delete q[k];
    Object.assign(q, antes[i]);
  });
  return true;
}

// O desfazer do "Separar": volta a ser uma parada só, como estava, se nenhuma foi entregue.
export function juntarDeNovo(e: Estado, p: Parada, antes: Parada, novas: Parada[]): boolean {
  if (p.entregue || novas.some(q => q.entregue)) return false;
  const ids = new Set(novas.map(q => q.id));
  e.paradas = e.paradas.filter(q => !ids.has(q.id));
  for (const ra of e.rota?.areas || []) ra.ordem = ra.ordem.filter(id => !ids.has(id));
  for (const k of Object.keys(p) as (keyof Parada)[]) delete p[k];
  Object.assign(p, antes);
  return true;
}

export function resumoPlanilha(r: ResumoPlanilha): string {
  return `${r.novas} parada(s) da planilha${r.juntas ? `, ${r.juntas} pacote(s) somado(s) a um mesmo endereço` : ''}${r.repetidas ? `, ${r.repetidas} já existia(m)` : ''}.`
    + (r.lembradas ? ` ${r.lembradas} com a posição que você já tinha corrigido.` : '')
    + (r.confirmadas ? ` ${r.confirmadas} com endereço verificado.` : '')
    + (r.sugestoes ? ` ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '')
    + (r.separadas ? ` ${r.separadas} endereço(s) com as entregas separadas pelo complemento, como já tinham sido separadas antes.` : '')
    + (r.xaropes ? ` ${r.xaropes} de cliente xarope: veja o pino antes de entregar.` : '')
    + (r.longe ? ` ${r.longe} com posição longe das outras entregas: ${r.noBairro === r.longe ? 'levada(s) para o bairro certo, confira no local.' : r.noBairro ? `${r.noBairro} levada(s) para o bairro certo, confira o pino das outras.` : 'confira o pino antes de sair.'}` : '')
    + (r.aproximadas ? ` ${r.aproximadas} com posição aproximada na planilha: confira o pino.` : '')
    + (r.numeros ? ` ${r.numeros} com número que não bate com a posição: confira.` : '')
    + (r.censo ? ` ${r.censo} levada(s) para a porta do censo do IBGE, longe de onde a planilha punha: confira na porta.` : '')
    + (r.foraDoCep ? ` ${r.foraDoCep} estava(m) longe das portas do próprio CEP: levada(s) para a porta do censo do IBGE, confira.` : '')
    + (r.genericas ? ` ${r.genericas} com um ponto que a planilha repete para bairros diferentes: ${(r.genericasNoLugar || 0) === r.genericas ? 'levada(s) para a porta do censo ou para o bairro, confira no local.' : `${r.genericasNoLugar || 0} levada(s) para a porta do censo ou para o bairro, confira o pino das outras.`}` : '')
    + (r.semPosicao ? ` ${r.semPosicao} sem posição, buscando no mapa…` : '');
}

// `doLeitor`: as linhas que a leitura de print ou vídeo trouxe (podem estar também em `linhas`).
export function adicionarLinhas(e: Estado, linhas: string[], doLeitor: string[] = []): {novas: number; repetidas: number; arrumadas: number; coladas: Parada[]} {
  const porNumero = new Map(e.paradas.filter(x => x.ml).map(x => [x.ml!, chaveEndereco(x.texto).split('|').slice(0, 2).join('|')]));
  const soRuaNumero = (x: string) => chaveEndereco(x).split('|').slice(0, 2).join('|');
  let novas = 0, repetidas = 0, arrumadas = 0;
  const coladas: Parada[] = [];
  // Cartões iguais na mesma porta são entregas diferentes, e o leitor devolve um por cartão: a linha
  // que a leitura viu N vezes vira até N paradas. Colado ou digitado duas vezes é engano, e continua
  // uma parada só (decisão de 15/10). Já ter na rota conta: ler a mesma gravação de novo não
  // acrescenta nada.
  const chaveDaLinha = (l: string) => chaveEndereco(analisarLinha(coordenadaNoTexto(l) ? semLink(l) : l).texto);
  const naRota = new Map<string, number>(), nestas = new Map<string, number>(), lidas = new Map<string, number>();
  for (const x of e.paradas) { const k = chaveEndereco(x.texto); naRota.set(k, (naRota.get(k) || 0) + 1); }
  for (const l of doLeitor) { const k = chaveDaLinha(l); lidas.set(k, (lidas.get(k) || 0) + 1); }
  for (const l of linhas) {
    // Endereço colado junto com um link do mapa: a coordenada é a resposta, não um palpite a
    // conferir. O censo não tem a porta de toda rua, e o dono às vezes chega com ela na mão.
    const coord = coordenadaNoTexto(l);
    const {ml, texto, unidades, comercial} = analisarLinha(coord ? semLink(l) : l);
    if (!texto) continue;
    const chave = chaveEndereco(texto);
    const semComplemento = chave.split('|').slice(0, 2).join('|');
    // Colar a porta de uma parada que já está na lista é conserto, não parada nova. O título que o
    // Google copia vem com CEP e a linha lida do cartão fechado do Meli não vem, então a chave
    // inteira não bate — o que bate é a rua e o número. Sem isto, colar as cinco portas de uma
    // avenida criava cinco paradas a mais em vez de arrumar as cinco que já estavam lá.
    if (coord && semComplemento.replace(/\|/g, '')) {
      const mesmas = e.paradas.filter(x => !x.entregue && soRuaNumero(x.texto) === semComplemento);
      if (mesmas.length) {
        for (const x of mesmas) {
          Object.assign(x, {lat: coord.lat, lng: coord.lng, precisao: 'manual',
            fonte: 'link do mapa', exibido: 'Local que você colou do mapa', candidatos: []});
          delete x.sugestao;
          coladas.push(x);
        }
        arrumadas += mesmas.length;
        continue;
      }
    }
    if (ml && porNumero.get(ml) === semComplemento) { repetidas++; continue; }
    const vez = (nestas.get(chave) || 0) + 1;
    nestas.set(chave, vez);
    if (vez > Math.max(1, lidas.get(chave) || 0) || vez <= (naRota.get(chave) || 0)) { repetidas++; continue; }
    if (ml) porNumero.set(ml, semComplemento);
    const p: Parada = {id: novoId(), area: e.areaAtual, ml, texto, unidades, comercial,
      lat: coord ? coord.lat : null, lng: coord ? coord.lng : null,
      exibido: coord ? 'Local que você colou do mapa' : '',
      precisao: coord ? 'manual' : 'pendente', fonte: coord ? 'link do mapa' : undefined,
      candidatos: [], entregue: false};
    e.paradas.push(p);
    if (coord) coladas.push(p);
    novas++;
  }
  if (novas || arrumadas) { marcarIsoladas(e.paradas); if (e.rota) e.rota.desatualizada = true; }
  return {novas, repetidas, arrumadas, coladas};
}

import {haversine} from './geo';
import {blocos, matrizAproximada, otimizar, type Matriz} from './otimizacao';
import type {Estado, Local, Parada, Perna, Ponto, Rota, RotaArea} from './tipos';

// Entregou fora da ordem, e o resto da área volta a ser ordenado a partir dali (dono, 15/11, na
// rota: "a rota não se adapta quando faço um pino diferente"). O cartão da próxima apontava para
// a parada pulada, já para trás dele. Não precisa de rede: os tempos entre as visitas vieram do
// serviço de ruas quando a rota foi montada e ficaram guardados, e a ordem é calculada aqui.
// Seguindo a ordem, nada muda: a lista não fica pulando a cada entrega.

// Pino que andou mais que isto desde a montagem já não é o ponto que o serviço mediu, e a ordem a
// partir dele seria chute. Nesse caso fica como antes: "Refazer a rota", com rede.
export const ANDOU_DEMAIS = 100;
// A conta roda no toque do Entreguei: mais que isto e o botão parece travado.
export const TEMPO_DA_CONTA = 300;

export interface Reorganizada {
  rota: Rota;
  // as pernas das paradas que faltam, na ordem nova
  pernas: Record<string, Perna>;
  area: string;
  // da entrega feita até o fim da área: o caminho da linha nova, para pedir quando houver rede
  pontos: Ponto[];
}

// Chamada antes de `feita` ser marcada como entregue: é o momento em que dá para saber se ela era
// a do cartão.
export function reorganizarDaqui(e: Estado, feita: Parada, tempoMs = TEMPO_DA_CONTA): Reorganizada | null {
  const R = e.rota;
  if (!R || R.ordemDoApp || e.ordemDoApp) return null;
  const k = R.areas.findIndex(ra => ra.ordem.includes(feita.id));
  if (k < 0) return null;
  const ra = R.areas[k], t = ra.tempos;
  if (!t) return null;
  const parada = (id: string) => e.paradas.find(p => p.id === id);
  const falta = (id: string) => id !== feita.id && !parada(id)?.entregue;

  // Na ordem é a do primeiro bloco com alguma por fazer: o mesmo que o cartão da próxima mostra.
  const bs = blocos(ra.ordem, parada);
  const doCartao = bs.find(b => b.some(id => !parada(id)?.entregue));
  if (!doCartao || doCartao.includes(feita.id)) return null;

  const visitaDe = new Map<string, number>();
  t.visitas.forEach((v, i) => v.ids.forEach(id => visitaDe.set(id, i)));
  // Separada depois de montar: entrou na ordem logo depois da original, e segue com ela.
  let anterior = -1;
  const daOrdem = ra.ordem.map(id => { anterior = visitaDe.get(id) ?? anterior; return {id, v: anterior}; });
  if (daOrdem.some(x => x.v < 0)) return null;

  const vf = daOrdem.find(x => x.id === feita.id)!.v;
  const pendentes: number[] = [];
  for (const x of daOrdem) if (falta(x.id) && x.v !== vf && !pendentes.includes(x.v)) pendentes.push(x.v);
  if (!pendentes.length) return null;

  const andou = (id: string, v: number) => {
    const p = parada(id);
    return !p || p.lat == null || p.lng == null || haversine(p as Ponto, t.visitas[v]) > ANDOU_DEMAIS;
  };
  if (andou(feita.id, vf) || daOrdem.some(x => falta(x.id) && andou(x.id, x.v))) return null;
  if (t.fim && (!e.fim || haversine(e.fim, t.fim) > ANDOU_DEMAIS)) return null;

  const pontosDaMatriz: Ponto[] = [...t.visitas, ...(t.fim ? [t.fim] : [])];
  const M: {dur: Matriz; dist: Matriz} = t.dur && t.dist ? {dur: t.dur, dist: t.dist} : matrizAproximada(pontosDaMatriz);
  const FIM = t.visitas.length;
  const idx = [vf, ...pendentes, ...(t.fim ? [FIM] : [])];
  const seq = otimizar(idx.length, idx.map(i => idx.map(j => M.dur[i][j])), true, !!t.fim, tempoMs).map(i => idx[i]);
  const novas = seq.filter(v => v !== vf && v !== FIM);
  if (novas.every((v, i) => v === pendentes[i])) return null;

  const idsDa = (v: number) => daOrdem.filter(x => x.v === v).map(x => x.id);
  const prontas = daOrdem.filter(x => x.v !== vf && !pendentes.includes(x.v)).map(x => x.id);
  const ordem = [...prontas, ...idsDa(vf), ...novas.flatMap(idsDa)];

  // A perna de cada visita fica na primeira que falta dela; as outras, no mesmo ponto, são zero.
  const pernas: Record<string, Perna> = {};
  for (const id of idsDa(vf)) if (falta(id)) pernas[id] = {dur: 0, dist: 0};
  let fim: Perna | undefined;
  for (let q = 1; q < seq.length; q++) {
    const perna = {dur: M.dur[seq[q - 1]][seq[q]], dist: M.dist[seq[q - 1]][seq[q]]};
    if (seq[q] === FIM) { fim = perna; continue; }
    idsDa(seq[q]).filter(falta).forEach((id, i) => { pernas[id] = i ? {dur: 0, dist: 0} : perna; });
  }

  // O total passa a ser o que já foi feito na ordem velha mais o que falta na nova.
  const soma = (ps: Record<string, Perna>, campo: keyof Perna) =>
    daOrdem.filter(x => falta(x.id)).reduce((s, x) => s + (ps[x.id]?.[campo] || 0), 0);
  const area = (campo: keyof Perna) => soma(pernas, campo) - soma(e.pernas, campo);
  const doFim = (campo: keyof Perna) => t.fim ? (fim?.[campo] || 0) - (R.fim?.[campo] || 0) : 0;
  const nova: RotaArea = {...ra, ordem, linha: null, dur: ra.dur + area('dur'), dist: ra.dist + area('dist')};
  const rota: Rota = {
    ...R,
    areas: R.areas.map((x, i) => i === k ? nova : x),
    dur: R.dur + area('dur') + doFim('dur'),
    dist: R.dist + area('dist') + doFim('dist'),
    ...(t.fim ? {fim} : {}),
  };
  return {rota, pernas, area: ra.id, pontos: seq.map(v => ({lat: pontosDaMatriz[v].lat, lng: pontosDaMatriz[v].lng}))};
}

// Um pino do que falta andou mais que ANDOU_DEMAIS desde a montagem (dono, 15/11: "quando mudamos
// pinos, ela reage?"). A ordem foi feita com o ponto velho, e a da entrega fora da ordem não roda
// mais. No histórico, em 26 de 111 dias de rota um pino de parada por entregar andou mais de 100 m
// pelo menos 10 min antes da entrega dela. Refazer pede rede: quando, quem decide é acoes/rota.ts.
export function andouDemais(e: Estado): boolean {
  const R = e.rota;
  if (!R || R.ordemDoApp || e.ordemDoApp) return false;
  for (const ra of R.areas) {
    const t = ra.tempos;
    if (!t) continue;
    const visita = new Map(t.visitas.flatMap(v => v.ids.map(id => [id, v] as const)));
    for (const id of ra.ordem) {
      const p = e.paradas.find(x => x.id === id), v = visita.get(id);
      if (!p || !v || p.entregue || p.adiada || p.lat == null || p.lng == null) continue;
      if (haversine(p as Ponto, v) > ANDOU_DEMAIS) return true;
    }
  }
  return false;
}

// De onde sai a rota refeita no caminho: de onde ele está, se o GPS é de agora e bom; senão, da
// última entrega. A saída da manhã faria a rota do meio do dia começar do outro lado da cidade.
export const GPS_DE_AGORA = 120_000;
export const GPS_QUE_SERVE = 100;
export function pontoDePartida(e: Estado, eu: {lat: number; lng: number; precisao: number; quando: number} | null, agora: number): Local | null {
  if (eu && agora - eu.quando <= GPS_DE_AGORA && eu.precisao <= GPS_QUE_SERVE)
    return {id: 'inicio', lat: eu.lat, lng: eu.lng, exibido: `Minha localização (±${Math.round(eu.precisao)} m)`};
  const ultima = e.paradas.filter(p => p.entregue && p.entregueEm && p.lat != null && p.lng != null)
    .sort((a, b) => b.entregueEm! - a.entregueEm!)[0];
  if (ultima) return {id: 'inicio', lat: ultima.lat!, lng: ultima.lng!, exibido: 'Onde foi a última entrega'};
  return e.inicio;
}

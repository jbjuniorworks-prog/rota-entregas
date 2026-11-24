import {haversine} from './geo';

// Teste do caminho (dono, 24/11): gravar o caminho gasta muita bateria? Com a Rota aberta, o GPS já
// fica ligado (seguirMinhaPosicao), então gravar só guarda o que ele já lê. O que o teste mede de
// verdade é quanto do dia o caminho cobre, e onde ficam os buracos: com o app escondido (Waze, tela
// apagada), fora da Rota, ou na Rota sem leitura. E a bateria por hora, gravando e sem gravar.
// Tudo fica no celular.

export interface PontoDoCaminho {
  t: number;
  lat: number;
  lng: number;
  prec: number;
}

// 'escondido'/'visivel': o app saiu da tela ou voltou. 'rota'/'fora': o GPS do app ligou ou
// desligou, porque ele só fica ligado na Rota.
export interface MarcaDoCaminho {
  t: number;
  tipo: 'escondido' | 'visivel' | 'rota' | 'fora';
}

export interface LeituraDaBateria {
  t: number;
  nivel: number;
  carregando: boolean;
  gravando: boolean;
}

// Um ponto a cada 10 s andando, ou a cada minuto parado: o minuto é o que separa "parado, com o GPS
// lendo" de "buraco".
export const INTERVALO = 10_000, DISTANCIA = 15, BATIDA = 60_000;
// Sem ponto por mais que isto, é buraco. Com a batida de 1 minuto, 2 minutos sem nada é o GPS calado.
export const BURACO = 120_000;

export function devoAnotar(ultimo: PontoDoCaminho | undefined, novo: PontoDoCaminho): boolean {
  if (!ultimo) return true;
  const dt = novo.t - ultimo.t;
  if (dt >= BATIDA) return true;
  return dt >= INTERVALO && haversine(ultimo, novo) >= DISTANCIA;
}

export interface Buracos {
  vezes: number;
  ms: number;
  maior: number;
}

export interface ResumoDoCaminho {
  pontos: number;
  de: number;
  ate: number;
  cobertura: number;
  escondido: Buracos;
  fora: Buracos;
  naRota: Buracos;
  // Pontos gravados com o app escondido. É a prova do que o navegador faz: se manda o GPS com o
  // Waze por cima, isto passa de zero.
  pontosEscondido: number;
  tempoEscondido: number;
}

// Em que estado o app estava em `t`, pela última marca de cada tipo até ali. Antes de qualquer
// marca, na tela e na Rota: o teste começa na tela do teste e o GPS liga ao voltar para a Rota.
function estadoEm(marcas: MarcaDoCaminho[], t: number) {
  let escondido = false, fora = false;
  for (const m of marcas) {
    if (m.t > t) break;
    if (m.tipo === 'escondido') escondido = true;
    else if (m.tipo === 'visivel') escondido = false;
    else if (m.tipo === 'fora') fora = true;
    else fora = false;
  }
  return {escondido, fora};
}

// O tempo com o app escondido entre `de` e `ate`.
function escondidoEntre(marcas: MarcaDoCaminho[], de: number, ate: number): number {
  let t = de, escondido = estadoEm(marcas, de).escondido, soma = 0;
  for (const m of marcas) {
    if (m.t <= de || (m.tipo !== 'escondido' && m.tipo !== 'visivel')) continue;
    if (m.t >= ate) break;
    if (escondido) soma += m.t - t;
    t = m.t;
    escondido = m.tipo === 'escondido';
  }
  if (escondido) soma += ate - t;
  return soma;
}

const nenhum = (): Buracos => ({vezes: 0, ms: 0, maior: 0});

export function resumirCaminho(pontos: PontoDoCaminho[], marcas: MarcaDoCaminho[]): ResumoDoCaminho | null {
  if (!pontos.length) return null;
  const ps = [...pontos].sort((a, b) => a.t - b.t), ms = [...marcas].sort((a, b) => a.t - b.t);
  const r: ResumoDoCaminho = {
    pontos: ps.length, de: ps[0].t, ate: ps[ps.length - 1].t, cobertura: 1,
    escondido: nenhum(), fora: nenhum(), naRota: nenhum(), pontosEscondido: 0,
    tempoEscondido: escondidoEntre(ms, ps[0].t, ps[ps.length - 1].t),
  };
  for (const p of ps) if (estadoEm(ms, p.t).escondido) r.pontosEscondido++;
  let buraco = 0;
  for (let i = 1; i < ps.length; i++) {
    const de = ps[i - 1].t, ate = ps[i].t, dt = ate - de;
    if (dt <= BURACO) continue;
    // escondido vence: com o Waze por cima, estar ou não na Rota não muda nada
    const noMeio = ms.filter(m => m.t > de && m.t < ate);
    const antes = estadoEm(ms, de);
    const tipo = antes.escondido || noMeio.some(m => m.tipo === 'escondido') ? 'escondido'
      : antes.fora || noMeio.some(m => m.tipo === 'fora') ? 'fora' : 'naRota';
    const b = r[tipo];
    b.vezes++;
    b.ms += dt;
    b.maior = Math.max(b.maior, dt);
    buraco += dt;
  }
  const total = r.ate - r.de;
  r.cobertura = total > 0 ? 1 - buraco / total : 1;
  return r;
}

export interface Gasto {
  porHora: number | null;
  minutos: number;
}

// Leituras a 5 minutos uma da outra: um par mais longe que isto teve o app fechado no meio.
export const PAR_MAX = 15 * 60000;
// Menos que meia hora de app aberto, a bateria anda de 1 em 1% e a conta não diz nada.
export const MINIMO = 30;

// Quanto a bateria cai por hora com o app aberto, gravando e sem gravar. Só conta o par de leituras
// seguidas sem carregar, sem o app escondido no meio, e sem a bateria subindo.
export function gastoDaBateria(leituras: LeituraDaBateria[], marcas: MarcaDoCaminho[]): {gravando: Gasto; semGravar: Gasto} {
  const ls = [...leituras].sort((a, b) => a.t - b.t), ms = [...marcas].sort((a, b) => a.t - b.t);
  const soma = {gravando: {caiu: 0, ms: 0}, semGravar: {caiu: 0, ms: 0}};
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    if (a.carregando || b.carregando || b.t - a.t > PAR_MAX || b.nivel > a.nivel) continue;
    if (escondidoEntre(ms, a.t, b.t) > 0) continue;
    const s = a.gravando ? soma.gravando : soma.semGravar;
    s.caiu += a.nivel - b.nivel;
    s.ms += b.t - a.t;
  }
  const gasto = (s: {caiu: number; ms: number}): Gasto => {
    const minutos = Math.round(s.ms / 60000);
    return {minutos, porHora: minutos >= MINIMO ? Math.round(s.caiu / (s.ms / 3600e3) * 10) / 10 : null};
  };
  return {gravando: gasto(soma.gravando), semGravar: gasto(soma.semGravar)};
}

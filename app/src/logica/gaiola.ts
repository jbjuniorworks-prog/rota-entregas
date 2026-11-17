import type {Parada} from './tipos';

// "Um aviso em vermelho avisando que 3 pacotes não estão na sua gaiola" (dono, 16/11). O pacote
// que vem na planilha da rota sem número de parada não estava na gaiola do motorista: em 16/11, os
// 6 sem número da rota do dono e os 6 da do Pedro eram exatamente os que faltavam na gaiola de cada
// um (pelo romaneio do galpão), e estavam em gaiolas a até 16 km dali. No histórico, 152 das 193
// rotas de planilha tinham até 10% de pacotes assim.

// Mais que esta parte sem número, a planilha é que veio sem sequência: no histórico, 9 rotas vieram
// com todos os pacotes sem número, e nenhuma ficou entre 30% e 90%.
export const PLANILHA_SEM_SEQUENCIA = 0.3;

export interface ForaDaGaiola {
  tn: string;
  parada: string;
  texto: string;
  bairro: string;
}

interface Linha {
  tn: string | null;
  texto: string;
  ml: string | null;
  stop: string | null;
}

// Cada pacote da parada, com o número que a planilha deu a ele. A parada de um pacote só não
// guarda a lista: o número é o dela.
const pacotesDa = (p: Parada): Linha[] => p.itens?.length
  ? p.itens
  : (p.pacotes?.length ? p.pacotes : [null]).map(tn => ({tn, texto: p.texto, ml: p.ml, stop: p.stop ?? null}));

export function foraDaGaiola(paradas: Parada[]): ForaDaGaiola[] {
  // por planilha: a segunda do dia, sem sequência, não faz os pacotes da primeira parecerem de fora
  const porRota = new Map<string, {p: Parada; l: Linha}[]>();
  for (const p of paradas) for (const l of pacotesDa(p)) {
    if (!l.tn) continue;
    const k = p.rota || '';
    porRota.set(k, [...(porRota.get(k) || []), {p, l}]);
  }
  const saida: ForaDaGaiola[] = [];
  for (const linhas of porRota.values()) {
    const sem = linhas.filter(({l}) => !l.ml && !l.stop);
    if (sem.length / linhas.length > PLANILHA_SEM_SEQUENCIA) continue;
    for (const {p, l} of sem) if (!p.entregue) saida.push({tn: l.tn!, parada: p.id, texto: l.texto, bairro: p.bairro || ''});
  }
  return saida;
}

// O que ainda falta ele dizer que pegou: o "Já peguei" vale para os pacotes que estavam no aviso, e
// o pacote sem número de uma planilha lida depois volta a avisar.
export const naoVistos = (fora: ForaDaGaiola[], vistos: string[] | undefined) => {
  const ja = new Set(vistos || []);
  return fora.filter(f => !ja.has(f.tn));
};

export const avisoDaGaiola = (n: number) => n === 1 ? '1 pacote não está na sua gaiola.' : `${n} pacotes não estão na sua gaiola.`;

export function textoDaGaiola(fora: ForaDaGaiola[]): string {
  return [avisoDaGaiola(fora.length).replace('sua gaiola', 'minha gaiola') + ' Vieram na rota sem número de parada:',
    ...fora.map(f => `${f.tn}${f.bairro ? ' · ' + f.bairro : ''}`)].join('\n');
}

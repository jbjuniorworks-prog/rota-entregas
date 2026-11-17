import {hojeEmMaceio} from './painel';
import type {Estado} from './tipos';

// "Finalizei a última entrega, o app fica nisso mesmo, não finaliza nada; aí temos que resetar a
// rota?" (dono, 16/11). A rota do celular não tinha data, e o dia seguinte começava com a de ontem
// até alguém resetar pelo Mais; a planilha nova lida por cima somava com ela.

// O dia da rota: o da última leitura de endereços ou da última entrega, o que for mais novo. A rota
// guardada antes desta versão não tem a leitura, e fica com o dia da última entrega.
export function diaDaRota(e: Estado): string | null {
  const entregas = e.paradas.map(p => p.entregueEm).filter((t): t is number => typeof t === 'number');
  const daEntrega = entregas.length ? hojeEmMaceio(Math.max(...entregas)) : null;
  return [e.dia, daEntrega].filter((d): d is string => !!d).sort().pop() ?? null;
}

export type Virada =
  | {acao: 'nada'}
  // ontem acabou: o app abre limpo, com Desfazer
  | {acao: 'limpar'; dia: string}
  // ontem ficou entrega por fazer: ele decide, sabendo quantas
  | {acao: 'perguntar'; dia: string; pendentes: number};

export function oQueFazerNoDiaNovo(e: Estado, agora = Date.now()): Virada {
  if (!e.paradas.length) return {acao: 'nada'};
  const dia = diaDaRota(e);
  // sem data nenhuma (sem leitura gravada e sem entrega), não dá para dizer que é de ontem
  if (!dia || dia >= hojeEmMaceio(agora)) return {acao: 'nada'};
  const pendentes = e.paradas.filter(p => !p.entregue).length;
  return pendentes ? {acao: 'perguntar', dia, pendentes} : {acao: 'limpar', dia};
}

// "16/11", como o motorista fala do dia
export const diaCurto = (dia: string) => dia.slice(8, 10) + '/' + dia.slice(5, 7);

export function resumoDoDia(e: Estado): {entregas: number; de: number | null; ate: number | null} {
  const feitas = e.paradas.filter(p => p.entregue);
  const horas = feitas.map(p => p.entregueEm).filter((t): t is number => typeof t === 'number');
  return {entregas: feitas.length, de: horas.length ? Math.min(...horas) : null, ate: horas.length ? Math.max(...horas) : null};
}

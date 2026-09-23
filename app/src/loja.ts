import {useSyncExternalStore} from 'react';
import {CHAVES, carregarEstado, guardaEm, salvarEstado} from './logica/guarda';
import type {Estado, Parada} from './logica/tipos';

export type Aba = 'enderecos' | 'conferir' | 'rota' | 'admin';
export type TamanhoDoMapa = 'fechado' | 'normal' | 'grande';

export interface Marca {
  lat: number;
  lng: number;
  rotulo: string;
  texto: string;
  cor: string;
}

export interface Ui {
  aba: Aba;
  posicionando: string | null;
  selecionada: string | null;
  soDuvidas: boolean;
  ocupado: boolean;
  // o tamanho do mapa é decisão por aba: em Endereços ele não tem o que mostrar enquanto se
  // digita, em Conferir ele é o trabalho, e em Rota o cartão da próxima entrega vem antes.
  mapa: Partial<Record<Aba, TamanhoDoMapa>>;
  aviso: string;
  enquadrar: number;
  focar: {id: string; vez: number} | null;
  desfazer: (() => void) | null;
  marcas: {pontos: Marca[]; vez: number} | null;
}

export const guarda = guardaEm(localStorage);
let estado = carregarEstado(guarda);
const ui: Ui = {
  aba: estado.paradas.length ? (estado.rota ? 'rota' : 'conferir') : 'enderecos',
  posicionando: null, selecionada: null, soDuvidas: false, ocupado: false, mapa: guarda.ler(CHAVES.mapa, {}), aviso: '', enquadrar: 1, focar: null, desfazer: null, marcas: null,
};

let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = () => { versao++; ouvintes.forEach(f => f()); };

let indice: {lista: Parada[]; quantas: number; onde: Map<string, Parada>} | null = null;

export const loja = {
  get e(): Estado { return estado; },
  ui,
  mudou(salvar = true) {
    if (salvar) salvarEstado(guarda, estado);
    avisar();
  },
  trocarEstado(novo: Estado) {
    estado = novo;
    salvarEstado(guarda, estado);
    avisar();
  },
  parada: (id: string): Parada | undefined => {
    if (!indice || indice.lista !== estado.paradas || indice.quantas !== estado.paradas.length) {
      indice = {lista: estado.paradas, quantas: estado.paradas.length, onde: new Map(estado.paradas.map(p => [p.id, p]))};
    }
    return indice.onde.get(id);
  },
  area: (id: string) => estado.areas.find(a => a.id === id) || estado.areas[0],
};

let temporizador: ReturnType<typeof setTimeout> | undefined;
export function status(msg: string, ms?: number, desfazer: (() => void) | null = null) {
  ui.aviso = msg;
  ui.desfazer = desfazer;
  clearTimeout(temporizador);
  if (msg && ms) temporizador = setTimeout(() => { if (ui.aviso === msg) { ui.aviso = ''; ui.desfazer = null; avisar(); } }, ms);
  avisar();
}

export function useLoja() {
  useSyncExternalStore(f => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return {e: estado, ui};
}

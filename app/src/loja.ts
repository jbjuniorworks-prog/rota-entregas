import {useSyncExternalStore} from 'react';
import {carregarEstado, guardaEm, salvarEstado} from './logica/guarda';
import type {PosicaoCompartilhada} from './logica/compartilhadas';
import type {Grupo} from './logica/grupos';
import type {NomeNoMapa} from './logica/nomesNoMapa';
import type {Estado, Parada} from './logica/tipos';

// Uma tela por vez, e o mapa só nas que trabalham nele: a Rota e o Admin.
export type Tela = 'inicio' | 'rota' | 'conferir' | 'saida' | 'areas' | 'admin';

export interface Marca {
  lat: number;
  lng: number;
  rotulo: string;
  texto: string;
  cor: string;
}

export interface Ui {
  tela: Tela;
  // o cartão de baixo da Rota: a próxima entrega, a lista inteira puxada para cima, a escolha
  // dos pinos para o Maps, ou os grupos circulados no mapa
  folha: 'proxima' | 'lista' | 'escolher' | 'circular';
  // os pinos escolhidos para o Maps, na ordem dos toques (uma entrega de cada pino)
  escolhidas: string[];
  // os grupos circulados, na ordem do dedo: só viram áreas quando ele manda montar a rota
  grupos: Grupo[];
  // as entregas do pino que ele tocou no mapa: o cartão de baixo passa a ser delas
  pino: string[] | null;
  // o menu Mais aberto por cima da tela
  menu: boolean;
  posicionando: string | null;
  // o toque no mapa do Admin armado para gravar a porta de um endereço como quem administra; quem
  // grava é a tela do Admin, que sabe a chave
  marcandoLugar: {endereco: string; gravar: (lat: number, lng: number) => Promise<void>} | null;
  // a localização que chegou pelo Compartilhar (a do cliente, pelo WhatsApp), esperando ele dizer de qual entrega é
  localRecebido: {lat: number; lng: number} | null;
  selecionada: string | null;
  soDuvidas: boolean;
  ocupado: boolean;
  aviso: string;
  enquadrar: number;
  focar: {id: string; vez: number} | null;
  desfazer: (() => void) | null;
  marcas: {pontos: Marca[]; vez: number} | null;
  // Onde o motorista está, e para onde está apontado. O mapa mostrava os pinos e não mostrava
  // ele: sem se ver no meio deles não dá para saber para que lado sair da esquina.
  euAqui: {lat: number; lng: number; precisao: number; rumo: number | null; quando: number} | null;
  irParaMim: number;
  // o mapa da Rota anda junto com ele, com ele no meio (pedidos de 02/10 e 03/10: "todas as
  // respostas são onde você está"). Arrastar o mapa desliga; a mira liga de novo.
  seguindo: boolean;
  // quantas marcações esperam decisão de quem administra: o número no botão Mais e no Admin
  esperandoAdmin: number;
  // a entrega com a escolha de "cliente xarope" aberta
  xarope: string | null;
  // versão publicada mais nova que a que está rodando, com rota andando: a barra de atualizar
  versaoNova: {id: string; quando: string} | null;
  // portas verificadas na nuvem depois da rota montada, que levariam pinos para outro lugar: a
  // barra de atualizar os pinos
  pinosNovos: {resultados: PosicaoCompartilhada[]; entregas: number} | null;
  // o nome das ruas do dia onde o mapa mostra outro ou nenhum, e os trechos que ele não desenha
  nomesNoMapa: NomeNoMapa[];
  // o Chrome avisou que dá para instalar, e ele não pediu para deixar para depois
  podeInstalar: boolean;
  // o cartão da próxima reduzido a uma linha, e o mapa com quase a tela toda (pedido de 03/10)
  minimizado: boolean;
}

// Fica escolhido neste celular: o Android fecha o app quando ele vai para o Waze, e minimizar de
// novo a cada volta seria o mesmo incômodo de antes.
export const MINIMIZADO = 'rota-entregas-cartao-minimizado';
const lerMinimizado = () => { try { return localStorage.getItem(MINIMIZADO) === '1'; } catch { return false; } };

export const guarda = guardaEm(localStorage);
let estado = carregarEstado(guarda);
const ui: Ui = {
  tela: estado.paradas.length ? 'rota' : 'inicio', folha: 'proxima', escolhidas: [], grupos: [], pino: null, menu: false,
  // a Conferir que se abre pelo aviso do mapa é a das paradas que precisam dele
  posicionando: null, marcandoLugar: null, localRecebido: null, selecionada: null, soDuvidas: true, ocupado: false, aviso: '', enquadrar: 1, focar: null, desfazer: null, marcas: null,
  euAqui: null, irParaMim: 0, seguindo: true, esperandoAdmin: 0, xarope: null, versaoNova: null, pinosNovos: null, nomesNoMapa: [], podeInstalar: false,
  minimizado: lerMinimizado(),
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

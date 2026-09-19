import {CHAVES, type Guarda} from './guarda';
import {chaveLugar} from './texto';
import type {Parada} from './tipos';

interface Lembrada {
  lat: number;
  lng: number;
  quando: number;
}

export function criarMemoria(g: Guarda, cidade: () => string, aoGuardar: (chave: string, lat: number, lng: number) => void = () => {}) {
  const todas = () => g.ler<Record<string, Lembrada>>(CHAVES.memoria, {});
  const chave = (p: Parada) => chaveLugar(p.texto, p.bairro, cidade());
  return {
    quantas: () => Object.keys(todas()).length,
    esquecer: () => g.gravar(CHAVES.memoria, {}),
    lembrar(p: Parada, agora = Date.now()): boolean {
      const k = chave(p);
      if (!k || p.lat == null || p.lng == null) return false;
      const m = todas();
      m[k] = {lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), quando: agora};
      aoGuardar(k, m[k].lat, m[k].lng);
      return g.gravar(CHAVES.memoria, m);
    },
    fotografar(p: Parada): {chave: string; valor: Lembrada | undefined} | null {
      const k = chave(p);
      return k ? {chave: k, valor: todas()[k]} : null;
    },
    restaurar(foto: {chave: string; valor: Lembrada | undefined}) {
      const m = todas();
      if (foto.valor) m[foto.chave] = foto.valor;
      else delete m[foto.chave];
      g.gravar(CHAVES.memoria, m);
    },
    aplicar(p: Parada): boolean {
      const k = chave(p), r = k ? todas()[k] : undefined;
      if (!r) return false;
      const dia = new Date(r.quando).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
      Object.assign(p, {lat: r.lat, lng: r.lng, precisao: 'lembrado', exibido: `Posição que você corrigiu em ${dia}`});
      return true;
    },
  };
}

export type Memoria = ReturnType<typeof criarMemoria>;

export const avisoGuardou = (guardou: boolean) =>
  guardou ? ' e guardado para as próximas rotas.' : '. Sem CEP nem bairro, não deu para guardar para as próximas rotas.';

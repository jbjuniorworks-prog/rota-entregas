import {CHAVES, type Guarda} from './guarda';
import {chaveLugar, chavePorta} from './texto';
import type {Parada} from './tipos';

interface Lembrada {
  lat: number;
  lng: number;
  quando: number;
  // Rua e número, guardados junto para achar a porta quando a chave de hoje sai diferente da de
  // ontem. Falta nas marcações antigas, e aí só a chave exata vale — como era antes.
  porta?: string;
}

export function criarMemoria(g: Guarda, cidade: () => string, aoGuardar: (chave: string, lat: number, lng: number) => void = () => {}) {
  const todas = () => g.ler<Record<string, Lembrada>>(CHAVES.memoria, {});
  const chave = (p: Parada) => chaveLugar(p.texto, p.bairro, cidade());
  return {
    quantas: () => Object.keys(todas()).length,
    esquecer: () => g.gravar(CHAVES.memoria, {}),
    lembrar(p: Parada, agora = Date.now(), compartilhar = true): boolean {
      const k = chave(p);
      if (!k || p.lat == null || p.lng == null) return false;
      const m = todas();
      m[k] = {lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), quando: agora, porta: chavePorta(p.texto) || undefined};
      if (compartilhar) aoGuardar(k, m[k].lat, m[k].lng);
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
      const m = todas(), k = chave(p);
      let r = k ? m[k] : undefined;
      // A chave de hoje pode não ser a de ontem para a mesma porta: o CEP some quando o cartão do
      // Meli está fechado, e o bairro vem da busca, que pode responder outro — inclusive da nossa
      // base de ruas, que escolhe o trecho mais perto do meio da rota do dia. Então, sem acerto
      // exato, procura pela rua e pelo número. Só vale se houver UMA só: duas marcações com a
      // mesma rua e número são portas diferentes em bairros diferentes, e aí não dá para escolher.
      if (!r) {
        const porta = chavePorta(p.texto);
        const iguais = porta ? Object.values(m).filter(x => x.porta === porta) : [];
        if (iguais.length === 1) r = iguais[0];
      }
      if (!r) return false;
      const dia = new Date(r.quando).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
      Object.assign(p, {lat: r.lat, lng: r.lng, precisao: 'lembrado', fonte: 'memoria do aparelho',
        exibido: `Posição que você corrigiu em ${dia}`});
      return true;
    },
  };
}

export type Memoria = ReturnType<typeof criarMemoria>;

export const avisoGuardou = (guardou: boolean) =>
  guardou ? ' e guardado para as próximas rotas.' : '. Sem CEP nem bairro, não deu para guardar para as próximas rotas.';

import {CHAVES, type Guarda} from './guarda';
import type {ItemPlanilha} from './planilha';
import type {PosicaoCompartilhada} from './compartilhadas';
import {chaveLugar} from './texto';
import type {LinhaDeUso} from './uso';

export interface PacoteNuvem {
  spx_tn: string | null;
  sequencia: number | null;
  parada: number | null;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  chave_lugar: string | null;
}

export type Operacao =
  | {tipo: 'rota'; chave: string; at_id: string | null; arquivo: string; pacotes: PacoteNuvem[]}
  | {tipo: 'entregue'; rota: string; tns: string[]; quando: string | null}
  | {tipo: 'correcao'; chave: string; lat: number; lng: number}
  | {tipo: 'desfazerCorrecao'; chave: string; lat: number; lng: number}
  | {tipo: 'observacao'; chave: string; lat: number; lng: number; precisao: number; endereco: string; rua: string; ruaChave: string}
  | {tipo: 'lugar'; nomeChave: string; nome: string; cidade: string; lat: number; lng: number; endereco: string}
  | {tipo: 'registro'; rota: string; semRuas: string | null; itens: ItemRegistro[]}
  | {tipo: 'uso'; dia: string; linhas: LinhaDeUso[]};

export interface ItemRegistro {
  tn: string;
  lat: number | null;
  lng: number | null;
  fonte: string;
  precisao: string;
}

export interface LugarConhecido {
  nome_chave: string;
  nome: string;
  lat: number;
  lng: number;
  situacao: 'confirmado' | 'sugestao';
  vistas: number;
}

export class ErroNuvem extends Error {
  constructor(mensagem: string, readonly deRede: boolean) { super(mensagem); }
}

export interface ClienteNuvem {
  rotaExistente(atId: string): Promise<string | null>;
  criarRota(id: string, atId: string | null, arquivo: string): Promise<void>;
  inserirPacotes(rotaId: string, pacotes: PacoteNuvem[]): Promise<void>;
  marcarEntregue(rotaId: string, tns: string[], quando: string | null): Promise<void>;
  inserirCorrecao(chave: string, lat: number, lng: number): Promise<void>;
  apagarCorrecao(chave: string, lat: number, lng: number): Promise<void>;
  inserirObservacao(o: {chave: string; lat: number; lng: number; precisao: number; endereco: string; rua: string; ruaChave: string}): Promise<void>;
  inserirLugar(l: {nomeChave: string; nome: string; cidade: string; lat: number; lng: number; endereco: string}): Promise<void>;
  registrar(rotaId: string, semRuas: string | null, itens: ItemRegistro[]): Promise<void>;
  contarUso(dia: string, linhas: LinhaDeUso[]): Promise<void>;
  lugaresConhecidos(palavras: string[], cidade: string): Promise<LugarConhecido[]>;
  posicoes(chaves: string[]): Promise<PosicaoCompartilhada[]>;
}

export const FILA_MAX = 3000;

export function operacoesDaPlanilha(itens: ItemPlanilha[], rotaDe: (it: ItemPlanilha) => string, cidade: string): Operacao[] {
  const porRota = new Map<string, Extract<Operacao, {tipo: 'rota'}>>();
  const inteiro = (v: unknown) => /^\d{1,6}$/.test(String(v ?? '').trim()) ? +String(v).trim() : null;
  for (const it of itens) {
    const k = rotaDe(it);
    if (!porRota.has(k)) porRota.set(k, {tipo: 'rota', chave: k, at_id: it.at, arquivo: it.arquivo, pacotes: []});
    porRota.get(k)!.pacotes.push({
      spx_tn: it.tn, sequencia: inteiro(it.ml), parada: inteiro(it.parada), endereco: it.endereco || it.texto,
      bairro: it.bairro || null, cidade: it.cidade || null, cep: it.cep, lat: it.lat, lng: it.lng,
      chave_lugar: chaveLugar(it.texto, it.bairro, cidade),
    });
  }
  return [...porRota.values()];
}

export function criarFila(g: Guarda, novoUuid: () => string = () => crypto.randomUUID()) {
  const ler = () => g.ler<Operacao[]>(CHAVES.fila, []);
  let enviando = false;
  let erro = '';

  async function enviarUma(c: ClienteNuvem, op: Operacao): Promise<'ok' | 'rede' | 'descartar'> {
    try {
      if (op.tipo === 'rota') {
        const mapa = g.ler<Record<string, string>>(CHAVES.rotasNuvem, {});
        let id = mapa[op.chave] || (op.at_id ? await c.rotaExistente(op.at_id) : null);
        if (!id) { id = novoUuid(); await c.criarRota(id, op.at_id, op.arquivo); }
        mapa[op.chave] = id;
        g.gravar(CHAVES.rotasNuvem, mapa);
        for (let i = 0; i < op.pacotes.length; i += 200) await c.inserirPacotes(id, op.pacotes.slice(i, i + 200));
      } else if (op.tipo === 'entregue') {
        const id = g.ler<Record<string, string>>(CHAVES.rotasNuvem, {})[op.rota];
        if (!id) return 'descartar';
        await c.marcarEntregue(id, op.tns, op.quando);
      } else if (op.tipo === 'correcao') {
        await c.inserirCorrecao(op.chave, op.lat, op.lng);
      } else if (op.tipo === 'observacao') {
        await c.inserirObservacao(op);
      } else if (op.tipo === 'lugar') {
        await c.inserirLugar(op);
      } else if (op.tipo === 'registro') {
        const id = g.ler<Record<string, string>>(CHAVES.rotasNuvem, {})[op.rota];
        if (!id) return 'descartar';
        await c.registrar(id, op.semRuas, op.itens);
      } else if (op.tipo === 'uso') {
        await c.contarUso(op.dia, op.linhas);
      } else {
        await c.apagarCorrecao(op.chave, op.lat, op.lng);
      }
      return 'ok';
    } catch (e) {
      if (e instanceof ErroNuvem && !e.deRede) {
        const calado = op.tipo === 'observacao' || op.tipo === 'lugar' || op.tipo === 'registro' || op.tipo === 'uso';
        if (!calado) erro = 'o servidor recusou um envio (' + e.message + ')';
        return 'descartar';
      }
      return 'rede';
    }
  }

  return {
    // o contador de botões não é trabalho do motorista: não entra no "⏳ N para enviar"
    pendentes: () => ler().filter(op => op.tipo !== 'uso').length,
    desde: () => g.ler<number>(CHAVES.filaDesde, 0),
    erro: () => erro,
    enfileirar(...ops: Operacao[]) {
      if (!ler().length) g.gravar(CHAVES.filaDesde, Date.now());
      g.gravar(CHAVES.fila, [...ler(), ...ops].slice(-FILA_MAX));
    },
    // O retrato do dia substitui o anterior em vez de empilhar: senão cada toque num botão
    // deixaria mais uma operação na fila, e um dia de rota entupiria ela à toa.
    contarUso(dia: string, linhas: LinhaDeUso[]) {
      const f = ler();
      if (!f.length) g.gravar(CHAVES.filaDesde, Date.now());
      const manter = f.filter((op, i) => op.tipo !== 'uso' || op.dia !== dia || (i === 0 && enviando));
      g.gravar(CHAVES.fila, [...manter, {tipo: 'uso', dia, linhas}].slice(-FILA_MAX));
    },
    desfazerCorrecao(chave: string, lat: number, lng: number): 'retirada' | 'apagar' {
      const f = ler();
      const i = f.map(op => op.tipo === 'correcao' && op.chave === chave).lastIndexOf(true);
      if (i >= 0 && !(i === 0 && enviando)) {
        f.splice(i, 1);
        g.gravar(CHAVES.fila, f);
        return 'retirada';
      }
      g.gravar(CHAVES.fila, [...f, {tipo: 'desfazerCorrecao', chave, lat, lng}].slice(-FILA_MAX));
      return 'apagar';
    },
    async enviar(c: ClienteNuvem | null): Promise<void> {
      if (!c || enviando) return;
      enviando = true;
      try {
        while (ler().length) {
          const r = await enviarUma(c, ler()[0]);
          if (r === 'rede') break;
          const f = ler();
          f.shift();
          g.gravar(CHAVES.fila, f);
          if (!f.length) g.gravar(CHAVES.filaDesde, 0);
        }
      } finally {
        enviando = false;
      }
    },
  };
}

export type Fila = ReturnType<typeof criarFila>;

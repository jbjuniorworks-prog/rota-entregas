// O registro de cada busca de lista (026): onde vai o tempo de localizar as paradas sem posição.
// Só contagens, tempos e a origem da lista. O evento é montado campo a campo, só com números:
// endereço, rua, bairro, CEP, coordenada e texto da lista não têm por onde entrar.
import {haversine} from './geo';
import type {Ponto} from './tipos';

export const ORIGENS = ['planilha', 'print', 'gravacao', 'colada', 'mista', 'de_novo'] as const;
export type OrigemLista = typeof ORIGENS[number];

// Mais de uma origem na mesma busca é 'mista'.
export function origemDe(tipos: Iterable<OrigemLista>): OrigemLista | null {
  const s = new Set(tipos);
  return s.size === 0 ? null : s.size === 1 ? [...s][0] : 'mista';
}

export const tipoDoArquivo = (f: {type: string}): OrigemLista => f.type.startsWith('video/') ? 'gravacao' : 'print';

export type FonteMedida = 'nominatim' | 'cep' | 'censo' | 'banco';

interface Conta {chamadas: number; ms: number; espera: number}

export interface Medicao {
  tempo_ms: number;
  fontes: Record<FonteMedida, Conta>;
  // quanto a busca de cada parada levou, e quantas vezes ela foi ao Nominatim
  paradas: Map<string, {ms: number; nominatim: number}>;
}

// Os serviços avisam o medidor; fora de uma busca de lista ele só deixa passar. As chamadas dentro
// de `medir` são as folhas (a ida ao Nominatim, ao ViaCEP, ao censo, ao banco), nunca uma função
// que chama outra medida: senão o mesmo tempo contaria duas vezes.
export function criarMedidor(agora: () => number = () => performance.now()) {
  let m: (Medicao & {inicio: number}) | null = null;
  let atual: {id: string; desde: number} | null = null;
  const conta = (): Conta => ({chamadas: 0, ms: 0, espera: 0});
  function naParada(id: string | null) {
    if (m && atual) m.paradas.get(atual.id)!.ms += agora() - atual.desde;
    atual = m && id ? {id, desde: agora()} : null;
    if (m && id && !m.paradas.has(id)) m.paradas.set(id, {ms: 0, nominatim: 0});
  }
  return {
    comecar() {
      m = {inicio: agora(), tempo_ms: 0, fontes: {nominatim: conta(), cep: conta(), censo: conta(), banco: conta()}, paradas: new Map()};
      atual = null;
    },
    naParada,
    async medir<T>(fonte: FonteMedida, fn: () => PromiseLike<T>): Promise<T> {
      const sessao = m, quem = atual?.id;
      if (!sessao) return fn();
      const t = agora();
      try {
        return await fn();
      } finally {
        const c = sessao.fontes[fonte];
        c.chamadas++;
        c.ms += agora() - t;
        if (fonte === 'nominatim' && quem) sessao.paradas.get(quem)!.nominatim++;
      }
    },
    // a vez na fila do serviço (o Nominatim pede 1,1 s entre chamadas): parado, sem chamar nada
    esperou(fonte: FonteMedida, ms: number) {
      if (m) m.fontes[fonte].espera += ms;
    },
    terminar(): Medicao | null {
      if (!m) return null;
      naParada(null);
      const {inicio, ...r} = m;
      r.tempo_ms = agora() - inicio;
      m = null;
      return r;
    },
  };
}

export const medidor = criarMedidor();

export const CATEGORIAS = ['memoria', 'censo', 'base', 'cep', 'nominatim', 'conhecida', 'sem_posicao', 'outras'] as const;
export type Categoria = typeof CATEGORIAS[number];

// Onde a parada terminou, pela origem da posição. Sem posição é sem posição, venha de onde vier;
// o que não tem nome aqui cai em 'outras', para a soma fechar sempre com as pendentes.
export function categoria(p: {lat?: number | null; lng?: number | null; fonte?: string}): Categoria {
  if (p.lat == null || p.lng == null) return 'sem_posicao';
  switch (p.fonte) {
    case 'memoria do aparelho': return 'memoria';
    case 'IBGE': return 'censo';
    case 'nossa base': return 'base';
    case 'CEP': case 'entregas': return 'cep';
    case 'OpenStreetMap': return 'nominatim';
    case 'minha correcao': case 'outro motorista': return 'conhecida';
    default: return 'outras';
  }
}

export interface EventoBusca {
  id: string;
  motorista_id: string;
  origem: OrigemLista;
  buscado_em: string;
  versao: string;
  paradas: number;
  pendentes: number;
  tempo_ms: number;
  nominatim_chamadas: number;
  nominatim_espera_ms: number;
  nominatim_ms: number;
  cep_chamadas: number;
  cep_ms: number;
  censo_ms: number;
  banco_chamadas: number;
  banco_ms: number;
  conhecidas: number;
  conhecidas_ms: number;
  conhecidas_nominatim: number;
  conhecidas_longe: number;
  terminou_memoria: number;
  terminou_censo: number;
  terminou_base: number;
  terminou_cep: number;
  terminou_nominatim: number;
  terminou_conhecida: number;
  terminou_sem_posicao: number;
  terminou_outras: number;
}

// O mesmo "perto" da conferência das portas da nuvem (logica/compartilhadas.ts).
const LONGE_DA_CONHECIDA = 30;

export interface PendenteNoFim {
  id: string;
  // onde a busca pôs, antes das portas da nuvem
  achada: Ponto | null;
  lat?: number | null;
  lng?: number | null;
  fonte?: string;
}

export function montarEvento(a: {
  id: string; motorista: string; origem: OrigemLista; quando: Date; versao: string;
  paradas: number; pendentes: PendenteNoFim[]; medicao: Medicao;
}): EventoBusca {
  if (!(ORIGENS as readonly string[]).includes(a.origem)) throw new Error('origem fora da lista: ' + a.origem);
  // os mesmos limites da 026: contagem até 5.000, tempo até um dia
  const n = (v: number, max = 5000) => Math.min(max, Math.max(0, Math.round(v || 0)));
  const ms = (v: number) => n(v, 86_400_000);
  const terminou = Object.fromEntries(CATEGORIAS.map(c => [c, 0])) as Record<Categoria, number>;
  let conhecidas = 0, conhecidasMs = 0, conhecidasNominatim = 0, longe = 0;
  for (const p of a.pendentes) {
    const c = categoria(p);
    terminou[c]++;
    if (c !== 'conhecida') continue;
    conhecidas++;
    const d = a.medicao.paradas.get(p.id);
    conhecidasMs += d ? d.ms : 0;
    conhecidasNominatim += d ? d.nominatim : 0;
    if (p.achada && haversine(p.achada, {lat: p.lat!, lng: p.lng!}) >= LONGE_DA_CONHECIDA) longe++;
  }
  const f = a.medicao.fontes;
  return {
    id: a.id,
    motorista_id: a.motorista,
    origem: a.origem,
    buscado_em: a.quando.toISOString(),
    versao: String(a.versao).slice(0, 40) || '?',
    paradas: n(a.paradas),
    pendentes: n(a.pendentes.length),
    tempo_ms: ms(a.medicao.tempo_ms),
    nominatim_chamadas: n(f.nominatim.chamadas),
    nominatim_espera_ms: ms(f.nominatim.espera),
    nominatim_ms: ms(f.nominatim.ms),
    cep_chamadas: n(f.cep.chamadas),
    // o ViaCEP também tem vez (0,4 s), e a 026 não tem coluna à parte para ela
    cep_ms: ms(f.cep.ms + f.cep.espera),
    censo_ms: ms(f.censo.ms),
    banco_chamadas: n(f.banco.chamadas),
    banco_ms: ms(f.banco.ms),
    conhecidas: n(conhecidas),
    conhecidas_ms: ms(conhecidasMs),
    conhecidas_nominatim: n(conhecidasNominatim),
    conhecidas_longe: n(longe),
    terminou_memoria: n(terminou.memoria),
    terminou_censo: n(terminou.censo),
    terminou_base: n(terminou.base),
    terminou_cep: n(terminou.cep),
    terminou_nominatim: n(terminou.nominatim),
    terminou_conhecida: n(terminou.conhecida),
    terminou_sem_posicao: n(terminou.sem_posicao),
    terminou_outras: n(terminou.outras),
  };
}

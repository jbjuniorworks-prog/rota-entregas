import {haversine} from './geo';
import {fmtKm} from './otimizacao';

// O motorista novo fica em conferência (022): o que ele marca ou entrega só vale para os outros
// depois que o admin aprova. Num dia com dois novos, um deles marcou duas portas no lugar errado,
// e uma já apareceu verificada para todos (15/10).

// Uma linha da `marcas_em_conferencia`: o endereço em que o pendente dele mudaria a porta que os
// outros recebem. `lat`/`situacao` são a porta com o dele; `*_antes`, a que vale hoje.
export interface MarcaEmConferencia {
  motorista_id: string;
  nome: string;
  chave_lugar: string;
  endereco: string;
  criado_em: string;
  lat: number | null;
  lng: number | null;
  situacao: string | null;
  lat_antes: number | null;
  lng_antes: number | null;
  situacao_antes: string | null;
  pino_lat: number | null;
  pino_lng: number | null;
  no_pino: boolean;
}

export interface ItemEmConferencia extends MarcaEmConferencia {
  lat: number;
  lng: number;
  // do ponto dele até o pino da rota dele; nulo em rota lida de vídeo, que não sobe pacote
  doPino: number | null;
  texto: string;
  mesmoPonto?: MesmoPonto;
}

// O ponto de verdade do que ele marcou ou entregou e espera aprovação. O `lat` da lista acima é a
// porta que ficaria, que pode ser a de outro motorista.
export interface PontoPendente {
  motorista_id: string;
  chave_lugar: string;
  lat: number;
  lng: number;
  criado_em: string;
}

export interface MesmoPonto {
  enderecos: number;
  ruas: number;
}

// A rua da chave: o CEP, ou a rua e o bairro da chave sem CEP.
export const ruaDaChave = (chave: string) => chave.startsWith('r|') ? chave.split('|').filter((_, i) => i !== 2).join('|') : chave.split('|')[0];

const PERTO_M = 15, JANELA_MIN = 30;

// O César de 19/10 marcou cinco endereços de duas ruas parado num lugar só, e dois foram aprovados.
// Vários do mesmo ponto na mesma rua costumam ser o mesmo prédio ou condomínio, e não marcam nada:
// o que pesa é ruas diferentes. Devolve, por motorista e chave, quantos endereços e ruas saíram do
// mesmo ponto em até 30 min.
export function marcadasDoMesmoPonto(pontos: PontoPendente[]): Map<string, MesmoPonto> {
  const saida = new Map<string, MesmoPonto>();
  for (const p of pontos) {
    const juntos = pontos.filter(q => q.motorista_id === p.motorista_id && haversine(p, q) <= PERTO_M
      && Math.abs(Date.parse(q.criado_em) - Date.parse(p.criado_em)) <= JANELA_MIN * 60000);
    const chaves = new Set(juntos.map(q => q.chave_lugar));
    const ruas = new Set([...chaves].map(ruaDaChave));
    if (chaves.size < 3 || ruas.size < 2) continue;
    for (const k of chaves) {
      const id = p.motorista_id + '|' + k, antes = saida.get(id);
      if (!antes || chaves.size > antes.enderecos) saida.set(id, {enderecos: chaves.size, ruas: ruas.size});
    }
  }
  return saida;
}

export interface MotoristaEmConferencia {
  id: string;
  nome: string;
  // a porta vai para onde ele marcou: cada um se olha
  mexem: ItemEmConferencia[];
  // só entregas a até 30 m do pino que ele seguia: confirmam a rota, aprovam-se juntas
  noPino: ItemEmConferencia[];
}

// o raio de "mesmo ponto" da `posicoes`
const MESMO_PONTO = 30;

function explicar(m: MarcaEmConferencia & {lat: number; lng: number}, doPino: number | null): string {
  const partes: string[] = [];
  if (m.no_pino) partes.push('Entregue no pino da rota.');
  else if (doPino == null) partes.push('Sem pino da rota para comparar.');
  else partes.push(`A ${fmtKm(doPino)} do pino da rota.`);
  if (m.lat_antes != null && m.lng_antes != null) {
    const longe = haversine(m, {lat: m.lat_antes, lng: m.lng_antes});
    if (longe >= MESMO_PONTO) partes.push(`A porta ${m.situacao_antes === 'confirmado' ? 'verificada' : 'sugerida'} hoje fica a ${fmtKm(longe)}.`);
  }
  partes.push(m.situacao === 'confirmado' ? 'Aprovada, fica verificada.' : 'Aprovada, vira sugestão para os outros.');
  return partes.join(' ');
}

export function agruparConferencia(linhas: MarcaEmConferencia[], mesmoPonto: ReadonlyMap<string, MesmoPonto> = new Map()): MotoristaEmConferencia[] {
  const grupos = new Map<string, MotoristaEmConferencia>();
  for (const l of linhas) {
    if (l.lat == null || l.lng == null) continue;
    const ponto = {...l, lat: l.lat, lng: l.lng};
    const doPino = l.pino_lat != null && l.pino_lng != null ? haversine(ponto, {lat: l.pino_lat, lng: l.pino_lng}) : null;
    let g = grupos.get(l.motorista_id);
    if (!g) grupos.set(l.motorista_id, g = {id: l.motorista_id, nome: l.nome, mexem: [], noPino: []});
    const junto = mesmoPonto.get(l.motorista_id + '|' + l.chave_lugar);
    (l.no_pino ? g.noPino : g.mexem).push({...ponto, doPino, texto: explicar(ponto, doPino), ...(junto ? {mesmoPonto: junto} : {})});
  }
  // o mais longe do pino primeiro, e o sem pino junto dele: é onde um erro custa mais
  const risco = (i: ItemEmConferencia) => i.doPino ?? Infinity;
  for (const g of grupos.values()) {
    g.mexem.sort((a, b) => risco(b) - risco(a) || b.criado_em.localeCompare(a.criado_em));
    g.noPino.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  }
  const total = (g: MotoristaEmConferencia) => g.mexem.length + g.noPino.length;
  return [...grupos.values()].sort((a, b) => total(b) - total(a) || a.nome.localeCompare(b.nome));
}

export const contarConferencia = (gs: MotoristaEmConferencia[]) => gs.reduce((n, g) => n + g.mexem.length + g.noPino.length, 0);

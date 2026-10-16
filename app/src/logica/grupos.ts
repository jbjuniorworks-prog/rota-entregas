import {CORES} from './rotulos';
import type {Area, Estado, Parada, Ponto} from './tipos';

// Grupos circulados no mapa (ideia do Luan, 16/10, como o "Manually order route" do Circuit): ele
// desenha em volta das entregas que quer fazer primeiro, depois em volta das seguintes, e a rota
// vai grupo por grupo, na melhor ordem dentro de cada um. As que ficam fora vão por último. Cada
// grupo vira uma área: é o que a montagem já sabe seguir, e a Lista já mostra por cor.

export interface Grupo {
  ids: string[];
  // o traço do dedo, para o mapa redesenhar enquanto ele circula os outros
  laco: Ponto[];
}

// Raio saindo do ponto para leste: cruzando a borda um número ímpar de vezes, está dentro. O traço
// não precisa fechar: a volta do último ponto ao primeiro fecha sozinha.
export function dentroDoLaco(laco: Ponto[], p: Ponto): boolean {
  let dentro = false;
  for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
    const a = laco[i], b = laco[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < (b.lng - a.lng) * (p.lat - a.lat) / (b.lat - a.lat) + a.lng) dentro = !dentro;
  }
  return dentro;
}

// Entregue e deixada para depois não entram na montagem: circular elas não mudaria nada.
const circulavel = (p: Parada | undefined): p is Parada => !!p && !p.entregue && !p.adiada && p.lat != null && p.lng != null;

// Quem já está num grupo fica nele: o círculo seguinte, desenhado com pressa, pega a borda do
// anterior, e o Desfazer é o caminho para corrigir.
export function circular(grupos: Grupo[], laco: Ponto[], paradas: Parada[]): {grupos: Grupo[]; aviso?: string} {
  const ja = new Set(grupos.flatMap(g => g.ids));
  const dentro = paradas.filter(p => circulavel(p) && dentroDoLaco(laco, p as Ponto));
  const novas = dentro.filter(p => !ja.has(p.id)).map(p => p.id);
  if (!novas.length) return {grupos, aviso: dentro.length ? 'As entregas deste círculo já estão num grupo.' : 'Nenhuma entrega por fazer dentro do círculo.'};
  return {grupos: [...grupos, {ids: novas, laco}]};
}

// Entregue no meio do caminho sai do grupo, e grupo vazio sai da conta.
export function gruposValidos(grupos: Grupo[], parada: (id: string) => Parada | undefined): Grupo[] {
  return grupos.map(g => ({...g, ids: g.ids.filter(id => circulavel(parada(id)))})).filter(g => g.ids.length);
}

// As cores que nenhuma área usa vêm primeiro: com a de sempre (verde), o primeiro grupo verde não
// se distinguia das que ficaram fora. Passando de seis, repetem.
export function coresDosGrupos(areas: Area[]): string[] {
  const usadas = new Set(areas.map(a => a.cor));
  return [...CORES.filter(c => !usadas.has(c[1])), ...CORES.filter(c => usadas.has(c[1]))].map(c => c[1]);
}

export function aplicarGrupos(e: Estado, grupos: Grupo[], novoId: () => string): Area[] {
  const cores = coresDosGrupos(e.areas);
  const nomes = new Set(e.areas.map(a => a.nome));
  const novas = grupos.map((_, k) => {
    const cor = cores[k % cores.length];
    const base = CORES.find(c => c[1] === cor)![0];
    let nome = base;
    for (let n = 2; nomes.has(nome); n++) nome = `${base} ${n}`;
    nomes.add(nome);
    return {id: novoId(), nome, cor, prazo: ''};
  });
  const daArea = new Map(grupos.flatMap((g, k) => g.ids.map(id => [id, novas[k].id] as const)));
  for (const p of e.paradas) p.area = daArea.get(p.id) ?? p.area;
  // a área que esvaziou some, menos a dos próximos endereços que ele carregar
  const comParada = new Set(e.paradas.map(p => p.area));
  e.areas = [...novas, ...e.areas.filter(a => comParada.has(a.id) || a.id === e.areaAtual)];
  // a ordem é a que ele desenhou, não a dos horários nem a da mais perto
  e.areasManual = true;
  return novas;
}

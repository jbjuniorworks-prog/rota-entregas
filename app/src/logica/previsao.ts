import type {Estado} from './tipos';

export const SERVICO_PADRAO = 180;

export interface Ritmo {
  segundos: number;
  medido: boolean;
}

export interface PrevisaoArea {
  chegada: number;
  fim: number;
  estoura: boolean;
}

export function ritmoPorParada(e: Estado): Ritmo {
  const feitas = e.paradas.filter(p => p.entregue && p.entregueEm).sort((a, b) => a.entregueEm! - b.entregueEm!);
  const amostras: number[] = [];
  for (let i = 1; i < feitas.length; i++) {
    const intervalo = (feitas[i].entregueEm! - feitas[i - 1].entregueEm!) / 1000;
    const dirigindo = (e.pernas[feitas[i].id] || {dur: 0}).dur || 0;
    const servico = intervalo - dirigindo;
    if (servico > 20 && servico < 1800) amostras.push(servico);
  }
  if (amostras.length < 3) return {segundos: SERVICO_PADRAO, medido: false};
  amostras.sort((a, b) => a - b);
  return {segundos: amostras[Math.floor(amostras.length / 2)], medido: true};
}

export function previsoes(e: Estado, agora = Date.now()): {porArea: Record<string, PrevisaoArea | null>; ritmo: Ritmo} | null {
  if (!e.rota) return null;
  const ritmo = ritmoPorParada(e);
  let t = agora;
  const porArea: Record<string, PrevisaoArea | null> = {};
  for (const ra of e.rota.areas) {
    const pendentes = ra.ordem.map(id => e.paradas.find(p => p.id === id)).filter(p => p && !p.entregue);
    if (!pendentes.length) { porArea[ra.id] = null; continue; }
    const chegada = t + ((e.pernas[pendentes[0]!.id] || {dur: 0}).dur || 0) * 1000;
    for (const p of pendentes) t += (((e.pernas[p!.id] || {dur: 0}).dur || 0) + ritmo.segundos) * 1000;
    const a = e.areas.find(x => x.id === ra.id) || e.areas[0];
    let estoura = false;
    if (a.prazo) {
      const [h, m] = a.prazo.split(':').map(Number);
      const limite = new Date(agora);
      limite.setHours(h, m, 0, 0);
      estoura = t > limite.getTime();
    }
    porArea[ra.id] = {chegada, fim: t, estoura};
  }
  return {porArea, ritmo};
}

// O "fim às" do topo. No começo da rota a previsão erra uns 20 a 30 minutos: medido em 127 rotas
// de produção em 24/11, contra a hora da última entrega. O minuto cravado prometia mais do que a
// conta sabe. Até a metade das entregas, a hora vai arredondada para 15 minutos. Da metade em
// diante o erro cai para uns 15 a 20 minutos, e o minuto volta. Pedido do Luan (24/11).
const QUARTO_DE_HORA = 15 * 60000;
const dois = (n: number) => String(n).padStart(2, '0');

export function textoDoFim(fim: number, feitas: number, total: number): string {
  if (total > 0 && feitas * 2 >= total) {
    const d = new Date(fim);
    return `fim às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }
  const r = new Date(Math.round(fim / QUARTO_DE_HORA) * QUARTO_DE_HORA);
  const h = r.getHours(), m = r.getMinutes();
  return `fim por volta ${h <= 1 ? 'da' : 'das'} ${h}h${m ? dois(m) : ''}`;
}

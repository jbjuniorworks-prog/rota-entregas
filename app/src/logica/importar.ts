import {marcarIsoladas} from './geo';
import type {ItemPlanilha} from './planilha';
import {analisarLinha, chaveEndereco} from './texto';
import type {Estado, Parada} from './tipos';

export const novoId = () => Math.random().toString(36).slice(2, 10);

export interface ResumoPlanilha {
  novas: number;
  juntas: number;
  repetidas: number;
  semPosicao: number;
  longe: number;
  lembradas: number;
}

export function adicionarDaPlanilha(
  e: Estado, itens: ItemPlanilha[], aplicarMemoria: (p: Parada) => boolean, agora = Date.now(),
): {resumo: ResumoPlanilha; rotaDe: (it: ItemPlanilha) => string} {
  const existentes = new Set(e.paradas.map(x => chaveEndereco(x.texto)));
  const desta = new Map<string, Parada>();
  const r: ResumoPlanilha = {novas: 0, juntas: 0, repetidas: 0, semPosicao: 0, longe: 0, lembradas: 0};
  const rotaDe = (it: ItemPlanilha) => it.at || `${it.arquivo}:${agora}`;
  for (const it of itens) {
    const chave = chaveEndereco(it.texto);
    const ja = desta.get(chave);
    if (ja) {
      ja.unidades = (ja.unidades || 1) + 1;
      if (it.tn) ja.pacotes!.push(it.tn);
      r.juntas++;
      continue;
    }
    if (existentes.has(chave)) { r.repetidas++; continue; }
    const temCoord = it.lat != null;
    const p: Parada = {
      id: novoId(), area: e.areaAtual, ml: it.ml, texto: it.texto, bairro: it.bairro, rota: rotaDe(it), pacotes: it.tn ? [it.tn] : [],
      unidades: null, comercial: false, lat: temCoord ? it.lat : null, lng: temCoord ? it.lng : null,
      exibido: temCoord ? 'Posição da planilha' : '', precisao: temCoord ? 'planilha' : 'pendente', candidatos: [], entregue: false,
    };
    const lembrada = aplicarMemoria(p);
    e.paradas.push(p);
    desta.set(chave, p);
    r.novas++;
    if (lembrada) r.lembradas++;
    else if (!temCoord) r.semPosicao++;
  }
  if (!e.cidade) { const c = itens.find(i => i.cidade); if (c) e.cidade = c.cidade; }
  r.longe = marcarIsoladas(e.paradas);
  if (r.novas || r.juntas) { e.rota = null; e.pernas = {}; }
  return {resumo: r, rotaDe};
}

export function resumoPlanilha(r: ResumoPlanilha): string {
  return `${r.novas} parada(s) da planilha${r.juntas ? `, ${r.juntas} pacote(s) somado(s) a um mesmo endereço` : ''}${r.repetidas ? `, ${r.repetidas} já existia(m)` : ''}.`
    + (r.lembradas ? ` 📌 ${r.lembradas} com a posição que você já tinha corrigido.` : '')
    + (r.longe ? ` ⚠️ ${r.longe} com posição longe das outras entregas: confira o pino antes de sair.` : '')
    + (r.semPosicao ? ` ${r.semPosicao} sem posição, buscando no mapa…` : '');
}

export function adicionarLinhas(e: Estado, linhas: string[]): {novas: number; repetidas: number} {
  const existentes = new Set(e.paradas.map(x => chaveEndereco(x.texto)));
  const porNumero = new Map(e.paradas.filter(x => x.ml).map(x => [x.ml!, chaveEndereco(x.texto).split('|').slice(0, 2).join('|')]));
  let novas = 0, repetidas = 0;
  for (const l of linhas) {
    const {ml, texto, unidades, comercial} = analisarLinha(l);
    if (!texto) continue;
    const chave = chaveEndereco(texto);
    const semComplemento = chave.split('|').slice(0, 2).join('|');
    if (existentes.has(chave) || (ml && porNumero.get(ml) === semComplemento)) { repetidas++; continue; }
    existentes.add(chave);
    if (ml) porNumero.set(ml, semComplemento);
    e.paradas.push({id: novoId(), area: e.areaAtual, ml, texto, unidades, comercial, lat: null, lng: null, exibido: '', precisao: 'pendente', candidatos: [], entregue: false});
    novas++;
  }
  if (novas) { marcarIsoladas(e.paradas); e.rota = null; e.pernas = {}; }
  return {novas, repetidas};
}

import {marcarIsoladas, marcarNumerosIncoerentes, moverPeloBairro} from './geo';
import type {ItemPlanilha} from './planilha';
import {analisarLinha, coordenadaNoTexto, semLink, chaveEndereco} from './texto';
import type {Estado, Parada} from './tipos';

export const novoId = () => Math.random().toString(36).slice(2, 10);

export const numeroDaParada = (valor: string | null | undefined): string | null =>
  /^\d{1,4}$/.test(String(valor ?? '').trim()) ? String(valor).trim() : null;

export const ehAdicional = (valor: string | null | undefined): boolean => String(valor ?? '').trim() === '-';

export interface ResumoPlanilha {
  novas: number;
  juntas: number;
  repetidas: number;
  semPosicao: number;
  longe: number;
  lembradas: number;
  noBairro: number;
  aproximadas: number;
  numeros: number;
  confirmadas: number;
  sugestoes: number;
}

export function adicionarDaPlanilha(
  e: Estado, itens: ItemPlanilha[], aplicarMemoria: (p: Parada) => boolean, agora = Date.now(),
): {resumo: ResumoPlanilha; rotaDe: (it: ItemPlanilha) => string} {
  const existentes = new Set(e.paradas.map(x => chaveEndereco(x.texto)));
  const desta = new Map<string, Parada>();
  const r: ResumoPlanilha = {novas: 0, juntas: 0, repetidas: 0, semPosicao: 0, longe: 0, lembradas: 0, noBairro: 0, aproximadas: 0, numeros: 0, confirmadas: 0, sugestoes: 0};
  const rotaDe = (it: ItemPlanilha) => it.at || `${it.arquivo}:${agora}`;
  for (const it of itens) {
    const chave = chaveEndereco(it.texto);
    const ja = desta.get(chave);
    if (ja) {
      ja.unidades = (ja.unidades || 1) + 1;
      if (it.tn) ja.pacotes!.push(it.tn);
      if (!ja.stop) ja.stop = numeroDaParada(it.parada);
      if (ehAdicional(it.parada)) ja.adicional = true;
      r.juntas++;
      continue;
    }
    if (existentes.has(chave)) { r.repetidas++; continue; }
    const temCoord = it.lat != null;
    const p: Parada = {
      id: novoId(), area: e.areaAtual, ml: it.ml, stop: numeroDaParada(it.parada), adicional: ehAdicional(it.parada), texto: it.texto, bairro: it.bairro, rota: rotaDe(it), pacotes: it.tn ? [it.tn] : [],
      unidades: null, comercial: false, lat: temCoord ? it.lat : null, lng: temCoord ? it.lng : null,
      exibido: !temCoord ? '' : it.aproximada ? 'Posição da planilha com poucas casas decimais: pode errar em até 1 km' : 'Posição da planilha',
      precisao: !temCoord ? 'pendente' : it.aproximada ? 'aproximada' : 'planilha', candidatos: [], entregue: false,
      fonte: temCoord ? 'planilha' : undefined,
    };
    const lembrada = aplicarMemoria(p);
    if (!lembrada && p.precisao === 'aproximada') r.aproximadas++;
    e.paradas.push(p);
    desta.set(chave, p);
    r.novas++;
    if (lembrada) r.lembradas++;
    else if (!temCoord) r.semPosicao++;
  }
  if (!e.cidade) { const c = itens.find(i => i.cidade); if (c) e.cidade = c.cidade; }
  r.numeros = marcarNumerosIncoerentes(e.paradas);
  r.longe = marcarIsoladas(e.paradas);
  r.noBairro = moverPeloBairro(e.paradas).length;
  // Parada nova não tira ninguém do lugar na sequência: ela entra na conta de "fora da rota",
  // e o segundo lote do dia deixa de custar a rota que o motorista já está fazendo.
  if (e.rota && (r.novas || r.juntas || r.noBairro)) {
    e.rota.desatualizada = true;
    if (r.noBairro) e.rota.mudouMuito = true;
  }
  return {resumo: r, rotaDe};
}

export function resumoPlanilha(r: ResumoPlanilha): string {
  return `${r.novas} parada(s) da planilha${r.juntas ? `, ${r.juntas} pacote(s) somado(s) a um mesmo endereço` : ''}${r.repetidas ? `, ${r.repetidas} já existia(m)` : ''}.`
    + (r.lembradas ? ` 📌 ${r.lembradas} com a posição que você já tinha corrigido.` : '')
    + (r.confirmadas ? ` 🤝 ${r.confirmadas} com posição confirmada por outros motoristas.` : '')
    + (r.sugestoes ? ` 💡 ${r.sugestoes} com sugestão de outro motorista: veja em Conferir.` : '')
    + (r.longe ? ` ⚠️ ${r.longe} com posição longe das outras entregas: ${r.noBairro === r.longe ? 'levada(s) para o bairro certo, confira no local.' : r.noBairro ? `${r.noBairro} levada(s) para o bairro certo, confira o pino das outras.` : 'confira o pino antes de sair.'}` : '')
    + (r.aproximadas ? ` ⚠️ ${r.aproximadas} com posição aproximada na planilha: confira o pino.` : '')
    + (r.numeros ? ` ⚠️ ${r.numeros} com número que não bate com a posição: confira.` : '')
    + (r.semPosicao ? ` ${r.semPosicao} sem posição, buscando no mapa…` : '');
}

export function adicionarLinhas(e: Estado, linhas: string[]): {novas: number; repetidas: number; arrumadas: number; coladas: Parada[]} {
  const existentes = new Set(e.paradas.map(x => chaveEndereco(x.texto)));
  const porNumero = new Map(e.paradas.filter(x => x.ml).map(x => [x.ml!, chaveEndereco(x.texto).split('|').slice(0, 2).join('|')]));
  const soRuaNumero = (x: string) => chaveEndereco(x).split('|').slice(0, 2).join('|');
  let novas = 0, repetidas = 0, arrumadas = 0;
  const coladas: Parada[] = [];
  for (const l of linhas) {
    // Endereço colado junto com um link do mapa: a coordenada é a resposta, não um palpite a
    // conferir. O censo não tem a porta de toda rua, e o dono às vezes chega com ela na mão.
    const coord = coordenadaNoTexto(l);
    const {ml, texto, unidades, comercial} = analisarLinha(coord ? semLink(l) : l);
    if (!texto) continue;
    const chave = chaveEndereco(texto);
    const semComplemento = chave.split('|').slice(0, 2).join('|');
    // Colar a porta de uma parada que já está na lista é conserto, não parada nova. O título que o
    // Google copia vem com CEP e a linha lida do cartão fechado do Meli não vem, então a chave
    // inteira não bate — o que bate é a rua e o número. Sem isto, colar as cinco portas de uma
    // avenida criava cinco paradas a mais em vez de arrumar as cinco que já estavam lá.
    if (coord && semComplemento.replace(/\|/g, '')) {
      const mesmas = e.paradas.filter(x => !x.entregue && soRuaNumero(x.texto) === semComplemento);
      if (mesmas.length) {
        for (const x of mesmas) {
          Object.assign(x, {lat: coord.lat, lng: coord.lng, precisao: 'manual',
            fonte: 'link do mapa', exibido: 'Local que você colou do mapa', candidatos: []});
          delete x.sugestao;
          coladas.push(x);
        }
        arrumadas += mesmas.length;
        continue;
      }
    }
    if (existentes.has(chave) || (ml && porNumero.get(ml) === semComplemento)) { repetidas++; continue; }
    existentes.add(chave);
    if (ml) porNumero.set(ml, semComplemento);
    const p: Parada = {id: novoId(), area: e.areaAtual, ml, texto, unidades, comercial,
      lat: coord ? coord.lat : null, lng: coord ? coord.lng : null,
      exibido: coord ? 'Local que você colou do mapa' : '',
      precisao: coord ? 'manual' : 'pendente', fonte: coord ? 'link do mapa' : undefined,
      candidatos: [], entregue: false};
    e.paradas.push(p);
    if (coord) coladas.push(p);
    novas++;
  }
  if (novas || arrumadas) { marcarIsoladas(e.paradas); if (e.rota) e.rota.desatualizada = true; }
  return {novas, repetidas, arrumadas, coladas};
}

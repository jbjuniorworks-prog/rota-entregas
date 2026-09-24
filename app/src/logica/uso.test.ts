import {guardaNaMemoria} from './guarda';
import {criarUso, hojeLocal, JUNTOS} from './uso';

const conta = (r: {linhas: {botao: string; antes: string; vezes: number}[]}, botao: string, antes = '') =>
  (r.linhas.find(l => l.botao === botao && l.antes === antes) || {vezes: 0}).vezes;

describe('contar o uso dos botões', () => {
  it('conta cada botão e devolve o acumulado do dia, não o toque', () => {
    const u = criarUso(guardaNaMemoria());
    u.registrar('ver');
    u.registrar('ver');
    const r = u.registrar('editar');
    expect(conta(r, 'ver')).toBe(2);
    expect(conta(r, 'editar')).toBe(1);
  });

  it('conta qual botão veio logo depois de qual', () => {
    let t = 1_700_000_000_000;
    const u = criarUso(guardaNaMemoria(), () => t);
    u.registrar('ver'); t += 3000;
    u.registrar('editar'); t += 3000;
    u.registrar('ver'); t += 3000;
    const r = u.registrar('editar');
    expect(conta(r, 'editar', 'ver')).toBe(2);
    expect(conta(r, 'ver', 'editar')).toBe(1);
    expect(conta(r, 'ver')).toBe(2);
  });

  // Dois toques com meia hora no meio não são um fluxo: são duas idas ao app. Contar isso como
  // sequência encheria a medição de pares que não querem dizer nada.
  it('toque muito depois do anterior não vira sequência', () => {
    let t = 1_700_000_000_000;
    const u = criarUso(guardaNaMemoria(), () => t);
    u.registrar('ver');
    t += JUNTOS + 1;
    const r = u.registrar('editar');
    expect(conta(r, 'editar')).toBe(1);
    expect(conta(r, 'editar', 'ver')).toBe(0);
  });

  it('o acumulado sobrevive a recarregar o app', () => {
    const g = guardaNaMemoria();
    criarUso(g).registrar('aqui');
    const r = criarUso(g).registrar('aqui');
    expect(conta(r, 'aqui')).toBe(2);
  });

  it('vira o dia e a contagem recomeça, com o dia certo no retrato', () => {
    let t = Date.parse('2026-09-23T15:00:00');
    const g = guardaNaMemoria();
    const u = criarUso(g, () => t);
    u.registrar('mapa');
    expect(u.doDia().dia).toBe(hojeLocal(t));
    t = Date.parse('2026-09-24T15:00:00');
    const r = u.registrar('mapa');
    expect(r.dia).toBe(hojeLocal(t));
    expect(conta(r, 'mapa')).toBe(1);
  });

  it('guarda estragado não derruba a contagem', () => {
    const g = guardaNaMemoria();
    g.gravar('rota-entregas-uso', {dia: hojeLocal(), lixo: true});
    expect(conta(criarUso(g).registrar('ver'), 'ver')).toBe(1);
  });
});

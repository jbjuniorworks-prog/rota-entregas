import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import XLSX from 'xlsx';
import {estadoVazio} from './guarda';
import {adicionarDaPlanilha, juntarDeNovo, juntarEntregas, separarEntregas, separarParada} from './importar';
import {itensDaPlanilha} from './planilha';
import {chaveDaParada, chaveLugar} from './texto';
import type {Estado} from './tipos';

// A rodovia de 26/10 (Pedro e Luan), com nomes de teste: "Rodovia Teste Ecológica, 67" para a
// mercearia, o condomínio e uma casa, CEP genérico, todos no mesmo ponto da planilha.
const carregar = () => {
  const wb = XLSX.read(readFileSync('testes/planilhas/rota-e.xlsx'), {type: 'buffer'});
  const e = estadoVazio();
  adicionarDaPlanilha(e, itensDaPlanilha(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true}), 'rota-e.xlsx'), () => false);
  return e;
};

describe('separar os pacotes de uma parada', () => {
  it('a parada que juntou linhas guarda o texto de cada pacote', () => {
    const e = carregar();
    expect(e.paradas).toHaveLength(2);
    const [p, outra] = e.paradas;
    expect(p.unidades).toBe(4);
    expect(p.itens!.map(i => [i.tn, i.ml, i.stop])).toEqual([
      ['BRTESTE0001', '24', '9'], ['BRTESTE0002', '25', '9'], ['BRTESTE0003', '29', '9'], ['BRTESTE0004', '30', '9']]);
    expect(p.itens![1].texto).toContain('Por trás do condomínio Portal Teste');
    expect(outra.itens).toBeUndefined();
  });

  it('cada pacote vira uma entrega, no mesmo ponto e logo depois dela na sequência', () => {
    const e = carregar();
    const [p, outra] = e.paradas;
    e.rota = {areas: [{id: e.areaAtual, ordem: [p.id, outra.id]}]} as unknown as Estado['rota'];
    const novas = separarParada(e, p);
    expect(novas).toHaveLength(3);
    expect(e.paradas.map(q => q.pacotes)).toEqual([['BRTESTE0001'], ['BRTESTE0002'], ['BRTESTE0003'], ['BRTESTE0004'], ['BRTESTE0005']]);
    expect(e.rota!.areas[0].ordem).toEqual([p.id, ...novas.map(q => q.id), outra.id]);
    expect([p, ...novas].map(q => q.ml)).toEqual(['24', '25', '29', '30']);
    for (const q of [p, ...novas]) expect(q).toMatchObject({separada: true, unidades: null, lat: p.lat, lng: p.lng, entregue: false});
    expect(novas[0].texto).toContain('Por trás do condomínio Portal Teste');
    expect(p.itens).toBeUndefined();
    expect(new Set(e.paradas.map(q => q.id)).size).toBe(5);
    // entregue, ou sem o que separar, fica como está
    expect(separarParada(e, p)).toEqual([]);
  });

  it('o desfazer volta a ser uma parada só, e não junta se uma já foi entregue', () => {
    const e = carregar(), p = e.paradas[0], antes = structuredClone(p);
    const novas = separarParada(e, p);
    expect(juntarDeNovo(e, p, antes, novas)).toBe(true);
    expect(e.paradas).toHaveLength(2);
    expect(p).toEqual(antes);

    const e2 = carregar(), p2 = e2.paradas[0], antes2 = structuredClone(p2);
    const novas2 = separarParada(e2, p2);
    novas2[1].entregue = true;
    expect(juntarDeNovo(e2, p2, antes2, novas2)).toBe(false);
    expect(e2.paradas).toHaveLength(5);
  });

  // O print do dono, 26/10: a porta geral do "67" estava verificada (a da mercearia), as cinco
  // separadas herdaram o "verificado", e o app escondia delas o Arrumar e o Entreguei aqui.
  it('a porta verificada da chave geral não passa para as separadas com complemento', () => {
    const e = carregar();
    const p = e.paradas[0];
    Object.assign(p, {precisao: 'confirmado', exibido: 'Endereço verificado'});
    const [mercearia, condominio, casa, naMercearia] = [p, ...separarParada(e, p)];
    for (const q of [mercearia, condominio, naMercearia]) expect(q).toMatchObject({precisao: 'vizinha', precisaoAntes: 'confirmado', lat: p.lat});
    // a sem complemento é a chave geral: a porta é dela também
    expect(casa.precisao).toBe('confirmado');

    // o que não é porta de ninguém (o ponto da planilha) não muda
    const e2 = carregar(), [m2, ...outras] = [e2.paradas[0], ...separarParada(e2, e2.paradas[0])];
    expect([m2, ...outras].map(q => q.precisao)).toEqual(['planilha', 'planilha', 'planilha', 'planilha']);
  });

  it('a separada guarda a porta com o complemento; a que ninguém separou, com a chave de sempre', () => {
    const e = carregar();
    const p = e.paradas[0];
    const base = chaveLugar(p.texto, p.bairro, e.cidade)!;
    // CEP terminado em 000 é genérico: a chave é a da rua
    expect(base).toMatch(/^r\|/);
    expect(chaveDaParada(p, e.cidade)).toBe(base);
    const [mercearia, condominio, casa, naMercearia] = [p, ...separarParada(e, p)];
    expect(chaveDaParada(mercearia, e.cidade)).toBe(base + '|mercearia nova opcao teste');
    expect(chaveDaParada(condominio, e.cidade)).toBe(base + '|por tras do condominio portal teste');
    // "Na mercearia" é a mesma mercearia
    expect(chaveDaParada(naMercearia, e.cidade)).toBe(chaveDaParada(mercearia, e.cidade));
    expect(chaveDaParada(casa, e.cidade)).toBe(base);
  });
});

// A avenida de 29/10 (Pedro), com nomes de teste: complementos de blocos e ruas projetadas
// diferentes no mesmo número. A planilha já faz uma entrega por complemento, mas todas dividiam a
// porta do número.
const carregarF = () => {
  const wb = XLSX.read(readFileSync('testes/planilhas/rota-f.xlsx'), {type: 'buffer'});
  const e = estadoVazio();
  adicionarDaPlanilha(e, itensDaPlanilha(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true}), 'rota-f.xlsx'), () => false);
  return e;
};

describe('separar as entregas de um mesmo número', () => {
  it('cada complemento vira entrega, mas todas dividem a porta do número até ele separar', () => {
    const e = carregarF();
    const doNumero = e.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    expect(doNumero.map(p => [p.unidades, p.itens?.length])).toEqual([[null, undefined], [2, 2], [null, undefined]]);
    const base = chaveLugar(doNumero[0].texto, doNumero[0].bairro, e.cidade)!;
    expect(base).toBe('49098232|101');
    expect(doNumero.map(p => chaveDaParada(p, e.cidade))).toEqual([base, base, base]);
  });

  it('separadas, cada uma guarda a porta do seu complemento; os pacotes da mesma pessoa continuam juntos', () => {
    const e = carregarF();
    const doNumero = e.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    const antes = e.paradas.map(p => p.id);
    expect(separarEntregas(e, doNumero)).toEqual(doNumero);
    expect(e.paradas.map(p => p.id), 'nenhuma entrega nova').toEqual(antes);
    const [blocoC, semComplemento, blocoD] = doNumero;
    expect(chaveDaParada(blocoC, e.cidade)).toBe('49098232|101|projetada 08 bloco c apt 101');
    expect(chaveDaParada(blocoD, e.cidade)).toBe('49098232|101|rua projetada 06 bloco d');
    expect(chaveDaParada(semComplemento, e.cidade)).toBe('49098232|101');
    expect(semComplemento).toMatchObject({unidades: 2, separada: true});
    expect(semComplemento.itens).toHaveLength(2);
    // já separadas, não há o que separar
    expect(separarEntregas(e, doNumero)).toEqual([]);
  });

  it('a entregue fica como está, e com uma só por entregar não há o que separar', () => {
    const e = carregarF();
    const [blocoC, semComplemento, blocoD] = e.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    blocoC.entregue = true;
    expect(separarEntregas(e, [blocoC, semComplemento, blocoD])).toEqual([semComplemento, blocoD]);
    expect(blocoC.separada).toBeUndefined();
    const e2 = carregarF();
    const [c2, s2, d2] = e2.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    c2.entregue = s2.entregue = true;
    expect(separarEntregas(e2, [c2, s2, d2])).toEqual([]);
  });

  it('a porta verificada do número passa a "confira na porta" nas de complemento, não na sem complemento', () => {
    const e = carregarF();
    const doNumero = e.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    for (const p of doNumero) Object.assign(p, {precisao: 'confirmado', exibido: 'Endereço verificado'});
    separarEntregas(e, doNumero);
    expect(doNumero.map(p => [p.precisao, p.precisaoAntes])).toEqual([['vizinha', 'confirmado'], ['confirmado', undefined], ['vizinha', 'confirmado']]);
  });

  it('o desfazer volta cada uma a como era, e não junta se uma já foi entregue', () => {
    const e = carregarF();
    const doNumero = e.paradas.filter(p => p.texto.includes('Teste Costa, 101'));
    const antes = doNumero.map(p => structuredClone(p));
    const mudadas = separarEntregas(e, doNumero);
    expect(juntarEntregas(mudadas, antes)).toBe(true);
    expect(doNumero).toEqual(antes);

    const mudadas2 = separarEntregas(e, doNumero);
    mudadas2[2].entregue = true;
    expect(juntarEntregas(mudadas2, antes)).toBe(false);
    expect(doNumero.map(p => p.separada)).toEqual([true, true, true]);
  });
});

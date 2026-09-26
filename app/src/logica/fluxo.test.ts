import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {ErroNuvem, criarFila, operacoesDaPlanilha, type ClienteNuvem} from './fila';
import {CHAVES, backupRecente, carregarEstado, estadoVazio, guardaNaMemoria, resetarDia, salvarEstado} from './guarda';
import {adicionarDaPlanilha, adicionarLinhas, resumoPlanilha} from './importar';
import {criarMemoria} from './memoria';
import {montarRota} from './montagem';
import {matrizAproximada} from './otimizacao';
import {itensDaPlanilha} from './planilha';
import {previsoes} from './previsao';

const ler = (arq: string) => {
  const wb = XLSX.read(readFileSync(arq), {type: 'buffer'});
  return itensDaPlanilha(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: '', raw: true}), arq.split('/').pop()!);
};
const A = ler('testes/planilhas/rota-a.txt'), B = ler('testes/planilhas/rota-b.xlsx');
const servicos = {matriz: async (pts: any[]) => ({...matrizAproximada(pts), porRuas: false}), linha: async () => null};

describe('importar planilha', () => {
  it('soma pacotes iguais, separa apartamentos, marca a posição longe', () => {
    const e = estadoVazio();
    const {resumo} = adicionarDaPlanilha(e, A, () => false);
    expect(resumo).toMatchObject({novas: 10, juntas: 2, repetidas: 0, longe: 1, lembradas: 0});
    expect(resumoPlanilha(resumo)).toBe('10 parada(s) da planilha, 2 pacote(s) somado(s) a um mesmo endereço. ⚠️ 1 com posição longe das outras entregas: confira o pino antes de sair.');
    const ipes = e.paradas.find(p => p.texto.startsWith('Rua dos Ipês, 300, Bloco A'))!;
    expect(ipes.unidades).toBe(3);
    expect(ipes.pacotes).toEqual(['BRTESTA0003', 'BRTESTA0004', 'BRTESTA0005']);
    expect(e.cidade).toBe('Cidade Teste');
  });
  it('a mesma planilha de novo não duplica', () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, A, () => false);
    const {resumo} = adicionarDaPlanilha(e, A, () => false);
    expect(resumo.novas).toBe(0);
    expect(resumo.repetidas).toBe(12);
  });
  it('texto colado ignora repetidos, inclusive pelo número do app', () => {
    const e = estadoVazio();
    expect(adicionarLinhas(e, ['18 Rua A, 10', '18 Rua A, 10', 'Rua B Longa, 20'])).toEqual({novas: 2, repetidas: 1});
    expect(e.paradas[0]).toMatchObject({ml: '18', precisao: 'pendente'});
  });
});

describe('memória de posições', () => {
  it('guarda a correção, reaplica em outra rota e avisa a nuvem', () => {
    const g = guardaNaMemoria(), enviadas: string[] = [];
    const mem = criarMemoria(g, () => 'Aracaju', k => enviadas.push(k));
    const e = estadoVazio();
    adicionarDaPlanilha(e, A, () => false);
    const d = e.paradas.find(p => p.texto.startsWith('Rua D, 49'))!;
    Object.assign(d, {lat: -10.9605, lng: -37.0455, precisao: 'manual'});
    expect(mem.lembrar(d, new Date(2026, 8, 18).getTime())).toBe(true);
    expect(enviadas).toEqual(['49000199|49']);

    const e2 = estadoVazio();
    const {resumo} = adicionarDaPlanilha(e2, A, p => mem.aplicar(p));
    expect(resumo).toMatchObject({lembradas: 1, longe: 0});
    expect(e2.paradas.find(p => p.texto.startsWith('Rua D, 49'))).toMatchObject({precisao: 'lembrado', lat: -10.9605, exibido: 'Posição que você corrigiu em 18/09'});
    mem.esquecer();
    expect(mem.quantas()).toBe(0);
  });
  // A chave do lugar usa CEP, ou rua + número + bairro. Nenhum dos dois é estável entre um dia e
  // outro: o CEP só aparece quando o cartão do Meli está aberto, e o bairro vem de quem respondeu
  // a busca — a mesma avenida voltou "Grageru" num número e "Jardins" no outro, e a nossa base de
  // ruas escolhe o trecho pelo meio da rota do dia. Sem isto, o Luan marcava a mesma porta sempre.
  it('acha a porta marcada mesmo quando a chave de hoje não é a de ontem', () => {
    const g = guardaNaMemoria();
    const mem = criarMemoria(g, () => 'Aracaju', () => {});
    const NA_RUA = {lat: -10.9395, lng: -37.0610};
    const ontem = {texto: 'Avenida Deputado Sílvio Teixeira 184', bairro: 'Grageru', lat: -10.9391, lng: -37.0604} as never;
    expect(mem.lembrar(ontem, new Date(2026, 8, 26).getTime())).toBe(true);

    // hoje a busca respondeu outro bairro, e o pino dela caiu na mesma avenida
    const hoje = {texto: 'Avenida Deputado Sílvio Teixeira 184', bairro: 'Jardins'} as never;
    expect(mem.aplicar(hoje, NA_RUA)).toBe(true);
    expect(hoje).toMatchObject({lat: -10.9391, precisao: 'lembrado'});

    // e hoje o cartão veio aberto, com CEP, que dá outra chave ainda
    const comCep = {texto: 'Avenida Deputado Sílvio Teixeira 184, CEP 49027-000', bairro: ''} as never;
    expect(mem.aplicar(comCep, NA_RUA)).toBe(true);
    expect(comCep).toMatchObject({lat: -10.9391});

    // sem saber onde a busca caiu hoje, não há como conferir: só a chave exata vale
    expect(mem.aplicar({texto: 'Avenida Deputado Sílvio Teixeira 184', bairro: 'Jardins'} as never)).toBe(false);
  });

  // A trava que faltava: "uma marcação só" é quase sempre verdade com o banco ainda vazio, e sem
  // conferir a distância a Rua A 10 de um conjunto viraria a Rua A 10 de outro — como `lembrado`,
  // que o app trata como posição certa. Errar assim é pior que um laranja.
  it('não aplica a porta de uma rua de mesmo nome do outro lado da cidade', () => {
    const g = guardaNaMemoria();
    const mem = criarMemoria(g, () => 'Aracaju', () => {});
    expect(mem.lembrar({texto: 'Rua dos Náufragos 10', bairro: 'Aruana', lat: -10.9800, lng: -37.0500} as never)).toBe(true);
    // a busca de hoje diz que esta Rua dos Náufragos 10 fica a uns 8 km dali
    const longe = {texto: 'Rua dos Náufragos 10', bairro: 'Santa Maria'} as never;
    expect(mem.aplicar(longe, {lat: -11.0300, lng: -37.1100})).toBe(false);
    expect(longe).not.toHaveProperty('lat');
    // e a mesma porta, com a busca caindo na vizinhança, continua valendo
    const perto = {texto: 'Rua dos Náufragos 10', bairro: 'Santa Maria'} as never;
    expect(mem.aplicar(perto, {lat: -10.9810, lng: -37.0505})).toBe(true);
  });

  // "Rua A" existe em conjunto atrás de conjunto, e a trava de 3 km não separa vizinhos. Nome
  // assim não vira identidade: só a chave exata.
  it('nome que não identifica rua nenhuma não serve de identidade', () => {
    const g = guardaNaMemoria();
    const mem = criarMemoria(g, () => 'Aracaju', () => {});
    expect(mem.lembrar({texto: 'Rua A 10', bairro: 'Aruana', lat: -10.98, lng: -37.05} as never)).toBe(true);
    // o conjunto vizinho, a 1 km: a trava de distância deixaria passar, o nome é que barra
    expect(mem.aplicar({texto: 'Rua A 10', bairro: 'Santa Maria'} as never, {lat: -10.989, lng: -37.055})).toBe(false);
    // mesma coisa para "sem denominação"
    expect(mem.lembrar({texto: 'Rua Sem Denominação 30', bairro: 'Aruana', lat: -10.98, lng: -37.05} as never)).toBe(true);
    expect(mem.aplicar({texto: 'Rua Sem Denominação 30', bairro: 'Santa Maria'} as never, {lat: -10.989, lng: -37.055})).toBe(false);
  });

  it('duas portas de mesma rua e número em bairros diferentes não se confundem', () => {
    const g = guardaNaMemoria();
    const mem = criarMemoria(g, () => 'Aracaju', () => {});
    expect(mem.lembrar({texto: 'Rua das Flores 100', bairro: 'Grageru', lat: -10.93, lng: -37.06} as never)).toBe(true);
    expect(mem.lembrar({texto: 'Rua das Flores 100', bairro: 'Jardins', lat: -10.9305, lng: -37.0605} as never)).toBe(true);
    // com duas candidatas, escolher seria chutar: só o acerto exato do bairro vale
    expect(mem.aplicar({texto: 'Rua das Flores 100', bairro: 'Aruana'} as never, {lat: -10.93, lng: -37.06})).toBe(false);
    const certa = {texto: 'Rua das Flores 100', bairro: 'Jardins'} as never;
    expect(mem.aplicar(certa, {lat: -10.93, lng: -37.06})).toBe(true);
    expect(certa).toMatchObject({lat: -10.9305});
  });

  it('escolher um palpite do mapa fica só neste celular, sem virar correção dos outros', () => {
    const g = guardaNaMemoria(), enviadas: string[] = [];
    const mem = criarMemoria(g, () => 'Aracaju', k => enviadas.push(k));
    const p = {texto: 'Rua D, 49, CEP 49000-199', lat: -10.96, lng: -37.04} as never;
    expect(mem.lembrar(p, Date.now(), false)).toBe(true);
    expect(enviadas).toEqual([]);
    expect(mem.quantas()).toBe(1);
    expect(mem.lembrar(p)).toBe(true);
    expect(enviadas).toEqual(['49000199|49']);
  });
  it('desfazer devolve a memória como estava, e a correção sai da fila se ainda não foi enviada', () => {
    const g = guardaNaMemoria(), f = criarFila(g);
    const mem = criarMemoria(g, () => 'Aracaju', (chave, lat, lng) => f.enfileirar({tipo: 'correcao', chave, lat, lng}));
    const p = {texto: 'Rua D, 49, CEP 49000-199', lat: 1, lng: 1} as any;
    mem.lembrar(p);
    const foto = mem.fotografar(p)!;
    Object.assign(p, {lat: 2, lng: 2});
    mem.lembrar(p);
    expect(f.pendentes()).toBe(2);
    mem.restaurar(foto);
    expect(f.desfazerCorrecao(foto.chave, 2, 2)).toBe('retirada');
    expect(f.pendentes()).toBe(1);
    const q = {texto: 'Rua D, 49, CEP 49000-199'} as any;
    mem.aplicar(q);
    expect([q.lat, q.lng]).toEqual([1, 1]);
    const novo = {texto: 'Rua E, 5, CEP 49000-198', lat: 3, lng: 3} as any;
    const antes = mem.fotografar(novo)!;
    mem.lembrar(novo);
    mem.restaurar(antes);
    expect(mem.aplicar({texto: 'Rua E, 5, CEP 49000-198'} as any)).toBe(false);
  });
  it('sem CEP nem bairro, não guarda', () => {
    const mem = criarMemoria(guardaNaMemoria(), () => 'Aracaju');
    expect(mem.lembrar({texto: 'Rua D, 10', lat: 1, lng: 1} as any)).toBe(false);
  });
});

describe('montar rota', () => {
  const p = (e: any, t: string) => e.paradas.find((x: any) => x.texto.startsWith(t)).id;
  it('sai do GPS e termina no ponto final escolhido', async () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, B, () => false);
    e.inicio = {id: 'inicio', lat: -10.93, lng: -37.08, exibido: ''};
    e.fim = {id: 'fim', lat: -10.93, lng: -37.055, exibido: ''};
    const rota = await montarRota(e, servicos);
    expect(rota.areas[0].ordem.at(-1)).toBe(p(e, 'Rua Leste, 5'));
    expect(rota.porRuas).toBe(false);
    expect(rota.fim).toBeDefined();
    expect(Object.keys(e.pernas)).toHaveLength(6);
  });
  it('compara com a ordem da planilha e deixa fora quem não tem posição ou já foi entregue', async () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, B, () => false);
    e.paradas[2].entregue = true;
    e.paradas[3].lat = null;
    const rota = await montarRota(e, servicos);
    expect(rota.areas[0].ordem).toHaveLength(4);
    expect(rota.mlDist).toBeGreaterThanOrEqual(rota.dist - 1e-6);
  });
  it('áreas com prazo vêm primeiro', async () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, B, () => false);
    e.areas.push({id: 'b2', nome: 'Azul', cor: '#2563eb', prazo: '10:00'});
    e.paradas[5].area = 'b2';
    const rota = await montarRota(e, servicos);
    expect(rota.areas.map(a => a.id)).toEqual(['b2', e.areas[1].id]);
  });
});

describe('previsões', () => {
  it('avisa quando a área estoura o prazo', async () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, B, () => false);
    e.areas[0].prazo = '08:05';
    await montarRota(e, servicos);
    const agora = new Date(2026, 8, 18, 8, 0).getTime();
    const prev = previsoes(e, agora)!;
    expect(prev.ritmo).toEqual({segundos: 180, medido: false});
    expect(prev.porArea[e.areas[0].id]!.estoura).toBe(true);
    e.areas[0].prazo = '12:00';
    expect(previsoes(e, agora)!.porArea[e.areas[0].id]!.estoura).toBe(false);
  });
});

describe('guardar estado e reset do dia', () => {
  it('o reset guarda cópia por 10 minutos e mantém cidade, chave e saída, mas não o ponto final', () => {
    const g = guardaNaMemoria(), e = estadoVazio();
    adicionarDaPlanilha(e, A, () => false);
    e.inicio = {id: 'inicio', lat: 1, lng: 1, exibido: '', texto: 'Galpão'};
    e.fim = {id: 'fim', lat: 2, lng: 2, exibido: ''};
    salvarEstado(g, e);
    const t = Date.now();
    const novo = resetarDia(g, e, t);
    expect(novo.paradas).toEqual([]);
    expect(novo.fim).toBeUndefined();
    expect(novo.inicio?.texto).toBe('Galpão');
    expect(carregarEstado(g).paradas).toEqual([]);
    expect(backupRecente(g, t + 5 * 60000)?.estado.paradas).toHaveLength(10);
    expect(backupRecente(g, t + 11 * 60000)).toBeNull();
  });
});

describe('fila da nuvem', () => {
  function servidor(falhas: {rede?: number; recusar?: string} = {}) {
    const chamadas: string[] = [];
    let rede = falhas.rede || 0;
    const c: ClienteNuvem = {
      async rotaExistente(at) { chamadas.push('existe ' + at); return null; },
      async criarRota(id, at) { if (rede-- > 0) throw new ErroNuvem('offline', true); chamadas.push('rota ' + at); },
      async inserirPacotes(id, ps) { chamadas.push('pacotes ' + ps.length); },
      async marcarEntregue(id, tns, q) { chamadas.push(`entregue ${tns.join(',')} ${q ? 'sim' : 'não'}`); },
      async inserirCorrecao(k) { if (falhas.recusar) throw new ErroNuvem(falhas.recusar, false); chamadas.push('correcao ' + k); },
      async apagarCorrecao(k, lat) { chamadas.push(`apagar ${k} ${lat}`); },
      async inserirObservacao(o) { if (falhas.recusar) throw new ErroNuvem(falhas.recusar, false); chamadas.push(`passagem ${o.chave} ${o.lat} ±${o.precisao}`); },
      async inserirLugar(l) { if (falhas.recusar) throw new ErroNuvem(falhas.recusar, false); chamadas.push(`lugar ${l.nomeChave} ${l.lat}`); },
      async lugaresConhecidos() { return []; },
      async registrar() {},
      async contarUso(dia, linhas) { if (falhas.recusar) throw new ErroNuvem(falhas.recusar, false); chamadas.push(`uso ${dia} ${linhas.map(l => `${l.botao}|${l.antes}=${l.vezes}`).join(' ')}`); },
      async posicoes() { return []; },
    };
    return {c, chamadas};
  }
  const e = estadoVazio();
  const {rotaDe} = adicionarDaPlanilha(e, A, () => false);
  const ops = operacoesDaPlanilha(A, rotaDe, 'Aracaju');

  it('agrupa a planilha em uma rota com todos os pacotes e a linha original', () => {
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({tipo: 'rota', chave: 'ATTESTE0001', at_id: 'ATTESTE0001'});
    const r = ops[0] as any;
    expect(r.pacotes).toHaveLength(12);
    expect(r.pacotes[1]).toMatchObject({spx_tn: 'BRTESTA0002', sequencia: 1, parada: 1, chave_lugar: '49000101|120'});
  });
  it('envia na ordem, e a entrega usa o id da rota criada', async () => {
    const g = guardaNaMemoria(), f = criarFila(g, () => 'uuid-1'), {c, chamadas} = servidor();
    f.enfileirar(...ops, {tipo: 'entregue', rota: 'ATTESTE0001', tns: ['BRTESTA0002'], quando: '2026-09-18T12:00:00Z'});
    await f.enviar(c);
    expect(chamadas).toEqual(['existe ATTESTE0001', 'rota ATTESTE0001', 'pacotes 12', 'entregue BRTESTA0002 sim']);
    expect(f.pendentes()).toBe(0);
    expect(g.ler(CHAVES.rotasNuvem, {})).toEqual({ATTESTE0001: 'uuid-1'});
  });
  it('sem internet, para e tenta de novo depois sem perder nada', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), {c, chamadas} = servidor({rede: 1});
    f.enfileirar(...ops);
    await f.enviar(c);
    expect(f.pendentes()).toBe(1);
    await f.enviar(c);
    expect(f.pendentes()).toBe(0);
    expect(chamadas.filter(x => x.startsWith('rota'))).toHaveLength(1);
  });
  it('envio recusado pelo servidor sai da fila e fica registrado', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), {c} = servidor({recusar: 'row-level security'});
    f.enfileirar({tipo: 'correcao', chave: 'x|1', lat: 1, lng: 1});
    await f.enviar(c);
    expect(f.pendentes()).toBe(0);
    expect(f.erro()).toContain('row-level security');
  });
  it('passagem recusada some sem assustar o motorista', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), {c} = servidor({recusar: 'tabela não existe'});
    f.enfileirar({tipo: 'observacao', chave: 'x|1', lat: 1, lng: 1, precisao: 10, endereco: 'Rua Um, 1', rua: 'Rua Um', ruaChave: 'um'});
    await f.enviar(c);
    expect(f.pendentes()).toBe(0);
    expect(f.erro()).toBe('');
  });
  it('sem login, não envia', async () => {
    const g = guardaNaMemoria(), f = criarFila(g);
    f.enfileirar(...ops);
    await f.enviar(null);
    expect(f.pendentes()).toBe(1);
  });

  // O contador de botões manda o acumulado do dia a cada toque. Se cada um virasse uma operação,
  // um dia de rota deixaria centenas delas na fila esperando rede.
  it('o retrato do uso substitui o anterior em vez de empilhar', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), {c, chamadas} = servidor();
    f.contarUso('2026-09-23', [{botao: 'ver', antes: '', vezes: 1}]);
    f.contarUso('2026-09-23', [{botao: 'ver', antes: '', vezes: 2}]);
    f.contarUso('2026-09-24', [{botao: 'ver', antes: '', vezes: 1}]);
    await f.enviar(c);
    expect(chamadas).toEqual(['uso 2026-09-23 ver|=2', 'uso 2026-09-24 ver|=1']);
  });

  it('o contador não entra no "para enviar" do motorista', () => {
    const f = criarFila(guardaNaMemoria());
    f.contarUso('2026-09-23', [{botao: 'ver', antes: '', vezes: 1}]);
    expect(f.pendentes()).toBe(0);
    f.enfileirar({tipo: 'correcao', chave: 'x|1', lat: 1, lng: 1});
    expect(f.pendentes()).toBe(1);
  });

  it('contador recusado pelo servidor some sem assustar o motorista', async () => {
    const f = criarFila(guardaNaMemoria()), {c} = servidor({recusar: 'tabela não existe'});
    f.contarUso('2026-09-23', [{botao: 'ver', antes: '', vezes: 1}]);
    await f.enviar(c);
    expect(f.erro()).toBe('');
  });
});

describe('desfazer correção já enviada', () => {
  it('se a correção já saiu da fila, o desfazer vira um pedido para apagar na nuvem', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), chamadas: string[] = [];
    const c = {
      rotaExistente: async () => null, criarRota: async () => {}, inserirPacotes: async () => {}, marcarEntregue: async () => {},
      inserirCorrecao: async (k: string) => { chamadas.push('correcao ' + k); },
      apagarCorrecao: async (k: string, lat: number) => { chamadas.push(`apagar ${k} ${lat}`); },
      inserirObservacao: async () => {},
      inserirLugar: async () => {},
      lugaresConhecidos: async () => [],
      registrar: async () => {},
      contarUso: async () => {},
      posicoes: async () => [],
    };
    f.enfileirar({tipo: 'correcao', chave: 'k|1', lat: -11.5, lng: -37.5});
    await f.enviar(c);
    expect(f.desfazerCorrecao('k|1', -11.5, -37.5)).toBe('apagar');
    await f.enviar(c);
    expect(chamadas).toEqual(['correcao k|1', 'apagar k|1 -11.5']);
  });
});

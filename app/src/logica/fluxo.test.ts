import {readFileSync} from 'node:fs';
import XLSX from 'xlsx';
import {BUSCAS_MAX, ErroNuvem, FILA_MAX, criarFila, operacoesDaPlanilha, type ClienteNuvem} from './fila';
import {CHAVES, backupRecente, carregarEstado, estadoVazio, guardaEm, guardaNaMemoria, resetarDia, salvarEstado} from './guarda';
import {adicionarDaPlanilha, adicionarLinhas, resumoPlanilha} from './importar';
import {criarMemoria} from './memoria';
import {montarRota} from './montagem';
import {matrizAproximada} from './otimizacao';
import {itensDaPlanilha} from './planilha';
import {previsoes} from './previsao';
import {montarEvento} from './telemetria';
import {juntarLeituras, juntarQuadros} from './texto';

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
    expect(resumoPlanilha(resumo)).toBe('10 parada(s) da planilha, 2 pacote(s) somado(s) a um mesmo endereço. 1 com posição longe das outras entregas: confira o pino antes de sair.');
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
  // 29/09: o endereço de uma parada mudou (Editar, ou o link colado que apagava o texto) e a
  // planilha foi lida de novo. Pelo texto a linha não achava par e entrava outra vez: dois pinos
  // da mesma entrega, e ele teve de apagar um. O código do pacote não muda com o endereço.
  it('a mesma planilha de novo não duplica a parada cujo endereço foi editado', () => {
    const e = estadoVazio();
    adicionarDaPlanilha(e, A, () => false);
    const d = e.paradas.find(p => p.texto.startsWith('Rua D, 49'))!;
    expect(d.pacotes!.length, 'a planilha de teste traz o código do pacote').toBeGreaterThan(0);
    d.texto = 'Rua Dê Corrigida, 49';
    const {resumo} = adicionarDaPlanilha(e, A, () => false);
    expect(resumo.novas).toBe(0);
    expect(e.paradas.filter(p => p.pacotes!.some(tn => d.pacotes!.includes(tn)))).toEqual([d]);
  });
  it('texto colado ignora repetidos, inclusive pelo número do app', () => {
    const e = estadoVazio();
    expect(adicionarLinhas(e, ['18 Rua A, 10', '18 Rua A, 10', 'Rua B Longa, 20'])).toMatchObject({novas: 2, repetidas: 1});
    expect(e.paradas[0]).toMatchObject({ml: '18', precisao: 'pendente'});
  });
  // 15/10: o leitor devolve uma linha por cartão, e cartões iguais na mesma porta são entregas
  // diferentes; colar o mesmo endereço duas vezes é engano. Só o repetido que a leitura viu multiplica.
  it('repetido colado continua uma parada; lido, uma por cartão, até quantas a leitura viu', () => {
    const e = estadoVazio(), igual = 'Avenida Teste Inventada 2000', outra = 'Rua B Longa, 20';
    expect(adicionarLinhas(e, [igual, igual, outra])).toMatchObject({novas: 2, repetidas: 1});
    const lidas = [igual, igual, igual, outra];
    expect(adicionarLinhas(e, lidas, lidas)).toMatchObject({novas: 2, repetidas: 2});
    expect(adicionarLinhas(e, lidas, lidas)).toMatchObject({novas: 0, repetidas: 4});
    // um quarto digitado a mais do que a leitura viu não vira parada
    expect(adicionarLinhas(e, [igual, igual, igual, igual], lidas)).toMatchObject({novas: 0, repetidas: 4});
    expect(e.paradas.filter(p => p.texto === igual)).toHaveLength(3);
  });

  it('ler a mesma gravação de novo não dobra a rota', () => {
    const e = estadoVazio(), igual = 'Avenida Teste Inventada 2000', outra = 'Rua B Longa, 20';
    const quadros = [[igual, igual], [igual, igual, igual, outra], [outra]];
    const ler = () => juntarQuadros(quadros.map(q => juntarLeituras([q])));
    const lidas = ler();
    expect(lidas).toEqual([igual, igual, igual, outra]);
    expect(adicionarLinhas(e, lidas, lidas)).toMatchObject({novas: 4});
    const deNovo = ler();
    expect(adicionarLinhas(e, deNovo, deNovo)).toMatchObject({novas: 0, repetidas: 4});
    expect(e.paradas).toHaveLength(4);
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
  it('o reset guarda cópia por 10 minutos e mantém cidade e chave, mas não a saída de ontem nem o ponto final', () => {
    const g = guardaNaMemoria(), e = estadoVazio();
    adicionarDaPlanilha(e, A, () => false);
    e.inicio = {id: 'inicio', lat: 1, lng: 1, exibido: '', texto: 'Galpão'};
    e.fim = {id: 'fim', lat: 2, lng: 2, exibido: ''};
    salvarEstado(g, e);
    const t = Date.now();
    const novo = resetarDia(g, e, t);
    expect(novo.paradas).toEqual([]);
    expect(novo.fim).toBeUndefined();
    expect(novo.inicio).toBeNull();
    expect(carregarEstado(g).paradas).toEqual([]);
    expect(backupRecente(g, t + 5 * 60000)?.estado.paradas).toHaveLength(10);
    expect(backupRecente(g, t + 11 * 60000)).toBeNull();
  });
});

describe('fila da nuvem', () => {
  function servidor(falhas: {rede?: number; recusar?: string; buscaRede?: number; buscaRecusada?: boolean; aoRegistrarBusca?: () => void} = {}) {
    const chamadas: string[] = [];
    let rede = falhas.rede || 0, buscaRede = falhas.buscaRede || 0;
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
      async inserirReclamacao(k, m) { if (falhas.recusar) throw new ErroNuvem(falhas.recusar, false); chamadas.push(`xarope ${k} ${m}`); },
      async tirarReclamacao(k, m) { chamadas.push(`tirar xarope ${k} ${m}`); },
      async reclamacoes() { return []; },
      async abrirLinkDoMapa() { return null; },
      async registrarBusca(ev) {
        if (buscaRede-- > 0) throw new ErroNuvem('offline', true);
        if (falhas.buscaRecusada) throw new ErroNuvem('new row violates row-level security policy', false);
        chamadas.push('busca ' + ev.id);
        falhas.aoRegistrarBusca?.();
      },
    };
    return {c, chamadas};
  }
  const busca = (id: string) => montarEvento({id, motorista: 'm1', origem: 'colada', quando: new Date(0), versao: 'v', paradas: 1,
    pendentes: [{id: 'p1', achada: null, lat: -10.9, lng: -37.05, fonte: 'IBGE'}], medicao: {tempo_ms: 1000, fontes: {
      nominatim: {chamadas: 0, ms: 0, espera: 0}, cep: {chamadas: 0, ms: 0, espera: 0}, censo: {chamadas: 1, ms: 10, espera: 0}, banco: {chamadas: 0, ms: 0, espera: 0}},
    paradas: new Map()}});
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

  // Marcou "cliente xarope" e desfez sem sinal: as duas saem na ordem em que ele tocou, senão a
  // marcação desfeita reapareceria para todo mundo.
  it('marcar e tirar cliente xarope saem na ordem', async () => {
    const f = criarFila(guardaNaMemoria()), {c, chamadas} = servidor();
    f.enfileirar({tipo: 'reclamacao', chave: 'x|1', motivo: 'vizinho'}, {tipo: 'tirarReclamacao', chave: 'x|1', motivo: 'vizinho'});
    await f.enviar(c);
    expect(chamadas).toEqual(['xarope x|1 vizinho', 'tirar xarope x|1 vizinho']);
  });

  // É trabalho dele, não medição nossa: recusado (a 018 não rodou), tem de aparecer.
  it('cliente xarope recusado pelo servidor fica registrado', async () => {
    const f = criarFila(guardaNaMemoria()), {c} = servidor({recusar: 'relation "reclamacoes" does not exist'});
    f.enfileirar({tipo: 'reclamacao', chave: 'x|1', motivo: 'jogado'});
    await f.enviar(c);
    expect(f.erro()).toContain('reclamacoes');
  });

  // A telemetria da busca de lista (026) nunca passa na frente do trabalho do motorista.
  it('o registro da busca só sai depois do trabalho do motorista', async () => {
    const f = criarFila(guardaNaMemoria()), {c, chamadas} = servidor();
    f.guardarBusca(busca('b1'));
    f.enfileirar({tipo: 'correcao', chave: 'x|1', lat: 1, lng: 1});
    await f.enviar(c);
    expect(chamadas).toEqual(['correcao x|1', 'busca b1']);
    expect(f.buscas()).toBe(0);
  });
  it('o que o motorista faz enquanto um registro vai passa na frente do próximo', async () => {
    let f: ReturnType<typeof criarFila>;
    const {c, chamadas} = servidor({aoRegistrarBusca: () => { if (chamadas.length === 1) f.enfileirar({tipo: 'correcao', chave: 'x|1', lat: 1, lng: 1}); }});
    f = criarFila(guardaNaMemoria());
    f.guardarBusca(busca('b1'));
    f.guardarBusca(busca('b2'));
    await f.enviar(c);
    expect(chamadas).toEqual(['busca b1', 'correcao x|1', 'busca b2']);
  });
  it('sem internet o registro fica, e volta com o mesmo id', async () => {
    const g = guardaNaMemoria(), f = criarFila(g), {c, chamadas} = servidor({buscaRede: 1});
    f.guardarBusca(busca('b1'));
    await f.enviar(c);
    expect(chamadas).toEqual([]);
    expect(f.buscas()).toBe(1);
    // fechar e abrir o app: a fila é lida de novo do aparelho
    const outra = criarFila(g);
    await outra.enviar(c);
    expect(chamadas).toEqual(['busca b1']);
    expect(outra.buscas()).toBe(0);
  });
  it('registro recusado (motorista desativado, outra conta) sai calado', async () => {
    const f = criarFila(guardaNaMemoria()), {c} = servidor({buscaRecusada: true});
    f.guardarBusca(busca('b1'));
    await f.enviar(c);
    expect(f.buscas()).toBe(0);
    expect(f.erro()).toBe('');
  });
  it('o registro não entra na fila do motorista, nem com ela cheia, e guarda no máximo 30', () => {
    const g = guardaNaMemoria(), f = criarFila(g);
    f.enfileirar(...Array.from({length: FILA_MAX}, (_, i) => ({tipo: 'correcao' as const, chave: 'x|' + i, lat: 1, lng: 1})));
    for (let i = 0; i < 40; i++) f.guardarBusca(busca('b' + i));
    const dele = g.ler<{chave: string}[]>(CHAVES.fila, []);
    expect(dele).toHaveLength(FILA_MAX);
    expect(dele[0].chave).toBe('x|0');
    expect(f.pendentes()).toBe(FILA_MAX);
    expect(f.buscas()).toBe(BUSCAS_MAX);
    expect(g.ler<{id: string}[]>(CHAVES.buscas, [])[0].id).toBe('b10');
  });
  it('guardar de novo o mesmo registro não duplica', () => {
    const f = criarFila(guardaNaMemoria());
    f.guardarBusca(busca('b1'));
    f.guardarBusca(busca('b1'));
    expect(f.buscas()).toBe(1);
  });

  // Auditoria da fila, primeira rodada (20/10): o retrato de como é HOJE, defeitos incluídos.
  // Quando um conserto mudar o comportamento, o teste muda junto, com a decisão escrita.
  it('hoje: passando de 3.000, a fila descarta os mais antigos calada, e sem a rota a entrega dela também se perde', async () => {
    const g = guardaNaMemoria(), f = criarFila(g, () => 'uuid-1'), {c, chamadas} = servidor();
    f.enfileirar(...ops, {tipo: 'entregue', rota: 'ATTESTE0001', tns: ['BRTESTA0002'], quando: '2026-10-20T12:00:00Z'});
    f.enfileirar(...Array.from({length: FILA_MAX - 2}, (_, i) => ({tipo: 'observacao' as const, chave: 'x|' + i, lat: 1, lng: 1, precisao: 10, endereco: 'Rua Um, 1', rua: 'Rua Um', ruaChave: 'um'})));
    expect(f.pendentes()).toBe(FILA_MAX);
    f.enfileirar({tipo: 'correcao', chave: 'nova|1', lat: 1, lng: 1});
    const tipos = g.ler<{tipo: string}[]>(CHAVES.fila, []).map(o => o.tipo);
    expect(tipos).toHaveLength(FILA_MAX);
    // o mais antigo, a rota da planilha, saiu para a correção nova entrar
    expect(tipos).not.toContain('rota');
    expect(tipos[0]).toBe('entregue');
    // a primeira passagem para por falta de rede: o que importa é o envio da entrega, antes dela
    c.inserirObservacao = async () => { throw new ErroNuvem('offline', true); };
    await f.enviar(c);
    // sem a rota criada, a entrega não tem para onde ir: sai da fila sem ir a lugar nenhum, e nada avisa
    expect(chamadas.some(x => x.startsWith('rota') || x.startsWith('entregue'))).toBe(false);
    expect(g.ler<{tipo: string}[]>(CHAVES.fila, []).map(o => o.tipo)).not.toContain('entregue');
    expect(f.erro()).toBe('');
  });
  it('hoje: com a memória do aparelho cheia, o que entra na fila, nas seguradas e no estado se perde calado', () => {
    const dados: Record<string, string> = {};
    let cheio = false;
    const g = guardaEm({getItem: k => dados[k] ?? null, setItem: (k, v) => { if (cheio) throw new DOMException('cheio', 'QuotaExceededError'); dados[k] = v; }});
    const f = criarFila(g);
    f.enfileirar({tipo: 'correcao', chave: 'antes|1', lat: 1, lng: 1});
    cheio = true;
    expect(() => f.enfileirar({tipo: 'entregue', rota: 'R1', tns: ['BRTESTA0002'], quando: '2026-10-20T12:00:00Z'})).not.toThrow();
    f.segurar('p1', [{tipo: 'correcao', chave: 'porta|1', lat: 1, lng: 1}], Date.now() + 1000);
    expect(g.ler<{tipo: string}[]>(CHAVES.fila, []).map(o => o.tipo)).toEqual(['correcao']);
    expect(g.ler(CHAVES.seguradas, [])).toEqual([]);
    expect(f.erro()).toBe('');
    // o estado também não grava; quem chama recebe false (e hoje ninguém olha)
    expect(salvarEstado(g, estadoVazio())).toBe(false);
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
      inserirReclamacao: async () => {},
      tirarReclamacao: async () => {},
      reclamacoes: async () => [],
      registrarBusca: async () => {},
      abrirLinkDoMapa: async () => null,
    };
    f.enfileirar({tipo: 'correcao', chave: 'k|1', lat: -11.5, lng: -37.5});
    await f.enviar(c);
    expect(f.desfazerCorrecao('k|1', -11.5, -37.5)).toBe('apagar');
    await f.enviar(c);
    expect(chamadas).toEqual(['correcao k|1', 'apagar k|1 -11.5']);
  });
});

describe('endereço colado com o local do mapa', () => {
  it('a coordenada colada vira a posição, e o endereço fica sem o link', () => {
    const e = estadoVazio();
    const r = adicionarLinhas(e, [
      'Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100 https://www.google.com/maps/place/x/@-10.94,-37.06,17z/data=!3m1!4b1!8m2!3d-10.9436218!4d-37.0527487',
      'Rua Sem Link 50, Jardins',
    ]);
    expect(r.novas).toBe(2);
    expect(r.coladas).toHaveLength(1);
    expect(e.paradas[0]).toMatchObject({precisao: 'manual', fonte: 'link do mapa'});
    expect(e.paradas[0].lat).toBeCloseTo(-10.9436218, 6);
    expect(e.paradas[0].texto).toBe('Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100');
    // a que veio sem link continua indo para a busca
    expect(e.paradas[1]).toMatchObject({precisao: 'pendente', lat: null});
  });

  it('o local colado é guardado e vai para os outros motoristas', () => {
    const g = guardaNaMemoria(), enviadas: string[] = [];
    const mem = criarMemoria(g, () => 'Aracaju', k => enviadas.push(k));
    const e = estadoVazio();
    const {coladas} = adicionarLinhas(e, ['Av. Deputado Sílvio Teixeira, 184, Jardins, CEP 49025-100 https://maps.google.com/?q=-10.9436218,-37.0527487']);
    expect(coladas).toHaveLength(1);
    expect(mem.lembrar(coladas[0])).toBe(true);
    expect(enviadas).toEqual(['49025100|184']);
  });
});

// Ele foi buscar as portas no Google e colou de volta. O título que o Google copia traz o CEP e a
// linha lida do cartão fechado do Meli não traz, então a chave inteira não bate — o que bate é a
// rua e o número. Sem isso, colar as cinco portas da avenida criava cinco paradas a mais.
describe('colar a porta de uma parada que já está na lista', () => {
  const LINK = 'https://www.google.com/maps/place/x/@-10.94,-37.06,17z/data=!3m1!4b1!8m2!3d-10.9436218!4d-37.0527487';

  it('arruma a parada em vez de criar outra', () => {
    const e = estadoVazio();
    adicionarLinhas(e, ['Avenida Deputado Sílvio Teixeira 184']);
    expect(e.paradas).toHaveLength(1);
    const r = adicionarLinhas(e, [`Av. Deputado Sílvio Teixeira, 184 - Jardins, Aracaju - SE, 49025-100 ${LINK}`]);
    expect(r).toMatchObject({novas: 0, arrumadas: 1});
    expect(e.paradas, 'não pode virar duas paradas').toHaveLength(1);
    expect(e.paradas[0].lat).toBeCloseTo(-10.9436218, 6);
    expect(e.paradas[0]).toMatchObject({precisao: 'manual', fonte: 'link do mapa'});
  });

  it('duas entregas na mesma porta são arrumadas juntas', () => {
    const e = estadoVazio();
    adicionarLinhas(e, ['Rua A Longa 215, Loja Um', 'Rua A Longa 215, Loja Dois']);
    expect(e.paradas).toHaveLength(2);
    const r = adicionarLinhas(e, [`Rua A Longa, 215 - Jardins ${LINK}`]);
    expect(r).toMatchObject({arrumadas: 2, novas: 0});
    expect(e.paradas.every(p => p.precisao === 'manual')).toBe(true);
  });

  it('porta de rua que não está na lista continua entrando como parada nova', () => {
    const e = estadoVazio();
    const r = adicionarLinhas(e, [`Rua Que Nao Estava 90, Jardins ${LINK}`]);
    expect(r).toMatchObject({novas: 1, arrumadas: 0});
  });
});

// Revisão de 05/10: a porta de uma entrega espera o prazo de desfazer numa chave à parte da fila,
// gravada, e o desfazer a tira de lá pela parada.
describe('porta segurada até o prazo de desfazer', () => {
  const passagem = (chave: string) => ({tipo: 'observacao' as const, chave, lat: 1, lng: 1, precisao: 10, endereco: 'Rua Um, 1', rua: 'Rua Um', ruaChave: 'um'});
  const lugar = {tipo: 'lugar' as const, nomeChave: 'flores', nome: 'Condomínio das Flores', cidade: 'aracaju', lat: 1, lng: 1, endereco: 'Rua Um, 1'};

  it('não entra na fila antes do prazo, nem conta como "para enviar"', () => {
    const g = guardaNaMemoria(), f = criarFila(g);
    f.segurar('p1', [passagem('x|1'), lugar], 1000);
    expect(f.liberar(999)).toBe(1000);
    expect(f.pendentes()).toBe(0);
    expect(f.liberar(1000)).toBeNull();
    expect(g.ler(CHAVES.fila, [])).toEqual([passagem('x|1'), lugar]);
  });

  it('soltar tira só as da parada desfeita, e a outra vence no prazo dela', () => {
    const g = guardaNaMemoria(), f = criarFila(g);
    f.segurar('p1', [passagem('x|1'), lugar], 1000);
    f.segurar('p2', [passagem('x|2')], 2000);
    expect(f.soltar('p1')).toBe(1);
    expect(f.liberar(1500)).toBe(2000);
    expect(f.pendentes()).toBe(0);
    expect(f.liberar(2000)).toBeNull();
    expect(g.ler(CHAVES.fila, [])).toEqual([passagem('x|2')]);
  });

  it('fica gravada: o app fechado e aberto de novo solta no prazo', () => {
    const g = guardaNaMemoria();
    criarFila(g).segurar('p1', [passagem('x|1')], 1000);
    const reaberta = criarFila(g);
    expect(reaberta.liberar(1000)).toBeNull();
    expect(reaberta.pendentes()).toBe(1);
  });
});

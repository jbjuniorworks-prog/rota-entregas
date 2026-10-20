import {operacoesDaPlanilha} from '../logica/fila';
import {cidadeDaParada, haversine, levarGenericaAoBairro, levarGenericaParaARua, levarParaOCenso, marcarIsoladas, marcarPontoGenerico, mediana, marcarNumerosIncoerentes, moverGenericasPeloBairro, moverParaOBairro, moverPeloBairro, voltarDoBairro} from '../logica/geo';
import {adicionarDaPlanilha, adicionarLinhas, novoId, resumoPlanilha} from '../logica/importar';
import {CORES, DA_PLANILHA} from '../logica/rotulos';
import {medidor, montarEvento, origemDe, tipoDoArquivo, type OrigemLista} from '../logica/telemetria';
import {decompor, extrairEnderecos, lerEdicao, ruaGenerica} from '../logica/texto';
import type {Parada, Ponto, Precisao} from '../logica/tipos';
import {loja, status} from '../loja';
import {lerArquivos, lerPlanilhas, separarPlanilhas} from '../servicos/arquivos';
import {carregarAncorasDeCep} from '../servicos/base';
import {centroDaCidade, centroDoBairro, geocodificar, usarRegiao} from '../servicos/geocodificacao';
import {corretorDeNomes, enderecoDoIbge, nomeCorrigidoPeloCenso, portaNoBairroDoIbge, portasDaRuaNoIbge, portasDoCep, ruaNoIbge} from '../servicos/ibge';
import {nuvem} from '../servicos/nuvem';
import {desatualizarRota, e, enviarFila, fila, invalidarRota, memoria, ui} from './base';
import {irPara} from './navegacao';
import {avisoCompartilhadas, consultarCompartilhadas, corrigirPosicao, focar} from './posicoes';
import {registrarComoFicou} from './registro';
import {montarRota} from './rota';
import {semRecarregar} from './versao';

export const RAIO_REGIAO = 100000;

export async function garantirRegiao(): Promise<void> {
  const est = e(), cidade = est.cidade.trim();
  if (est.regiao && est.regiao.nome === (cidade || 'entregas')) { usarRegiao(est.regiao); return; }
  if (cidade) {
    try {
      const c = await centroDaCidade(cidade);
      if (c) est.regiao = {nome: cidade, lat: c.lat, lng: c.lng, raio: RAIO_REGIAO};
    } catch {}
  }
  if (!cidade && (!est.regiao || est.regiao.nome !== 'entregas')) {
    const comLocal = est.paradas.filter(p => p.lat != null && p.lng != null);
    const base = comLocal.length >= 3
      ? {lat: mediana(comLocal.map(p => p.lat!)), lng: mediana(comLocal.map(p => p.lng!))}
      : est.inicio;
    est.regiao = base ? {nome: 'entregas', lat: base.lat, lng: base.lng, raio: RAIO_REGIAO} : null;
  }
  usarRegiao(est.regiao || null);
  loja.mudou();
}

export function centroDasEntregas() {
  const comLocal = e().paradas.filter(p => p.lat != null && p.lng != null);
  if (comLocal.length) return {lat: mediana(comLocal.map(p => p.lat!)), lng: mediana(comLocal.map(p => p.lng!))};
  const r = e().regiao;
  return r ? {lat: r.lat, lng: r.lng} : null;
}

export async function buscarParada(p: Parada) {
  if (memoria.aplicar(p)) return;
  await garantirRegiao();
  // Enquanto a busca anda, ele pode marcar a porta no mapa, e a resposta que chega depois não passa
  // por cima da marcação dele. Numa lista de 60 a busca leva mais de um minuto; um teste que
  // falhou uma vez em 09/10 mostrou a resposta atrasada apagando o "Local definido".
  const marcouNoMeio = () => p.precisao !== 'pendente';
  try {
    const cands = await geocodificar(p.texto, {cidade: p.cidade || e().cidade, perto: centroDasEntregas(), bairro: p.bairro || ''});
    if (marcouNoMeio()) return;
    p.candidatos = cands;
    // A linha do Mercado Livre com o cartão fechado vem só "Avenida Tal 184": sem CEP e sem
    // bairro, `chaveLugar` devolve null e a marcação que o motorista faz na porta não tem onde
    // ser guardada nem como chegar aos outros. Quem achou o endereço sabe o bairro — a parada
    // adota ele, e aí a porta marcada uma vez vale para sempre.
    if (cands[0]) {
      if (!p.bairro && cands[0].bairro) p.bairro = cands[0].bairro;
      // E aqui a memória é consultada DE NOVO. Sem isto, amanhã a mesma linha crua chega sem
      // bairro, a chave volta a dar null lá em cima e o app guarda a porta todo dia sem nunca
      // usá-la — a marcação dele valeria só para o dia em que foi feita.
      if (memoria.aplicar(p, cands[0])) return;
    }
    if (cands.length) Object.assign(p, {lat: cands[0].lat, lng: cands[0].lng, exibido: cands[0].exibido, precisao: cands[0].precisao, fonte: cands[0].fonte});
    else Object.assign(p, {lat: null, lng: null, exibido: '', precisao: 'nao', fonte: 'nao achou'});
  } catch (err) {
    if (marcouNoMeio()) return;
    p.precisao = 'pendente';
    throw err;
  }
}

export async function buscarPendentes(resumoAntes = '', origem: OrigemLista = 'de_novo') {
  if (ui.ocupado) return;
  const alvo = e().paradas.filter(p => p.precisao === 'pendente');
  if (!alvo.length) return;
  ui.ocupado = true;
  medidor.comecar();
  await garantirRegiao();
  // Uma consulta só, antes de começar: onde ficam os CEPs desta rota, pelo que já foi entregue.
  await carregarAncorasDeCep(alvo.map(p => decompor(p.texto).cep || '').filter(Boolean));
  let erro: Error | null = null;
  for (let i = 0; i < alvo.length; i++) {
    status(`Buscando endereços… ${i + 1} de ${alvo.length}`);
    // a que ele já marcou enquanto a lista andava não é mais buscada
    if (alvo[i].precisao !== 'pendente') continue;
    medidor.naParada(alvo[i].id);
    try { await buscarParada(alvo[i]); } catch (err) { erro = err as Error; }
    medidor.naParada(null);
    loja.mudou();
  }
  ui.ocupado = false;
  const longe = marcarIsoladas(e().paradas);
  ui.enquadrar++;
  loja.mudou();
  const resultado = erro ? 'Alguns falharam (' + erro.message + '). Toque em "Buscar sem posição", em Conferir endereços.'
    : longe ? `Pronto! ${longe} parada(s) longe das outras entregas: confira o pino.` : 'Pronto! Confira os laranja e os vermelhos, se houver.';
  // onde a busca pôs cada uma, antes de as portas da nuvem passarem por cima
  const achadas = new Map(alvo.map(p => [p.id, p.lat != null && p.lng != null ? {lat: p.lat, lng: p.lng} : null]));
  const comp = avisoCompartilhadas(await consultarCompartilhadas());
  guardarBuscaDaLista(alvo, achadas, origem);
  registrarComoFicou();
  enviarFila();
  status((resumoAntes ? `${resumoAntes} Busca dos sem posição: ${resultado}` : resultado) + comp, resumoAntes || comp ? 15000 : longe ? 8000 : 4000);
}

// O registro desta busca (026), só com números. Vai com o id de quem buscou: se outra conta entrar
// no aparelho antes do envio, o banco recusa em vez de pôr no nome dela. O que der errado aqui
// fica sem registro e não atrapalha a busca.
function guardarBuscaDaLista(alvo: Parada[], achadas: Map<string, Ponto | null>, origem: OrigemLista) {
  const medicao = medidor.terminar();
  const motorista = nuvem.sessao?.user.id;
  if (!medicao || !motorista) return;
  try {
    fila.guardarBusca(montarEvento({
      id: crypto.randomUUID(), motorista, origem, quando: new Date(), versao: __VERSAO__.id, paradas: e().paradas.length,
      pendentes: alvo.map(p => ({id: p.id, achada: achadas.get(p.id) || null, lat: p.lat, lng: p.lng, fonte: p.fonte})), medicao,
    }));
  } catch {}
}

// As longe da planilha, e o ponto genérico que nem o censo nem as outras entregas do bairro
// resolveram: o centro do bairro pelo mapa, da cidade de cada uma.
async function levarAoBairroPeloMapa(soGenericas = false): Promise<{longe: number; genericas: number}> {
  const perto = e().paradas.filter(p => p.lat != null && p.lng != null && p.precisao !== 'longe' && !p.pontoGenerico);
  const sozinhas = e().paradas.filter(p => !p.entregue && p.bairro && ((p.pontoGenerico && p.precisao === 'aproximada') || (!soGenericas && p.precisao === 'longe' && DA_PLANILHA.has(p.precisaoAntes!))));
  const n = {longe: 0, genericas: 0};
  if (!perto.length || !sozinhas.length) return n;
  const centro = {lat: mediana(perto.map(p => p.lat!)), lng: mediana(perto.map(p => p.lng!))};
  for (const p of sozinhas) {
    status(`Procurando o bairro ${p.bairro} no mapa…`);
    try {
      const c = await centroDoBairro(p.bairro!, cidadeDaParada(p, e().cidade));
      if (!c || haversine(c, centro) >= 20000) continue;
      if (p.pontoGenerico) { levarGenericaAoBairro(p, c); n.genericas++; } else { moverParaOBairro(p, c, p.bairro!); n.longe++; }
    } catch {}
  }
  if (n.longe || n.genericas) desatualizarRota(true);
  return n;
}

// Antes da nuvem: a porta que alguém já entregou passa por cima do censo também.
// As refinadas andam poucos metros: a sequência e o tempo da rota continuam valendo, e a barra de
// "as posições mudaram, refazer rota" seria barulho, ainda mais ao abrir o app no meio do dia.
async function conferirComOCenso(): Promise<{levadas: number; refinadas: number; genericas: number; foraDoCep: number}> {
  const {levadas, refinadas, genericas, foraDoCep} = await levarParaOCenso(e().paradas, e().cidade,
    {porta: (cep, numero, cidade) => enderecoDoIbge(cep, numero, cidade, true), rua: portasDaRuaNoIbge, cep: portasDoCep,
      existe: ruaNoIbge, noBairro: portaNoBairroDoIbge});
  // O desatualizar também marca as isoladas. A que sai de longe do próprio CEP pode cair longe do
  // resto da rota, e o vermelho de longe das outras entregas é o aviso de que ela nem é deste
  // trajeto (Pedro, 08/10: 11,7 km).
  if (levadas.length || genericas.length || foraDoCep.length) desatualizarRota(true);
  return {levadas: levadas.length, refinadas: refinadas.length, genericas: genericas.length, foraDoCep: foraDoCep.length};
}

// O ponto que a planilha repete para vários bairros: a porta do censo, se ele tem; senão a rua,
// pela busca de endereço; senão o meio das outras entregas do mesmo bairro; senão o centro do
// bairro pelo mapa. Sem aviso: o app
// decide, e o pino vai laranja ou vermelho conforme o que achou.
async function genericasNoLugar(): Promise<number> {
  let n = 0;
  // A rua, pela busca de endereço: só vale se ela achou a rua, e não só o bairro. Nome genérico
  // ("Rua I") fica de fora, como no censo: a busca achou a Rua I do Pontal da Barra para uma
  // entrega do Governador Marcelo Déda, na planilha do Jeferson.
  for (const p of e().paradas.filter(x => x.pontoGenerico && x.precisao === 'aproximada' && !x.entregue && !ruaGenerica(decompor(x.texto).rua))) {
    try {
      const [c] = await geocodificar(p.texto, {cidade: cidadeDaParada(p, e().cidade), perto: centroDasEntregas(), bairro: p.bairro || ''});
      if (c && NA_RUA.has(c.precisao)) { levarGenericaParaARua(p, c); n++; }
    } catch {}
  }
  n += moverGenericasPeloBairro(e().paradas).length;
  if (n) desatualizarRota(true);
  return n;
}
const NA_RUA: ReadonlySet<Precisao> = new Set<Precisao>(['exato', 'bom', 'rua', 'censo']);

// A "Não encontrado" de uma leitura de antes da correção de nomes (11/10) ficava assim para sempre: a
// busca só volta a ela se alguém editar o texto. Ao abrir, a que o censo sabe corrigir é buscada de
// novo, e a busca agora tenta o nome do censo. As outras ficam, para não perguntar ao mapa, a cada
// abertura, o que ele já disse que não tem.
export async function buscarDeNovoOsNomesTortos() {
  const tortas: Parada[] = [];
  for (const p of e().paradas) {
    if (p.precisao === 'nao' && !p.entregue && await nomeCorrigidoPeloCenso(p.texto, cidadeDaParada(p, e().cidade))) tortas.push(p);
  }
  if (!tortas.length) return;
  for (const p of tortas) p.precisao = 'pendente';
  await buscarPendentes();
}

// A rota que já estava na tela também passa pelo censo: lida por uma versão de antes da regra, ou
// com o censo ainda sem baixar, atualizar o app não consertava nada (Luan, 02/10). Quem já está
// na porta do censo, ou foi escolhido por ele, não é mais 'planilha' e não volta a ser mexido.
export async function conferirComOCensoAoAbrir() {
  // a rota lida antes de 09/10 pode ter levado um grupo inteiro para o bairro do mapa (Leudy)
  const deVolta = voltarDoBairro(e().paradas).length;
  if (deVolta) desatualizarRota(true);
  // e o "número não bate" gravado antes vale de novo pela regra de hoje, que deixa a rodovia de
  // fora: antes do censo, como na leitura da planilha (Leudy: 10 vermelhos na rodovia)
  const tinham = e().paradas.filter(p => p.precisao === 'numero');
  tinham.forEach(p => { p.precisao = 'planilha'; });
  const numerosMudaram = tinham.length !== marcarNumerosIncoerentes(e().paradas);
  // a longe das outras do mesmo bairro, que a regra de hoje marca, vai para o meio delas, como na
  // leitura da planilha (Leudy: duas ADS do Jatobá no centro da Barra)
  marcarIsoladas(e().paradas);
  const paraOBairro = moverPeloBairro(e().paradas).length;
  if (paraOBairro) desatualizarRota(true);
  const avisoDeVolta = [
    deVolta ? `${deVolta} parada(s) de um grupo longe do resto da rota voltaram para a posição da planilha.` : '',
    paraOBairro ? `${paraOBairro} parada(s) longe das outras do mesmo bairro, levada(s) para o meio delas: confira no local.` : '',
  ].filter(Boolean).join(' ');
  if (!e().paradas.some(p => (p.precisao === 'planilha' || p.pontoGenerico) && !p.entregue)) {
    if (deVolta || numerosMudaram || paraOBairro) loja.mudou();
    if (avisoDeVolta) status(avisoDeVolta, 8000);
    return;
  }
  // a rota de antes desta versão também tem o ponto genérico, sem marca
  const genericas = marcarPontoGenerico(e().paradas);
  const {levadas, refinadas, genericas: doCenso, foraDoCep} = await conferirComOCenso();
  const noLugar = e().paradas.some(p => p.pontoGenerico) || doCenso
    ? doCenso + (await genericasNoLugar()) + (await levarAoBairroPeloMapa(true)).genericas : 0;
  if (!levadas && !refinadas && !genericas && !noLugar && !foraDoCep && !deVolta && !numerosMudaram && !paraOBairro) return;
  loja.mudou();
  if (levadas || noLugar || foraDoCep || avisoDeVolta) status([
    avisoDeVolta,
    levadas ? `${levadas} parada(s) levada(s) para a porta do censo do IBGE, longe de onde a planilha punha: confira na porta.` : '',
    foraDoCep ? `${foraDoCep} parada(s) que a planilha punha longe das portas do próprio CEP, levada(s) para a porta do censo do IBGE: confira.` : '',
    noLugar ? `${noLugar} parada(s) que a planilha punha num mesmo ponto para vários bairros, levada(s) para a porta ou o bairro: confira no local.` : '',
  ].filter(Boolean).join(' '), 8000);
}

async function importarPlanilhas(files: Blob[]) {
  const itens = await lerPlanilhas(files);
  const {resumo, rotaDe} = adicionarDaPlanilha(e(), itens, p => memoria.aplicar(p));
  fila.enfileirar(...operacoesDaPlanilha(itens, rotaDe, e().cidade));
  enviarFila();
  // o censo antes do bairro: a porta vale mais que o meio do bairro
  const censo = await conferirComOCenso();
  resumo.censo = censo.levadas;
  resumo.foraDoCep = censo.foraDoCep;
  const pelaRuaOuBairro = await genericasNoLugar();
  const peloMapa = await levarAoBairroPeloMapa();
  resumo.noBairro += peloMapa.longe;
  if (resumo.genericas) resumo.genericasNoLugar = censo.genericas + pelaRuaOuBairro + peloMapa.genericas;
  const comp = await consultarCompartilhadas();
  resumo.confirmadas = comp.confirmadas;
  // a que a memória trouxe e a nuvem verificou já sai como verificada: não repete como corrigida
  resumo.lembradas = Math.max(0, resumo.lembradas - comp.lembradasVerificadas);
  resumo.sugestoes = comp.sugestoes;
  resumo.xaropes = comp.xaropes;
  return resumo;
}

// O que a leitura de prints e vídeo pôs na lista, para o "Adicionar" saber quantos cartões iguais ela
// viu: repetido colado ou digitado é engano, repetido lido é outro cartão (decisão de 15/10).
let doLeitor: string[] = [];
// e de que arquivos ela leu, para o registro da busca saber se a lista veio de print ou de gravação
let doLeitorTipos: OrigemLista[] = [];

export function lerPrints(files: File[], textoAtual: string): Promise<string | null> {
  return semRecarregar(() => lerPrintsAgora(files, textoAtual));
}

async function lerPrintsAgora(files: File[], textoAtual: string): Promise<string | null> {
  const {planilhas, outros} = await separarPlanilhas(files);
  if (planilhas.length) {
    status('Lendo a planilha…');
    try {
      const r = await importarPlanilhas(planilhas);
      if (outros.length) { const lidas = await lerArquivos(outros, m => status(m)); r.novas += adicionarLinhas(e(), lidas, lidas).novas; }
      irPara('rota');
      ui.enquadrar++;
      loja.mudou();
      const resumo = resumoPlanilha(r) + (e().rota ? ' A rota de agora continua na tela: toque em "Refazer a rota" para as novas entrarem na sequência.' : '');
      status(resumo, r.longe || e().rota ? 12000 : 5000);
      await buscarPendentes(resumo, origemDe(['planilha', ...outros.map(tipoDoArquivo)])!);
    } catch (err) {
      status('Não consegui ler a planilha: ' + (err as Error).message, 6000);
    }
    return null;
  }
  status('Carregando leitor de texto (a primeira vez demora)…');
  try {
    const nomes = await corretorDeNomes(e().cidade);
    const unicos = await lerArquivos(files, m => status(m), nomes.corrigir);
    // sem nenhum endereço o app culpava a gravação; quando a leitura é que falhou, o aviso dela
    // é que tem de aparecer, senão o motorista grava tudo de novo à toa
    const avisos = unicos.avisos.map(a => ' ' + a).join('');
    const corrigidas = nomes.corrigidas.size ? ` ${nomes.corrigidas.size} nome(s) de rua lido(s) torto(s), corrigido(s) pelo censo.` : '';
    // O que a comanda pede para conferir vem antes e fica mais tempo: o endereço sem apartamento
    // não pode parecer leitura completa, e a porta não confirmada não é falha de leitura (19/10).
    const daComanda = unicos.daComanda.join('\n');
    status(unicos.length
      ? `${daComanda ? daComanda + '\n' : ''}${unicos.length} endereço(s) lido(s).${corrigidas} Confira o texto e toque em "Adicionar".${avisos}`
      : daComanda
        ? daComanda + avisos
        : avisos
          ? `Não consegui ler.${avisos}`
          : 'Não achei endereços. Use o print ou a gravação da LISTA de paradas, onde os endereços aparecem escritos. Print do mapa não serve.', daComanda ? 20000 : 8000);
    doLeitor = textoAtual.trim() ? [...doLeitor, ...unicos] : [...unicos];
    doLeitorTipos = textoAtual.trim() ? [...doLeitorTipos, ...files.map(tipoDoArquivo)] : files.map(tipoDoArquivo);
    return (textoAtual.trim() ? textoAtual.trim() + '\n' : '') + unicos.join('\n');
  } catch (err) {
    status('Não consegui ler a imagem: ' + (err as Error).message, 5000);
    return null;
  }
}

export function processarCompartilhado() {
  return semRecarregar(lerCompartilhado);
}

async function lerCompartilhado() {
  const files: Blob[] = [];
  let texto = '';
  try {
    const cache = await caches.open('compartilhado');
    for (const req of await cache.keys()) {
      const r = (await cache.match(req))!;
      if (req.url.endsWith('/texto')) texto += await r.text();
      else files.push(await r.blob());
      await cache.delete(req);
    }
  } catch {}
  // tira o ?compartilhado da barra sem apagar o passo do voltar que está nesta entrada: com null,
  // fechar o menu caía num estado vazio, e o app avisava que ia sair
  history.replaceState(history.state, '', location.pathname);
  if (!files.length && !texto.trim()) return;
  try {
    const {planilhas, outros} = await separarPlanilhas(files);
    const daPlanilha = planilhas.length ? await importarPlanilhas(planilhas) : null;
    const lidos = outros.length ? await lerArquivos(outros, m => status(m), (await corretorDeNomes(e().cidade)).corrigir) : null;
    const linhas: string[] = lidos ? [...lidos] : [];
    const lidas = [...linhas];
    const daComanda = lidos ? lidos.daComanda.join('\n') : '';
    if (texto.trim()) {
      const doTexto = extrairEnderecos(texto);
      linhas.push(...(doTexto.length ? doTexto : texto.split('\n').map(l => l.trim()).filter(Boolean)));
    }
    if (!linhas.length && !(daPlanilha && daPlanilha.novas + daPlanilha.juntas)) {
      irPara('inicio');
      // a comanda com a porta não confirmada foi lida: pedir a planilha ou a lista não ajuda
      status(daComanda || 'Não achei endereços. Compartilhe a planilha da rota ou o print da LISTA de paradas, onde os endereços aparecem escritos. Print do mapa não serve.', daComanda ? 20000 : 8000);
      return;
    }
    const {novas, repetidas} = adicionarLinhas(e(), linhas, lidas);
    status(daPlanilha ? resumoPlanilha(daPlanilha) : `${novas} parada(s) nova(s)${repetidas ? `, ${repetidas} já existia(m)` : ''}. Buscando no mapa…`);
    irPara('rota');
    await buscarPendentes('', origemDe([...(planilhas.length ? ['planilha' as const] : []), ...outros.map(tipoDoArquivo),
      ...(texto.trim() ? ['colada' as const] : [])]) || 'colada');
    await montarRota();
    // por último, para o "Rota pronta" não cobrir o complemento que ficou de fora
    if (daComanda) status(daComanda, 20000);
  } catch (err) {
    status('Não consegui processar: ' + (err as Error).message, 6000);
  }
}

export async function adicionarTexto(texto: string) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  if (!linhas.length) { status('Cole pelo menos um endereço.', 2500); return false; }
  const {novas, repetidas, arrumadas, coladas} = adicionarLinhas(e(), linhas, doLeitor);
  // a linha que o leitor pôs vem do print ou da gravação; a que ele digitou ou mudou, colada
  const lidas = new Set(doLeitor);
  const origem = origemDe([...(linhas.some(l => lidas.has(l)) ? doLeitorTipos : []),
    ...(linhas.some(l => !lidas.has(l)) ? ['colada' as const] : [])]) || 'colada';
  doLeitor = [];
  doLeitorTipos = [];
  // O local colado do mapa é correção, não palpite: fica guardado neste aparelho e vai para os
  // outros motoristas, como se ele tivesse marcado na porta.
  let guardadas = 0;
  for (const p of coladas) if (memoria.lembrar(p)) guardadas++;
  irPara('rota');
  const doMapa = coladas.length
    ? ` ${arrumadas ? `${arrumadas} parada(s) arrumada(s)` : `${coladas.length} com local`} pelo local colado do mapa${guardadas < coladas.length ? ' (sem CEP nem bairro na linha, não deu para guardar para as próximas rotas)' : ', guardado para as próximas rotas'}.`
    : '';
  status(`${novas} adicionada(s)${repetidas ? `, ${repetidas} repetida(s) ignorada(s)` : ''}.${doMapa}`, doMapa ? 9000 : 2500);
  await buscarPendentes('', origem);
  return true;
}

export async function editar(p: Parada) {
  const ed = lerEdicao(p.texto, prompt('Corrija o endereço, ou cole o link do mapa para arrumar só a posição:', p.texto));
  if (ed.tipo === 'nada') return;
  // Consertar uma parada que já está na lista é por aqui, não por "Adicionar": colar o link no
  // Editar tinha de valer igual, senão a coordenada que ele foi buscar no mapa não tem porta de
  // entrada nenhuma para o que já foi lido.
  if (ed.tipo === 'posicao') {
    // O link é para arrumar a posição, não o nome do pino (29/09): o endereço fica como estava,
    // com ou sem texto em volta do link — como já faz o link colado em Endereços. Antes o que
    // sobrava virava o endereço, e colar só o link deixava a parada sem nome e sem chave para
    // guardar a porta.
    corrigirPosicao(p, ed.lat, ed.lng, 'Local colado do mapa', 'Local que você colou do mapa');
    focar(p.id);
    return;
  }
  if (ed.tipo === 'link sem posicao') {
    status('Não foi possível obter a posição desse link. Seu endereço não foi alterado. Para arrumar o pino, use "Marcar no mapa" ou, na porta, "Estou aqui".', 9000);
    return;
  }
  p.texto = ed.texto;
  p.precisao = 'pendente';
  desatualizarRota(true);
  loja.mudou();
  status('Buscando…');
  try { await buscarParada(p); status('Pronto.', 1500); } catch (err) { status('Falhou: ' + (err as Error).message, 4000); }
  loja.mudou();
  focar(p.id);
}

export function remover(p: Parada) {
  if (!confirm('Remover esta parada?')) return;
  e().paradas = e().paradas.filter(x => x.id !== p.id);
  invalidarRota();
  loja.mudou();
}

async function localPorTexto(pergunta: string, atual: string | undefined, naoAchou: string) {
  const t = prompt(pergunta, atual || '');
  if (!t || !t.trim()) return null;
  status('Buscando…');
  try {
    const c = (await geocodificar(t.trim(), {cidade: e().cidade}))[0];
    if (!c) { status(naoAchou, 3000); return null; }
    return {texto: t.trim(), lat: c.lat, lng: c.lng, exibido: c.exibido};
  } catch (err) {
    status('Falhou: ' + (err as Error).message, 4000);
    return null;
  }
}

export async function fimPorEndereco() {
  const l = await localPorTexto('Onde você quer terminar? (ex.: Ponto Novo, ou um endereço)', e().fim?.texto, 'Lugar não encontrado. Tente "Marcar no mapa".');
  if (!l) return;
  e().fim = {id: 'fim', ...l};
  desatualizarRota();
  ui.enquadrar++;
  loja.mudou();
  status('Ponto final definido. Confira o F no mapa.', 3000);
}

export function novaArea() {
  const usadas = new Set(e().areas.map(a => a.cor));
  const [nome, cor] = CORES.find(c => !usadas.has(c[1])) || CORES[e().areas.length % CORES.length];
  const nova = {id: novoId(), nome, cor, prazo: ''};
  e().areas.push(nova);
  e().areaAtual = nova.id;
  loja.mudou();
}

export function corDaArea(cor: string, nome: string) {
  const a = loja.area(e().areaAtual);
  const nomePadrao = CORES.some(c => c[0] === a.nome);
  a.cor = cor;
  if (nomePadrao) a.nome = nome;
  loja.mudou();
}

export function removerArea() {
  const a = loja.area(e().areaAtual);
  const n = e().paradas.filter(x => x.area === a.id).length;
  if (!confirm(`Apagar a área ${a.nome}${n ? ` e as ${n} parada(s) dela` : ''}?`)) return;
  e().paradas = e().paradas.filter(x => x.area !== a.id);
  e().areas = e().areas.filter(x => x.id !== a.id);
  e().areaAtual = e().areas[0].id;
  invalidarRota();
  loja.mudou();
}

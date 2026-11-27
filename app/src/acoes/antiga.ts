import {aplicarComentarios} from '../logica/comentarios';
import {aplicarReclamacoes, clienteDoLugar} from '../logica/reclamacoes';
import type {Parada} from '../logica/tipos';
import {loja, status, type Marca} from '../loja';
import type {EntregaAntiga} from '../servicos/historico';
import {clienteNuvem, nuvem} from '../servicos/nuvem';
import {contar, enviarFila, fila, ui} from './base';
import {abrir} from './navegacao';
import {comMinhaPosicao, marcarLugar} from './posicoes';

// A entrega de outro dia achada na busca do Conferir (dono, 26/11: "o conferir precisa ter como
// ver no mapa e editar, igual numa rota"; e depois "aparecer igual como se estivesse em rota:
// entregou errado, cliente xarope, comentário, pra o entregador lembrar melhor"). Ela vira uma
// parada só desta tela, com a chave do endereço fixa (`chaveCliente`): o aviso do xarope, a marca e
// o comentário da rota servem nela como estão. A porta e o resto vão pela fila, pela chave.

const marcaDa = (x: EntregaAntiga, lat: number, lng: number): Marca =>
  ({lat, lng, rotulo: x.entregueEm ? '✓' : 'E', texto: x.endereco, cor: x.entregueEm ? '#16a34a' : '#2563eb'});

export function abrirAntiga(x: EntregaAntiga) {
  if (!x.ponto) return;
  contar('antiga-mapa');
  const chave = x.chave ? clienteDoLugar(x.chave, x.endereco) : undefined;
  const p = {
    id: 'antiga', area: '', ml: null, stop: null, texto: x.endereco, bairro: x.bairro || '', lat: x.ponto.lat, lng: x.ponto.lng,
    exibido: '', precisao: 'manual', entregue: !!x.entregueEm, pacotes: x.codigo ? [x.codigo] : [], chaveCliente: chave,
  } as unknown as Parada;
  ui.antiga = x;
  ui.paradaAntiga = p;
  ui.marcas = {pontos: [marcaDa(x, x.ponto.lat, x.ponto.lng)], vez: (ui.marcas?.vez || 0) + 1};
  abrir({tela: 'antiga'});
  if (chave) void lembrar(p, chave);
}

// O que já se sabe do endereço: o xarope e os comentários de todos. Sem rede, a tela fica sem eles.
async function lembrar(p: Parada, chave: string) {
  const c = clienteNuvem();
  if (!c) return;
  const [rs, cs] = await Promise.all([c.reclamacoes([chave]).catch(() => null), c.comentarios([chave]).catch(() => null)]);
  if (ui.paradaAntiga !== p) return;
  if (rs) aplicarReclamacoes([p], rs, () => chave);
  if (cs) aplicarComentarios([p], cs, () => chave);
  loja.mudou(false);
}

function gravarPorta(x: EntregaAntiga, chave: string, lat: number, lng: number) {
  fila.enfileirar({tipo: 'correcao', chave, lat, lng});
  enviarFila();
  if (ui.antiga === x) ui.marcas = {pontos: [marcaDa(x, lat, lng)], vez: (ui.marcas?.vez || 0) + 1};
  loja.mudou(false);
}

const aviso = () => nuvem.perfil?.papel === 'admin' ? 'Passa a valer para todos os motoristas.'
  : 'Os outros motoristas recebem a sua marcação; longe de uma porta verificada, quem administra decide.';

export function marcarPortaDaAntiga() {
  const x = ui.antiga;
  if (!x?.chave) return;
  const chave = x.chave;
  contar('antiga-porta');
  marcarLugar({
    endereco: x.endereco,
    pergunta: `Marcar este ponto como a porta de ${x.endereco}?\n\n${aviso()}`,
    feito: 'Porta marcada. Vai para a nuvem assim que houver internet.',
    gravar: async (lat, lng) => gravarPorta(x, chave, lat, lng),
  });
}

// "Entregou errado?" na porta certa: uma leitura do GPS, como o "Estou aqui" da rota.
export function estouNaPortaDaAntiga() {
  const x = ui.antiga;
  if (!x?.chave || !navigator.geolocation) return;
  const chave = x.chave;
  contar('antiga-aqui');
  // com o GPS ligado em todas as telas, a leitura de agora já está aqui (como no "Estou aqui")
  comMinhaPosicao((lat, lng, accuracy) => {
    if (!confirm(`Marcar onde você está (GPS de ${Math.round(accuracy)} m) como a porta de ${x.endereco}?\n\n${aviso()}`)) { status('Nada gravado.', 3000); return; }
    gravarPorta(x, chave, +lat.toFixed(6), +lng.toFixed(6));
    status('Porta marcada onde você está. Vai para a nuvem assim que houver internet.', 6000);
  }, () => status('Não consegui a sua posição. Use "Marcar no mapa".', 6000), 'Pegando a sua posição…');
}

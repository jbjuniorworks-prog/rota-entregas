import {clienteDoLugar, MOTIVOS} from '../logica/reclamacoes';
import type {MotivoReclamacao} from '../logica/tipos';
import {loja, status} from '../loja';
import type {EntregaAntiga} from '../servicos/historico';
import {nuvem} from '../servicos/nuvem';
import {contar, enviarFila, fila, ui} from './base';
import {abrir} from './navegacao';
import {marcarLugar} from './posicoes';

// A entrega de outro dia achada na busca do Conferir (dono, 26/11: "o conferir precisa ter como
// ver no mapa e editar, igual numa rota"). Ela não é parada de hoje: o mapa mostra o ponto dela, e
// a porta e o cliente xarope se marcam pela chave do endereço, pela mesma fila das outras marcações.

export function abrirAntiga(x: EntregaAntiga) {
  if (!x.ponto) return;
  contar('antiga-mapa');
  ui.antiga = x;
  ui.marcas = {pontos: [{lat: x.ponto.lat, lng: x.ponto.lng, rotulo: 'E', texto: x.endereco, cor: '#2563eb'}], vez: (ui.marcas?.vez || 0) + 1};
  abrir({tela: 'antiga'});
}

export function marcarPortaDaAntiga() {
  const x = ui.antiga;
  if (!x?.chave) return;
  const chave = x.chave;
  const admin = nuvem.perfil?.papel === 'admin';
  contar('antiga-porta');
  marcarLugar({
    endereco: x.endereco,
    pergunta: `Marcar este ponto como a porta de ${x.endereco}?\n\n${admin ? 'Passa a valer para todos os motoristas.' : 'Os outros motoristas recebem a sua marcação; longe de uma porta verificada, quem administra decide.'}`,
    feito: 'Porta marcada. Vai para a nuvem assim que houver internet.',
    gravar: async (lat, lng) => {
      fila.enfileirar({tipo: 'correcao', chave, lat, lng});
      enviarFila();
      if (ui.antiga === x) ui.marcas = {pontos: [{lat, lng, rotulo: 'E', texto: x.endereco, cor: '#2563eb'}], vez: (ui.marcas?.vez || 0) + 1};
      loja.mudou(false);
    },
  });
}

export function xaropeDaAntiga(motivo: MotivoReclamacao) {
  const x = ui.antiga;
  if (!x?.chave) return;
  const chave = clienteDoLugar(x.chave, x.endereco);
  contar('antiga-xarope');
  fila.enfileirar({tipo: 'reclamacao', chave, motivo});
  enviarFila();
  status(`Cliente xarope marcado: reclamou ${MOTIVOS[motivo].reclamou}. Quem entregar neste endereço vai ver no pino.`, 10000, () => {
    fila.enfileirar({tipo: 'tirarReclamacao', chave, motivo});
    enviarFila();
    status('Marcação de cliente xarope tirada.', 3000);
  });
}

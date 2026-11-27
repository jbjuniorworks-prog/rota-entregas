import * as A from '../acoes';
import {diaCurto} from '../logica/diaNovo';
import {MOTIVOS} from '../logica/reclamacoes';
import type {MotivoReclamacao} from '../logica/tipos';
import {useLoja} from '../loja';
import {Cabecalho} from './comuns';

// A entrega de outro dia, no mapa (dono, 26/11): o ponto dela e o que dá para fazer sem ela estar
// na rota de hoje. A porta se marca tocando no mapa, como o "Marcar no mapa" do Conferir.
export function TopoAntiga() {
  const {ui} = useLoja();
  const x = ui.antiga;
  return <Cabecalho titulo={x ? x.endereco : 'Entrega'} sub={x ? `Rota de ${diaCurto(x.dia)}` : undefined} />;
}

export function CartaoAntiga() {
  const {ui} = useLoja();
  const x = ui.antiga;
  if (!x) return <div className="folha proxima"><div className="info">Nada aberto. Volte e procure a entrega de novo.</div></div>;
  const motivos = Object.keys(MOTIVOS) as MotivoReclamacao[];
  return <div className="folha proxima" data-folha="antiga">
    <div className="info">{x.ponto?.daEntrega ? 'No mapa: onde a entrega foi marcada.' : 'No mapa: a posição que a planilha deu.'}</div>
    {!x.chave
      ? <div className="aviso">Esta entrega veio sem CEP e sem bairro: não dá para guardar a porta nem o cliente xarope.</div>
      : <>
        <div className="linha">
          <button className="btn pri" data-acao="porta-antiga" onClick={A.marcarPortaDaAntiga}>Marcar a porta no mapa</button>
        </div>
        <div className="marcar-xarope" data-marcar-xarope>
          <div className="info">Cliente xarope? O próximo motorista vê no pino.</div>
          <div className="linha">{motivos.map(m =>
            <button key={m} className="btn peq" onClick={() => A.xaropeDaAntiga(m)}>{MOTIVOS[m].marcar}</button>)}</div>
        </div>
      </>}
  </div>;
}

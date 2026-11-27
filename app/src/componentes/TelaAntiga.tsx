import * as A from '../acoes';
import {diaCurto} from '../logica/diaNovo';
import {useLoja} from '../loja';
import {AvisoXarope, Cabecalho, ComentariosDoLugar, MarcarXarope} from './comuns';

// A entrega de outro dia, no mapa, como um pino da rota (dono, 26/11: "aparecer igual como se
// estivesse em rota: entregou errado, cliente xarope, comentário, pra o entregador lembrar melhor").
// O xarope e o comentário são os mesmos da rota, pela chave do endereço; a porta se arruma onde ele
// está ou tocando no mapa.
export function TopoAntiga() {
  const {ui} = useLoja();
  const x = ui.antiga;
  return <Cabecalho titulo={x ? x.endereco : 'Entrega'} sub={x ? `Rota de ${diaCurto(x.dia)}` : undefined} />;
}

const hora = (t: string) => new Date(t).toLocaleString('pt-BR', {timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}).replace(',', ' às');

export function CartaoAntiga() {
  const {ui} = useLoja();
  const x = ui.antiga, p = ui.paradaAntiga;
  if (!x || !p) return <div className="folha proxima"><div className="info">Nada aberto. Volte e procure a entrega de novo.</div></div>;
  return <div className="folha proxima" data-folha="antiga">
    <div className="info">
      {x.entregueEm ? `Entregue em ${hora(x.entregueEm)}` : 'Não marcada como entregue'}
      {x.codigo ? ` · pacote ${x.codigo}` : ''}
      {' · '}{x.ponto?.daEntrega ? 'no mapa, onde a entrega foi marcada' : 'no mapa, a posição da planilha'}
    </div>
    {!x.chave
      ? <div className="aviso">Esta entrega veio sem CEP e sem bairro: não dá para guardar a porta, o cliente xarope nem o comentário.</div>
      : <>
        <AvisoXarope p={p} />
        <ComentariosDoLugar p={p} />
        <div className="linha">
          <button className="btn pri" data-acao="aqui-antiga" onClick={A.estouNaPortaDaAntiga}>Porta errada? Estou aqui</button>
          <button className="btn" data-acao="porta-antiga" onClick={A.marcarPortaDaAntiga}>Marcar no mapa</button>
        </div>
        <MarcarXarope p={p} />
      </>}
  </div>;
}

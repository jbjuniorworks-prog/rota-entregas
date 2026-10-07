import * as A from '../acoes';
import {haversine, RAIO_BLOCO} from '../logica/geo';
import {agruparPorEndereco, blocos, fmtKm, fmtMin, linkMaps, linkMapsVarios, linkWaze, porPerto, trechos} from '../logica/otimizacao';
import {previsoes} from '../logica/previsao';
import {DUVIDA, QUASE} from '../logica/rotulos';
import {mesmoEndereco} from '../logica/texto';
import type {Parada, Ponto, RotaArea} from '../logica/tipos';
import {loja, useLoja} from '../loja';
import {rotuloDe} from '../logica/rotulo';
import {AvisoXarope, BotaoMais, hhmm, Icone, MarcarXarope, Meta, Tag} from './comuns';

const daRota = () => {
  const R = loja.e.rota;
  return R ? R.areas.flatMap(ra => ra.ordem.map(loja.parada).filter((p): p is Parada => !!p)) : [];
};

export function TopoRota() {
  const {e} = useLoja();
  const R = e.rota;
  const todas = daRota(), feitas = todas.filter(p => p.entregue).length;
  const prev = R ? previsoes(e) : null;
  const ultima = R ? R.areas[R.areas.length - 1] : null;
  const fim = prev && ultima ? prev.porArea[ultima.id] : null;
  const esperando = A.fila.pendentes();
  // há quanto tempo a fila espera: "3 para enviar" desde as 8h é sinal de que nada está subindo
  const desde = A.fila.desde();
  const minutos = desde ? Math.floor((Date.now() - desde) / 60000) : 0;
  const haQuanto = !desde ? '' : minutos < 1 ? 'agora' : minutos < 60 ? `há ${minutos} min` : `há ${Math.floor(minutos / 60)} h`;
  return <div className="topo-rota" data-topo>
    <div className="progresso">
      {R ? <>
        <div className="resumo"><b>{feitas} de {todas.length} entregas</b>{fim ? <span className={R.desatualizada ? 'velho' : ''}> · fim às {hhmm(fim.fim)}</span> : null}
          {esperando > 0 ? <span> · {esperando} para enviar{haQuanto ? ` (${haQuanto})` : ''}</span> : null}</div>
        <div className="barra"><i style={{width: `${todas.length ? Math.round(feitas * 100 / todas.length) : 0}%`}} /></div>
      </> : <div className="resumo"><b>{e.paradas.length} entrega(s) carregada(s)</b></div>}
    </div>
    <BotaoMais />
  </div>;
}

// Por cima do mapa, só a mira: o "para conferir" foi para o botão Mais (03/10).
export function SobreOMapa() {
  const {ui} = useLoja();
  // azul enquanto o mapa anda junto com ele; apagada, ele arrastou o mapa e o toque liga de novo
  return <button className="redondo" id="btnEu" aria-label="Seguir onde estou" aria-pressed={ui.seguindo} onClick={A.centralizarEmMim}><Icone nome="mira" /></button>;
}

// As entregas de um ponto, cada endereço com os seus botões. Na porta, "Entreguei aqui" entrega e
// marca onde ela fica num toque só; um botão para endereços diferentes marcaria a porta de um no
// lugar do outro, e de longe (pilha da tela, não do chão) marcaria a de outra rua.
function EntregasDoPonto({ps}: {ps: Parada[]}) {
  const pend = ps.filter(p => !p.entregue);
  const noChao = pend.every(x => haversine(x as Ponto, pend[0] as Ponto) <= RAIO_BLOCO);
  return <>{!noChao && <div className="info" data-aproxime>Entregas de ruas diferentes neste pino: aproxime o mapa para marcar a porta de cada uma.</div>}
    {agruparPorEndereco(ps).map(g => {
    const abertas = g.ps.filter(p => !p.entregue);
    const ids = g.ps.map(p => p.id).join('+');
    return <div className="entrega" key={g.chave} data-item={g.ps[0].id}>
      <div className="linha-entrega">
        <div className="badge" style={{background: loja.area(g.ps[0].area).cor}}>{g.ps.map(rotuloDe).join('+')}</div>
        <div className="txt">
          <div className="end">{g.ps[0].texto}</div>
          <Meta p={g.ps[0]} />{g.ps.length > 1 && <div className="achado">{g.ps.length} pacotes</div>}
          {(DUVIDA.has(g.ps[0].precisao) || QUASE.has(g.ps[0].precisao)) && <Tag p={g.ps[0]} />}
          <AvisoXarope p={g.ps.find(p => p.reclamacoes?.length) || g.ps[0]} />
        </div>
      </div>
      {abertas.length > 0 ? <div className="botoes-entrega">
        {/* porta confirmada não se marca de novo na rua: o botão ali é toque errado esperando (28/09) */}
        {noChao && abertas[0].precisao !== 'confirmado' && <button className="btn ok" data-acao="aqui" data-ids={ids} onClick={() => { A.contar('balao-aqui'); A.entregueAqui(abertas); }}>Entreguei aqui</button>}
        <button className="btn contorno-ok" data-acao="entregue" data-ids={ids} onClick={() => { A.contar('balao-entreguei'); abertas.length > 1 ? A.entregarTodas(abertas) : A.marcarEntregue(abertas[0], true); }}>Entreguei</button>
        {abertas[0].precisao !== 'confirmado' && <button className="btn contorno" data-acao="arrumar" data-ids={abertas[0].id} onClick={() => A.posicionar(abertas[0].id)}>Arrumar o pino</button>}
        {/* "Cadê o botão do Waze?" (Luan, 06/10): ele toca no pino para ir até ele. Um por endereço,
            porque um pino de ruas diferentes tem mais de um destino. */}
        <a className="btn contorno-azul" data-acao="waze" data-ids={ids} href={linkWaze(abertas[0] as Ponto)} target="_blank" rel="noopener">Waze</a>
        {/* Na porta ele toca no pino, e é ali que procura o Depois (print de 05/10): só o cartão da
            próxima tinha. Adiada, o mesmo lugar traz de volta, que serve de desfazer. */}
        {loja.e.rota && (abertas.some(p => p.adiada)
          ? <button className="btn contorno" data-acao="voltar-rota" data-ids={ids} onClick={() => abertas.forEach(A.voltarParaARota)}>Voltar para a rota</button>
          : <button className="btn contorno" data-acao="depois" data-ids={ids} onClick={() => A.deixarParaDepois(...abertas)}>Depois</button>)}
        {abertas[0].precisao === 'confirmado' && <span className="info">Endereço verificado. Se estiver errado, arrume em Conferir endereços.</span>}
      </div> : <div className="botoes-entrega">
        <span className="feita">Entregue</span>
        <button className="btn contorno" onClick={() => g.ps.forEach(p => A.marcarEntregue(p, false))}>Desfazer</button>
        <button className="btn contorno" onClick={() => A.abrirXarope(g.ps[0])}>Cliente reclamou</button>
      </div>}
      {g.ps.some(p => loja.ui.xarope === p.id) && <MarcarXarope p={g.ps[0]} />}
    </div>;
  })}</>;
}

function CartaoPino({ids}: {ids: string[]}) {
  const ps = ids.map(loja.parada).filter((p): p is Parada => !!p);
  if (!ps.length) return null;
  return <div className="folha" data-folha="pino">
    <div className="folha-cab">
      <div className="titulo">{ps.length > 1 ? `Neste pino: ${ps.length} entregas` : 'Neste pino'}</div>
      <button className="quadrado" aria-label="Fechar" onClick={A.voltar}><Icone nome="x" /></button>
    </div>
    <div className="folha-corpo"><EntregasDoPonto ps={ps} /></div>
  </div>;
}

function CartaoMontar() {
  const {e} = useLoja();
  const semLocal = e.paradas.filter(p => p.lat == null && !p.entregue).length;
  return <div className="folha" data-folha="montar">
    <div className="titulo">{e.paradas.length} entrega(s) no mapa</div>
    <div className="info">Saindo de {e.inicio && e.inicio.texto ? e.inicio.exibido : 'onde você estiver'}
      {' · '}<button className="link" onClick={() => A.abrir({tela: 'saida'})}>trocar</button></div>
    {semLocal > 0 && <div className="aviso">{semLocal} parada(s) sem local ficarão fora da rota. Corrija em Conferir.</div>}
    <button className="btn pri grande-btn" onClick={A.montarRota}>Montar a rota</button>
  </div>;
}

// Os avisos da rota, numa linha cada. No cartão da próxima vêm depois dos botões: em cima, eles
// empurravam o Entreguei para fora de um cartão que agora é baixo. Na lista, vêm no alto.
function AvisosDaRota() {
  const {e} = useLoja();
  const R = e.rota!;
  const naRota = new Set(R.areas.flatMap(a => a.ordem));
  const foraDaRota = e.paradas.filter(p => !p.entregue && !p.adiada && p.lat != null && !naRota.has(p.id)).length;
  const semLocal = e.paradas.filter(p => !p.entregue && p.lat == null).length;
  const prev = previsoes(e);
  const estouro = R.areas.map(ra => loja.area(ra.id)).find(a => prev && prev.porArea[a.id]?.estoura);
  return <>
    {estouro && prev && <div className="aviso vermelho">A área {estouro.nome} não fecha até {estouro.prazo}: previsão de terminar às {hhmm(prev.porArea[estouro.id]!.fim)} ({Math.round(prev.ritmo.segundos / 60)} min por parada, {prev.ritmo.medido ? 'seu ritmo de hoje' : 'estimado'}).</div>}
    {!R.porRuas && <div className="aviso laranja">Rota em linha reta{R.motivoSemRuas ? ` (${R.motivoSemRuas})` : ''}: não sabe de mão única. <button className="link" onClick={A.montarRota}>Tentar de novo</button></div>}
    {R.desatualizada && <div className={`aviso${R.mudouMuito ? ' laranja' : ''}`}>{R.mudouMuito
      ? 'Uma posição mudou muito depois de montar a rota: a sequência pode não valer mais.'
      : 'As posições mudaram depois de montar a rota: a sequência continua valendo, o tempo é que é de antes.'} <button className="link" onClick={A.montarRota}>Refazer a rota</button></div>}
    {foraDaRota > 0 && <div className="aviso">{foraDaRota} parada(s) nova(s) ou corrigida(s) fora da rota. <button className="link" onClick={A.montarRota}>Refazer a rota</button></div>}
    {semLocal > 0 && <div className="aviso">{semLocal} parada(s) sem local, fora da rota.</div>}
  </>;
}

function CartaoProxima() {
  const {e, ui} = useLoja();
  const R = e.rota!;
  let agora: {ra: RotaArea; b: string[]; k: number} | null = null;
  for (const ra of R.areas) {
    const bs = blocos(ra.ordem, loja.parada);
    const k = bs.findIndex(b => b.some(id => !loja.parada(id)!.entregue));
    if (k >= 0) { agora = {ra, b: bs[k], k}; break; }
  }
  const faltam = daRota().filter(p => !p.entregue).length;
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue).length;
  const puxar = <button className="puxador" data-lista onClick={() => A.abrir({folha: 'lista'})}><i />Ver a lista · faltam {faltam + adiadas}</button>;
  if (!agora) {
    return <div className="folha proxima" data-folha="fim">{puxar}<AvisosDaRota />
      <div className="grande">{adiadas ? `Sequência concluída. Falta(m) ${adiadas} deixada(s) para depois, na lista.` : 'Todas as entregas da rota foram feitas!'}</div>
    </div>;
  }
  const bp = agora.b.map(loja.parada).filter((p): p is Parada => !!p);
  const pend = bp.filter(p => !p.entregue);
  const alvo = pend[0];
  // minimizado, o mapa fica com a tela: sobra a próxima numa linha, e o toque traz os botões
  if (ui.minimizado) {
    return <div className="folha proxima minimizada" data-folha="proxima">
      <button className="linha-minimizada" aria-label="Mostrar a próxima entrega" onClick={() => A.minimizarCartao(false)}>
        <span className="badge" style={{background: loja.area(alvo.area).cor}}>{rotuloDe(alvo)}</span>
        <span className="end-curto">{alvo.texto}</span>
        <Icone nome="cima" />
      </button>
    </div>;
  }
  const umEndereco = agruparPorEndereco(pend).length === 1;
  const pacotes = pend.reduce((n, p) => n + (p.unidades || 1), 0);
  const vizinhas = porPerto(e.paradas, alvo as Ponto, agora.b);
  const perna = e.pernas[agora.b[0]];
  const podeAqui = alvo.precisao !== 'confirmado' && pend.every(x => haversine(x as Ponto, alvo as Ponto) <= RAIO_BLOCO);
  const entreguei = (classe: string) => <button className={classe} data-acao="entregue" onClick={() => pend.length > 1 ? A.entregarTodas(pend) : A.marcarEntregue(alvo, true)}>Entreguei{pend.length > 1 ? ` as ${pend.length}` : ''}</button>;
  // O mapa é a maior parte da tela (pedido de 03/10, com o print do Pedro): acima dos botões fica
  // só o que ele lê antes de tocar. Os avisos da rota e o resto vêm depois, rolando o cartão.
  return <div className="folha proxima" data-folha="proxima">
    <div className="topo-folha">
      {puxar}
      <button className="minimizar" aria-label="Minimizar" onClick={() => A.minimizarCartao(true)}><Icone nome="baixo" /></button>
    </div>
    <div className="linha-entrega">
      <div className="badge grande-badge" style={{background: loja.area(alvo.area).cor}}>{rotuloDe(alvo)}</div>
      <div className="txt">
        <div className="rotulo-proxima">Próxima{alvo.stop ? ` · parada ${alvo.stop}` : alvo.adicional ? ' · ADS' : ''}{pacotes > 1 ? ` · ${pacotes} pacotes` : ''}{perna && perna.dur ? ` · ${fmtMin(perna.dur)}` : ''}</div>
        <div className="endereco">{alvo.texto}</div>
        {/* de onde veio a posição só importa quando ela é duvidosa */}
        {DUVIDA.has(alvo.precisao) && alvo.exibido && <div className="achado">{alvo.exibido}</div>}
        {QUASE.has(alvo.precisao) && <div className="quase" data-quase>{alvo.precisao === 'censo'
          // até alguém entregar ali, a porta do censo é o lugar mais provável, não o certo (pedido de 01/10)
          ? 'Pino na porta do censo do IBGE, não onde a planilha punha: confira na porta.'
          : 'Número aproximado: confira na porta.'}</div>}
      </div>
    </div>
    <AvisoXarope p={pend.find(x => x.reclamacoes?.length) || alvo} />
    {umEndereco ? <>
      {/* na porta confirmada o botão grande é o Entreguei simples: ela não se marca de novo na rua */}
      {podeAqui
        ? <button className="btn ok grande-btn" data-acao="aqui" onClick={() => { A.contar('balao-aqui'); A.entregueAqui(pend); }}>Entreguei aqui{pend.length > 1 ? ` as ${pend.length}` : ''}</button>
        : entreguei('btn ok grande-btn')}
      <div className="tres">
        <a className="btn contorno-azul" href={linkWaze(alvo as Ponto)} target="_blank" rel="noopener">Waze</a>
        {podeAqui && entreguei('btn contorno-ok')}
        <button className="btn contorno" onClick={() => A.deixarParaDepois(...pend)}>Depois</button>
      </div>
    </> : <>
      <div className="info">{pend.length} entregas {mesmoEndereco(pend.map(p => p.texto)) ? 'no mesmo endereço' : 'aqui perto'}:</div>
      <EntregasDoPonto ps={pend} />
    </>}
    <AvisosDaRota />
    <div className="secundarios">
      {alvo.precisao === 'confirmado'
        ? <span data-confirmada>Endereço verificado.</span>
        : <button className="link" onClick={() => A.estouAqui(alvo)}>Pino errado? Estou aqui</button>}
      <a className="link" href={linkMaps(alvo as Ponto)} target="_blank" rel="noopener">Google Maps</a>
    </div>
    {vizinhas.length > 0 && <div className="info perto">Aqui perto, fora desta parada: {vizinhas.slice(0, 3).map(v =>
      <button key={v.p.id} className="link" onClick={() => A.focar(v.p.id)}>{v.p.texto.split(',').slice(0, 2).join(',')} ({Math.round(v.distancia)} m)</button>)}{vizinhas.length > 3 ? ` e mais ${vizinhas.length - 3}.` : ''}</div>}
  </div>;
}

function LinhaParada({p}: {p: Parada}) {
  const {ui} = useLoja();
  return <>
    <div className={`parada ${p.entregue ? 'feito' : ''}`} data-item={p.id}>
      <div className="badge" style={{background: loja.area(p.area).cor}}>{rotuloDe(p)}</div>
      <button className="txt" onClick={() => A.focar(p.id)}>
        <span className="end">{p.texto}</span><Meta p={p} />
        {(DUVIDA.has(p.precisao) || QUASE.has(p.precisao)) && <Tag p={p} />}
        {p.reclamacoes?.length ? <span className="etiqueta-xarope">Cliente xarope</span> : null}
      </button>
      {!p.entregue && !p.adiada && loja.e.rota && <button className="quadrado" aria-label="Deixar para depois" onClick={() => A.deixarParaDepois(p)}><Icone nome="pausa" /></button>}
      {/* a reclamação costuma chegar depois de entregue: é na entrega feita que se marca */}
      {p.entregue && <button className="quadrado" aria-label="Cliente xarope" onClick={() => A.abrirXarope(p)}><Icone nome="alerta" /></button>}
      {p.entregue
        ? <button className="quadrado" aria-label="Desfazer" onClick={() => A.marcarEntregue(p, false)}><Icone nome="desfazer" /></button>
        : <button className="quadrado ok" aria-label="Entregue" onClick={() => A.marcarEntregue(p, true)}><Icone nome="check" /></button>}
    </div>
    {ui.xarope === p.id && <MarcarXarope p={p} />}
  </>;
}

function Adiadas() {
  const {e} = useLoja();
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue);
  if (!adiadas.length) return null;
  return <div className="bloco-lista">
    <div className="area-cab"><span className="txt">Deixadas para depois ({adiadas.length})</span></div>
    {adiadas.map(p => <div key={p.id}>
      <LinhaParada p={p} />
      <div className="linha">
        <button className="btn peq" onClick={() => A.posicionar(p.id)}>Marcar no mapa</button>
        <button className="btn peq" onClick={() => A.estouAqui(p)}>Estou aqui</button>
        <button className="btn peq pri" onClick={() => A.voltarParaARota(p)}>Voltar para a rota</button>
      </div>
    </div>)}
  </div>;
}

// A lista inteira, puxada para cima: só existe na tela quando está aberta, e a Rota de 95
// entregas não desenha 95 cartões o tempo todo.
function Lista() {
  const {e} = useLoja();
  const R = e.rota!;
  const prev = previsoes(e);
  const ultima = R.areas[R.areas.length - 1];
  const velho = R.desatualizada ? 'velho' : '';
  const trechosDe = (ra: RotaArea) => trechos(ra.ordem, loja.parada, e.tamTrecho, ra === ultima ? e.fim : null);
  const feitas = daRota().filter(p => p.entregue);
  const proximoTrecho = R.areas.map(trechosDe).flat().find(t => t.some(x => x.ids.some(id => !loja.parada(id)!.entregue)));
  return <div className="folha lista" data-folha="lista">
    <button className="puxador" onClick={A.voltar}><i />Voltar ao mapa</button>
    {/* é daqui que uma adiada volta para a rota: o "Refazer" tem de estar à mão */}
    <AvisosDaRota />
    {proximoTrecho && proximoTrecho.length > 1 && <a className="btn contorno-azul" href={linkMapsVarios(proximoTrecho.map(x => x.alvo))} target="_blank" rel="noopener">Abrir as próximas {proximoTrecho.filter(x => x.ids.length).length} no Google Maps</a>}
    {R.areas.map((ra, i) => {
      const a = loja.area(ra.id);
      const ps = ra.ordem.map(loja.parada).filter((p): p is Parada => !!p);
      const pa = prev && prev.porArea[a.id];
      const bs = blocos(ra.ordem, loja.parada).filter(b => b.some(id => !loja.parada(id)!.entregue));
      let n = 0;
      return <div key={ra.id} className="bloco-lista">
        <div className="area-cab" style={{'--c': a.cor} as any}>
          <span className="dot" />
          <span className="txt">{a.nome}{a.prazo ? ' · até ' + a.prazo : ''}</span>
          <span className="info">{ps.filter(p => p.entregue).length}/{ps.length}</span>
          {pa && <span className={`info ${velho}`}>{pa.estoura ? 'atrasa ' : ''}{hhmm(pa.fim)}</span>}
          {R.areas.length > 1 && <>
            <button className="quadrado" disabled={i === 0} aria-label="Subir área" onClick={() => A.moverArea(a.id, -1)}><Icone nome="cima" /></button>
            <button className="quadrado" disabled={i === R.areas.length - 1} aria-label="Descer área" onClick={() => A.moverArea(a.id, 1)}><Icone nome="baixo" /></button>
          </>}
        </div>
        {/* um botão por trecho, do tamanho do número: nove botões de largura inteira empurravam
            a primeira entrega para fora da tela */}
        {bs.length > 0 && <div className="trechos"><span className="info">No Google Maps, por trecho:</span>{trechosDe(ra).map((t, k) => {
          const ini = n + 1;
          n += t.filter(x => x.ids.length).length;
          return <a key={k} className="btn peq contorno-azul" aria-label={`Trecho ${k + 1}, pontos ${ini} a ${n}`} href={linkMapsVarios(t.map(x => x.alvo))} target="_blank" rel="noopener">{ini}–{n}</a>;
        })}</div>}
        {/* só o que falta: a feita vai para o "N entregue(s)" do fim, mesmo com o bloco pela
            metade (pedido de 07/10, ver as feitas no meio atrapalhava) */}
        {bs.length ? bs.map(b => {
          const falta = b.map(id => loja.parada(id)!).filter(p => !p.entregue);
          return <div key={b[0]} className="bloco">
            {falta.length > 1 && <div className="info">{falta.length} entregas {mesmoEndereco(falta.map(p => p.texto)) ? 'no mesmo endereço' : 'perto'}</div>}
            {falta.map(p => <LinhaParada key={p.id} p={p} />)}
          </div>;
        }) : <div className="info">Área concluída.</div>}
      </div>;
    })}
    <Adiadas />
    {feitas.length > 0 && <details className="feitas">
      <summary>{feitas.length} entregue(s)</summary>
      {feitas.map(p => <LinhaParada key={p.id} p={p} />)}
    </details>}
    <div className="info rodape-lista">{fmtKm(R.dist)} · {fmtMin(R.dur)} dirigindo{R.porRuas ? '' : ' · aproximado'}.{' '}
      {R.ordemDoApp
        ? R.melhorDist != null && R.dist - R.melhorDist > 200
          ? `Você pediu a ordem do app. A melhor sequência faria ${fmtKm(R.melhorDist)}, ${fmtMin(R.melhorDur!)}: ${fmtKm(R.dist - R.melhorDist)} a menos. Desmarque a opção em "Ponto de saída e de chegada" para usá-la.`
          : 'Você pediu a ordem do app. A melhor sequência não faria diferença hoje.'
        : R.mlDist > 0 ? R.mlDist - R.dist > 200 ? `${fmtKm(R.mlDist - R.dist)} a menos que a ordem do app.` : 'A ordem do app já estava boa.' : ''}</div>
  </div>;
}

export function FolhaRota() {
  const {e, ui} = useLoja();
  // o pino tocado pode ter sumido (parada removida, rota resetada): aí vale o cartão de sempre
  if (ui.pino && ui.pino.some(id => loja.parada(id))) return <CartaoPino ids={ui.pino} />;
  if (!e.rota) return <CartaoMontar />;
  return ui.folha === 'lista' ? <Lista /> : <CartaoProxima />;
}

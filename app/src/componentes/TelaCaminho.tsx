import {useEffect, useState} from 'react';
import * as A from '../acoes';
import type {ResultadoDoTeste} from '../acoes/caminho';
import type {Buracos, Gasto} from '../logica/caminho';
import {fmtMin} from '../logica/otimizacao';
import {useLoja} from '../loja';
import {Cabecalho, hhmm} from './comuns';

// O teste do caminho (dono, 24/11): ligar, desligar, e o que ele mediu. Ver logica/caminho.ts.

const dur = (ms: number) => fmtMin(ms / 1000);

function LinhaDeBuraco({rotulo, b, marca}: {rotulo: string; b: Buracos; marca: string}) {
  if (!b.vezes) return null;
  return <li data-buraco={marca}>{rotulo}: {b.vezes === 1 ? '1 vez' : `${b.vezes} vezes`}, {dur(b.ms)}{b.vezes > 1 ? ` no total, o maior de ${dur(b.maior)}` : ''}.</li>;
}

function LinhaDeGasto({rotulo, g, marca}: {rotulo: string; g: Gasto; marca: string}) {
  return <li data-gasto={marca}>{rotulo}: {g.porHora != null
    ? `${String(g.porHora).replace('.', ',')}% por hora, em ${dur(g.minutos * 60000)} de app aberto`
    : g.minutos ? `pouco tempo ainda (${dur(g.minutos * 60000)}, precisa de meia hora)` : 'nada ainda'}.</li>;
}

export function TelaCaminho() {
  useLoja();
  const teste = A.testeDoCaminho();
  const comecado = !!teste, gravando = !!teste?.gravando;
  const [r, setR] = useState<ResultadoDoTeste | 'erro' | null>(null);
  const [vez, setVez] = useState(0);
  useEffect(() => {
    let vivo = true;
    A.resultadoDoCaminho().then(x => { if (vivo) setR(x); }, () => { if (vivo) setR('erro'); });
    return () => { vivo = false; };
  }, [vez, comecado, gravando]);
  const h = r && r !== 'erro' ? r.hoje : null;
  return <>
    <Cabecalho titulo="Teste do caminho" sub="Fica só neste celular. Nada vai para a nuvem." />
    <div className="corpo" data-caminho>
      <div className="info">Com a localização liberada, o GPS do app já fica ligado. Gravando, o app guarda neste celular o caminho que
        o GPS lê, e a bateria a cada 5 minutos. Serve para ver quanto da rota o caminho cobre e quanta bateria vai embora.</div>
      <button className={`btn ${gravando ? 'contorno' : 'pri'} grande-btn`} data-gravar onClick={A.trocarCaminho}>
        {gravando ? 'Parar de gravar' : 'Gravar meu caminho'}</button>
      {gravando && <div className="info" data-gravando>Gravando. Volte para a Rota e use o app normalmente: fora da Rota o GPS do
        app fica desligado.</div>}
      <h2>Hoje</h2>
      {r === null ? <div className="info">Lendo…</div>
        : r === 'erro' ? <div className="info">Não consegui ler o teste neste celular.</div>
        : !h ? <div className="info" data-hoje-vazio>Nada gravado hoje.</div>
        : <div data-hoje>
          <div className="info">{h.pontos} pontos, das {hhmm(h.de)} às {hhmm(h.ate)}. O caminho cobriu {Math.round(h.cobertura * 100)}% desse
            tempo.</div>
          {h.escondido.vezes + h.fora.vezes + h.naRota.vezes > 0 ? <>
            <div className="info">Buracos de mais de 2 minutos:</div>
            <ul className="info">
              <LinhaDeBuraco rotulo="Com o app escondido (Waze, tela apagada)" b={h.escondido} marca="escondido" />
              <LinhaDeBuraco rotulo="Fora da tela da Rota" b={h.fora} marca="fora" />
              <LinhaDeBuraco rotulo="Na Rota, sem leitura do GPS (parado ou sem sinal)" b={h.naRota} marca="na-rota" />
            </ul>
          </> : <div className="info">Nenhum buraco de mais de 2 minutos.</div>}
          {h.tempoEscondido > 0 && <div className="info" data-veredito>{h.pontosEscondido
            ? `Com o app escondido (${dur(h.tempoEscondido)}), o navegador mandou o GPS: ${h.pontosEscondido} ponto(s).`
            : `Com o app escondido (${dur(h.tempoEscondido)}), o navegador não mandou o GPS: nenhum ponto.`}</div>}
        </div>}
      <h2>Bateria</h2>
      {r && r !== 'erro' && (r.bateria
        ? <ul className="info" data-bateria>
          <LinhaDeGasto rotulo="Gravando" g={r.bateria.gravando} marca="gravando" />
          <LinhaDeGasto rotulo="Sem gravar" g={r.bateria.semGravar} marca="sem-gravar" />
        </ul>
        : <div className="info" data-sem-bateria>Este celular não informa a bateria ao app (o iPhone não informa).</div>)}
      <div className="info">Só conta o tempo com o app aberto e fora da tomada. Compare dias parecidos: a tela acesa e o Waze
        gastam mais que o GPS.</div>
      <div className="linha">
        <button className="btn" onClick={() => setVez(v => v + 1)}>Atualizar</button>
        {comecado && <button className="btn apagar" data-apagar onClick={() => { A.apagarTesteDoCaminho().then(() => setVez(v => v + 1)); }}>
          Apagar o teste</button>}
      </div>
    </div>
  </>;
}

import {useEffect, useState} from 'react';
import {MOTIVOS_DO_MOTORISTA, type MinhasPortas} from '../logica/verificacao';
import {DIAS_DAS_PORTAS, minhasPortasVerificadas} from '../servicos/verificadas';
import {Cabecalho, PortasExplicadas} from './comuns';

const diaExtenso = (dia: string) => new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'});

// "Aquela lista de verificados aparecendo para eles também" (Luan, pelo dono, 15/11): o "Portas
// verificadas por motorista" do Admin, só das rotas de quem está no celular, com o porquê de cada
// rota nas palavras do motorista. Os números dos outros motoristas não aparecem aqui.
export function TelaVerificadas() {
  const [r, setR] = useState<MinhasPortas | {erro: string} | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const ver = () => {
    setR(null);
    minhasPortasVerificadas().then(setR, err => setR({erro: (err as Error).message}));
  };
  useEffect(ver, []);
  return <>
    <Cabecalho titulo="Minhas portas verificadas" sub={`As suas rotas dos últimos ${DIAS_DAS_PORTAS} dias`} />
    <div className="corpo" data-minhas-portas>
      {!r && <div className="info">Perguntando à nuvem pelas suas portas…</div>}
      {r && 'erro' in r && <div className="aviso">Não consegui ver as suas portas: {r.erro}. <button className="link" onClick={ver}>Tentar de novo</button></div>}
      {r && !('erro' in r) && <>
        {r.rotas
          ? <div className="item" data-total><div><b>{r.verificados} de {r.entregues}</b> endereço(s) entregue(s) com a porta verificada ({Math.floor(r.verificados / r.entregues * 100)}%), em {r.rotas} rota(s).</div></div>
          : <div className="info">Nenhuma entrega sua nestes {DIAS_DAS_PORTAS} dias.</div>}
        {r.porRota.map(({rota, portas}) => <div className="item" key={rota.id} data-rota={rota.id}>
          <div><b>{diaExtenso(rota.dia)}</b> · {portas.verificados} de {portas.entregues} verificado(s)</div>
          {rota.arquivo && <div className="achado">{rota.arquivo}</div>}
          {portas.semVerificar.length > 0 && <button className="link" aria-expanded={aberta === rota.id} onClick={() => setAberta(aberta === rota.id ? null : rota.id)}>
            {aberta === rota.id ? 'Fechar' : 'Por que algum não verificou?'}</button>}
          {aberta === rota.id && <div data-porque={rota.id}><PortasExplicadas r={portas} textos={MOTIVOS_DO_MOTORISTA} /></div>}
        </div>)}
      </>}
    </div>
  </>;
}

import {useState} from 'react';
import * as A from '../acoes';
import {avisoDaGaiola, foraDaGaiola, naoVistos} from '../logica/gaiola';
import {useLoja} from '../loja';

// "Um aviso em vermelho avisando que 3 pacotes não estão na sua gaiola" (dono, 16/11): os pacotes
// que vieram na planilha sem número de parada, para pedir aos analistas antes de sair do galpão.
export function AvisoGaiola() {
  const {e} = useLoja();
  const [aberto, setAberto] = useState(false);
  const fora = naoVistos(foraDaGaiola(e.paradas), e.gaiolaVistos);
  if (!fora.length) return null;
  return <div className="aviso vermelho" data-fora-da-gaiola>
    <b>{avisoDaGaiola(fora.length)}</b> Vieram na planilha sem número de parada.{' '}
    <button className="link" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar' : 'Ver'}</button>
    {aberto && <div className="fora-da-gaiola">
      {fora.map(f => <div key={f.tn} data-pacote-fora={f.tn}><b>{f.tn}</b>{f.bairro ? ` · ${f.bairro}` : ''}<div className="achado">{f.texto}</div></div>)}
      <div className="ordem">
        <button className="btn contorno" onClick={() => A.copiarForaDaGaiola(fora)}>Copiar para os analistas</button>
        <button className="btn contorno" onClick={() => { setAberto(false); A.jaPegueiDaGaiola(fora); }}>Já peguei</button>
      </div>
    </div>}
  </div>;
}

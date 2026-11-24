import {useState} from 'react';
import * as A from '../acoes';
import {longeDoProprioCep} from '../logica/longeDoCep';
import {decompor} from '../logica/texto';
import {useLoja} from '../loja';

const km = (m: number) => `${(m / 1000).toFixed(0)} km`;
const cepBonito = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;

// "Nem um aviso nem nada, simplesmente fica na rota" (dono, 23/11): a entrega com o pino da planilha
// longe das portas do próprio CEP. Diz o fato e quanto custa; não move, porque os dados não decidem
// quem está certo (logica/longeDoCep.ts).
export function AvisoLongeDoCep() {
  const {e} = useLoja();
  const [aberto, setAberto] = useState(false);
  const longe = longeDoProprioCep(e.paradas);
  if (!longe.length) return null;
  const maior = Math.max(...longe.map(p => p.longeDoCep!));
  return <div className="aviso vermelho" data-longe-do-cep>
    <b>{longe.length === 1 ? `1 entrega com o pino a ${km(maior)} do próprio CEP.` : `${longe.length} entregas com o pino a até ${km(maior)} do próprio CEP.`}</b>{' '}
    A planilha e o CEP discordam: se o CEP estiver certo, a entrega fica longe desta rota.{' '}
    <button className="link" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar' : 'Ver'}</button>
    {aberto && <div className="fora-da-gaiola">
      {longe.map(p => {
        const cep = decompor(p.texto).cep;
        return <div key={p.id} data-pino-longe={p.id}>
          <div>{p.texto.split(',').slice(0, 3).join(',')}{p.bairro ? ` · ${p.bairro}` : ''}</div>
          <div className="achado">O pino da planilha está a {km(p.longeDoCep!)} das portas do CEP{cep ? ` ${cepBonito(cep)}` : ''}.</div>
          <button className="btn contorno peq" onClick={() => { setAberto(false); A.focar(p.id); }}>Ver no mapa</button>
        </div>;
      })}
    </div>}
  </div>;
}

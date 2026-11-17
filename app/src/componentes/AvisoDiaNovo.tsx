import * as A from '../acoes';
import {diaCurto, oQueFazerNoDiaNovo} from '../logica/diaNovo';
import {useLoja} from '../loja';

// A rota de ontem com entrega por fazer: os dados não decidem se ele ainda vai fazer, então
// pergunta, dizendo quantas são (dono, 16/11). A de ontem toda feita sai sozinha (virarODia).
export function AvisoDiaNovo() {
  const {e} = useLoja();
  const v = oQueFazerNoDiaNovo(e);
  if (v.acao !== 'perguntar') return null;
  return <div className="aviso laranja" data-dia-novo>
    <b>A rota de {diaCurto(v.dia)} ficou com {v.pendentes === 1 ? '1 entrega' : `${v.pendentes} entregas`} por fazer.</b> Começar o dia de hoje do zero?
    <div className="ordem">
      <button className="btn pri" onClick={() => { A.contar('dia-novo-zero'); A.encerrarRota(); }}>Começar do zero</button>
      <button className="btn contorno" onClick={A.continuarADeOntem}>Continuar a de {diaCurto(v.dia)}</button>
    </div>
  </div>;
}

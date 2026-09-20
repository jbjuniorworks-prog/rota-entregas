import * as A from '../acoes';
import {fmtKm} from '../logica/otimizacao';
import {COR_PRECISAO, ROTULO} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {useLoja} from '../loja';

export const Tag = ({p}: {p: {precisao: Parada['precisao']}}) =>
  <span className="tag" style={{background: COR_PRECISAO[p.precisao]}}>{ROTULO[p.precisao]}</span>;

export function Meta({p}: {p: Parada}) {
  const partes: string[] = [];
  if (p.ml) partes.push(`no app: #${p.ml}`);
  if (p.unidades) partes.push(`📦 ${p.unidades} unid.`);
  if (p.comercial) partes.push('🏪 horário comercial');
  return partes.length ? <div className="achado">{partes.join(' · ')}</div> : null;
}

export function Sugestao({p}: {p: Parada}) {
  if (!p.sugestao) return null;
  const d = p.sugestao.distancia;
  return <div className="aviso">💡 Outro motorista marcou este endereço em outro lugar{d != null ? `, a ${fmtKm(d)} daqui` : ''}.{' '}
    <button className="btn peq pri" onClick={() => A.usarSugestao(p)}>Usar a posição dele</button></div>;
}

export function BotaoResetar() {
  const {e} = useLoja();
  return e.paradas.length ? <div className="linha" style={{marginTop: 16}}><button className="btn" onClick={A.resetar}>🔄 Resetar rota (começar do zero)</button></div> : null;
}

export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});

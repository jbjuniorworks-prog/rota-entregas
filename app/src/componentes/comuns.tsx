import * as A from '../acoes';
import {fmtKm} from '../logica/otimizacao';
import {avisoXarope, MOTIVOS} from '../logica/reclamacoes';
import {COR_PRECISAO, ROTULO} from '../logica/rotulos';
import type {MotivoReclamacao, Parada} from '../logica/tipos';
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

export function AvisoXarope({p}: {p: Parada}) {
  const t = avisoXarope(p.reclamacoes);
  return t ? <div className="aviso xarope" data-xarope>⚠️ {t}</div> : null;
}

// Pedido de 28/09: a reclamação costuma chegar depois da entrega, então isto aparece também
// para entrega já feita. Só a própria marcação se tira: a do outro motorista o banco não deixa.
export function MarcarXarope({p}: {p: Parada}) {
  const motivos = Object.keys(MOTIVOS) as MotivoReclamacao[];
  return <div className="marcar-xarope" data-marcar-xarope>
    <div className="info">⚠️ Cliente xarope? O próximo motorista vê no pino.</div>
    <div className="linha">{motivos.map(m => {
      const r = p.reclamacoes?.find(x => x.motivo === m);
      if (r && !r.minha) return <span key={m} className="etiqueta">{MOTIVOS[m].marcar} · já marcado</span>;
      return r
        ? <button key={m} className="btn peq" onClick={() => A.tirarXarope(p, m)}>✓ {MOTIVOS[m].marcar} · tirar</button>
        : <button key={m} className="btn peq" onClick={() => A.marcarXarope(p, m)}>{MOTIVOS[m].marcar}</button>;
    })}</div>
  </div>;
}

export function BotaoResetar() {
  const {e} = useLoja();
  return e.paradas.length ? <div className="linha" style={{marginTop: 16}}><button className="btn" onClick={A.resetar}>🔄 Resetar rota (começar do zero)</button></div> : null;
}

export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});

import type {ReactNode} from 'react';
import * as A from '../acoes';
import {fmtKm} from '../logica/otimizacao';
import {avisoXarope, MOTIVOS} from '../logica/reclamacoes';
import {COR_PRECISAO, ROTULO} from '../logica/rotulos';
import type {MotivoReclamacao, Parada} from '../logica/tipos';
import {loja} from '../loja';

// Ícones de traço, desenhados aqui: um pacote de ícones pesaria mais que o app inteiro de telas.
const DESENHOS: Record<string, ReactNode> = {
  mais: <><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  voltar: <path d="M15 6l-6 6 6 6" />,
  mira: <><circle cx="12" cy="12" r="6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  check: <path d="M5 12l5 5L19 7" />,
  desfazer: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  pausa: <path d="M9 6v12M15 6v12" />,
  alerta: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
  cima: <path d="M6 15l6-6 6 6" />,
  baixo: <path d="M6 9l6 6 6-6" />,
};

export const Icone = ({nome}: {nome: keyof typeof DESENHOS}) =>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{DESENHOS[nome]}</svg>;

// O número do que espera quem administra fica no botão Mais, à vista em toda tela: era a aba
// Admin que o mostrava, e o pedido de 28/09 é ver sem ir procurar.
export function BotaoMais() {
  const n = loja.ui.esperandoAdmin;
  return <button className="quadrado com-selo" aria-label="Mais" onClick={() => A.abrir({menu: true})}><Icone nome="mais" />
    {n > 0 && <span className="selo" data-selo>{n}</span>}</button>;
}

// O alto das telas que não são o mapa: voltar faz o que o botão do celular faria.
export function Cabecalho({titulo, sub, direita}: {titulo: string; sub?: string; direita?: ReactNode}) {
  return <div className="cabecalho">
    <button className="quadrado" aria-label="Voltar" onClick={A.voltar}><Icone nome="voltar" /></button>
    <div className="titulos"><div className="titulo">{titulo}</div>{sub && <div className="info">{sub}</div>}</div>
    {direita}
  </div>;
}

export const Tag = ({p}: {p: {precisao: Parada['precisao']}}) =>
  <span className="tag" style={{background: COR_PRECISAO[p.precisao]}}>{ROTULO[p.precisao]}</span>;

export function Meta({p}: {p: Parada}) {
  const partes: string[] = [];
  if (p.ml) partes.push(`no app: #${p.ml}`);
  if (p.unidades) partes.push(`${p.unidades} unid.`);
  if (p.comercial) partes.push('horário comercial');
  return partes.length ? <span className="achado">{partes.join(' · ')}</span> : null;
}

export function Sugestao({p}: {p: Parada}) {
  if (!p.sugestao) return null;
  const d = p.sugestao.distancia;
  return <div className="aviso">Outro motorista marcou este endereço em outro lugar{d != null ? `, a ${fmtKm(d)} daqui` : ''}.{' '}
    <button className="btn peq pri" onClick={() => A.usarSugestao(p)}>Usar a posição dele</button></div>;
}

export function AvisoXarope({p}: {p: Parada}) {
  const t = avisoXarope(p.reclamacoes);
  return t ? <div className="aviso xarope" data-xarope>{t}</div> : null;
}

// Pedido de 28/09: a reclamação costuma chegar depois da entrega, então isto aparece também
// para entrega já feita. Só a própria marcação se tira: a do outro motorista o banco não deixa.
export function MarcarXarope({p}: {p: Parada}) {
  const motivos = Object.keys(MOTIVOS) as MotivoReclamacao[];
  return <div className="marcar-xarope" data-marcar-xarope>
    <div className="info">Cliente xarope? O próximo motorista vê no pino.</div>
    <div className="linha">{motivos.map(m => {
      const r = p.reclamacoes?.find(x => x.motivo === m);
      if (r && !r.minha) return <span key={m} className="etiqueta">{MOTIVOS[m].marcar} · já marcado</span>;
      return r
        ? <button key={m} className="btn peq" onClick={() => A.tirarXarope(p, m)}>{MOTIVOS[m].marcar} · tirar</button>
        : <button key={m} className="btn peq" onClick={() => A.marcarXarope(p, m)}>{MOTIVOS[m].marcar}</button>;
    })}</div>
  </div>;
}

export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});

import * as A from '../acoes';
import {backupRecente} from '../logica/guarda';
import {guarda, useLoja} from '../loja';
import {nuvem} from '../servicos/nuvem';
import {Icone} from './comuns';
import {Conta} from './Conta';

// O que se usa uma vez por dia ou nunca, fora do caminho do dedo. Fechar e escolher voltam um
// passo no histórico, para o voltar do celular não reabrir o menu.
export function MenuMais() {
  const {e, ui} = useLoja();
  const comParadas = e.paradas.length > 0;
  const admin = nuvem.perfil?.papel === 'admin';
  const item = (rotulo: string, acao: () => void, classe = '') =>
    <button className={`item-menu ${classe}`} onClick={() => A.fecharMenuE(acao)}>{rotulo}</button>;
  return <div className="fundo-menu" onClick={ev => { if (ev.target === ev.currentTarget) A.voltar(); }}>
    <div className="menu" role="dialog" aria-label="Mais">
      <div className="folha-cab">
        <div className="titulo">Mais</div>
        <button className="quadrado" aria-label="Fechar" onClick={A.voltar}><Icone nome="x" /></button>
      </div>
      {comParadas && item('Conferir endereços', () => { ui.soDuvidas = false; A.abrir({tela: 'conferir'}); })}
      {comParadas && item(e.rota ? 'Refazer a rota' : 'Montar a rota', A.montarRota)}
      {item('Ponto de saída e de chegada', () => A.abrir({tela: 'saida'}))}
      {item('Áreas e horários', () => A.abrir({tela: 'areas'}))}
      {e.rota && item('Copiar a rota para o WhatsApp', A.copiarRota)}
      {comParadas && item('Ler mais uma planilha ou endereços', () => A.abrir({tela: 'inicio'}))}
      {comParadas && item('Resetar a rota', A.resetar, 'perigo')}
      {!comParadas && backupRecente(guarda) && item('Desfazer o último reset', A.desfazerReset)}
      {admin && <button className="item-menu" onClick={() => A.fecharMenuE(() => A.abrir({tela: 'admin'}))}>Admin
        {ui.esperandoAdmin > 0 && <span className="selo" data-selo aria-label={`${ui.esperandoAdmin} esperando você`}>{ui.esperandoAdmin}</span>}</button>}
      <div className="rodape-menu">
        <Conta />
        {/* para saber, pelo print de um motorista, se o celular dele já está com a versão nova */}
        <div className="info" data-versao>Versão do app: {__VERSAO__.quando}</div>
      </div>
    </div>
  </div>;
}

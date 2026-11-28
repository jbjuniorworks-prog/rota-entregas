import * as A from '../acoes';
import {backupRecente} from '../logica/guarda';
import {guarda, useLoja} from '../loja';
import {nuvem} from '../servicos/nuvem';
import {Icone, paraConferir} from './comuns';
import {Conta} from './Conta';

// O que se usa uma vez por dia ou nunca, fora do caminho do dedo. Fechar e escolher voltam um
// passo no histórico, para o voltar do celular não reabrir o menu.
export function MenuMais() {
  const {e, ui} = useLoja();
  const comParadas = e.paradas.length > 0;
  const admin = nuvem.perfil?.papel === 'admin';
  const duvidas = paraConferir();
  const item = (rotulo: string, acao: () => void, classe = '') =>
    <button className={`item-menu ${classe}`} onClick={() => A.fecharMenuE(acao)}>{rotulo}</button>;
  return <div className="fundo-menu" onClick={ev => { if (ev.target === ev.currentTarget) A.voltar(); }}>
    <div className="menu" role="dialog" aria-label="Mais">
      <div className="folha-cab">
        <div className="titulo">Mais</div>
        <button className="quadrado" aria-label="Fechar" onClick={A.voltar}><Icone nome="x" /></button>
      </div>
      {duvidas > 0 && <button className="item-menu" data-conferir onClick={() => A.fecharMenuE(() => { ui.soDuvidas = true; A.abrir({tela: 'conferir'}); })}>
        {duvidas} para conferir</button>}
      {/* Em grupos (dono, 28/11: "é bom organizar esse Mais, cheio de coisa"): eram 14 itens soltos. */}
      <div className="grupo-menu">Rota de hoje</div>
      {/* sem rota, a mesma tela serve para achar uma entrega de outro dia (B.O.) */}
      {item(comParadas ? 'Conferir endereços' : 'Procurar uma entrega', () => { ui.soDuvidas = false; A.abrir({tela: 'conferir'}); })}
      {comParadas && item(e.rota ? 'Refazer a rota' : 'Montar a rota', A.montarRota)}
      {e.rota && item('Copiar a rota para o WhatsApp', A.copiarRota)}
      {comParadas && item('Ler mais uma planilha ou endereços', () => A.abrir({tela: 'inicio'}))}
      {/* com a ocorrência ainda na sequência, o cartão de fim não chega: daqui encerra a qualquer hora */}
      {e.rota && item('Encerrar a rota', () => { A.contar('encerrar-mais'); A.encerrarComSobras(); })}
      <div className="grupo-menu">Antes de sair</div>
      {/* na hora de pegar a rota: os pacotes em gaiola longe do bairro, para os analistas (dono, 16/11) */}
      {item('Conferir romaneio', () => A.abrir({tela: 'romaneio'}))}
      {item('Ponto de chegada', () => A.abrir({tela: 'saida'}))}
      {item('Áreas e horários', () => A.abrir({tela: 'areas'}))}
      <div className="grupo-menu">Meu</div>
      {/* a lista do Admin, só com as rotas dele (Luan, pelo dono, 15/11) */}
      {nuvem.sessao && item('Minhas portas verificadas', () => { A.contar('minhas-portas'); A.abrir({tela: 'verificadas'}); })}
      {/* som, guia das curvas e teste do caminho; gravando, o nome diz, para ninguém esquecer ligado (24/11) */}
      {item(A.gravandoCaminho() ? 'Ajustes deste celular (gravando o caminho)' : 'Ajustes deste celular', () => A.abrir({tela: 'celular'}))}
      {admin && <button className="item-menu" onClick={() => A.fecharMenuE(() => A.abrir({tela: 'admin'}))}>Admin
        {ui.esperandoAdmin > 0 && <span className="selo" data-selo aria-label={`${ui.esperandoAdmin} esperando você`}>{ui.esperandoAdmin}</span>}</button>}
      {comParadas && item('Resetar a rota', A.resetar, 'perigo separado')}
      {!comParadas && backupRecente(guarda) && item('Desfazer o último reset', A.desfazerReset, 'separado')}
      <div className="rodape-menu">
        <Conta />
        {/* para saber, pelo print de um motorista, se o celular dele já está com a versão nova */}
        <div className="info" data-versao>Versão do app: {__VERSAO__.quando}</div>
      </div>
    </div>
  </div>;
}

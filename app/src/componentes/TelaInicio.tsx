import {useEffect, useState} from 'react';
import * as A from '../acoes';
import {backupRecente} from '../logica/guarda';
import {guarda, loja, useLoja} from '../loja';
import {BotaoMais, Cabecalho} from './comuns';

const hoje = () => new Date().toLocaleDateString('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit'});

// O começo do dia: carregar a rota. Com a rota já na tela, a mesma tela soma mais endereços.
export function TelaInicio() {
  const {e} = useLoja();
  const [colar, setColar] = useState(false);
  const [lista, setLista] = useState('');
  const a = loja.area(e.areaAtual);
  const comRota = e.paradas.length > 0;
  // O leitor de planilha pesa mais que o resto do app junto. Baixa aqui, onde ele vai ser usado,
  // e não em toda abertura: na Rota, que é onde ele passa o dia, não serve para nada. E depois de
  // a tela aparecer, para não disputar a rede com a abertura do app.
  useEffect(() => {
    const t = setTimeout(() => { import('xlsx').catch(() => {}); }, 2000);
    return () => clearTimeout(t);
  }, []);
  const abrirArquivos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const texto = await A.lerPrints([...files], lista);
    // prints e vídeo voltam como texto, para conferir antes de adicionar
    if (texto != null) { setLista(texto); setColar(true); }
  };
  return <>
    {comRota
      ? <Cabecalho titulo="Carregar mais endereços" sub={`Somam aos ${e.paradas.length} que já estão na rota`} />
      : <div className="cabecalho">
        <div className="titulos"><div className="titulo">Rota de Entregas</div><div className="info">{hoje()}</div></div>
        <BotaoMais />
      </div>}
    <div className="corpo inicio">
      {!comRota && <h1>Carregar a rota de hoje</h1>}
      <input type="file" id="arquivo" multiple hidden accept="image/*,video/*,application/pdf,.pdf,.xlsx,.xls,.ods,.csv,.txt"
        onChange={ev => { abrirArquivos(ev.target.files); ev.target.value = ''; }} />
      <label htmlFor="arquivo" className="btn pri grande-btn opcao">
        <span className="opcao-titulo">Ler a planilha</span>
        <span className="opcao-sub">A que vem do app de entregas</span>
      </label>
      <button className="btn contorno grande-btn opcao" aria-expanded={colar} onClick={() => setColar(!colar)}>
        <span className="opcao-titulo">Colar endereços</span>
      </button>
      {colar && <div className="colar">
        <label htmlFor="cidade">Cidade padrão</label>
        <input type="text" id="cidade" placeholder="Ex.: Aracaju, SE" defaultValue={e.cidade} onChange={ev => A.mudar(() => { e.cidade = ev.target.value.trim(); e.regiao = null; })} />
        {/* com a cidade escrita e sem região, quem faltou foi o mapa (sem sinal), não o motorista:
            mandar "preencha a cidade" com a cidade preenchida logo acima só faz duvidar da tela */}
        <div className="info">{e.regiao
          ? `Só procuro endereço até ${Math.round(e.regiao.raio / 1000)} km de ${e.regiao.nome === 'entregas' ? 'onde você entrega' : e.regiao.nome}. Rua de mesmo nome em outro estado é descartada.`
          : e.cidade
            ? `Ainda não confirmei ${e.cidade} no mapa (sem sinal?). Vou procurar perto das suas entregas assim que a primeira tiver posição.`
            : 'Preencha a cidade. Sem ela, uma rua de mesmo nome em outro estado pode entrar na rota.'}</div>
        <label htmlFor="lista">Endereços da área {a.nome} (um por linha)</label>
        <textarea id="lista" placeholder={'18 Avenida Dulce Diniz 920, CEP 49048430\n...'} value={lista} onChange={ev => setLista(ev.target.value)} />
        <button className="btn pri" onClick={async () => { if (await A.adicionarTexto(lista)) setLista(''); }}>Adicionar em {a.nome}</button>
      </div>}
      <label htmlFor="arquivo" className="btn contorno grande-btn opcao">
        <span className="opcao-titulo">Mandar prints ou vídeo da lista</span>
        <span className="opcao-sub">Ou use o Compartilhar do celular</span>
      </label>
      <div className="linha-area">
        <span className="dot" style={{'--c': a.cor} as any} />Área: {a.nome}{e.areas.length > 1 ? ` (de ${e.areas.length})` : ''}
        <button className="link" onClick={() => A.abrir({tela: 'areas'})}>trocar</button>
      </div>
      {backupRecente(guarda) && <div className="aviso">Você apagou uma rota há pouco. <button className="btn peq pri" onClick={A.desfazerReset}>Desfazer</button></div>}
    </div>
  </>;
}

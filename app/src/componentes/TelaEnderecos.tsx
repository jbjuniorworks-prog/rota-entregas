import {useState, type ReactNode} from 'react';
import * as A from '../acoes';
import {backupRecente} from '../logica/guarda';
import {CORES} from '../logica/rotulos';
import type {Area} from '../logica/tipos';
import {guarda, loja, useLoja} from '../loja';
import {BotaoResetar} from './comuns';
import {Conta} from './Conta';

export function TelaEnderecos() {
  const {e} = useLoja();
  const [lista, setLista] = useState('');
  const a = loja.area(e.areaAtual);
  const lembradas = A.memoria.quantas();
  const abrir = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const texto = await A.lerPrints([...files], lista);
    if (texto != null) setLista(texto);
  };
  return <>
    <Conta />
    <h2>Adicionar endereços por área</h2>
    <div className="info">Faça uma área (cor do app) por vez: escolha a cor abaixo, tire print da lista dessa área e adicione.</div>
    <label htmlFor="cidade">Cidade padrão</label>
    <input type="text" id="cidade" placeholder="Ex.: Aracaju, SE" defaultValue={e.cidade} onChange={ev => A.mudar(() => { e.cidade = ev.target.value.trim(); e.regiao = null; })} />
    <div className="info">{e.regiao
      ? `🔎 Só procuro endereço até ${Math.round(e.regiao.raio / 1000)} km de ${e.regiao.nome === 'entregas' ? 'onde você entrega' : e.regiao.nome}. Rua de mesmo nome em outro estado é descartada.`
      : '🔎 Preencha a cidade acima. Sem ela, uma rua de mesmo nome em outro estado pode entrar na rota.'}</div>
    <label>Área</label>
    <div className="chips">
      {e.areas.map(x => <ChipArea key={x.id} a={x} on={x.id === a.id} onClick={() => A.mudar(() => { e.areaAtual = x.id; })} />)}
      <button className="chip" onClick={A.novaArea}>+ Nova área</button>
    </div>
    <div className="item" style={{marginTop: 10}}>
      <div className="linha" style={{marginTop: 0}}>
        {CORES.map(([nome, cor]) => <button key={cor} className={`cor ${a.cor === cor ? 'on' : ''}`} style={{'--c': cor} as any} title={nome} aria-label={nome} onClick={() => A.corDaArea(cor, nome)} />)}
      </div>
      <div style={{display: 'flex', gap: 8}}>
        <div style={{flex: 2}}><label htmlFor="aNome">Nome</label><input type="text" id="aNome" key={a.id + 'n'} defaultValue={a.nome} onBlur={ev => A.mudar(() => { a.nome = ev.target.value.trim() || 'Área'; })} /></div>
        <div style={{flex: 1}}><label htmlFor="aPrazo">Entregar até</label><input type="time" id="aPrazo" key={a.id + 'p'} defaultValue={a.prazo} onChange={ev => A.mudar(() => { a.prazo = ev.target.value; }, true)} /></div>
      </div>
      {e.areas.length > 1 && <div className="linha"><button className="btn peq" onClick={A.removerArea}>Apagar esta área</button></div>}
    </div>
    <label htmlFor="lista">Endereços da área {a.nome} (um por linha)</label>
    <textarea id="lista" placeholder={'18 Avenida Dulce Diniz 920, Condomínio Luzia Residence, CEP 49048430\n...'} value={lista} onChange={ev => setLista(ev.target.value)} />
    <div className="linha">
      <button className="btn pri" onClick={async () => { if (await A.adicionarTexto(lista)) setLista(''); }}>Adicionar em {a.nome}</button>
      <label className="btn" style={{margin: 0, color: 'var(--tx)'}}>📷 Ler print, vídeo, PDF ou planilha
        <input type="file" accept="image/*,video/*,application/pdf,.pdf,.xlsx,.xls,.ods,.csv,.txt" id="print" multiple hidden onChange={ev => { abrir(ev.target.files); ev.target.value = ''; }} />
      </label>
    </div>
    <div className="info" style={{marginTop: 8}}>Pode mandar vários prints de uma vez, ou <b>gravar a tela</b> rolando a lista devagar do começo ao fim e mandar o vídeo. Endereços repetidos são ignorados. O número do app na frente (ex.: <b>18</b> Avenida…) aparece no pino.</div>
    <BotaoResetar />
    {backupRecente(guarda) && <div className="aviso">Você apagou uma rota há pouco. <button className="btn peq pri" onClick={A.desfazerReset}>↺ Desfazer</button></div>}
    {lembradas > 0 && <details>
      <summary>Posições que você corrigiu ({lembradas})</summary>
      <div className="info" style={{marginTop: 6}}>Quando você arrasta um pino ou marca no mapa, o local fica guardado neste celular. Se o endereço cair de novo numa rota, ele já vem no lugar certo, em roxo. Para trocar, é só corrigir de novo.</div>
      <div className="linha"><button className="btn" onClick={A.esquecerPosicoes}>Esquecer todas</button></div>
    </details>}
    <ChaveGoogle />
  </>;
}

function ChaveGoogle() {
  const {e} = useLoja();
  const [chave, setChave] = useState(e.googleKey);
  return <details>
    <summary>Precisão extra com Google (opcional)</summary>
    <div className="info" style={{marginTop: 6}}>Sem chave, a busca usa o OpenStreetMap, que às vezes acha só a rua. Com uma chave da Geocoding API do Google o número costuma vir certo (cota grátis mensal; pede cartão para criar).</div>
    <div className="aviso"><b>Cuidado:</b> a chave fica dentro desta página, no seu celular, e a API do Google <b>não</b> permite travar a chave por site — só por IP de servidor. Quem abrir esta página com a chave configurada pode copiá-la e gastar na sua conta. Use só no seu aparelho, ponha um <b>limite de gastos</b> no painel do Google e não configure a chave em celular de outra pessoa.</div>
    <label htmlFor="gkey">Chave da API do Google</label>
    <input type="password" id="gkey" value={chave} placeholder="AIza…" autoComplete="off" onChange={ev => setChave(ev.target.value)} />
    <div className="linha"><button className="btn" onClick={() => { A.mudar(() => { e.googleKey = chave.trim(); }); }}>Salvar chave</button></div>
  </details>;
}

function ChipArea({a, on, onClick, extra}: {a: Area; on: boolean; onClick: () => void; extra?: ReactNode}) {
  const n = loja.e.paradas.filter(p => p.area === a.id).length;
  return <button className={`chip ${on ? 'on' : ''}`} style={{'--c': a.cor} as any} onClick={onClick}>
    <span className="dot" />{a.nome}{a.prazo ? ' · até ' + a.prazo : ''} <small>({n})</small>{extra}
  </button>;
}

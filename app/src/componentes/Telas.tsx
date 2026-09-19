import {useState, type ReactNode} from 'react';
import * as A from '../acoes';
import {backupRecente} from '../logica/guarda';
import {blocos, fmtKm, fmtMin, linkMaps, linkMapsVarios, linkWaze, trechos} from '../logica/otimizacao';
import {previsoes} from '../logica/previsao';
import {COR_PRECISAO, CORES, DUVIDA, NO_NUMERO, ROTULO} from '../logica/rotulos';
import {mesmoEndereco} from '../logica/texto';
import type {Area, Parada, Ponto, RotaArea} from '../logica/tipos';
import {guarda, loja, useLoja} from '../loja';
import {nuvem} from '../servicos/nuvem';
import {rotuloDe} from './Mapa';

const Tag = ({p}: {p: {precisao: Parada['precisao']}}) =>
  <span className="tag" style={{background: COR_PRECISAO[p.precisao]}}>{ROTULO[p.precisao]}</span>;

function Meta({p}: {p: Parada}) {
  const partes: string[] = [];
  if (p.ml) partes.push(`no app: #${p.ml}`);
  if (p.unidades) partes.push(`📦 ${p.unidades} unid.`);
  if (p.comercial) partes.push('🏪 horário comercial');
  return partes.length ? <div className="achado">{partes.join(' · ')}</div> : null;
}

function Sugestao({p}: {p: Parada}) {
  if (!p.sugestao) return null;
  const d = p.sugestao.distancia;
  return <div className="aviso">💡 Outro motorista marcou este endereço em outro lugar{d != null ? `, a ${fmtKm(d)} daqui` : ''}.{' '}
    <button className="btn peq pri" onClick={() => A.usarSugestao(p)}>Usar a posição dele</button></div>;
}

function BotaoResetar() {
  const {e} = useLoja();
  return e.paradas.length ? <div className="linha" style={{marginTop: 16}}><button className="btn" onClick={A.resetar}>🔄 Resetar rota (começar do zero)</button></div> : null;
}

function Conta() {
  useLoja();
  const s = nuvem.sessao, pf = nuvem.perfil;
  const n = A.fila.pendentes(), erro = nuvem.semServidor ? 'sem conexão com o servidor' : A.fila.erro();
  const texto = erro ? '⚠️ ' + erro + (n ? ` · ${n} para enviar` : '') : n ? `⏳ ${n} para enviar` : '✓ tudo salvo';
  if (s) {
    return <div className="info">☁️ Conectado como <b>{pf ? pf.nome : s.user.email}</b>{pf?.papel === 'admin' ? ' (administrador)' : ''} · <span id="nuvemFila">{texto}</span>{' '}
      <button className="btn peq" onClick={A.sair}>Sair</button></div>;
  }
  return <div className="info">☁️ Sem conexão com a conta agora. O que você fizer fica neste celular e sobe quando a internet voltar{n ? ` (${n} para enviar)` : ''}.</div>;
}

export function TelaEntrar() {
  useLoja();
  const [email, setEmail] = useState(''), [senha, setSenha] = useState('');
  const pf = nuvem.perfil;
  if (nuvem.sessao && pf && !pf.ativo) {
    return <div className="entrar">
      <h2>Conta desativada</h2>
      <div className="info">Sua conta foi desativada. Fale com o responsável.</div>
      <div className="linha"><button className="btn" onClick={A.sair}>Sair</button></div>
    </div>;
  }
  return <form className="entrar" onSubmit={ev => { ev.preventDefault(); A.entrar(email.trim(), senha); }}>
    <h2>🚚 Rota de Entregas</h2>
    <div className="info">Entre com a conta que o responsável criou para você.</div>
    <label htmlFor="loginEmail">E-mail</label>
    <input type="email" id="loginEmail" autoComplete="username" inputMode="email" value={email} onChange={ev => setEmail(ev.target.value)} />
    <label htmlFor="loginSenha">Senha</label>
    <input type="password" id="loginSenha" autoComplete="current-password" value={senha} onChange={ev => setSenha(ev.target.value)} />
    <div className="linha"><button className="btn pri" type="submit">Entrar</button></div>
    {nuvem.semServidor && <div className="aviso">Sem conexão com o servidor. Para entrar pela primeira vez, precisa de internet.</div>}
    <div className="info" style={{marginTop: 10}}>Não tem conta? Peça ao responsável.</div>
  </form>;
}

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
    <input type="text" id="cidade" placeholder="Ex.: Aracaju, SE" defaultValue={e.cidade} onChange={ev => A.mudar(() => { e.cidade = ev.target.value.trim(); })} />
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
      <label className="btn" style={{margin: 0, color: 'var(--tx)'}}>📷 Ler print, PDF ou planilha
        <input type="file" accept="image/*,application/pdf,.pdf,.xlsx,.xls,.ods,.csv,.txt" id="print" multiple hidden onChange={ev => { abrir(ev.target.files); ev.target.value = ''; }} />
      </label>
    </div>
    <div className="info" style={{marginTop: 8}}>Pode mandar vários prints de uma vez (rolando a lista). Endereços repetidos são ignorados. O número do app na frente (ex.: <b>18</b> Avenida…) aparece no pino.</div>
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

export function TelaConferir() {
  const {e, ui} = useLoja();
  if (!e.paradas.length) return <div className="info">Nenhum endereço ainda. Vá em <b>1. Endereços</b>.</div>;
  const conta = (ks: readonly string[]) => e.paradas.filter(p => ks.includes(p.precisao)).length;
  const duvidas = conta([...DUVIDA]), pend = conta(['pendente']), sugeridas = e.paradas.filter(p => p.sugestao && !p.entregue).length;
  return <>
    <h2>Conferir locais</h2>
    <div className="info">✅ {conta(NO_NUMERO)} no número · 🛣️ {conta(['rua'])} na rua certa · ❗ {duvidas} para conferir{sugeridas ? ` · 💡 ${sugeridas} com sugestão` : ''}{pend ? ` · ⏳ ${pend} sem buscar` : ''}</div>
    {duvidas > 0 && <div className="aviso">Os de borda vermelha podem estar longe do lugar. Toque em <b>Ver</b> para olhar no mapa e use <b>Marcar no mapa</b> para corrigir (olhando a posição no app de entregas).</div>}
    <div className="linha">
      {pend > 0 && <button className="btn pri" onClick={() => A.buscarPendentes()}>Buscar {pend} pendente(s)</button>}
      <button className="btn" onClick={() => A.mudar(() => { ui.soDuvidas = !ui.soDuvidas; })}>{ui.soDuvidas ? 'Mostrar todos' : 'Só os duvidosos'}</button>
      <button className={`btn ${pend ? '' : 'pri'}`} onClick={() => A.irPara('rota')}>Ir para a rota →</button>
    </div>
    {e.areas.map(a => {
      const ps = e.paradas.filter(p => p.area === a.id && (!ui.soDuvidas || DUVIDA.has(p.precisao) || p.precisao === 'pendente'));
      if (!ps.length) return null;
      return <div key={a.id}>
        <div className="area-cab" style={{'--c': a.cor} as any}><span className="dot" /><span className="txt">{a.nome}</span><span className="info">{ps.length}</span></div>
        {ps.map(p => <ItemConferir key={p.id} p={p} />)}
      </div>;
    })}
  </>;
}

function ItemConferir({p}: {p: Parada}) {
  const {e, ui} = useLoja();
  const sel = ui.selecionada === p.id;
  const a = loja.area(p.area);
  return <div className={`item ${sel ? 'sel' : ''}`} data-item={p.id}>
    <div className="topo">
      <div className="badge" style={{background: a.cor}}>{rotuloDe(p)}</div>
      <div className="txt">
        <div className="orig">{p.texto}</div><Meta p={p} />
        {p.exibido && <div className="achado">📍 {p.exibido}</div>}
        <Tag p={p} />
      </div>
    </div>
    <Sugestao p={p} />
    <div className="linha">
      {p.lat != null && <button className="btn peq" onClick={() => A.focar(p.id)}>Ver</button>}
      <button className="btn peq" onClick={() => A.posicionar(p.id)}>{ui.posicionando === p.id ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      <button className="btn peq" onClick={() => A.estouAqui(p)}>📍 Estou aqui</button>
      <button className="btn peq" onClick={() => A.editar(p)}>Editar</button>
      <button className="btn peq" onClick={() => A.remover(p)}>Remover</button>
    </div>
    {sel && <><label>Área</label>
      <select value={p.area} onChange={ev => A.mudar(() => { p.area = ev.target.value; }, true)}>
        {e.areas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select></>}
    {sel && p.candidatos && p.candidatos.length > 1 && <div className="cands"><div className="info" style={{marginTop: 8}}>Outras opções encontradas:</div>
      {p.candidatos.map((c, k) => <button key={k} onClick={() => A.escolherCandidato(p, k)}><Tag p={c} /><br />{c.exibido}</button>)}
    </div>}
  </div>;
}

function ConfigInicio() {
  const {e, ui} = useLoja();
  return <>
    <h2>Ponto de saída</h2>
    <div className="info">{e.inicio && e.inicio.texto
      ? `📍 ${e.inicio.exibido}. Saindo deste endereço, não do GPS.`
      : `📡 Sua localização. É pega na hora de montar a rota${e.inicio ? ` (última: ${e.inicio.exibido})` : ''}.`}</div>
    <div className="linha">
      <button className="btn" onClick={() => A.gps().catch(() => {})}>📡 Onde estou agora</button>
      <button className="btn" onClick={A.saidaPorEndereco}>Sair de outro endereço</button>
      {e.inicio && e.inicio.texto && <button className="btn" onClick={() => A.mudar(() => { e.inicio = null; }, true)}>Usar o GPS</button>}
    </div>
    <label style={{display: 'flex', gap: 8, alignItems: 'center', color: 'var(--tx)'}}>
      <input type="checkbox" id="voltar" checked={!!(e.voltar && !e.fim)} disabled={!!e.fim} style={{width: 20, height: 20}} onChange={ev => A.mudar(() => { e.voltar = ev.target.checked; }, true)} />
      Voltar ao ponto de saída no final
    </label>
    <h2>Terminar perto de</h2>
    <div className="info">{e.fim ? `🏁 ${e.fim.exibido}. A última entrega fica o mais perto possível daqui.` : 'Sem ponto final: a rota termina onde for mais curto.'}</div>
    <div className="linha">
      <button className="btn" onClick={A.fimPorEndereco}>Digitar lugar</button>
      <button className="btn" onClick={() => A.posicionar('fim')}>{ui.posicionando === 'fim' ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      {e.fim && <button className="btn" onClick={() => A.mudar(() => { e.fim = null; }, true)}>Tirar</button>}
    </div>
    <label htmlFor="tamTrecho">Paradas por trecho no Google Maps</label>
    <input type="text" inputMode="numeric" id="tamTrecho" defaultValue={e.tamTrecho} style={{maxWidth: 90}}
      onBlur={ev => A.mudar(() => { e.tamTrecho = Math.min(25, Math.max(1, parseInt(ev.target.value, 10) || 9)); })} />
    <div className="info">Se o Maps cortar pontos, diminua este número. Entregas bem próximas contam como 1 ponto.</div>
    <div className="info" style={{marginTop: 8}}>As áreas com horário (“entregar até”) vão primeiro; entre elas, a mais perto.</div>
    <div className="linha"><button className="btn pri" onClick={A.montarRota}>🧭 Montar melhor sequência</button></div>
  </>;
}

function LinhaParada({p, comWaze}: {p: Parada; comWaze: boolean}) {
  const a = loja.area(p.area);
  return <div className={`parada ${p.entregue ? 'feito' : ''}`} data-item={p.id}>
    <div className="badge" style={{background: a.cor}}>{rotuloDe(p)}</div>
    <div className="txt" onClick={() => A.focar(p.id)}>
      <div>{p.texto}</div><Meta p={p} />
      {DUVIDA.has(p.precisao) && <Tag p={p} />}
      {p.sugestao && !p.entregue && <div className="achado">💡 Outro motorista sugere outro lugar: veja em 2. Conferir</div>}
    </div>
    {comWaze && !p.entregue && <a className="btn peq waze" href={linkWaze(p as Ponto)} target="_blank" rel="noopener" aria-label="Waze">🧭</a>}
    {!p.entregue && !p.adiada && loja.e.rota && <button className="btn peq" aria-label="Deixar para depois" title="Deixar para depois" onClick={() => A.deixarParaDepois(p)}>⏸</button>}
    {p.entregue
      ? <button className="btn peq" aria-label="Desfazer" onClick={() => A.marcarEntregue(p, false)}>↺</button>
      : <button className="btn peq ok" aria-label="Entregue" onClick={() => A.marcarEntregue(p, true)}>✓</button>}
  </div>;
}

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});

function Adiadas() {
  const {e, ui} = useLoja();
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue);
  if (!adiadas.length) return null;
  return <>
    <div className="area-cab"><span className="txt">⏸ Deixadas para depois ({adiadas.length})</span></div>
    <div className="info">Fora da sequência. Arrume a localização com "Marcar no mapa" (a rota de hoje não muda) e toque em "Voltar para a rota" quando quiser.</div>
    {adiadas.map(p => <div className="item" key={p.id} data-item={p.id}>
      <LinhaParada p={p} comWaze />
      <div className="linha">
        <button className="btn peq" onClick={() => A.posicionar(p.id)}>{ui.posicionando === p.id ? 'Toque no mapa…' : 'Marcar no mapa'}</button>
      <button className="btn peq" onClick={() => A.estouAqui(p)}>📍 Estou aqui</button>
        <button className="btn peq pri" onClick={() => A.voltarParaARota(p)}>Voltar para a rota</button>
      </div>
    </div>)}
  </>;
}

export function TelaRota() {
  const {e} = useLoja();
  if (!e.rota) {
    const semLocal = e.paradas.filter(p => p.lat == null && !p.entregue).length;
    return <><ConfigInicio />{semLocal > 0 && <div className="aviso">{semLocal} parada(s) sem local ficarão fora da rota. Corrija em <b>2. Conferir</b>.</div>}<Adiadas /><BotaoResetar /></>;
  }
  const R = e.rota;
  const naRota = new Set(R.areas.flatMap(a => a.ordem));
  const foraDaRota = e.paradas.filter(p => !p.entregue && !p.adiada && p.lat != null && !naRota.has(p.id)).length;
  const adiadas = e.paradas.filter(p => p.adiada && !p.entregue);
  const semLocal = e.paradas.filter(p => !p.entregue && p.lat == null).length;
  const prev = previsoes(e);
  const ultima = R.areas[R.areas.length - 1];
  const trechosDe = (ra: RotaArea) => trechos(ra.ordem, loja.parada, e.tamTrecho, ra === ultima ? e.fim : null);

  let agora: {ra: RotaArea; b: string[]} | null = null;
  for (const ra of R.areas) {
    for (const b of blocos(ra.ordem, loja.parada)) if (b.some(id => !loja.parada(id)!.entregue)) { agora = {ra, b}; break; }
    if (agora) break;
  }

  const avisoPrazo = (a: Area) => {
    const pa = prev && prev.porArea[a.id];
    if (!pa) return null;
    const ritmo = `${Math.round(prev!.ritmo.segundos / 60)} min por parada, ${prev!.ritmo.medido ? 'seu ritmo de hoje' : 'estimado'}`;
    if (pa.estoura) return <div className="aviso" style={{background: '#fee2e2', borderColor: '#fca5a5'}}><b>⚠ Você não fecha esta área no prazo.</b><br />
      Previsão de terminar: <b>{hhmm(pa.fim)}</b>, e o prazo é <b>{a.prazo}</b>. ({ritmo})</div>;
    return <div className="info">Previsão de terminar a área: <b>{hhmm(pa.fim)}</b>{a.prazo ? ` · prazo ${a.prazo} ✓` : ''} ({ritmo})</div>;
  };

  let proxima: ReactNode;
  if (agora) {
    const a = loja.area(agora.ra.id);
    const todasArea = agora.ra.ordem.map(loja.parada).filter((p): p is Parada => !!p);
    const pend = agora.b.map(loja.parada).filter((p): p is Parada => !!p && !p.entregue);
    const alvo = pend[0];
    const trechoAtual = trechosDe(agora.ra)[0] || [];
    const entregasTrecho = trechoAtual.reduce((n, x) => n + x.ids.filter(i => !loja.parada(i)!.entregue).length, 0);
    proxima = <div className="proxima" style={{borderColor: a.cor}}>
      <div className="info" style={{display: 'flex', gap: 6, alignItems: 'center', '--c': a.cor} as any}><span className="dot" />
        Área <b>{a.nome}</b>{a.prazo ? ' · até ' + a.prazo : ''} · {todasArea.filter(p => p.entregue).length}/{todasArea.length} entregues</div>
      {avisoPrazo(a)}
      <div className="grande">{pend.length > 1 ? `${pend.length} entregas ${mesmoEndereco(agora.b.map(id => loja.parada(id)!.texto)) ? 'no mesmo endereço' : 'aqui perto'}` : 'Próxima entrega'}</div>
      <div className="achado">📍 {alvo.exibido || alvo.texto}</div>
      <div className="info" style={{marginTop: 4}}>Chegou e o pino está errado? <button className="btn peq" onClick={() => A.estouAqui(alvo)}>📍 Estou aqui</button></div>
      <div className="linha">
        <a className="btn waze" href={linkWaze(alvo as Ponto)} target="_blank" rel="noopener">Waze</a>
        <a className="btn pri" href={linkMaps(alvo as Ponto)} target="_blank" rel="noopener">Google Maps</a>
      </div>
      {trechoAtual.length > 1 && <div className="linha"><a className="btn pri" href={linkMapsVarios(trechoAtual.map(x => x.alvo))} target="_blank" rel="noopener">
        🗺️ Maps com os próximos {trechoAtual.filter(x => x.ids.length).length} pontos ({entregasTrecho} entregas){trechoAtual.some(x => !x.ids.length) ? ' + 🏁' : ''}</a></div>}
      <div style={{marginTop: 8}}>{agora.b.map(loja.parada).map(p => <LinhaParada key={p!.id} p={p!} comWaze={pend.length > 1} />)}</div>
      {pend.length > 1 && <div className="info" style={{marginTop: 6}}>Chegando, use o mapa do app de entregas para achar a porta de cada uma.</div>}
    </div>;
  } else {
    proxima = <div className="proxima"><div className="grande">{adiadas.length
      ? `✓ Sequência concluída. Falta(m) ${adiadas.length} deixada(s) para depois, no fim da tela.`
      : '🎉 Todas as entregas da rota foram feitas!'}</div></div>;
  }

  const economia = R.mlDist - R.dist;
  return <>
    {proxima}
    <div className="info">Total estimado: <b>{fmtKm(R.dist)}</b>, cerca de <b>{fmtMin(R.dur)}</b> dirigindo (sem contar as paradas){R.porRuas ? '' : ', aproximado'}.</div>
    {R.mlDist > 0 && <div className="info" style={{marginTop: 4}}>Na ordem da lista do app: {fmtKm(R.mlDist)}, {fmtMin(R.mlDur)}. {economia > 200
      ? <b style={{color: 'var(--ok)'}}>Esta rota economiza {fmtKm(economia)}.</b> : 'A ordem do app já estava boa.'}</div>}
    {semLocal > 0 && <div className="aviso">{semLocal} parada(s) não encontrada(s) ficaram fora da rota. Corrija em <b>2. Conferir</b>.</div>}
    {foraDaRota > 0 && <div className="aviso">{foraDaRota} parada(s) nova(s) ou corrigida(s) fora da rota. <button className="btn peq pri" onClick={A.montarRota}>Refazer rota</button></div>}
    <div className="linha"><button className="btn" onClick={A.copiarRota}>📋 Copiar rota (WhatsApp)</button>
      {e.areasManual && <button className="btn" onClick={() => { e.areasManual = false; A.montarRota(); }}>Ordem automática das áreas</button>}</div>
    {R.areas.map((ra, i) => {
      const a = loja.area(ra.id);
      const ps = ra.ordem.map(loja.parada).filter((p): p is Parada => !!p);
      const feitas = ps.filter(p => p.entregue).length;
      const pa = prev && prev.porArea[a.id];
      let n = 0;
      return <div key={ra.id}>
        <div className="area-cab" style={{'--c': a.cor} as any}>
          <span className="dot" />
          <span className="txt">{i + 1}. {a.nome}{a.prazo ? ' · até ' + a.prazo : ''}</span>
          <span className="info">{feitas}/{ps.length}</span>
          {pa && <span className="info" style={{color: pa.estoura ? 'var(--bad)' : 'var(--mut)'}}>{pa.estoura ? '⚠ ' : '~'}{hhmm(pa.fim)}</span>}
          <button className="btn peq" disabled={i === 0} aria-label="Subir área" onClick={() => A.moverArea(a.id, -1)}>▲</button>
          <button className="btn peq" disabled={i === R.areas.length - 1} aria-label="Descer área" onClick={() => A.moverArea(a.id, 1)}>▼</button>
        </div>
        {feitas === ps.length ? <div className="info">✓ Área concluída.</div> : <>
          <div className="info">{fmtKm(ra.dist)} · {fmtMin(ra.dur)}</div>
          <div className="linha">{trechosDe(ra).map((t, k) => {
            const ini = n + 1;
            n += t.filter(x => x.ids.length).length;
            return <a key={k} className="btn peq pri" href={linkMapsVarios(t.map(x => x.alvo))} target="_blank" rel="noopener">Maps trecho {k + 1} (pontos {ini}–{n})</a>;
          })}</div>
          {blocos(ra.ordem, loja.parada).map((b, k) => {
            const bp = b.map(loja.parada).filter((p): p is Parada => !!p);
            const pend = bp.filter(p => !p.entregue);
            const perna = e.pernas[b[0]];
            return <div className="item" key={b[0]}>
              <div className="bloco-cab">
                <span style={{flex: 1}}>Parada {k + 1}{b.length > 1 ? ` · ${b.length} entregas ${mesmoEndereco(bp.map(p => p.texto)) ? 'no mesmo endereço' : 'perto'}` : ''}{perna && perna.dur ? ` · 🚗 ${fmtMin(perna.dur)}` : ''}</span>
                {pend.length ? <a className="btn peq waze" href={linkWaze(pend[0] as Ponto)} target="_blank" rel="noopener">Waze</a> : '✓'}
              </div>
              {bp.map(p => <LinhaParada key={p.id} p={p} comWaze={false} />)}
            </div>;
          })}
        </>}
      </div>;
    })}
    <Adiadas />
    <details><summary>Ponto de saída / refazer rota</summary><ConfigInicio /></details>
    <BotaoResetar />
  </>;
}

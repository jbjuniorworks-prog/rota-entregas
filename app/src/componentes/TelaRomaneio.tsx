import {useState} from 'react';
import * as A from '../acoes';
import {daGaiola, linhaDoSuspeito, textoParaAnalistas, type Conferencia, type Suspeito} from '../logica/romaneio';
import {Cabecalho, PLANILHAS} from './comuns';

type Estado = {fase: 'lendo'} | {fase: 'erro'; erro: string} | {fase: 'pronto'; c: Conferencia};

const total = (ss: Suspeito[]) => ss.reduce((n, s) => n + s.pacotes, 0);

function Lista({suspeitos, vazio, marca}: {suspeitos: Suspeito[]; vazio: string; marca: string}) {
  if (!suspeitos.length) return <div className="info" data-vazio={marca}>{vazio}</div>;
  return <>{suspeitos.map(s => <div className="item" key={s.gaiola + s.bairro} data-suspeito={marca}>{linhaDoSuspeito(s)}</div>)}</>;
}

// "Identificar já os que estão fora de rota, pra avisar aos analistas enquanto pegamos a rota logo
// cedo" (dono, 16/11). Para todos, no Mais: cada motorista vê a gaiola dele e o galpão inteiro.
export function TelaRomaneio() {
  const [r, setR] = useState<Estado | null>(null);
  const [gaiola, setGaiola] = useState(A.gaiolaGuardada);
  const ler = (f: File | undefined) => {
    if (!f) return;
    setR({fase: 'lendo'});
    A.conferirOArquivo(f).then(c => setR({fase: 'pronto', c}), err => setR({fase: 'erro', erro: (err as Error).message}));
  };
  const c = r?.fase === 'pronto' ? r.c : null;
  const g = gaiola.trim().toUpperCase();
  const minha = c && g && c.gaiolas.includes(g) ? daGaiola(c, g) : null;
  return <>
    <Cabecalho titulo="Conferir romaneio" sub="Pacotes numa gaiola longe do bairro deles" />
    <div className="corpo" data-romaneio>
      <input type="file" id="romaneio" hidden accept={PLANILHAS} onChange={ev => { ler(ev.target.files?.[0]); ev.target.value = ''; }} />
      <label htmlFor="romaneio" className={`btn ${c ? 'contorno' : 'pri'} grande-btn opcao`}>
        <span className="opcao-titulo">{c ? 'Ler outro romaneio' : 'Ler o romaneio'}</span>
        <span className="opcao-sub">A planilha com o bairro e a gaiola de cada pacote</span>
      </label>
      {r?.fase === 'lendo' && <div className="info" data-lendo>Conferindo o romaneio…</div>}
      {r?.fase === 'erro' && <div className="aviso" data-erro>Não consegui conferir: {r.erro}.</div>}
      {c && <>
        <div className="item" data-resumo>
          <div><b>{total(c.suspeitos)} pacote(s)</b> parecem fora de rota, em {new Set(c.suspeitos.map(s => s.gaiola)).size} gaiola(s). O romaneio tem {c.pacotes} pacotes em {c.gaiolas.length} gaiolas.</div>
          {c.semConferir > 0 && <div className="achado">{c.semConferir} {c.semConferir === 1 ? 'ficou' : 'ficaram'} sem conferir: o censo do IBGE não sabe onde fica o bairro deles.</div>}
          <div className="achado">É para conferir: o bairro é o que o cliente escreveu, e às vezes está errado.</div>
        </div>
        <label htmlFor="gaiola">Sua gaiola</label>
        <input type="text" id="gaiola" placeholder="Ex.: B-7" autoCapitalize="characters" value={gaiola}
          onChange={ev => { setGaiola(ev.target.value); A.guardarGaiola(ev.target.value); }} />
        {g && !minha && <div className="info" data-sem-gaiola>A gaiola {g} não está neste romaneio.</div>}
        {minha && <>
          <h2>Na sua gaiola ({g})</h2>
          <Lista suspeitos={minha.naGaiola} vazio="Nenhum pacote de fora." marca="na-gaiola" />
          <h2>Da sua área, em outras gaiolas</h2>
          <Lista suspeitos={minha.emOutras} vazio="Nenhum." marca="em-outras" />
          {(minha.naGaiola.length > 0 || minha.emOutras.length > 0) &&
            <button className="btn contorno" data-copiar="gaiola" onClick={() => A.copiarParaAnalistas(textoParaAnalistas([...minha.naGaiola, ...minha.emOutras]))}>
              Copiar só os da sua gaiola</button>}
        </>}
        <h2>Galpão inteiro</h2>
        <button className="btn pri" data-copiar="galpao" onClick={() => A.copiarParaAnalistas(textoParaAnalistas(c.suspeitos))}>Copiar a lista para os analistas</button>
        <Lista suspeitos={c.suspeitos} vazio="Nenhum pacote parece fora de rota." marca="galpao" />
      </>}
    </div>
  </>;
}

import {useState} from 'react';
import * as A from '../acoes';
import {useLoja} from '../loja';
import {nuvem} from '../servicos/nuvem';

export function Conta() {
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
  const [email, setEmail] = useState(''), [senha, setSenha] = useState(''), [verSenha, setVerSenha] = useState(false);
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
    <div className="senha">
      <input type={verSenha ? 'text' : 'password'} id="loginSenha" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={senha} onChange={ev => setSenha(ev.target.value)} />
      <button type="button" className="olho" aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={verSenha} onClick={() => setVerSenha(!verSenha)}>{verSenha ? '🙈' : '👁️'}</button>
    </div>
    <div className="linha"><button className="btn pri" type="submit">Entrar</button></div>
    {nuvem.semServidor && <div className="aviso">Sem conexão com o servidor. Para entrar pela primeira vez, precisa de internet.</div>}
    <div className="info" style={{marginTop: 10}}>Não tem conta? Peça ao responsável.</div>
  </form>;
}

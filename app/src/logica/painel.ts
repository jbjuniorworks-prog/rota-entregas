// O painel do dia no Admin (dono, 19/10): os números de hoje e cada rota com a sua situação.
// Puro de propósito, para a regra ser testada sem nuvem.

export type Situacao = 'terminou' | 'na rua' | 'parada' | 'não começou';

// Sem entregar há mais que isto, com pacotes por fazer: o César de 19/10 parou às 12:58 com 14 de
// 121 e nada mais chegou.
export const PARADA_MIN = 60;

export interface RotaDoDia {
  id: string;
  motorista: string;
  arquivo: string | null;
}

export interface PacoteDoDia {
  rota_id: string;
  chave_lugar: string | null;
  endereco: string;
  entregue_em: string | null;
}

export interface LinhaDoDia extends RotaDoDia {
  pacotes: number;
  entregues: number;
  enderecos: number;
  verificados: number;
  ultima: string | null;
  situacao: Situacao;
  // há quanto tempo parada, em minutos
  parada: number;
}

export interface Dia {
  linhas: LinhaDoDia[];
  pacotes: number;
  entregues: number;
  enderecos: number;
  verificados: number;
  naRua: number;
}

export const hojeEmMaceio = (agora = Date.now()) => new Date(agora).toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});

export function situacaoDaRota(pacotes: number, entregues: number, ultima: string | null, agora: number): {situacao: Situacao; parada: number} {
  if (pacotes > 0 && entregues >= pacotes) return {situacao: 'terminou', parada: 0};
  if (!entregues || !ultima) return {situacao: 'não começou', parada: 0};
  const minutos = Math.floor((agora - Date.parse(ultima)) / 60000);
  return minutos >= PARADA_MIN ? {situacao: 'parada', parada: minutos} : {situacao: 'na rua', parada: 0};
}

// Endereço é a chave do lugar; sem chave (sem número, sem CEP nem bairro), o próprio texto, que
// conta como não verificado.
export function resumirDia(rotas: RotaDoDia[], pacotes: PacoteDoDia[], confirmadas: ReadonlySet<string>, agora = Date.now()): Dia {
  const linhas = rotas.map(r => {
    const ps = pacotes.filter(p => p.rota_id === r.id);
    const enderecos = new Set(ps.map(p => p.chave_lugar ?? 'texto:' + p.endereco.trim().toLowerCase()));
    const verificados = new Set(ps.map(p => p.chave_lugar).filter((k): k is string => !!k && confirmadas.has(k)));
    const entregues = ps.filter(p => p.entregue_em);
    const ultima = entregues.map(p => p.entregue_em!).sort().pop() ?? null;
    return {...r, pacotes: ps.length, entregues: entregues.length, enderecos: enderecos.size, verificados: verificados.size, ultima,
      ...situacaoDaRota(ps.length, entregues.length, ultima, agora)};
  });
  // o que precisa de olho primeiro: parada, na rua, não começou, terminou
  const ordem: Record<Situacao, number> = {'parada': 0, 'na rua': 1, 'não começou': 2, 'terminou': 3};
  linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.motorista.localeCompare(b.motorista));
  const soma = (f: (l: LinhaDoDia) => number) => linhas.reduce((n, l) => n + f(l), 0);
  return {
    linhas, pacotes: soma(l => l.pacotes), entregues: soma(l => l.entregues), enderecos: soma(l => l.enderecos),
    verificados: soma(l => l.verificados), naRua: new Set(linhas.filter(l => l.situacao === 'na rua').map(l => l.motorista)).size,
  };
}

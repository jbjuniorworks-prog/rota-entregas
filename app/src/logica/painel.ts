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
  criado_em?: string;
  // na conta de quem administra entra planilha dos outros de propósito
  doAdmin?: boolean;
}

export interface PacoteDoDia {
  rota_id: string;
  chave_lugar: string | null;
  endereco: string;
  entregue_em: string | null;
  bairro?: string | null;
  lat?: number | null;
  lng?: number | null;
}

// Parada por fazer sem pino na rota do motorista: não encontrada na busca. Uma por endereço.
export interface SemLocal {
  rota_id: string;
  motorista: string;
  endereco: string;
  bairro: string;
  chave: string | null;
  pacotes: number;
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

export type Suspeita = {tipo: 'outro dia'; dia: string} | {tipo: 'outro motorista'; nome: string} | {tipo: 'repetida'};

export interface ParaConferir extends LinhaDoDia {
  suspeita: Suspeita;
}

export interface Dia {
  linhas: LinhaDoDia[];
  // fora dos números: planilha de outro dia, de outro motorista ou aberta de novo, sem entrega
  paraConferir: ParaConferir[];
  semLocal: SemLocal[];
  // para o mapa do dia
  pontos: PacoteDoDia[];
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

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const primeiro = (nome: string) => semAcento(nome).split(/\s+/)[0] || '';

// 19/10: na conta do dono entrou a planilha de 19/09 do Pedro, e na do Luan a do Pedro de hoje; as
// duas sem nenhuma entrega. O nome do arquivo da Shopee traz o dia e o nome do motorista. Só a rota
// sem entrega: com entrega, alguém está fazendo. A conta de quem administra carrega planilha dos
// outros de propósito: lá, só o dia conta.
export function suspeitaDaRota(arquivo: string | null, dia: string, dono: string, motoristas: string[], doAdmin: boolean, entregues: number): Suspeita | null {
  if (!arquivo || entregues > 0) return null;
  const d = arquivo.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (d && `${d[3]}-${d[2]}-${d[1]}` !== dia) return {tipo: 'outro dia', dia: `${d[1]}/${d[2]}/${d[3]}`};
  if (doAdmin) return null;
  const palavras = new Set(semAcento(arquivo).split(/[^a-z]+/));
  if (palavras.has(primeiro(dono))) return null;
  const outro = motoristas.find(n => primeiro(n) !== primeiro(dono) && primeiro(n).length > 2 && palavras.has(primeiro(n)));
  return outro ? {tipo: 'outro motorista', nome: outro} : null;
}

// "(1)19-10-2026 JEFFERSON….xlsx" é a mesma planilha baixada de novo
const nomeDaPlanilha = (arquivo: string) => semAcento(arquivo).replace(/\(\d+\)/g, '').replace(/\s+/g, ' ').trim();

// Endereço é a chave do lugar; sem chave (sem número, sem CEP nem bairro), o próprio texto, que
// conta como não verificado.
export function resumirDia(rotas: RotaDoDia[], pacotes: PacoteDoDia[], confirmadas: ReadonlySet<string>, agora = Date.now(), motoristas: string[] = []): Dia {
  const todas = rotas.map(r => {
    const ps = pacotes.filter(p => p.rota_id === r.id);
    const enderecos = new Set(ps.map(p => p.chave_lugar ?? 'texto:' + p.endereco.trim().toLowerCase()));
    const verificados = new Set(ps.map(p => p.chave_lugar).filter((k): k is string => !!k && confirmadas.has(k)));
    const entregues = ps.filter(p => p.entregue_em);
    const ultima = entregues.map(p => p.entregue_em!).sort().pop() ?? null;
    return {...r, pacotes: ps.length, entregues: entregues.length, enderecos: enderecos.size, verificados: verificados.size, ultima,
      ...situacaoDaRota(ps.length, entregues.length, ultima, agora)};
  });
  const hoje = hojeEmMaceio(agora);
  // a que fica é a que tem entrega; sem entrega nas duas, a primeira enviada
  const repetida = (l: LinhaDoDia) => !!l.arquivo && !l.entregues && todas.some(o => o.id !== l.id && !!o.arquivo
    && nomeDaPlanilha(o.arquivo) === nomeDaPlanilha(l.arquivo!) && (o.entregues > 0 || (o.criado_em || '') < (l.criado_em || '')));
  const paraConferir: ParaConferir[] = [];
  const linhas: LinhaDoDia[] = [];
  for (const l of todas) {
    const s = suspeitaDaRota(l.arquivo, hoje, l.motorista, motoristas, !!l.doAdmin, l.entregues) ?? (repetida(l) ? {tipo: 'repetida' as const} : null);
    if (s) paraConferir.push({...l, suspeita: s});
    else linhas.push(l);
  }
  // o que precisa de olho primeiro: parada, na rua, não começou, terminou
  const ordem: Record<Situacao, number> = {'parada': 0, 'na rua': 1, 'não começou': 2, 'terminou': 3};
  linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.motorista.localeCompare(b.motorista));
  const valem = new Set(linhas.map(l => l.id));
  const semLocal = new Map<string, SemLocal>();
  for (const p of pacotes) {
    if (!valem.has(p.rota_id) || p.entregue_em || p.lat != null) continue;
    const k = p.rota_id + '|' + (p.chave_lugar ?? p.endereco);
    const s = semLocal.get(k);
    if (s) s.pacotes++;
    else semLocal.set(k, {rota_id: p.rota_id, motorista: linhas.find(l => l.id === p.rota_id)!.motorista, endereco: p.endereco, bairro: p.bairro || '', chave: p.chave_lugar, pacotes: 1});
  }
  const soma = (f: (l: LinhaDoDia) => number) => linhas.reduce((n, l) => n + f(l), 0);
  return {
    linhas, paraConferir, semLocal: [...semLocal.values()],
    pontos: pacotes.filter(p => valem.has(p.rota_id) && p.lat != null && p.lng != null),
    pacotes: soma(l => l.pacotes), entregues: soma(l => l.entregues), enderecos: soma(l => l.enderecos),
    verificados: soma(l => l.verificados), naRua: new Set(linhas.filter(l => l.situacao === 'na rua').map(l => l.motorista)).size,
  };
}

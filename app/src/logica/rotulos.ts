import type {Precisao} from './tipos';

export const ROTULO: Record<Precisao, string> = {
  exato: 'Número encontrado',
  planilha: 'Posição da planilha',
  lembrado: 'Corrigida por você antes',
  longe: 'Longe das outras entregas — confira o pino',
  bom: 'Prédio encontrado',
  rua: 'Rua encontrada (chega perto)',
  ruim: 'Impreciso — confira o pino',
  nao: 'Não encontrado',
  manual: 'Ajustado por você',
  pendente: 'Ainda não buscado',
};

export const COR_PRECISAO: Record<Precisao, string> = {
  exato: '#16a34a', planilha: '#16a34a', lembrado: '#7c3aed', longe: '#dc2626', bom: '#16a34a',
  rua: '#0891b2', ruim: '#dc2626', nao: '#dc2626', manual: '#7c3aed', pendente: '#6b7280',
};

export const RANK: Record<Precisao, number> = {
  exato: 0, planilha: 0, lembrado: 0, manual: 0, bom: 1, rua: 2, longe: 3, ruim: 3, nao: 4, pendente: 5,
};

export const DUVIDA: ReadonlySet<Precisao> = new Set<Precisao>(['ruim', 'nao', 'longe']);
export const NO_NUMERO: readonly Precisao[] = ['exato', 'bom', 'manual', 'planilha', 'lembrado'];

export const CORES: readonly [nome: string, cor: string, emoji: string][] = [
  ['Verde', '#16a34a', '🟢'], ['Amarelo', '#ca8a04', '🟡'], ['Roxo', '#9333ea', '🟣'],
  ['Azul', '#2563eb', '🔵'], ['Laranja', '#ea580c', '🟠'], ['Rosa', '#db2777', '🩷'],
];

export type Precisao = 'exato' | 'planilha' | 'lembrado' | 'manual' | 'bom' | 'rua' | 'longe' | 'bairro' | 'aproximada' | 'numero' | 'confirmado' | 'ruim' | 'nao' | 'pendente';

export interface Ponto {
  lat: number;
  lng: number;
}

export interface Candidato extends Ponto {
  exibido: string;
  precisao: Precisao;
  rua?: string;
  nomes?: string[];
  fonte: string;
}

export interface Parada {
  id: string;
  area: string;
  ml: string | null;
  stop?: string | null;
  adicional?: boolean;
  texto: string;
  bairro?: string;
  rota?: string;
  pacotes?: string[];
  unidades: number | null;
  comercial: boolean;
  lat: number | null;
  lng: number | null;
  exibido: string;
  precisao: Precisao;
  precisaoAntes?: Precisao;
  candidatos: Candidato[];
  entregue: boolean;
  entregueEm?: number | null;
  adiada?: boolean;
  sugestao?: {lat: number; lng: number; distancia: number | null};
}

export interface Area {
  id: string;
  nome: string;
  cor: string;
  prazo: string;
}

export interface Local extends Ponto {
  id: string;
  exibido: string;
  texto?: string;
}

export interface Perna {
  dur: number;
  dist: number;
}

export interface RotaArea {
  id: string;
  ordem: string[];
  dur: number;
  dist: number;
  linha: [number, number][] | null;
}

export interface Rota {
  areas: RotaArea[];
  dur: number;
  dist: number;
  mlDur: number;
  mlDist: number;
  ordemDoApp?: boolean;
  melhorDur?: number;
  melhorDist?: number;
  porRuas: boolean;
  quando: number;
  fim?: Perna;
}

export interface Regiao {
  nome: string;
  lat: number;
  lng: number;
  raio: number;
}

export interface Estado {
  cidade: string;
  regiao?: Regiao | null;
  googleKey: string;
  tamTrecho: number;
  inicio: Local | null;
  fim?: Local | null;
  voltar: boolean;
  ordemDoApp?: boolean;
  areas: Area[];
  areaAtual: string;
  areasManual: boolean;
  paradas: Parada[];
  rota: Rota | null;
  pernas: Record<string, Perna>;
}

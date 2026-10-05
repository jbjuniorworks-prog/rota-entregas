import type {FotoDaMemoria} from './memoria';

export type Precisao = 'exato' | 'planilha' | 'lembrado' | 'manual' | 'bom' | 'rua' | 'longe' | 'bairro' | 'aproximada' | 'numero' | 'censo' | 'confirmado' | 'ruim' | 'nao' | 'pendente';

export interface Ponto {
  lat: number;
  lng: number;
}

export interface Candidato extends Ponto {
  exibido: string;
  precisao: Precisao;
  rua?: string;
  // O bairro que a resposta conhece. A parada adota ele quando chega sem bairro nenhum: sem CEP
  // e sem bairro, `chaveLugar` devolve null e a marcação do motorista não tem onde ser guardada.
  bairro?: string;
  nomes?: string[];
  fonte: string;
  // o censo marca a porta do prédio lá dentro do terreno; a entrega é na portaria
  predio?: boolean;
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
  fonte?: string;
  candidatos: Candidato[];
  entregue: boolean;
  entregueEm?: number | null;
  adiada?: boolean;
  sugestao?: {lat: number; lng: number; distancia: number | null};
  // "cliente xarope": já reclamou de pacote jogado ou deixado com vizinho (018)
  reclamacoes?: Reclamacao[];
  // como ela estava antes do "Entreguei aqui" levar o pino para a porta
  portaAntes?: PortaAntes;
  // A cidade da linha da planilha. O censo e a busca são da cidade de cada entrega: com a de
  // ontem guardada no app, a Barra dos Coqueiros era procurada no censo de Aracaju (05/10).
  cidade?: string;
  // a planilha deu o mesmo ponto para entregas de vários bairros: não é a porta de ninguém
  pontoGenerico?: boolean;
}

// Na própria parada, que é gravada: o Desfazer da lista pode vir horas depois do "aqui", com o
// app reaberto, e tem de voltar a porta junto com a entrega (05/10).
export interface PortaAntes {
  lat: number | null;
  lng: number | null;
  exibido: string;
  precisao: Precisao;
  precisaoAntes?: Precisao;
  fonte?: string;
  sugestao?: Parada['sugestao'];
  // onde o "aqui" pôs o pino: se ele foi mexido de novo depois, o desfazer não passa por cima
  porta: Ponto;
  memoria: FotoDaMemoria | null;
}

export type MotivoReclamacao = 'jogado' | 'vizinho';

export interface Reclamacao {
  motivo: MotivoReclamacao;
  quando: string;
  // só a sua dá para tirar: o banco não deixa um motorista apagar a marcação do outro
  minha: boolean;
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
  motivoSemRuas?: string;
  quando: number;
  fim?: Perna;
  // posições mudaram depois que ela foi montada: a ordem continua valendo, as estimativas não
  desatualizada?: boolean;
  mudouMuito?: boolean;
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

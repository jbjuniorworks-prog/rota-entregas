export type Linha = [number, number][];
export function amostrar(linha: Linha): Linha;
export function indexar(osm: {nome_chave: string | null; linha: Linha}[]): Map<string, unknown[]>;
export function classificar(trecho: {nome_chave: string | null; fonte: string; linha: Linha}, grade: Map<string, unknown[]>): 'com_nome' | 'sem_nome' | 'fora';

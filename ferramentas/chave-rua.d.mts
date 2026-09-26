export declare const normal: (s: unknown) => string;
export declare const chaveRua: (nome: string) => string;
export declare const tipoDaRua: (nome: string) => string;
export function ruaCompleta(rua: string): string;
export function chavesDoLugar(p: {rua: string; numero: string; cep?: string | null; bairro?: string; cidade: string}): string[];
export function grafiasDaRua(rua: string): string[];

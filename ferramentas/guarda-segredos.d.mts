export declare const olharNome: (caminho: string) => string | null;
export declare const olharConteudo: (texto: string) => string | null;
export declare const revisar: (arquivos: string[], lerTexto: (c: string) => string | null) => {caminho: string; motivo: string}[];

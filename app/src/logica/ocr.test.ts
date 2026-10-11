import {describe, expect, it} from 'vitest';
import {linhaSemSelo, textoSemSelo, type LinhaOcr} from './ocr';

// Uma linha como o leitor devolve: cada palavra com as letras, a largura de cada uma e o vão antes
// dela. Os números são os medidos nos quadros do vídeo do Meli de 11/10, numa linha de 20 px.
type Letra = [string, number, number]; // texto, largura, vão antes
function linha(...palavras: Letra[][]): LinhaOcr {
  let x = 0;
  const words = palavras.map(letras => {
    const symbols = letras.map(([text, w, vao]) => { x += vao; const s = {text, bbox: {x0: x, y0: 0, x1: x + w, y1: 20}}; x += w; return s; });
    return {text: letras.map(l => l[0]).join(''), bbox: {x0: symbols[0].bbox.x0, y0: 0, x1: symbols[symbols.length - 1].bbox.x1, y1: 20}, symbols};
  });
  return {text: words.map(w => w.text).join(' ') + '\n', bbox: {x0: 0, y0: 0, x1: x, y1: 20}, words};
}
const palavra = (texto: string, vao = 9): Letra[] => [...texto].map((c, i) => [c, 11, i ? 2 : vao]);

describe('o selo de "verificado" grudado no número', () => {
  it('o selo lido como "8" largo, depois de um vão grande, sai do número', () => {
    expect(linhaSemSelo(linha([['5', 12, 0], ['0', 13, 3], ['1', 6, 2], ['8', 19, 9]]))).toBe('501');
    expect(linhaSemSelo(linha([['2', 12, 0], ['1', 5, 4], ['8', 19, 10]]))).toBe('21');
    expect(linhaSemSelo(linha([['1', 6, 0], ['8', 13, 3], ['7', 12, 1], ['8', 19, 8]]))).toBe('187');
  });
  it('o selo lido em duas letras ("68") também sai', () => {
    expect(linhaSemSelo(linha([['3', 12, 0], ['4', 12, 3], ['1', 6, 2], ['6', 9, 9], ['8', 9, 1]]))).toBe('341');
  });
  it('o selo solto depois do número, na mesma linha da rua ou sozinho, sai', () => {
    expect(linhaSemSelo(linha([['4', 13, 0], ['6', 13, 2], ['5', 12, 3]], [['&', 19, 9]]))).toBe('465');
    expect(linhaSemSelo(linha(palavra('Rua', 0), palavra('Celuta'), palavra('Porto'), palavra('105'), [['&', 19, 9]]))).toBe('Rua Celuta Porto 105');
  });
  it('número sem selo, letra de casa e rua de uma letra ficam como vieram', () => {
    expect(linhaSemSelo(linha([['1', 6, 0], ['8', 11, 4], ['4', 12, 3]]))).toBeNull();
    expect(linhaSemSelo(linha([['1', 6, 0], ['8', 13, 3], ['7', 12, 1], ['8', 13, 3]]))).toBeNull();
    expect(linhaSemSelo(linha(palavra('Rua', 0), [['M', 15, 9]]))).toBeNull();
    expect(linhaSemSelo(linha(palavra('45', 0), [['A', 12, 9]]))).toBeNull();
    expect(linhaSemSelo(linha(palavra('12', 0), [['S', 11, 9]]))).toBeNull();
  });
  it('algarismos de verdade depois de um vão não são selo: "II 105" lido "11105" não perde o 105', () => {
    expect(linhaSemSelo(linha([['1', 6, 0], ['1', 6, 2], ['1', 6, 10], ['0', 12, 2], ['5', 12, 2]]))).toBeNull();
  });
  it('no texto inteiro, só a linha com o selo muda', () => {
    const rua = linha(palavra('Rua', 0), palavra('Inventada')), numero = linha([['5', 12, 0], ['0', 13, 3], ['1', 6, 2], ['8', 19, 9]]);
    const cep = linha(palavra('CEP', 0), palavra('49000100'));
    const r = {text: 'Rua Inventada\n5018\nCEP 49000100\n', blocks: [{paragraphs: [{lines: [rua, numero, cep]}]}]};
    expect(textoSemSelo(r)).toBe('Rua Inventada\n501\nCEP 49000100\n');
    expect(textoSemSelo({text: 'sem posições\n'})).toBe('sem posições\n');
  });
});

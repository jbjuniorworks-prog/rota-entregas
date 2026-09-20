import {chaveRua as chaveDaFerramenta} from '../../../ferramentas/chave-rua.mjs';
import {chaveRua} from '../logica/texto';
import {escolherTrecho, pontoDoTrecho} from './base';

const trecho = (nome: string, cidade: string, lat: number, lng: number, linha: [number, number][] = [[lat, lng]]) => ({nome, cidade, lat, lng, linha});

describe('nossa base de ruas', () => {
  it('a ferramenta que copia o mapa guarda o nome do mesmo jeito que o app procura', () => {
    for (const nome of ['Rua Orlando Magalhães Maia', 'Av. Pres. Tancredo Neves', 'Travessa São João', 'R Dr. Silva', 'Rua B', 'Alameda das Flores']) {
      expect(chaveDaFerramenta(nome)).toBe(chaveRua(nome));
    }
  });
  it('entre trechos da mesma rua, escolhe o mais perto de onde são as entregas do dia', () => {
    const longe = trecho('Avenida Longa', 'Aracaju', -10.99, -37.10);
    const perto = trecho('Avenida Longa', 'Aracaju', -10.94, -37.06);
    expect(escolherTrecho([longe, perto], 'Aracaju, SE', {lat: -10.941, lng: -37.061})).toBe(perto);
  });
  it('prefere a cidade padrão quando a mesma rua existe em duas cidades', () => {
    const outra = trecho('Rua Um', 'Nossa Senhora do Socorro', -10.85, -37.06);
    const aqui = trecho('Rua Um', 'Aracaju', -10.94, -37.06);
    expect(escolherTrecho([outra, aqui], 'Aracaju, SE', null)).toBe(aqui);
  });
  it('dentro do trecho, usa o ponto mais perto das outras entregas', () => {
    const t = trecho('Avenida Longa', 'Aracaju', -10.96, -37.08, [[-10.99, -37.10], [-10.96, -37.08], [-10.94, -37.06]]);
    expect(pontoDoTrecho(t, {lat: -10.9401, lng: -37.0601})).toEqual({lat: -10.94, lng: -37.06});
    expect(pontoDoTrecho(t, null)).toEqual({lat: -10.96, lng: -37.08});
  });
});

import {empilhar} from './pinos';
import type {Parada, Ponto} from './tipos';

const GRAU = 111320;
const tela = (mPorPixel: number) => (p: Ponto) => ({x: p.lng * GRAU * 0.98 / mPorPixel, y: -p.lat * GRAU / mPorPixel});
const metros = (m: number) => m / GRAU;

function parada(id: string, texto: string, norte: number, extra: Partial<Parada> = {}): Parada {
  return {id, area: 'a', ml: null, texto, bairro: 'Jardins', unidades: null, comercial: false,
    lat: -10.94 + metros(norte), lng: -37.06, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra};
}

const ids = (ps: ReturnType<typeof empilhar>) => ps.map(g => g.ps.map(p => p.id));

describe('empilhar pinos', () => {
  it('o prédio continua um pino só mesmo com a planilha jogando as entregas a 17 m, e o vizinho de número fica de fora', () => {
    const ps = [
      parada('predio1', 'Avenida das Flores, 1210, Apto 1601', 0),
      parada('predio2', 'Avenida das Flores, 1210, Condomínio Portal', 17),
      parada('vizinho', 'Avenida das Flores, 1241, Escritório de Imóveis', 22),
    ];
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['predio1', 'predio2'], ['vizinho']]);
  });

  it('o mesmo condomínio em ruas diferentes vira um pino, em qualquer zoom', () => {
    const ps = [
      parada('condoA', 'Avenida das Flores, 1500, Ed Villa Sorrento', 0),
      parada('condoB', 'Rua do Poeta, 1500, Apt 704 edificio Villa Sorento', 37),
    ];
    expect(ids(empilhar(ps, tela(0.1)))).toEqual([['condoA', 'condoB']]);
  });

  it('longe um do outro, junta quando o zoom afasta e separa quando aproxima', () => {
    const ps = [
      parada('a', 'Rua A, 10, Casa', 0),
      parada('b', 'Rua B, 20, Casa', 200),
    ];
    expect(ids(empilhar(ps, tela(10)))).toEqual([['a', 'b']]);
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['a'], ['b']]);
  });

  it('entregue não empilha com pendente', () => {
    const ps = [
      parada('feita', 'Avenida das Flores, 1210, Apto 101', 0, {entregue: true}),
      parada('falta', 'Avenida das Flores, 1210, Apto 102', 0),
    ];
    expect(ids(empilhar(ps, tela(0.5)))).toEqual([['feita'], ['falta']]);
  });
});

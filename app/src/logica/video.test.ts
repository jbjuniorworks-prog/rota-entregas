import {deslocamento, escolherQuadros} from './video';

let semente = 7;
const aleatorio = () => (semente = (semente * 16807) % 2147483647) / 2147483647;
const lista = Array.from({length: 3000}, () => Math.round(aleatorio() * 255));
const tela = (topo: number, altura = 200) => lista.slice(topo, topo + altura);

describe('rolagem do vídeo da lista', () => {
  it('mede quanto a lista subiu ou desceu entre dois quadros', () => {
    expect(deslocamento(tela(100), tela(160))).toBe(60);
    expect(deslocamento(tela(500), tela(430))).toBe(-70);
    expect(deslocamento(tela(800), tela(800))).toBe(0);
  });
  it('escolhe um quadro a cada meia tela rolada, e ignora os quadros parados', () => {
    const topos = [0, 0, 0, 20, 40, 60, 80, 100, 100, 100, 120, 140, 160, 180, 200, 220, 240];
    const {indices, rapido} = escolherQuadros(topos.map(t => tela(t)));
    expect(indices.map(i => topos[i])).toEqual([0, 100, 200, 240]);
    expect(rapido).toBe(false);
  });
  it('avisa quando rolou rápido demais entre dois quadros', () => {
    expect(escolherQuadros([tela(0), tela(150), tela(300)]).rapido).toBe(true);
  });
});

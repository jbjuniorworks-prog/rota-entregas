import {portaDesfazivel} from './desfazerPorta';
import type {Parada, PortaAntes} from './tipos';

const AS_1240 = new Date(2026, 10, 25, 12, 40).getTime();
const AS_1700 = new Date(2026, 10, 25, 17, 0).getTime();
const ONTEM = new Date(2026, 10, 24, 15, 0).getTime();
const PLANILHA = {lat: -10.94, lng: -37.06};
const PORTA = {lat: -10.9405, lng: -37.0602};
const OUTRO = {lat: -10.9411, lng: -37.0611};

function parada(onde: {lat: number; lng: number}, extra: Partial<Parada> = {}): Parada {
  return {id: 'p1', area: 'a', ml: null, texto: 'Rua Teste, 10', bairro: 'Jardins', unidades: null, comercial: false,
    ...onde, exibido: '', precisao: 'manual', candidatos: [], entregue: false, ...extra};
}
const antes = (porta: {lat: number; lng: number}, quando?: number): PortaAntes => ({
  ...PLANILHA, exibido: 'Posição da planilha', precisao: 'planilha', porta, memoria: null, ...(quando != null ? {quando} : {}),
});

describe('a porta que este celular marcou, para o Desfazer do cartão', () => {
  it('a mudança de hoje, com o pino ainda na porta marcada, se desfaz o resto do dia', () => {
    const p = parada(PORTA, {mudanca: {...antes(PORTA, AS_1240), grupo: 'g1'}});
    expect(portaDesfazivel(p, AS_1700)).toEqual({de: 'mudanca', quando: AS_1240});
  });

  it('com o pino mexido de novo depois, a marcação de antes não vale mais', () => {
    const p = parada(OUTRO, {mudanca: {...antes(PORTA, AS_1240), grupo: 'g1'}});
    expect(portaDesfazivel(p, AS_1700)).toBeNull();
  });

  it('a de outro dia não se desfaz pelo cartão', () => {
    const p = parada(PORTA, {mudanca: {...antes(PORTA, ONTEM), grupo: 'g1'}});
    expect(portaDesfazivel(p, AS_1240)).toBeNull();
  });

  it('a marcação de antes desta versão, sem a hora, não se desfaz pelo cartão', () => {
    const p = parada(PORTA, {entregue: true, portaAntes: antes(PORTA)});
    expect(portaDesfazivel(p, AS_1240)).toBeNull();
  });

  it('a porta do "Entreguei aqui" de hoje também se desfaz, e a entrega não entra na conta', () => {
    const p = parada(PORTA, {entregue: true, portaAntes: antes(PORTA, AS_1240)});
    expect(portaDesfazivel(p, AS_1700)).toEqual({de: 'entrega', quando: AS_1240});
  });

  it('entregue com "Entreguei aqui" e mudada depois: o que se desfaz é a mudança, que é a do pino', () => {
    const p = parada(OUTRO, {entregue: true, portaAntes: antes(PORTA, AS_1240), mudanca: {...antes(OUTRO, AS_1700), grupo: 'g2'}});
    expect(portaDesfazivel(p, AS_1700)).toEqual({de: 'mudanca', quando: AS_1700});
  });
});

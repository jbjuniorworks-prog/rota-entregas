import {oQueFazerComAVersao} from './versao';

describe('versão publicada mais nova que a que está rodando', () => {
  it('sem entrega pendente, recarrega; com rota andando, só avisa', () => {
    expect(oQueFazerComAVersao('a', 'b', 0, null)).toBe('recarregar');
    expect(oQueFazerComAVersao('a', 'b', 12, null)).toBe('avisar');
  });

  it('a mesma versão, ou sem resposta, não faz nada', () => {
    expect(oQueFazerComAVersao('a', 'a', 0, null)).toBe('nada');
    expect(oQueFazerComAVersao('a', null, 0, null)).toBe('nada');
    expect(oQueFazerComAVersao('a', undefined, 12, null)).toBe('nada');
  });

  // logo depois de publicar, o servidor ainda pode mandar a página antiga: recarregar de novo seria laço
  it('a versão que já foi tentada nesta sessão vira aviso', () => {
    expect(oQueFazerComAVersao('a', 'b', 0, 'b')).toBe('avisar');
    expect(oQueFazerComAVersao('a', 'c', 0, 'b')).toBe('recarregar');
  });
});

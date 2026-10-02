import {oQueFazerComAVersao} from './versao';

describe('versão publicada mais nova que a que está rodando', () => {
  it('parado e sem entrega pendente, recarrega; com rota andando, só avisa', () => {
    expect(oQueFazerComAVersao('a', 'b', 0, null, true)).toBe('recarregar');
    expect(oQueFazerComAVersao('a', 'b', 12, null, true)).toBe('avisar');
  });

  // de volta do seletor de arquivos, com a planilha escolhida: recarregar perderia a escolha
  it('voltando de fora há pouco, só avisa, mesmo sem entrega pendente', () => {
    expect(oQueFazerComAVersao('a', 'b', 0, null, false)).toBe('avisar');
  });

  it('a mesma versão, ou sem resposta, não faz nada', () => {
    expect(oQueFazerComAVersao('a', 'a', 0, null, true)).toBe('nada');
    expect(oQueFazerComAVersao('a', null, 0, null, true)).toBe('nada');
    expect(oQueFazerComAVersao('a', undefined, 12, null, false)).toBe('nada');
  });

  // logo depois de publicar, o servidor ainda pode mandar a página antiga: recarregar de novo seria laço
  it('a versão que já foi tentada nesta sessão vira aviso', () => {
    expect(oQueFazerComAVersao('a', 'b', 0, 'b', true)).toBe('avisar');
    expect(oQueFazerComAVersao('a', 'c', 0, 'b', true)).toBe('recarregar');
  });
});

import {aplicarReclamacoes, avisoXarope, chaveCliente, type ReclamacaoDaNuvem} from './reclamacoes';
import type {Parada} from './tipos';

let n = 0;
const parada = (chave: string, extra: Partial<Parada> = {}): Parada & {chave: string} => ({
  id: 'p' + ++n, chave, area: 'a', ml: null, texto: chave, unidades: null, comercial: false,
  lat: -10.9, lng: -37.05, exibido: '', precisao: 'planilha', candidatos: [], entregue: false, ...extra,
});
const daNuvem = (chave: string, motivo: 'jogado' | 'vizinho', minha = false): ReclamacaoDaNuvem =>
  ({chave_lugar: chave, motivo, quando: '2026-09-20T12:00:00Z', minha});
const aplicar = (ps: (Parada & {chave: string})[], rs: ReclamacaoDaNuvem[]) => aplicarReclamacoes(ps, rs, p => (p as any).chave);

describe('cliente xarope', () => {
  it('chega em todas as entregas do mesmo endereço, e só nelas', () => {
    const a = parada('a|1'), b = parada('a|1'), c = parada('b|2');
    expect(aplicar([a, b, c], [daNuvem('a|1', 'vizinho')])).toBe(2);
    expect(a.reclamacoes).toEqual([{motivo: 'vizinho', quando: '2026-09-20T12:00:00Z', minha: false}]);
    expect(b.reclamacoes).toHaveLength(1);
    expect(c.reclamacoes).toBeUndefined();
  });

  // Marcou sem sinal: está na fila, a nuvem ainda não sabe. A consulta não pode tirar da tela.
  it('não apaga o que este aparelho marcou e ainda não subiu', () => {
    const a = parada('a|1', {reclamacoes: [{motivo: 'jogado', quando: '2026-09-28T15:00:00Z', minha: true}]});
    aplicar([a], [daNuvem('a|1', 'vizinho')]);
    expect(a.reclamacoes!.map(r => r.motivo).sort()).toEqual(['jogado', 'vizinho']);
    expect(a.reclamacoes!.find(r => r.motivo === 'jogado')!.minha).toBe(true);
  });

  it('motivo que o app não conhece não entra', () => {
    const a = parada('a|1');
    expect(aplicar([a], [{...daNuvem('a|1', 'jogado'), motivo: 'outro' as any}])).toBe(0);
    expect(a.reclamacoes).toBeUndefined();
  });

  // Pedido de 28/09: fica "no endereço", para qualquer pessoa que pedir dali — mas num condomínio
  // é de um apartamento, não do prédio inteiro.
  describe('de quem é a reclamação', () => {
    const k = (t: string) => chaveCliente(t, undefined, 'Aracaju');
    it('a mesma casa, escrita com ou sem "Casa", é o mesmo cliente', () => {
      // os #54 e #55 de 28/09: "Casa" sozinho não é unidade — antes virava "casa aero"
      expect(k('Rua Manoel Bispo dos Santos, 132, Casa, Aeroporto, CEP 49037-146'))
        .toBe(k('Rua Manoel Bispo dos Santos, 132, Aeroporto, CEP 49037-146'));
    });
    it('no condomínio, cada apartamento é um', () => {
      const a101 = k('Rua dos Ipês, 300, Bloco A ap 101, CEP 49000-103');
      expect(a101).not.toBe(k('Rua dos Ipês, 300, Bloco B ap 202, CEP 49000-103'));
      expect(a101).not.toBe(k('Rua dos Ipês, 300, Bloco A ap 102, CEP 49000-103'));
      expect(a101, 'o prédio sem apartamento não herda a reclamação de um').not.toBe(k('Rua dos Ipês, 300, CEP 49000-103'));
      expect(a101, 'o mesmo apartamento escrito de outro jeito').toBe(k('Rua dos Ipês, 300, Bl A Apto 101, CEP 49000-103'));
    });
    it('na vila, cada casa numerada é uma', () => {
      expect(k('Travessa Um, 45, Casa 2, CEP 49000-104')).not.toBe(k('Travessa Um, 45, Casa 3, CEP 49000-104'));
      expect(k('Travessa Um, 45, Casa 03, CEP 49000-104')).toBe(k('Travessa Um, 45, casa 3, CEP 49000-104'));
    });
    it('sem número não tem de quem ser', () => {
      expect(k('Rua Sem Número Nenhum, Aeroporto')).toBeNull();
    });
  });

  it('o aviso diz o que fazer, na língua deles', () => {
    expect(avisoXarope(undefined)).toBeNull();
    expect(avisoXarope([{motivo: 'vizinho', quando: '', minha: false}]))
      .toBe('Cliente xarope: alguém que comprou neste endereço já reclamou de deixar com vizinho — não deixe com vizinho.');
    expect(avisoXarope([{motivo: 'jogado', quando: '', minha: false}, {motivo: 'vizinho', quando: '', minha: true}]))
      .toBe('Cliente xarope: alguém que comprou neste endereço já reclamou de pacote jogado e de deixar com vizinho — entregue em mãos, não deixe com vizinho.');
  });
});

import {readdirSync, readFileSync} from 'node:fs';

// Os dois arquivos de rodar tudo copiam as migrações, na ordem em que rodaram na produção:
// `000_rodar_tudo.sql` é o que o dono cola no SQL Editor, e `banco-inteiro.sql` monta um projeto
// novo. Cada um já saiu de passo sem ninguém ver: o banco-inteiro ficou parado na 009 de 20/09 a
// 28/09, e a 011 entrou no 000 sem a linha de marca, colada na 010 (achado em 12/11).
const PASTA = new URL('../../../supabase/', import.meta.url);
const ler = (nome: string) => readFileSync(new URL(nome, PASTA), 'utf8');
const MARCA = /^-- ===== (0\d\d_[a-z0-9_]+\.sql) =====$/;
const MIGRACAO = /^0\d\d_[a-z0-9_]+\.sql$/;
const RODAR_TUDO = '000_rodar_tudo.sql';
const BANCO_INTEIRO = 'banco-inteiro.sql';
const migracoes = readdirSync(PASTA).filter(f => MIGRACAO.test(f) && f !== RODAR_TUDO).sort();
const numero = (nome: string) => Number(nome.slice(0, 3));

// O 000 nasceu em 20/09 com o que faltava rodar; a 001 e a 002 tinham rodado em 19/09.
const FORA_DO_000 = ['001_inicial.sql', '002_desfazer_correcao.sql'];
// Pares fora da ordem dos números, cada um com o motivo. A 031 rodou na produção antes da 030
// (ABERTO.md, 09/11), e os arquivos guardam a ordem em que rodou.
const FORA_DA_ORDEM = [['031_comerciais.sql', '030_evidencia_do_servidor.sql']];
// Da 001 à 005, os combinados trazem a versão reescrita para rodar de novo (`if not exists`,
// `drop policy if exists`); o arquivo é a de como rodou na primeira vez.
const REESCRITAS_ATE = 5;

// Fim de linha e espaço no fim da linha não mudam o SQL; o resto conta.
const normal = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map(l => l.trimEnd()).join('\n').trim();

function secoes(arquivo: string): {nome: string; texto: string}[] {
  const saida: {nome: string; linhas: string[]}[] = [];
  for (const linha of ler(arquivo).replace(/\r\n/g, '\n').split('\n')) {
    const m = linha.match(MARCA);
    if (m) saida.push({nome: m[1], linhas: []});
    else saida.at(-1)?.linhas.push(linha);
  }
  return saida.map(s => ({nome: s.nome, texto: normal(s.linhas.join('\n'))}));
}
const nomes = (arquivo: string) => secoes(arquivo).map(s => s.nome);
const secao = (arquivo: string, nome: string) => secoes(arquivo).find(s => s.nome === nome)?.texto;

describe('migrações nos arquivos de rodar tudo', () => {
  it('toda migração aparece uma vez no banco-inteiro', () => {
    expect(migracoes.length).toBeGreaterThan(30);
    expect([...nomes(BANCO_INTEIRO)].sort()).toEqual(migracoes);
  });

  it('da 003 em diante, toda migração aparece uma vez no 000', () => {
    expect([...nomes(RODAR_TUDO)].sort()).toEqual(migracoes.filter(m => !FORA_DO_000.includes(m)));
  });

  it('a ordem é a mesma nos dois arquivos', () => {
    expect(nomes(RODAR_TUDO)).toEqual(nomes(BANCO_INTEIRO).filter(m => !FORA_DO_000.includes(m)));
  });

  it('a ordem é a dos números, fora os pares explicados', () => {
    const ordem = nomes(BANCO_INTEIRO);
    const trocados = ordem.slice(1).map((m, i) => [ordem[i], m])
      .filter(([a, b]) => numero(a) > numero(b));
    expect(trocados).toEqual(FORA_DA_ORDEM);
  });

  it.each([RODAR_TUDO, BANCO_INTEIRO])('da 006 em diante, cada seção do %s é o arquivo da migração', arquivo => {
    const diferentes = nomes(arquivo).filter(m => numero(m) > REESCRITAS_ATE && secao(arquivo, m) !== normal(ler(m)));
    expect(diferentes).toEqual([]);
  });

  it('as reescritas para rodar de novo são iguais nos dois arquivos', () => {
    const nos2 = nomes(RODAR_TUDO).filter(m => numero(m) <= REESCRITAS_ATE);
    expect(nos2.length).toBeGreaterThan(0);
    expect(nos2.filter(m => secao(RODAR_TUDO, m) !== secao(BANCO_INTEIRO, m))).toEqual([]);
  });
});

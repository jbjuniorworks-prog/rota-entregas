import {mesmoBanco} from '../../../ferramentas/banco.mjs';
import {olharConteudo, olharNome, revisar} from '../../../ferramentas/guarda-segredos.mjs';

describe('trava da restauração', () => {
  it('recusa restaurar/limpar quando o destino é o banco de verdade', () => {
    const casa = {url: 'https://hkclz.supabase.co', chave: 'servico-da-casa'};
    expect(mesmoBanco(casa, casa)).toBe(true);
    expect(mesmoBanco(casa, {url: 'https://teste.supabase.co', chave: casa.chave})).toBe(true);
    expect(mesmoBanco(casa, {url: 'https://teste.supabase.co', chave: 'servico-do-teste'})).toBe(false);
  });
});

describe('trava contra subir dado real para o repositório público', () => {
  // Este arquivo é pulado pela própria trava; noutro lugar, marque a linha com guarda:exemplo.
  it('barra print e PDF fora de app/public, que e por onde a rota chega', () => {
    expect(olharNome('rota-de-hoje.png')).toMatch(/imagem/);
    expect(olharNome('docs/print da lista.jpeg')).toMatch(/imagem/);
    expect(olharNome('comanda.pdf')).toMatch(/imagem/);
    expect(olharNome('app/public/icone-192.png')).toBeNull();
    expect(olharNome('app/public/favicon.ico')).toBeNull();
  });
  it('barra planilha de rota fora da pasta de teste', () => {
    expect(olharNome('20-09-2026 Luan Mateus Santos Silva.xlsx')).toMatch(/planilha/);
    expect(olharNome('app/dados/rota.csv')).toMatch(/planilha/);
    expect(olharNome('testes/planilhas/rota-b.xlsx')).toBeNull();
  });
  it('barra .txt solto, .env e arquivo vindo do Downloads', () => {
    expect(olharNome('rota-de-hoje.txt')).toMatch(/\.txt/);
    expect(olharNome('.env')).toMatch(/env/);
    expect(olharNome('C:/Users/Jree/Downloads/lista.json')).toMatch(/pasta pessoal/);
    expect(olharNome('README.md')).toBeNull();
  });
  it('barra chave de serviço, token e e-mail de pessoa real', () => {
    expect(olharConteudo('{"role":"service_role","iss":"supabase"}')).toMatch(/service_role/);
    expect(olharConteudo('SUPABASE_SERVICE_ROLE_KEY=abc123')).toMatch(/chave/);
    expect(olharConteudo('const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"')).toMatch(/chave|token/);
    expect(olharConteudo('mandar para luanmateus_cs@hotmail.com')).toMatch(/pessoa real/);
  });
  it('barra código de pacote e telefone de verdade', () => {
    expect(olharConteudo('spx_tn: BR268632715522L')).toMatch(/pacote/);
    expect(olharConteudo('contato +55 79 96060000')).toBeNull();
    expect(olharConteudo('contato +55 79 96067704')).toBeNull();
  });
  it('deixa passar o que o projeto usa de verdade', () => {
    expect(olharConteudo('const SUPA_CHAVE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrY2x6bWxjZmlrc2FxcXNwcXN5Iiwicm9sZSI6ImFub24i…"')).toBeNull();
    expect(olharConteudo('juniorpiks+motorista-teste@hotmail.com')).toBeNull();
    expect(olharConteudo('spx_tn: BRTESTA0003')).toBeNull();
  });
  it('a revisão aponta o arquivo e o motivo', () => {
    const achados = revisar(['README.md', 'segredo.env', 'app/src/x.ts'], c => c === 'app/src/x.ts' ? 'const k = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.zzzzzzzzzzz"' : '');
    expect(achados.map(a => a.caminho)).toEqual(['segredo.env', 'app/src/x.ts']);
  });
});

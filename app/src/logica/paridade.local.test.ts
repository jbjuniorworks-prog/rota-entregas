import {existsSync, readFileSync} from 'node:fs';
import {analisarLinha, chaveEndereco, chaveLugar, decompor, extrairEnderecos, mesmaRua, pareceEndereco} from './texto';

const ARQ = process.env.PARIDADE;
describe.runIf(ARQ && existsSync(ARQ))('paridade com o app atual (dados reais, só local)', () => {
  const {textos, extras, legado} = JSON.parse(readFileSync(ARQ!, 'utf8'));
  const todos: string[] = [...textos, ...extras];
  it('decompor', () => expect(todos.map(decompor)).toEqual(legado.decompor));
  it('analisarLinha', () => expect(todos.map(analisarLinha)).toEqual(legado.analisar));
  it('chaveEndereco', () => expect(todos.map(chaveEndereco)).toEqual(legado.chave));
  it('chaveLugar', () => expect(todos.flatMap(t => ['', 'Centro'].map(b => chaveLugar(t, b, 'Aracaju')))).toEqual(legado.lugar));
  it('pareceEndereco', () => expect(todos.map(pareceEndereco)).toEqual(legado.parece));
  it('extrairEnderecos', () => expect([textos.join('\n'), textos.slice(0, 30).map((t: string) => '12\n' + t + '\nCEP 49000-100').join('\n')].map(extrairEnderecos)).toEqual(legado.extrair));
  it('mesmaRua', () => expect(todos.slice(0, 60).map((t, i) => mesmaRua(t, todos[(i + 7) % todos.length]))).toEqual(legado.mesma));
});

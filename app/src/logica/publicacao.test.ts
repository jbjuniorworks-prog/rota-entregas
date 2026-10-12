import {readFileSync} from 'node:fs';

// A publicação troca o app no celular de quem está na rua. Ação do GitHub presa por etiqueta
// ("@v4") roda o que estiver na etiqueta no dia; presa pelo commit, roda só o que foi escolhido.
describe('publicação', () => {
  it('toda ação que a publicação usa está presa a um commit', () => {
    const yml = readFileSync(new URL('../../../.github/workflows/publicar.yml', import.meta.url), 'utf8');
    const usos = [...yml.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map(m => m[1]);
    expect(usos.length).toBeGreaterThan(0);
    expect(usos.filter(u => !/@[0-9a-f]{40}$/.test(u))).toEqual([]);
  });
});

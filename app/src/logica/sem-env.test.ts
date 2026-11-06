import {citaEnv} from '../../../ferramentas/sem-env.mjs';

describe('hook que recusa comando com o .env', () => {
  it('recusa o comando que nomeia o arquivo', () => {
    expect(citaEnv('cat .env')).toBe(true);
    expect(citaEnv('type "C:\\projeto\\.env"')).toBe(true);
    expect(citaEnv('Get-Content ./.env | Select-Object -First 3')).toBe(true);
    expect(citaEnv('grep KEY .env.local')).toBe(true);
    expect(citaEnv('node -e "x" < .env')).toBe(true);
  });
  it('deixa passar o que só se parece', () => {
    expect(citaEnv('node -e "console.log(process.env.APP_URL)"')).toBe(false);
    expect(citaEnv('cat .envrc')).toBe(false);
    expect(citaEnv('npm run test:nuvem')).toBe(false);
    expect(citaEnv('git status --short')).toBe(false);
    expect(citaEnv('node ferramentas/portas.mjs')).toBe(false);
  });
});

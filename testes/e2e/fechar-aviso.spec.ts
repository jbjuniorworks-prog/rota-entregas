import {abrir, aviso, carregar, expect, test} from './apoio';

// Dono, 26/11, com o print do resumo da leitura em cima do mapa: "essas msgs tem que ter como
// tirar, não ficar um tempo lá". O resumo não tem prazo para sumir.
test.use({viewport: {width: 412, height: 915}});
const ROTA_D = 'testes/planilhas/rota-d.xlsx';

test('o resumo da leitura fecha com um toque no "×", e o mapa fica livre', async ({page}) => {
  await abrir(page);
  await carregar(page, ROTA_D);
  const fechar = aviso(page).getByRole('button', {name: 'Tirar a mensagem'});
  await expect(fechar).toBeVisible();
  // o "×" não entra no texto da mensagem
  await expect(aviso(page)).not.toContainText('×');
  await fechar.click();
  await expect(aviso(page)).toBeHidden();
  await expect(aviso(page)).not.toContainText('parada(s) da planilha');
});

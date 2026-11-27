import type {Page} from '@playwright/test';
import {aba, abrir, aviso, carregar, expect, montar, test, ROTA_A, type NuvemFalsa} from './apoio';

// Dono, 26/11: "vamos colocar opção de comentário no pino, tipo casa da filha, número da casa ao
// lado é 500". Texto curto sobre o lugar, que vai para todos os motoristas (034).
test.use({viewport: {width: 412, height: 915}});

const cartao = (page: Page) => page.locator('[data-folha="proxima"]');
const comentados = (nuvem: NuvemFalsa) => nuvem.pedidos.filter(p => p.caminho === 'rpc/comentar').map(p => p.corpo as {chave: string; texto_: string});

// outro motorista já comentou todos os endereços da rota
function comentarioDeOutro(nuvem: NuvemFalsa) {
  nuvem.rpc.comentarios_dos_lugares = (corpo: {chaves: string[]}) =>
    corpo.chaves.map((k, i) => ({id: 100 + i, chave_lugar: k, texto: 'casa da filha', quando: '2026-11-25T12:00:00Z', minha: false}));
}

async function naRota(page: Page) {
  await abrir(page);
  await carregar(page, ROTA_A);
  await montar(page);
}

// No cartão da próxima o comentário só aparece: os botões de entregar têm de caber sem rolar. Se
// escreve no Conferir e no cartão do pino, que usam o mesmo pedaço de tela.
async function noConferir(page: Page) {
  await abrir(page);
  await carregar(page, ROTA_A);
  await aba(page, '2. Conferir');
  return page.locator('[data-item]').first();
}

test('o comentário de outro motorista aparece no cartão da próxima, sem o nome', async ({page, nuvem}) => {
  comentarioDeOutro(nuvem);
  await naRota(page);
  await expect(cartao(page).locator('[data-comentario]')).toHaveText('Comentário: casa da filha');
  await expect(cartao(page).getByRole('button', {name: 'Comentar o lugar'}), 'escrever não cabe ali').toHaveCount(0);
});

test('escrever o seu: vai para a nuvem pela chave do endereço e fica no endereço', async ({page, nuvem}) => {
  const item = await noConferir(page);
  await item.getByRole('button', {name: 'Comentar o lugar'}).click();
  await item.getByLabel('Comentário do lugar').fill('portão azul, nº ao lado é 500');
  await item.getByRole('button', {name: 'Salvar'}).click();
  await expect(aviso(page)).toContainText('Comentário guardado.');
  await expect(item.locator('[data-meu]')).toContainText('Seu comentário: portão azul, nº ao lado é 500');
  await expect.poll(() => comentados(nuvem), {timeout: 20_000}).toEqual([{chave: expect.any(String), texto_: 'portão azul, nº ao lado é 500'}]);

  await item.locator('[data-meu]').getByRole('button', {name: 'Apagar'}).click();
  await expect(item.locator('[data-meu]')).toHaveCount(0);
  await expect.poll(() => comentados(nuvem).map(c => c.texto_), {timeout: 20_000}).toEqual(['portão azul, nº ao lado é 500', '']);
});

test('telefone não sai do celular: o Salvar fica desligado e diz por quê', async ({page, nuvem}) => {
  const item = await noConferir(page);
  await item.getByRole('button', {name: 'Comentar o lugar'}).click();
  await item.getByLabel('Comentário do lugar').fill('liga pra filha 79 99999-1234');
  await expect(item.getByRole('button', {name: 'Salvar'})).toBeDisabled();
  await expect(item.locator('.editar-comentario .info')).toContainText('Parece telefone');
  expect(comentados(nuvem)).toEqual([]);
});

test.describe('quem administra', () => {
  test.use({papel: 'admin'});
  test('apaga o comentário de outro motorista, para todos', async ({page, nuvem}) => {
    page.on('dialog', d => d.accept());
    comentarioDeOutro(nuvem);
    await naRota(page);
    const dele = cartao(page).locator('[data-comentario]').filter({hasText: 'casa da filha'});
    await dele.getByRole('button', {name: 'Apagar'}).click();
    await expect(aviso(page)).toContainText('Comentário apagado para todos.');
    await expect(dele).toHaveCount(0);
    expect(nuvem.pedidos.filter(p => p.caminho === 'rpc/apagar_comentario').map(p => p.corpo)).toEqual([{id_: expect.any(Number)}]);
  });
});

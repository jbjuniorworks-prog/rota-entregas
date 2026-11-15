import type {Page} from '@playwright/test';
import {abrir, EU, menu, test, expect} from './apoio';

// Luan, pelo dono, 15/11: "aquela lista de verificados aparecendo pra eles também". Cada motorista
// vê as portas verificadas das rotas dele; as dos outros não aparecem.
const diaEmMaceio = (atras: number) => new Date(Date.now() - atras * 864e5).toLocaleDateString('sv-SE', {timeZone: 'America/Maceio'});
const horasAtras = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const HOJE = diaEmMaceio(0), ONTEM = diaEmMaceio(1);

// Endereços inventados. Na rota de ontem, duas portas verificadas; na de hoje, uma verificada e uma
// entregue sem marca. A rota de outro motorista, com uma porta verificada, não pode entrar na conta.
const ROTAS = [
  {id: 'r-ontem', motorista_id: EU.id, dia: ONTEM, arquivo: 'ontem.xlsx'},
  {id: 'r-hoje', motorista_id: EU.id, dia: HOJE, arquivo: 'hoje.xlsx'},
  {id: 'r-outro', motorista_id: 'outro-motorista', dia: HOJE, arquivo: 'do-outro.xlsx'},
];
const pacote = (rota_id: string, chave: string, endereco: string, entregue: boolean) =>
  ({rota_id, chave_lugar: chave, endereco, lat: -10.95, lng: -37.05, entregue_em: entregue ? horasAtras(3) : null});
const PACOTES = [
  pacote('r-ontem', '49000-001|10', 'Rua Inventada A, 10', true),
  pacote('r-ontem', '49000-001|20', 'Rua Inventada A, 20', true),
  pacote('r-hoje', '49000-001|30', 'Rua Inventada B, 30', true),
  pacote('r-hoje', '49000-001|40', 'Rua Inventada B, 40', true),
  pacote('r-hoje', '49000-001|50', 'Rua Inventada B, 50', false),
  pacote('r-outro', '49000-001|60', 'Rua Inventada C, 60', true),
];
const VERIFICADAS = new Set(['49000-001|10', '49000-001|20', '49000-001|30', '49000-001|60']);

async function comAsRotas(page: Page, nuvem: {tabelas: Record<string, unknown[]>; rpc: Record<string, unknown>}) {
  nuvem.tabelas.rotas = ROTAS;
  nuvem.tabelas.pacotes = PACOTES;
  nuvem.rpc.posicoes = (corpo: {chaves: string[]}) => corpo.chaves.filter(k => VERIFICADAS.has(k))
    .map(k => ({chave_lugar: k, lat: -10.95, lng: -37.05, situacao: 'confirmado', motoristas: 1, minha: false}));
  await abrir(page);
  await menu(page, 'Minhas portas verificadas');
  await expect(page.locator('.cabecalho .titulo')).toHaveText('Minhas portas verificadas');
}

for (const papel of ['motorista', 'admin'] as const) {
  test.describe(`as portas verificadas do próprio motorista (${papel})`, () => {
    test.use({viewport: {width: 412, height: 915}, papel});

    test('o total e cada rota são só dele; o porquê abre na rota', async ({page, nuvem}) => {
      await comAsRotas(page, nuvem as never);
      const tela = page.locator('[data-minhas-portas]');
      await expect(tela.locator('[data-total]')).toHaveText('3 de 4 endereço(s) entregue(s) com a porta verificada (75%), em 2 rota(s).');
      await expect(tela.locator('[data-rota]')).toHaveCount(2);
      await expect(tela.locator('[data-rota="r-outro"]')).toHaveCount(0);
      // a mais nova primeiro
      await expect(tela.locator('[data-rota]').first()).toHaveAttribute('data-rota', 'r-hoje');
      await expect(tela.locator('[data-rota="r-hoje"]')).toContainText('1 de 2 verificado(s)');
      await expect(tela.locator('[data-rota="r-ontem"]')).toContainText('2 de 2 verificado(s)');
      // tudo verificado: nada para explicar
      await expect(tela.locator('[data-rota="r-ontem"]').getByRole('button')).toHaveCount(0);

      await tela.locator('[data-rota="r-hoje"]').getByRole('button', {name: 'Por que algum não verificou?'}).click();
      const porque = tela.locator('[data-porque="r-hoje"]');
      await expect(porque).toContainText('A entrega não marcou o lugar (1)');
      await expect(porque).toContainText('Rua Inventada B, 40');
      await expect(porque).not.toContainText('Rua Inventada C');
    });
  });
}

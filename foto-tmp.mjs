import {chromium} from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({viewport: {width: 390, height: 780}});
for (const s of ['router.project-osrm.org', 'tile.openstreetmap.org']) await ctx.route(`**://${s}/**`, r => r.abort());
await ctx.route('**://nominatim.openstreetmap.org/**', r => {
  const q = new URL(r.request().url()).searchParams.get('q') || '';
  const cidade = q.trim() === 'Aracaju, SE';
  r.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify([cidade
    ? {lat: '-10.9472', lon: '-37.0731', display_name: 'Aracaju', category: 'place', addresstype: 'city', address: {city: 'Aracaju'}}
    : {lat: '-10.9401', lon: '-37.0620', display_name: 'Rua B, Aracaju', category: 'highway', addresstype: 'road', address: {road: 'Rua B', suburb: 'Farolândia', city: 'Aracaju'}}])});
});
await ctx.addInitScript(() => { try { localStorage.setItem('rota-entregas-auth', '{}'); } catch {} });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:4173/');
await p.getByLabel('Cidade padrão').fill('Aracaju, SE');
await p.getByLabel(/Endereços da área/).fill('Rua B, 120, Conjunto Augusto Franco');
await p.getByRole('button', {name: /^Adicionar em/}).click();
await p.getByText(/Rua certa/).first().waitFor({timeout: 30000});
await p.screenshot({path: process.argv[2]});
await b.close();

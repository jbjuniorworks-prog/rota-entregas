import {devoAnotar, gastoDaBateria, resumirCaminho, type Gasto, type LeituraDaBateria, type MarcaDoCaminho, type PontoDoCaminho, type ResumoDoCaminho} from '../logica/caminho';
import {CHAVES} from '../logica/guarda';
import {guarda, loja, status} from '../loja';
import * as G from '../servicos/caminhoGuardado';
import {nuvem} from '../servicos/nuvem';

// O teste do caminho (dono, 24/11). Ver logica/caminho.ts. Ligado ou desligado vale para este
// celular e esta conta (a chave vai junto na troca de conta). Começado, a bateria é lida a cada 5
// minutos até alguém apagar o teste, gravando ou não: os dias sem gravar são a comparação.

interface Teste {
  gravando: boolean;
  desde: number;
}

const BATERIA_A_CADA = 5 * 60000;
const GUARDA_DIAS = 14;

const conta = () => nuvem.sessao?.user.id || 'sem-conta';
export const testeDoCaminho = () => guarda.ler<Teste | null>(CHAVES.caminho, null);
export const gravandoCaminho = () => !!testeDoCaminho()?.gravando;

// O teste nunca atrapalha a rota: falhou ao guardar, segue sem.
const anota = (loja: G.LojaDoCaminho, valor: unknown) => G.anotar(conta(), loja, valor).catch(() => {});

let ultimo: PontoDoCaminho | undefined;

// Cada leitura do GPS da Rota passa por aqui.
export function anotarNoCaminho(eu: {lat: number; lng: number; precisao: number; quando: number}) {
  if (!gravandoCaminho()) return;
  const novo: PontoDoCaminho = {t: eu.quando, lat: +eu.lat.toFixed(6), lng: +eu.lng.toFixed(6), prec: Math.round(eu.precisao)};
  if (!devoAnotar(ultimo, novo)) return;
  ultimo = novo;
  anota('pontos', novo);
}

export function marcarNoCaminho(tipo: MarcaDoCaminho['tipo']) {
  if (!testeDoCaminho()) return;
  anota('marcas', {t: Date.now(), tipo} satisfies MarcaDoCaminho);
}

interface Bateria {
  level: number;
  charging: boolean;
}
const temBateria = () => 'getBattery' in navigator;

async function lerBateria() {
  const t = testeDoCaminho();
  if (!t || !temBateria()) return;
  try {
    const b = await (navigator as Navigator & {getBattery(): Promise<Bateria>}).getBattery();
    anota('bateria', {t: Date.now(), nivel: Math.round(b.level * 100), carregando: b.charging, gravando: t.gravando} satisfies LeituraDaBateria);
  } catch {}
}

let relogio: ReturnType<typeof setInterval> | null = null;
function ligarBateria() {
  if (relogio) return;
  relogio = setInterval(lerBateria, BATERIA_A_CADA);
}
function desligarBateria() {
  if (relogio) clearInterval(relogio);
  relogio = null;
}

// Na abertura do app.
export function iniciarCaminho() {
  document.addEventListener('visibilitychange', () => marcarNoCaminho(document.visibilityState === 'visible' ? 'visivel' : 'escondido'));
  if (!testeDoCaminho()) return;
  G.tirarAntigos(conta(), Date.now() - GUARDA_DIAS * 86400e3).catch(() => {});
  ligarBateria();
  lerBateria();
}

export function trocarCaminho() {
  const t = testeDoCaminho();
  const gravando = !t?.gravando;
  if (!guarda.gravar(CHAVES.caminho, {gravando, desde: t?.desde ?? Date.now()} satisfies Teste)) {
    status('O celular não conseguiu guardar a escolha (falta espaço).', 6000);
    return;
  }
  ultimo = undefined;
  // o GPS fica ligado em todas as telas: a posição de agora é o primeiro ponto, sem esperar ele andar
  if (gravando && loja.ui.euAqui) anotarNoCaminho(loja.ui.euAqui);
  // a leitura na troca separa o tempo gravando do tempo sem gravar
  lerBateria();
  ligarBateria();
  status(gravando ? 'Gravando o caminho neste celular. Use a Rota normalmente.' : 'Parou de gravar o caminho. A bateria continua sendo lida, para comparar.', 5000);
  loja.mudou(false);
}

export async function apagarTesteDoCaminho() {
  if (!confirm('Apagar o caminho gravado e as leituras da bateria deste celular?')) return;
  desligarBateria();
  ultimo = undefined;
  guarda.gravar(CHAVES.caminho, null);
  try {
    await G.apagar(conta());
    status('Teste do caminho apagado.', 4000);
  } catch {
    status('Não consegui apagar o teste. Tente de novo.', 6000);
  }
  loja.mudou(false);
}

export interface ResultadoDoTeste {
  hoje: ResumoDoCaminho | null;
  // null: este celular não informa a bateria (o iPhone não informa)
  bateria: {gravando: Gasto; semGravar: Gasto} | null;
}

export async function resultadoDoCaminho(agora = Date.now()): Promise<ResultadoDoTeste> {
  const [pontos, marcas, leituras] = await Promise.all([
    G.lerTudo<PontoDoCaminho>(conta(), 'pontos'),
    G.lerTudo<MarcaDoCaminho>(conta(), 'marcas'),
    G.lerTudo<LeituraDaBateria>(conta(), 'bateria'),
  ]);
  const meiaNoite = new Date(agora);
  meiaNoite.setHours(0, 0, 0, 0);
  return {
    hoje: resumirCaminho(pontos.filter(p => p.t >= meiaNoite.getTime()), marcas),
    bateria: temBateria() ? gastoDaBateria(leituras, marcas) : null,
  };
}

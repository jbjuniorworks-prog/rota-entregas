// O toque de perto do pino: dois bipes e uma vibração. Sem arquivo de som, para não depender de
// rede nem de cache.
//
// O navegador só deixa tocar som, e vibrar, depois de um toque na página, e o Android pode suspender
// o som de uma página parada. Todo toque na tela destrava (ou acorda) o som. Um aviso antes do
// primeiro toque desde que o app abriu não sai: nem som nem vibração.
let contexto: AudioContext | null = null;

function criar(): AudioContext | null {
  if (contexto) return contexto;
  const Classe = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Classe) return null;
  try { contexto = new Classe(); } catch { contexto = null; }
  return contexto;
}

export function destravarSom() {
  const c = criar();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function bipe(c: AudioContext, inicio: number, frequencia: number) {
  const osc = c.createOscillator(), volume = c.createGain();
  osc.type = 'square';
  osc.frequency.value = frequencia;
  // sobe e desce em poucos milissegundos: corte seco estala no alto-falante
  volume.gain.setValueAtTime(0.0001, inicio);
  volume.gain.exponentialRampToValueAtTime(0.35, inicio + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.14);
  osc.connect(volume).connect(c.destination);
  osc.start(inicio);
  osc.stop(inicio + 0.15);
}

export function tocarAviso() {
  try { navigator.vibrate?.([150, 80, 150]); } catch {}
  const c = criar();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume().catch(() => {});
    const agora = c.currentTime;
    bipe(c, agora, 880);
    bipe(c, agora + 0.2, 1320);
  } catch {}
}

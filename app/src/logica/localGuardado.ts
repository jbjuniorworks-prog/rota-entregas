import {hojeEmMaceio} from './painel';

// A localização que chega antes da rota (dono, 12/11: "o link se perdeu" ao carregar a planilha):
// fica guardada até a rota entrar e então vira a pergunta "É de qual entrega?". Só a última, e só no
// dia de Aracaju em que chegou: a de ontem é de outra rota.
export interface LocalGuardado {
  lat: number;
  lng: number;
  endereco: string | null;
  quando: number;
}

export function localDeHoje(guardado: unknown, agora = Date.now()): LocalGuardado | null {
  const g = guardado as Partial<LocalGuardado> | null;
  if (!g || typeof g.lat !== 'number' || typeof g.lng !== 'number' || typeof g.quando !== 'number') return null;
  if (hojeEmMaceio(g.quando) !== hojeEmMaceio(agora)) return null;
  return {lat: g.lat, lng: g.lng, endereco: typeof g.endereco === 'string' ? g.endereco : null, quando: g.quando};
}

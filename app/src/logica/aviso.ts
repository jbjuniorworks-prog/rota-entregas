import {haversine} from './geo';
import {DUVIDA} from './rotulos';
import type {Parada, Ponto} from './tipos';

// Perto de um pino ainda por entregar, o app toca (dono, 15/11): indo para uma entrega, ele passa
// na porta de outra sem ver, olhando a rua ou o celular da Shopee. Medido em 111 rotas do
// histórico: 6,7% das paradas foram entregues depois de ele já ter parado a menos de 40 m delas,
// em outra entrega, e voltado.
export const RAIO_DO_AVISO = 40;
// A mesma parada só toca de novo depois de ele se afastar: parado na porta, o GPS oscila em volta
// do raio, e cada volta para dentro seria outro toque.
export const REARMAR = 100;
// Com uma margem maior que o próprio raio, o ponto não diz se ele está perto.
export const GPS_DO_AVISO = 40;

// As paradas que acabaram de ficar perto. `avisadas` é a memória entre uma leitura do GPS e a
// seguinte: entra a que tocou, sai a que ficou para trás (ou foi entregue).
export function pinosPerto(paradas: Parada[], eu: Ponto & {precisao: number}, avisadas: Set<string>): string[] {
  if (!(eu.precisao <= GPS_DO_AVISO)) return [];
  const novas: string[] = [];
  for (const p of paradas) {
    if (p.lat == null || p.lng == null) continue;
    // Pino em dúvida (o meio do bairro, o ponto da planilha que serve a vários bairros) pode não ser
    // a porta de ninguém: tocar ali diria que há uma entrega onde não há. Ela está em Conferir.
    if (p.entregue || DUVIDA.has(p.precisao)) { avisadas.delete(p.id); continue; }
    const metros = haversine({lat: p.lat, lng: p.lng}, eu);
    if (metros > REARMAR) avisadas.delete(p.id);
    else if (metros <= RAIO_DO_AVISO && !avisadas.has(p.id)) { avisadas.add(p.id); novas.push(p.id); }
  }
  return novas;
}

import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {corrigirPosicao, tocouNoMapa} from '../acoes';
import {DUVIDA} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {loja, useLoja} from '../loja';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

export function rotuloDe(p: Parada): string {
  const e = loja.e;
  if (e.rota) {
    const i = e.rota.areas.flatMap(a => a.ordem).indexOf(p.id);
    if (i >= 0) return String(i + 1);
  }
  if (p.ml) return '#' + p.ml;
  return String(e.paradas.indexOf(p) + 1);
}

function icone(texto: string, cor: string, apagado = false, duvida = false) {
  return L.divIcon({
    className: '', iconSize: [30, 30], iconAnchor: [15, 30],
    html: `<div class="pino ${duvida ? 'duvida' : ''}" style="background:${cor};opacity:${apagado ? .4 : 1}"><span>${esc(texto)}</span></div>`,
  });
}

export function Mapa() {
  const {e, ui} = useLoja();
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const marcadores = useRef<Record<string, L.Marker>>({});
  const enquadrado = useRef(0);
  const focado = useRef(0);

  useEffect(() => {
    const m = L.map(div.current!).setView([-15.8, -47.9], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap'}).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on('click', ev => tocouNoMapa(ev.latlng.lat, ev.latlng.lng));
    mapa.current = m;
    (window as any).rotaTeste = {clicarMapa: (lat: number, lng: number) => m.fire('click', {latlng: L.latLng(lat, lng)})};
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const m = mapa.current!, c = camada.current!;
    c.clearLayers();
    marcadores.current = {};
    const limites: [number, number][] = [];
    if (e.inicio) {
      L.marker([e.inicio.lat, e.inicio.lng], {icon: icone('S', '#111827')}).bindPopup('Saída: ' + esc(e.inicio.exibido)).addTo(c);
      limites.push([e.inicio.lat, e.inicio.lng]);
    }
    if (e.fim) {
      L.marker([e.fim.lat, e.fim.lng], {icon: icone('F', '#111827')}).bindPopup('Terminar perto de: ' + esc(e.fim.exibido)).addTo(c);
      limites.push([e.fim.lat, e.fim.lng]);
    }
    if (e.rota) for (const ra of e.rota.areas) if (ra.linha) L.polyline(ra.linha, {color: loja.area(ra.id).cor, weight: 4, opacity: .75}).addTo(c);
    for (const p of e.paradas) {
      if (p.lat == null || p.lng == null) continue;
      const a = loja.area(p.area);
      const mk = L.marker([p.lat, p.lng], {icon: icone(p.entregue ? '✓' : rotuloDe(p), a.cor, p.entregue, DUVIDA.has(p.precisao)), draggable: true});
      mk.bindPopup(`<b>${esc(rotuloDe(p))} · ${esc(p.texto)}</b><br><small>${esc(p.exibido)}</small><br><small>Arraste o pino para corrigir.</small>`);
      mk.on('dragend', () => { const ll = mk.getLatLng(); corrigirPosicao(p, ll.lat, ll.lng); });
      mk.on('click', () => {
        ui.selecionada = p.id;
        loja.mudou(false);
        document.querySelector(`[data-item="${p.id}"]`)?.scrollIntoView({behavior: 'smooth', block: 'center'});
      });
      mk.addTo(c);
      marcadores.current[p.id] = mk;
      if (!p.entregue) limites.push([p.lat, p.lng]);
    }
    if (ui.enquadrar !== enquadrado.current && limites.length) {
      enquadrado.current = ui.enquadrar;
      m.fitBounds(limites, {padding: [30, 30], maxZoom: 16});
    }
    if (ui.focar && ui.focar.vez !== focado.current) {
      focado.current = ui.focar.vez;
      const p = loja.parada(ui.focar.id);
      if (p && p.lat != null && p.lng != null) {
        m.setView([p.lat, p.lng], 17);
        marcadores.current[p.id]?.openPopup();
      }
    }
  });

  useEffect(() => { setTimeout(() => mapa.current?.invalidateSize(), 50); }, [ui.mapaGrande]);

  return <div id="map" ref={div} />;
}

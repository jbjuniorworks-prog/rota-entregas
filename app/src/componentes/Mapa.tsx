import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {tocouNoMapa} from '../acoes';
import {gruposNoMapa} from '../logica/otimizacao';
import {DUVIDA, QUASE} from '../logica/rotulos';
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

function icone(texto: string, cor: string, apagado = false, borda = '') {
  return L.divIcon({
    className: '', iconSize: [30, 30], iconAnchor: [15, 30],
    html: `<div class="pino ${borda}" style="background:${cor};opacity:${apagado ? .4 : 1}"><span>${esc(texto)}</span></div>`,
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
  const marcado = useRef(0);

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
      const mk = L.marker([p.lat, p.lng], {icon: icone(p.entregue ? '✓' : p.adiada ? '⏸' : rotuloDe(p), a.cor, p.entregue || !!p.adiada, DUVIDA.has(p.precisao) ? 'duvida' : QUASE.has(p.precisao) ? 'quase' : '')});
      const noApp = [
        p.stop ? `parada <b>${esc(p.stop)}</b>` : p.adicional ? 'sem parada (<b>ADS</b>, adicional)' : '',
        p.ml && e.rota ? `pacote <b>#${esc(p.ml)}</b>` : '',
      ].filter(Boolean).join(' · ');
      const linhaDoApp = noApp ? `<br><small>no app do entregador: ${noApp}</small>` : '';
      mk.bindPopup(`<b>${esc(rotuloDe(p))} · ${esc(p.texto)}</b>${linhaDoApp}<br><small>${esc(p.exibido)}</small><br><small>Para corrigir: 2. Conferir → Marcar no mapa.</small>`);
      mk.on('click', () => {
        ui.selecionada = p.id;
        loja.mudou(false);
        document.querySelector(`[data-item="${p.id}"]`)?.scrollIntoView({behavior: 'smooth', block: 'center'});
      });
      mk.addTo(c);
      marcadores.current[p.id] = mk;
      if (!p.entregue) limites.push([p.lat, p.lng]);
    }
    for (const g of gruposNoMapa(e.paradas)) {
      if (g.pacotes < 2 && !g.stops.length && !g.adicionais) continue;
      const daParada = [
        g.stops.length ? `P${g.stops.slice(0, 2).join('+')}${g.stops.length > 2 ? '+' : ''}` : '',
        g.adicionais ? 'ADS' : '',
      ].filter(Boolean).join(' ');
      const doPacote = g.pacotes > 1 ? `📦 ${g.pacotes}${g.enderecos > 1 ? ` · ${g.enderecos} endereços` : ''}` : '';
      const texto = [daParada, doPacote].filter(Boolean).join(' · ');
      const mk = marcadores.current[g.ids[0]];
      if (mk) mk.bindTooltip(texto, {permanent: true, direction: 'top', offset: [0, -28], className: 'balao'});
    }
    if (ui.aba === 'admin' && ui.marcas) {
      const pts = ui.marcas.pontos;
      for (const x of pts) L.marker([x.lat, x.lng], {icon: icone(x.rotulo, x.cor), zIndexOffset: 1000}).bindPopup(esc(x.texto)).addTo(c);
      if (ui.marcas.vez !== marcado.current && pts.length) {
        marcado.current = ui.marcas.vez;
        m.fitBounds(pts.map(x => [x.lat, x.lng] as [number, number]), {padding: [40, 40], maxZoom: 17});
      }
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

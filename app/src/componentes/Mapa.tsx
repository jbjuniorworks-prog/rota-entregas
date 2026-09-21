import {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {tocouNoMapa} from '../acoes';
import {gruposNoMapa} from '../logica/otimizacao';
import {rotuloDe} from '../logica/rotulo';
import {DUVIDA, QUASE} from '../logica/rotulos';
import type {Parada} from '../logica/tipos';
import {loja, useLoja} from '../loja';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));

function icone(texto: string, cor: string, apagado = false, borda = '') {
  return L.divIcon({
    className: '', iconSize: [30, 30], iconAnchor: [15, 30],
    html: `<div class="pino ${borda}" style="background:${cor};opacity:${apagado ? .4 : 1}"><span>${esc(texto)}</span></div>`,
  });
}

const BALAO = {permanent: true as const, direction: 'top' as const, offset: [0, -28] as [number, number], className: 'balao'};

function balaoDoGrupo(g: {stops: string[]; adicionais: number; pacotes: number}): string {
  const daParada = [
    g.stops.length ? `P${g.stops.slice(0, 2).join('+')}${g.stops.length > 2 ? '+' : ''}` : '',
    g.adicionais ? 'ADS' : '',
  ].filter(Boolean).join(' ');
  return [daParada, g.pacotes > 1 ? `×${g.pacotes}` : ''].filter(Boolean).join(' ');
}

interface NoMapa {
  mk: L.Marker;
  sig: string;
  lat: number;
  lng: number;
  popup: string;
  balao: string;
}

export default function Mapa() {
  const {e, ui} = useLoja();
  const div = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadaFundo = useRef<L.LayerGroup | null>(null);
  const camadaPinos = useRef<L.LayerGroup | null>(null);
  const pinos = useRef<Record<string, NoMapa>>({});
  const desenhado = useRef('');
  const fundoFeito = useRef('');
  const enquadrado = useRef(0);
  const focado = useRef(0);
  const marcado = useRef(0);

  useEffect(() => {
    const m = L.map(div.current!, {markerZoomAnimation: false}).setView([-15.8, -47.9], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap', updateWhenIdle: true, keepBuffer: 1}).addTo(m);
    camadaFundo.current = L.layerGroup().addTo(m);
    camadaPinos.current = L.layerGroup().addTo(m);
    m.on('click', ev => tocouNoMapa(ev.latlng.lat, ev.latlng.lng));
    mapa.current = m;
    (window as any).rotaTeste = {clicarMapa: (lat: number, lng: number) => m.fire('click', {latlng: L.latLng(lat, lng)})};
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const m = mapa.current!, fundo = camadaFundo.current!, camadaP = camadaPinos.current!;
    const comLocal = e.paradas.filter(p => p.lat != null && p.lng != null);
    const limites: [number, number][] = comLocal.filter(p => !p.entregue).map(p => [p.lat!, p.lng!]);
    if (e.inicio) limites.push([e.inicio.lat, e.inicio.lng]);
    if (e.fim) limites.push([e.fim.lat, e.fim.lng]);
    const marcasAdmin = ui.aba === 'admin' && ui.marcas ? ui.marcas : null;

    const desenho = [
      comLocal.map(p => [p.id, p.lat, p.lng, p.entregue, p.adiada, p.precisao, p.area, p.stop, p.adicional, p.unidades, rotuloDe(p), p.texto, p.exibido, p.ml].join(',')).join(';'),
      e.inicio && [e.inicio.lat, e.inicio.lng, e.inicio.exibido].join(','),
      e.fim && [e.fim.lat, e.fim.lng, e.fim.exibido].join(','),
      e.rota && e.rota.areas.map(ra => ra.id + ':' + (ra.linha ? ra.linha.length : 0)).join('|'),
      e.areas.map(a => a.id + a.cor).join(','),
      marcasAdmin ? 'admin' + marcasAdmin.vez : '',
    ].join('#');

    if (desenho !== desenhado.current) {
      desenhado.current = desenho;
      const vivos = new Set(comLocal.map(p => p.id));
      for (const [id, v] of Object.entries(pinos.current)) {
        if (vivos.has(id)) continue;
        v.mk.unbindTooltip().unbindPopup().remove();
        delete pinos.current[id];
      }
      const baloes = new Map<string, string>();
      for (const g of gruposNoMapa(e.paradas)) {
        const texto = balaoDoGrupo(g);
        if (texto) baloes.set(g.ids[0], texto);
      }
      for (const p of comLocal) {
        const cor = loja.area(p.area).cor;
        const rotulo = p.entregue ? '✓' : p.adiada ? '⏸' : rotuloDe(p);
        const apagado = p.entregue || !!p.adiada;
        const borda = DUVIDA.has(p.precisao) ? 'duvida' : QUASE.has(p.precisao) ? 'quase' : '';
        const noApp = [
          p.stop ? `parada <b>${esc(p.stop)}</b>` : p.adicional ? 'sem parada (<b>ADS</b>, adicional)' : '',
          p.ml && e.rota ? `pacote <b>#${esc(p.ml)}</b>` : '',
        ].filter(Boolean).join(' · ');
        const popup = `<b>${esc(rotulo)} · ${esc(p.texto)}</b>${noApp ? `<br><small>no app do entregador: ${noApp}</small>` : ''}<br><small>${esc(p.exibido)}</small><br><small>Para corrigir: 2. Conferir → Marcar no mapa.</small>`;
        const balao = baloes.get(p.id) || '';
        const sig = [p.lat, p.lng, rotulo, cor, apagado, borda, popup, balao].join('|');
        const antes = pinos.current[p.id];
        if (antes && antes.sig === sig) continue;
        if (!antes) {
          const mk = L.marker([p.lat!, p.lng!], {icon: icone(rotulo, cor, apagado, borda)}).bindPopup(popup);
          const id = p.id;
          mk.on('click', () => {
            ui.selecionada = id;
            loja.mudou(false);
            document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({behavior: 'smooth', block: 'center'});
          });
          if (balao) mk.bindTooltip(balao, BALAO);
          mk.addTo(camadaP);
          pinos.current[p.id] = {mk, sig, lat: p.lat!, lng: p.lng!, popup, balao};
          continue;
        }
        if (antes.lat !== p.lat || antes.lng !== p.lng) {
          antes.mk.setLatLng([p.lat!, p.lng!]);
          antes.lat = p.lat!;
          antes.lng = p.lng!;
        }
        antes.mk.setIcon(icone(rotulo, cor, apagado, borda));
        if (antes.popup !== popup) { antes.mk.setPopupContent(popup); antes.popup = popup; }
        if (antes.balao !== balao) {
          antes.mk.unbindTooltip();
          if (balao) antes.mk.bindTooltip(balao, BALAO);
          antes.balao = balao;
        }
        antes.sig = sig;
      }

      const sigFundo = [
        e.inicio && [e.inicio.lat, e.inicio.lng, e.inicio.exibido].join(','),
        e.fim && [e.fim.lat, e.fim.lng, e.fim.exibido].join(','),
        e.rota && e.rota.areas.map(ra => ra.id + ':' + (ra.linha ? ra.linha.length : 0)).join('|'),
        e.areas.map(a => a.id + a.cor).join(','),
        marcasAdmin ? 'admin' + marcasAdmin.vez : '',
      ].join('#');
      if (sigFundo !== fundoFeito.current) {
        fundoFeito.current = sigFundo;
        fundo.clearLayers();
        if (e.inicio) L.marker([e.inicio.lat, e.inicio.lng], {icon: icone('S', '#111827')}).bindPopup('Saída: ' + esc(e.inicio.exibido)).addTo(fundo);
        if (e.fim) L.marker([e.fim.lat, e.fim.lng], {icon: icone('F', '#111827')}).bindPopup('Terminar perto de: ' + esc(e.fim.exibido)).addTo(fundo);
        if (e.rota) for (const ra of e.rota.areas) if (ra.linha) L.polyline(ra.linha, {color: loja.area(ra.id).cor, weight: 4, opacity: .75}).addTo(fundo);
        if (marcasAdmin) for (const x of marcasAdmin.pontos) {
          L.marker([x.lat, x.lng], {icon: icone(x.rotulo, x.cor), zIndexOffset: 1000}).bindPopup(esc(x.texto)).addTo(fundo);
        }
      }
    }

    if (marcasAdmin && marcasAdmin.vez !== marcado.current && marcasAdmin.pontos.length) {
      marcado.current = marcasAdmin.vez;
      m.fitBounds(marcasAdmin.pontos.map(x => [x.lat, x.lng] as [number, number]), {padding: [40, 40], maxZoom: 17});
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
        pinos.current[p.id]?.mk.openPopup();
      }
    }
  });

  useEffect(() => { setTimeout(() => mapa.current?.invalidateSize(), 50); }, [ui.mapaGrande]);

  return <div id="map" ref={div} />;
}

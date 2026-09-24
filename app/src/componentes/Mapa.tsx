import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {seguirMinhaPosicao, tocouNoMapa} from '../acoes';
import {empilhar} from '../logica/pinos';
import {ondeNaRota, rotuloDe} from '../logica/rotulo';
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
const ZOOM_DO_FOCO = 17;
const ZOOM_DE_MIM = 17;

// A bolinha de "você está aqui", com a seta do rumo quando ele está andando.
const iconeDeMim = (rumo: number | null) => L.divIcon({
  className: '', iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div class="eu">${rumo == null ? '' : `<i style="transform:rotate(${Math.round(rumo)}deg) translateY(-17px)"></i>`}</div>`,
});

function balaoDoGrupo(g: {stops: string[]; adicionais: number; pacotes: number}): string {
  const daParada = [
    g.stops.length ? `P${g.stops.slice(0, 3).join('+')}${g.stops.length > 3 ? '+' : ''}` : '',
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
  const camadaEu = useRef<L.LayerGroup | null>(null);
  const pinos = useRef<Record<string, NoMapa>>({});
  const doPino = useRef<Record<string, string>>({});
  const desenhado = useRef('');
  const fundoFeito = useRef('');
  const enquadrado = useRef(0);
  const focado = useRef(0);
  const marcado = useRef(0);
  const [, setZoom] = useState(0);

  useEffect(() => {
    const m = L.map(div.current!, {markerZoomAnimation: false}).setView([-15.8, -47.9], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '© OpenStreetMap', updateWhenIdle: true, keepBuffer: 1}).addTo(m);
    camadaFundo.current = L.layerGroup().addTo(m);
    camadaPinos.current = L.layerGroup().addTo(m);
    m.on('click', ev => tocouNoMapa(ev.latlng.lat, ev.latlng.lng));
    m.on('zoomend', () => setZoom(m.getZoom()));
    mapa.current = m;
    (window as any).rotaTeste = {
      clicarMapa: (lat: number, lng: number) => m.fire('click', {latlng: L.latLng(lat, lng)}),
      zoom: (z: number) => m.setZoom(z),
      centro: () => { const c = m.getCenter(); return {lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5)}; },
    };
    return () => { m.remove(); };
  }, []);

  useEffect(() => {
    const m = mapa.current!, fundo = camadaFundo.current!, camadaP = camadaPinos.current!;
    const comLocal = e.paradas.filter(p => p.lat != null && p.lng != null);
    const limites: [number, number][] = comLocal.filter(p => !p.entregue).map(p => [p.lat!, p.lng!]);
    if (e.inicio) limites.push([e.inicio.lat, e.inicio.lng]);
    if (e.fim) limites.push([e.fim.lat, e.fim.lng]);
    const marcasAdmin = ui.aba === 'admin' && ui.marcas ? ui.marcas : null;

    const z = m.getZoom();
    const pilhas = empilhar(comLocal, q => m.project([q.lat, q.lng], z), q => ondeNaRota(q.id) ?? 1e6);
    const desenho = [
      pilhas.map(g => g.ps.map(p => [p.id, p.lat, p.lng, p.entregue, p.adiada, p.precisao, p.area, p.stop, p.adicional, p.unidades, rotuloDe(p), p.texto, p.exibido, p.ml].join(',')).join(';')).join('/'),
      e.inicio && [e.inicio.lat, e.inicio.lng, e.inicio.exibido].join(','),
      e.fim && [e.fim.lat, e.fim.lng, e.fim.exibido].join(','),
      e.rota && e.rota.areas.map(ra => ra.id + ':' + (ra.linha ? ra.linha.length : 0)).join('|'),
      e.areas.map(a => a.id + a.cor).join(','),
      marcasAdmin ? 'admin' + marcasAdmin.vez : '',
    ].join('#');

    if (desenho !== desenhado.current) {
      desenhado.current = desenho;
      const vivos = new Set(pilhas.map(g => g.ps.map(p => p.id).join('+')));
      for (const [chave, v] of Object.entries(pinos.current)) {
        if (vivos.has(chave)) continue;
        v.mk.unbindTooltip().unbindPopup().remove();
        delete pinos.current[chave];
      }
      doPino.current = {};
      for (const g of pilhas) {
        const p = g.ps[0];
        const chave = g.ps.map(x => x.id).join('+');
        for (const x of g.ps) doPino.current[x.id] = chave;
        const cor = loja.area(p.area).cor;
        const apagado = p.entregue || !!p.adiada;
        const so = g.ps.length === 1;
        const rotulo = (p.entregue ? '✓' : p.adiada ? '⏸' : rotuloDe(p)) + (so ? '' : `+${g.ps.length - 1}`);
        const borda = g.ps.some(x => DUVIDA.has(x.precisao)) ? 'duvida' : g.ps.some(x => QUASE.has(x.precisao)) ? 'quase' : '';
        const naRota = (x: Parada) => x.entregue ? '✓' : x.adiada ? '⏸' : rotuloDe(x);
        const noApp = (x: Parada) => [
          x.stop ? `parada <b>${esc(x.stop)}</b>` : x.adicional ? 'sem parada (<b>ADS</b>, adicional)' : '',
          x.ml && e.rota ? `pacote <b>#${esc(x.ml)}</b>` : '',
        ].filter(Boolean).join(' · ');
        const uma = (x: Parada) => `<b>${esc(naRota(x))} · ${esc(x.texto)}</b>${noApp(x) ? `<br><small>no app do entregador: ${noApp(x)}</small>` : ''}`;
        const popup = (so
          ? `${uma(p)}<br><small>${esc(p.exibido)}</small>`
          : `<b>${g.ps.length} entregas neste ponto</b><br>${g.ps.map(x => uma(x)).join('<br>')}`)
          + '<br><small>Para corrigir: 2. Conferir → Marcar no mapa.</small>';
        const pendentes = g.ps.filter(x => !x.entregue);
        const balao = balaoDoGrupo({
          stops: [...new Set(pendentes.map(x => x.stop).filter(Boolean) as string[])].sort((a, b) => +a - +b),
          adicionais: pendentes.filter(x => x.adicional).length,
          pacotes: pendentes.reduce((n, x) => n + (x.unidades || 1), 0),
        });
        const sig = [p.lat, p.lng, rotulo, cor, apagado, borda, popup, balao].join('|');
        const antes = pinos.current[chave];
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
          pinos.current[chave] = {mk, sig, lat: p.lat!, lng: p.lng!, popup, balao};
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
      const p = loja.parada(ui.focar.id);
      if (!p || p.lat == null || p.lng == null) focado.current = ui.focar.vez;
      else {
        const jaNoZoom = m.getZoom() === ZOOM_DO_FOCO;
        m.setView([p.lat, p.lng], ZOOM_DO_FOCO);
        if (jaNoZoom) {
          focado.current = ui.focar.vez;
          pinos.current[doPino.current[p.id]]?.mk.openPopup();
        }
      }
    }
  });

  useEffect(() => { setTimeout(() => mapa.current?.invalidateSize(), 50); }, [ui.mapa, ui.aba]);

  // Só segue a posição na aba Rota, que é a que ele olha dirigindo, e só enquanto o mapa está
  // desenhado — com o mapa fechado este componente nem existe, e o GPS não fica ligado à toa.
  useEffect(() => {
    if (ui.aba !== 'rota') return;
    return seguirMinhaPosicao();
  }, [ui.aba]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!camadaEu.current) camadaEu.current = L.layerGroup().addTo(m);
    const c = camadaEu.current;
    c.clearLayers();
    const eu = ui.euAqui;
    if (!eu || ui.aba !== 'rota') return;
    // o círculo é a margem de erro do GPS: some quando ele é bom, para não virar mancha na tela
    if (eu.precisao > 25) {
      L.circle([eu.lat, eu.lng], {radius: Math.min(300, eu.precisao), color: '#2563eb', weight: 1, fillOpacity: 0.1, interactive: false}).addTo(c);
    }
    L.marker([eu.lat, eu.lng], {icon: iconeDeMim(eu.rumo), interactive: false, zIndexOffset: 2000}).addTo(c);
  }, [ui.euAqui, ui.aba]);

  useEffect(() => {
    if (!ui.irParaMim || !ui.euAqui) return;
    mapa.current?.setView([ui.euAqui.lat, ui.euAqui.lng], Math.max(mapa.current.getZoom(), ZOOM_DE_MIM));
  }, [ui.irParaMim]);

  return <div id="map" ref={div} />;
}

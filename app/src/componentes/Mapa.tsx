import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {abrir, seguirMinhaPosicao, tocouNoMapa, trocar, voltar} from '../acoes';
import {empilhar} from '../logica/pinos';
import {ondeNaRota, rotuloDe} from '../logica/rotulo';
import {DUVIDA, QUASE} from '../logica/rotulos';
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
    // Tocar fora dos pinos: com o "toque no mapa" armado, é o lugar da entrega; com o cartão de
    // um pino aberto, fecha ele, que nem o voltar.
    m.on('click', ev => {
      if (loja.ui.posicionando) { tocouNoMapa(ev.latlng.lat, ev.latlng.lng); return; }
      if (loja.ui.pino) voltar();
    });
    m.on('zoomend', () => setZoom(m.getZoom()));
    mapa.current = m;
    const daqui = {
      clicarMapa: (lat: number, lng: number) => m.fire('click', {latlng: L.latLng(lat, lng)}),
      zoom: (z: number) => m.setZoom(z),
      zoomAtual: () => m.getZoom(),
      irPara: (lat: number, lng: number, z: number) => m.setView([lat, lng], z),
      centro: () => { const c = m.getCenter(); return {lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5)}; },
    };
    (window as any).rotaTeste = daqui;
    // Fechar e reabrir o mapa monta outro: sem tirar este daqui, o teste continuava mandando
    // ordem para um mapa já morto e elas sumiam sem erro nenhum.
    return () => { m.remove(); if ((window as any).rotaTeste === daqui) delete (window as any).rotaTeste; };
  }, []);

  useEffect(() => {
    const m = mapa.current!, fundo = camadaFundo.current!, camadaP = camadaPinos.current!;
    const comLocal = e.paradas.filter(p => p.lat != null && p.lng != null);
    const limites: [number, number][] = comLocal.filter(p => !p.entregue).map(p => [p.lat!, p.lng!]);
    if (e.inicio) limites.push([e.inicio.lat, e.inicio.lng]);
    if (e.fim) limites.push([e.fim.lat, e.fim.lng]);
    const marcasAdmin = ui.tela === 'admin' && ui.marcas ? ui.marcas : null;

    const z = m.getZoom();
    const pilhas = empilhar(comLocal, q => m.project([q.lat, q.lng], z), q => ondeNaRota(q.id) ?? 1e6);
    const desenho = [
      pilhas.map(g => g.ps.map(p => [p.id, p.lat, p.lng, p.entregue, p.adiada, p.precisao, p.area, p.stop, p.adicional, p.unidades, rotuloDe(p),
        (p.reclamacoes || []).map(r => r.motivo).join('+')].join(',')).join(';')).join('/'),
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
        v.mk.unbindTooltip().remove();
        delete pinos.current[chave];
      }
      // A próxima parada é a que ele mais olha e a que menos saltava: num mapa com quarenta
      // pinos iguais, achar qual é exigia ler os números um por um.
      const proxima = comLocal
        .filter(p => !p.entregue && !p.adiada)
        .map(p => ({id: p.id, i: ondeNaRota(p.id)}))
        .filter((x): x is {id: string; i: number} => x.i != null)
        .sort((a, b) => a.i - b.i)[0]?.id;
      for (const g of pilhas) {
        const p = g.ps[0];
        const chave = g.ps.map(x => x.id).join('+');
        const cor = loja.area(p.area).cor;
        const apagado = p.entregue || !!p.adiada;
        const so = g.ps.length === 1;
        const rotulo = (p.entregue ? '✓' : p.adiada ? '⏸' : rotuloDe(p)) + (so ? '' : `+${g.ps.length - 1}`);
        const duvidosa = g.ps.some(x => DUVIDA.has(x.precisao)) ? 'duvida' : g.ps.some(x => QUASE.has(x.precisao)) ? 'quase' : '';
        // "Cliente xarope" (pedido de 28/09): o pino já chega com outra cor, antes de ele tocar
        const xarope = g.ps.some(x => !x.entregue && x.reclamacoes?.length);
        const borda = [duvidosa, proxima && g.ps.some(x => x.id === proxima) ? 'alvo' : '', xarope ? 'xarope' : ''].filter(Boolean).join(' ');
        const pendentes = g.ps.filter(x => !x.entregue);
        const balao = ((xarope ? '! ' : '') + balaoDoGrupo({
          stops: [...new Set(pendentes.map(x => x.stop).filter(Boolean) as string[])].sort((a, b) => +a - +b),
          adicionais: pendentes.filter(x => x.adicional).length,
          pacotes: pendentes.reduce((n, x) => n + (x.unidades || 1), 0),
        })).trim();
        const sig = [p.lat, p.lng, rotulo, cor, apagado, borda, balao].join('|');
        const antes = pinos.current[chave];
        if (antes && antes.sig === sig) continue;
        if (!antes) {
          const mk = L.marker([p.lat!, p.lng!], {icon: icone(rotulo, cor, apagado, borda)});
          // O pino abre o cartão de baixo com as entregas dele, os mesmos botões do cartão da
          // próxima. O balão do Leaflet era pequeno para o dedo e montado em texto, à parte.
          mk.on('click', () => {
            if (loja.ui.tela !== 'rota') return;
            (loja.ui.pino ? trocar : abrir)({pino: chave.split('+'), folha: 'proxima'});
          });
          if (balao) mk.bindTooltip(balao, BALAO);
          mk.addTo(camadaP);
          pinos.current[chave] = {mk, sig, lat: p.lat!, lng: p.lng!, balao};
          continue;
        }
        if (antes.lat !== p.lat || antes.lng !== p.lng) {
          antes.mk.setLatLng([p.lat!, p.lng!]);
          antes.lat = p.lat!;
          antes.lng = p.lng!;
        }
        antes.mk.setIcon(icone(rotulo, cor, apagado, borda));
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

    // Escondido (outra tela aberta), o mapa não tem tamanho, e enquadrar agora mostrava o mundo
    // inteiro: o pedido espera ele aparecer. Aparecendo, o tamanho de antes já não vale.
    if (!div.current!.offsetWidth) return;
    const pedido = (marcasAdmin && marcasAdmin.vez !== marcado.current) || (ui.enquadrar !== enquadrado.current && limites.length)
      || (ui.focar && ui.focar.vez !== focado.current);
    if (pedido) m.invalidateSize({pan: false});
    if (marcasAdmin && marcasAdmin.vez !== marcado.current && marcasAdmin.pontos.length) {
      marcado.current = marcasAdmin.vez;
      m.fitBounds(marcasAdmin.pontos.map(x => [x.lat, x.lng] as [number, number]), {padding: [40, 40], maxZoom: 17});
    }
    if (ui.enquadrar !== enquadrado.current && limites.length) {
      enquadrado.current = ui.enquadrar;
      // em cima ficam o aviso de "para conferir" e o botão de onde estou: pino ali não se toca
      m.fitBounds(limites, {paddingTopLeft: [30, 72], paddingBottomRight: [30, 30], maxZoom: 16});
    }
    if (ui.focar && ui.focar.vez !== focado.current) {
      focado.current = ui.focar.vez;
      const p = loja.parada(ui.focar.id);
      if (p && p.lat != null && p.lng != null) m.setView([p.lat, p.lng], ZOOM_DO_FOCO);
    }
  });

  // o tamanho do mapa muda com a tela e com a lista puxada para cima
  useEffect(() => { setTimeout(() => mapa.current?.invalidateSize(), 50); }, [ui.tela, ui.folha]);

  // Só segue a posição na Rota, que é a tela que ele olha dirigindo: no Admin o GPS não fica
  // ligado à toa.
  useEffect(() => {
    if (ui.tela !== 'rota') return;
    return seguirMinhaPosicao();
  }, [ui.tela]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!camadaEu.current) camadaEu.current = L.layerGroup().addTo(m);
    const c = camadaEu.current;
    c.clearLayers();
    const eu = ui.euAqui;
    if (!eu || ui.tela !== 'rota') return;
    // o círculo é a margem de erro do GPS: some quando ele é bom, para não virar mancha na tela
    if (eu.precisao > 25) {
      L.circle([eu.lat, eu.lng], {radius: Math.min(300, eu.precisao), color: '#2563eb', weight: 1, fillOpacity: 0.1, interactive: false}).addTo(c);
    }
    L.marker([eu.lat, eu.lng], {icon: iconeDeMim(eu.rumo), interactive: false, zIndexOffset: 2000}).addTo(c);
  }, [ui.euAqui, ui.tela]);

  useEffect(() => {
    if (!ui.irParaMim || !ui.euAqui) return;
    mapa.current?.invalidateSize({pan: false});
    mapa.current?.setView([ui.euAqui.lat, ui.euAqui.lng], Math.max(mapa.current.getZoom(), ZOOM_DE_MIM));
  }, [ui.irParaMim]);

  return <div id="map" ref={div} />;
}

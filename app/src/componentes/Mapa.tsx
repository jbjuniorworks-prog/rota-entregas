import {useEffect, useRef, useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {contar, entregarTodas, entregueAqui, marcarEntregue, posicionar, seguirMinhaPosicao, tocouNoMapa} from '../acoes';
import {haversine, RAIO_BLOCO} from '../logica/geo';
import {agruparPorEndereco} from '../logica/otimizacao';
import {empilhar} from '../logica/pinos';
import {avisoXarope} from '../logica/reclamacoes';
import {ondeNaRota, rotuloDe} from '../logica/rotulo';
import {DUVIDA, QUASE} from '../logica/rotulos';
import type {Parada, Ponto} from '../logica/tipos';
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
    // Os botões do balão saem de uma string de HTML, então quem escuta é o contêiner do mapa.
    // Na rua ele está na porta com o mapa aberto: sair da tela para marcar entregue ou para
    // arrumar o pino era o que custava tempo.
    div.current!.addEventListener('click', ev => {
      const b = (ev.target as HTMLElement).closest('[data-acao]') as HTMLElement | null;
      if (!b) return;
      const ps = (b.dataset.ids || '').split('+').map(loja.parada).filter((p): p is Parada => !!p);
      if (!ps.length) return;
      m.closePopup();
      if (b.dataset.acao === 'arrumar') { posicionar(ps[0].id); return; }
      contar(b.dataset.acao === 'aqui' ? 'balao-aqui' : 'balao-entreguei');
      if (b.dataset.acao === 'aqui') { entregueAqui(ps); return; }
      const pendentes = ps.filter(p => !p.entregue);
      if (pendentes.length > 1) entregarTodas(pendentes);
      else if (pendentes.length === 1) marcarEntregue(pendentes[0], true);
    });
    m.on('zoomend', () => setZoom(m.getZoom()));
    mapa.current = m;
    const daqui = {
      clicarMapa: (lat: number, lng: number) => m.fire('click', {latlng: L.latLng(lat, lng)}),
      zoom: (z: number) => m.setZoom(z),
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
    const marcasAdmin = ui.aba === 'admin' && ui.marcas ? ui.marcas : null;
    const naRotaDeHoje = ui.aba === 'rota';

    const z = m.getZoom();
    const pilhas = empilhar(comLocal, q => m.project([q.lat, q.lng], z), q => ondeNaRota(q.id) ?? 1e6);
    const desenho = [
      pilhas.map(g => g.ps.map(p => [p.id, p.lat, p.lng, p.entregue, p.adiada, p.precisao, p.area, p.stop, p.adicional, p.unidades, rotuloDe(p), p.texto, p.exibido, p.ml,
        (p.reclamacoes || []).map(r => r.motivo).join('+')].join(',')).join(';')).join('/'),
      e.inicio && [e.inicio.lat, e.inicio.lng, e.inicio.exibido].join(','),
      e.fim && [e.fim.lat, e.fim.lng, e.fim.exibido].join(','),
      e.rota && e.rota.areas.map(ra => ra.id + ':' + (ra.linha ? ra.linha.length : 0)).join('|'),
      e.areas.map(a => a.id + a.cor).join(','),
      marcasAdmin ? 'admin' + marcasAdmin.vez : '',
      // Os botões do balão dependem da aba. Sem ela aqui, o balão montado na Conferir seguia
      // para a Rota sem o "Entreguei" e mandando ir para a Conferir (print de 28/09).
      naRotaDeHoje ? 'rota' : '',
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
        for (const x of g.ps) doPino.current[x.id] = chave;
        const cor = loja.area(p.area).cor;
        const apagado = p.entregue || !!p.adiada;
        const so = g.ps.length === 1;
        const rotulo = (p.entregue ? '✓' : p.adiada ? '⏸' : rotuloDe(p)) + (so ? '' : `+${g.ps.length - 1}`);
        const duvidosa = g.ps.some(x => DUVIDA.has(x.precisao)) ? 'duvida' : g.ps.some(x => QUASE.has(x.precisao)) ? 'quase' : '';
        // "Cliente xarope" (pedido de 28/09): o pino já chega com outra cor, antes de ele tocar
        const xarope = g.ps.some(x => !x.entregue && x.reclamacoes?.length);
        const borda = [duvidosa, proxima && g.ps.some(x => x.id === proxima) ? 'alvo' : '', xarope ? 'xarope' : ''].filter(Boolean).join(' ');
        const naRota = (x: Parada) => x.entregue ? '✓' : x.adiada ? '⏸' : rotuloDe(x);
        const noApp = (x: Parada) => [
          x.stop ? `parada <b>${esc(x.stop)}</b>` : x.adicional ? 'sem parada (<b>ADS</b>, adicional)' : '',
          x.ml && e.rota ? `pacote <b>#${esc(x.ml)}</b>` : '',
        ].filter(Boolean).join(' · ');
        const uma = (x: Parada) => `<b>${esc(naRota(x))} · ${esc(x.texto)}</b>${noApp(x) ? `<br><small>no app do entregador: ${noApp(x)}</small>` : ''}`;
        const pendentes = g.ps.filter(x => !x.entregue);
        // Pedido deles, 28/09: o que já foi entregue e a porta que já está confirmada não têm o
        // que arrumar na rua — botão ali é só toque errado esperando acontecer. Porta confirmada
        // errada se arruma na Conferir, com pergunta. Cliente que se mudou não cai aqui: o
        // endereço novo é outra chave e chega sem confirmação, com os botões de sempre.
        const abertas = pendentes.filter(x => x.precisao !== 'confirmado');
        const ids = (xs: Parada[]) => esc(xs.map(x => x.id).join('+'));
        // Com duas entregas no mesmo ponto, um botão só teria de escolher uma por conta própria —
        // e escolhia a primeira, calado. Quando são de endereços diferentes que só caíram juntos,
        // é justo a outra que ele quer mexer. Então cada uma ganha o seu botão, com o número dela.
        const arrumar = !abertas.length ? ''
          : so ? `<button data-acao="arrumar" data-ids="${esc(p.id)}">📍 Arrumar aqui</button>`
          : `<span class="popum">📍 Arrumar só a:</span>${abertas.map(x =>
            `<button class="so" data-acao="arrumar" data-ids="${esc(x.id)}">${esc(rotuloDe(x))}</button>`).join('')}`;
        // Na porta, o botão que ele quer: entrega e porta num toque só. A porta é uma por
        // endereço — num pino com o restaurante e a casa do lado, cada um ganha o seu.
        const enderecos = agruparPorEndereco(abertas);
        // Pilha é coisa da tela: com o mapa afastado, a próxima juntava 24 entregas de ruas
        // diferentes. Um toque errado ali dava como entregue — e com a porta aqui — o pacote de
        // outra rua. Só oferece quando elas estão juntas no chão, pela régua da "mesma parada".
        const noChao = abertas.every(x => haversine(x as Ponto, abertas[0] as Ponto) <= RAIO_BLOCO);
        const aqui = !enderecos.length ? ''
          : !noChao ? '<span class="popum">Aproxime o mapa para o 📍 Entreguei aqui.</span>'
          : enderecos.length === 1
            ? `<button data-acao="aqui" data-ids="${ids(abertas)}">📍 Entreguei aqui${abertas.length > 1 ? ` as ${abertas.length}` : ''}</button>`
            : `<span class="popum">📍 Entreguei aqui, só a:</span>${enderecos.map(en =>
              `<button class="so" data-acao="aqui" data-ids="${ids(en.ps)}">${esc(en.ps.map(rotuloDe).join('+'))}</button>`).join('')}`;
        const confirmada = abertas.length < pendentes.length ? '<span class="popum">✓ Endereço verificado. Se estiver errado, arrume em 2. Conferir.</span>' : '';
        const botoes = !pendentes.length ? '' : aqui
          + `<button data-acao="entregue" data-ids="${esc(chave)}">✓ Entreguei${pendentes.length > 1 ? ` as ${pendentes.length}` : ''}</button>`
          + arrumar + confirmada;
        const acoes = naRotaDeHoje
          ? botoes && `<div class="popacoes">${botoes}</div>`
          : '<br><small>Para corrigir: 2. Conferir → Marcar no mapa.</small>';
        // tocou no pino de outra cor: a primeira coisa do balão é por quê
        const xaropes = [...new Set(g.ps.filter(x => x.reclamacoes?.length).map(x =>
          `<div class="popxarope" data-xarope>⚠️ ${so ? '' : esc(rotuloDe(x)) + ' · '}${esc(avisoXarope(x.reclamacoes))}</div>`))].join('');
        const popup = xaropes + (so
          ? `${uma(p)}<br><small>${esc(p.exibido)}</small>`
          : `<b>${g.ps.length} entregas neste ponto</b><br>${g.ps.map(x => uma(x)).join('<br>')}`) + acoes;
        const balao = ((xarope ? '⚠️ ' : '') + balaoDoGrupo({
          stops: [...new Set(pendentes.map(x => x.stop).filter(Boolean) as string[])].sort((a, b) => +a - +b),
          adicionais: pendentes.filter(x => x.adicional).length,
          pacotes: pendentes.reduce((n, x) => n + (x.unidades || 1), 0),
        })).trim();
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

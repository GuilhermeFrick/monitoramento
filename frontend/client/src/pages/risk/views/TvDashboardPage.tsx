import { useEffect, useRef, useState } from "react";
import type * as LeafletNS from "leaflet";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Maximize2,
  Minus,
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";

const clusters = [
  { id: "sudeste", label: "Sudeste", count: 86, lat: -22.2, lng: -45.3, tone: "ok" },
  { id: "sul", label: "Sul", count: 41, lat: -28.2, lng: -51.1, tone: "ok" },
  { id: "centro", label: "Centro-Oeste", count: 28, lat: -16.1, lng: -54.7, tone: "warn" },
  { id: "nordeste", label: "Nordeste", count: 25, lat: -8.9, lng: -39.8, tone: "ok" },
  { id: "norte", label: "Norte", count: 12, lat: -4.5, lng: -62.1, tone: "danger" },
] as const;

const vehicles = [
  { plate: "VTR-2048", city: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, state: "moving" },
  { plate: "VTR-2240", city: "São Paulo", lat: -23.5505, lng: -46.6333, state: "moving" },
  { plate: "VTR-1783", city: "Belo Horizonte", lat: -19.9167, lng: -43.9345, state: "stopped" },
  { plate: "VTR-0931", city: "Curitiba", lat: -25.4284, lng: -49.2733, state: "moving" },
  { plate: "VTR-3110", city: "Porto Alegre", lat: -30.0346, lng: -51.2177, state: "moving" },
  { plate: "VTR-3650", city: "Vitória", lat: -20.3155, lng: -40.3128, state: "offline" },
  { plate: "VTR-1522", city: "Brasília", lat: -15.7939, lng: -47.8828, state: "moving" },
  { plate: "VTR-4208", city: "Goiânia", lat: -16.6869, lng: -49.2648, state: "stopped" },
  { plate: "VTR-2714", city: "Salvador", lat: -12.9777, lng: -38.5016, state: "moving" },
  { plate: "VTR-0882", city: "Recife", lat: -8.0476, lng: -34.877, state: "moving" },
  { plate: "VTR-1204", city: "Fortaleza", lat: -3.7319, lng: -38.5267, state: "risk" },
  { plate: "VTR-0441", city: "Manaus", lat: -3.119, lng: -60.0217, state: "offline" },
] as const;

const TILE_URL = import.meta.env?.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = import.meta.env?.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function TvFleetMap() {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const [zoom, setZoom] = useState(4);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let map: LeafletNS.Map | null = null;
    (async () => {
      const module = await import("leaflet");
      const L = ((module as unknown as { default?: typeof LeafletNS }).default ?? module) as typeof LeafletNS;
      if (!active || !host.current) return;
      map = L.map(host.current, { zoomControl: false, attributionControl: true, minZoom: 3, maxZoom: 10, preferCanvas: true });
      map.setView([-17.8, -56.2], 4);
      map.setMaxBounds(L.latLngBounds([-60, -95], [18, -25]));
      L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      const markers = L.layerGroup().addTo(map);

      const drawMarkers = () => {
        if (!map) return;
        markers.clearLayers();
        const currentZoom = map.getZoom();
        setZoom(currentZoom);
        if (currentZoom < 5) {
          for (const cluster of clusters) {
            const icon = L.divIcon({
              className: "tv-leaflet-icon",
              html: `<span class="tv-cluster ${cluster.tone}"><strong>${cluster.count}</strong><small>${cluster.label}</small></span>`,
              iconSize: [52, 52], iconAnchor: [26, 26],
            });
            L.marker([cluster.lat, cluster.lng], { icon, keyboard: false, title: `${cluster.label}: ${cluster.count} veículos` }).addTo(markers);
          }
        } else {
          for (const vehicle of vehicles) {
            const icon = L.divIcon({
              className: "tv-leaflet-icon",
              html: `<span class="tv-vehicle ${vehicle.state}"><span class="tv-vehicle-glyph">●</span><span><strong>${vehicle.plate}</strong><small>${vehicle.city}</small></span></span>`,
              iconSize: [104, 32], iconAnchor: [16, 16],
            });
            L.marker([vehicle.lat, vehicle.lng], { icon, keyboard: false, title: `${vehicle.plate} · ${vehicle.city}` }).addTo(markers);
          }
        }
      };

      map.on("zoomend", drawMarkers);
      drawMarkers();
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map?.invalidateSize(), 80);
    })().catch((error) => console.error("Falha ao carregar mapa do Modo TV", error));
    return () => { active = false; map?.remove(); mapRef.current = null; };
  }, []);

  return <div className="tv-map-stage">
    <div ref={host} className="tv-leaflet-host" aria-label="Mapa geográfico da América do Sul com veículos" />
    <div className="tv-map-vignette" aria-hidden="true" />
    <div className="tv-map-radar radar-a" aria-hidden="true" /><div className="tv-map-radar radar-b" aria-hidden="true" />
    <div className="tv-zoom-controls">
      <button aria-label="Diminuir zoom" onClick={() => mapRef.current?.zoomOut()}><Minus size={16} /></button>
      <span>{zoom}×</span>
      <button aria-label="Aumentar zoom" onClick={() => mapRef.current?.zoomIn()}><Plus size={16} /></button>
      <button aria-label="Centralizar mapa" onClick={() => mapRef.current?.setView([-17.8, -56.2], 4)}><LocateFixed size={16} /></button>
    </div>
    <div className="tv-map-hint">{!ready ? "Carregando mapa geográfico…" : zoom < 5 ? "Visão agrupada · aproxime para identificar os veículos" : "Visão detalhada · veículos em coordenadas reais"}</div>
  </div>;
}

const indicatorSlides = [
  {
    eyebrow: "Disponibilidade da frota",
    title: "Operação conectada",
    metric: "95,8%",
    description: "184 dos 192 veículos estão transmitindo neste momento.",
    items: [
      { label: "Online", value: "184", tone: "ok" },
      { label: "Offline", value: "08", tone: "danger" },
      { label: "Últimos 5 min", value: "+03", tone: "brand" },
    ],
  },
  {
    eyebrow: "Alertas em acompanhamento",
    title: "Risco e Safety",
    metric: "18",
    description: "Ocorrências que exigem acompanhamento da central.",
    items: [
      { label: "Risco Security", value: "04", tone: "danger" },
      { label: "Risco Safety", value: "06", tone: "warn" },
      { label: "Em tratamento", value: "08", tone: "brand" },
    ],
  },
  {
    eyebrow: "Desempenho da central",
    title: "Resposta operacional",
    metric: "04:38",
    description: "Tempo médio entre a entrada e o primeiro atendimento.",
    items: [
      { label: "Dentro do SLA", value: "92%", tone: "ok" },
      { label: "Críticos", value: "03", tone: "danger" },
      { label: "Resolvidos hoje", value: "37", tone: "brand" },
    ],
  },
] as const;

export function TvDashboardPage() {
  const [clock, setClock] = useState(new Date());
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % indicatorSlides.length), 8000);
    return () => window.clearInterval(timer);
  }, []);

  const changeSlide = (direction: number) => setSlide((current) => (current + direction + indicatorSlides.length) % indicatorSlides.length);
  const currentSlide = indicatorSlides[slide];
  const closeTv = () => { window.location.href = `${window.location.origin}${window.location.pathname}`; };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  return <main className="tv-dashboard tv-hero-dashboard">
    <div className="tv-hero-map" aria-label="Mapa operacional da América do Sul"><TvFleetMap /></div>
    <div className="tv-hero-scrim glow" aria-hidden="true" />
    <div className="tv-hero-scrim side" aria-hidden="true" />
    <div className="tv-hero-scrim vertical" aria-hidden="true" />

    <div className="tv-hero-ui">
      <header className="tv-hero-top">
        <div className="tv-hero-heading">
          <div className="tv-hero-kicker"><i /><span>Operação em tempo real</span></div>
          <h1>Avansat Risk</h1>
        </div>
        <div className="tv-hero-counts" aria-label="Resumo da frota">
          <div><strong>192</strong><span>veículos</span></div>
          <div><strong>184</strong><span>online</span></div>
          <div className="offline"><strong>08</strong><span>offline</span></div>
          <div><strong>117</strong><span>em percurso</span></div>
          <div className="risk"><strong>12</strong><span>em risco</span></div>
        </div>
      </header>

      <section className="tv-hero-content">
        <aside className="tv-hero-panel" aria-live="polite">
          <div className="tv-hero-slide-top"><span>{currentSlide.eyebrow}</span><b>{String(slide + 1).padStart(2, "0")} / {String(indicatorSlides.length).padStart(2, "0")}</b></div>
          <strong className="tv-hero-metric">{currentSlide.metric}</strong>
          <h2>{currentSlide.title}</h2>
          <p>{currentSlide.description}</p>
          <div className="tv-hero-trio">{currentSlide.items.map((item) => <div key={item.label}><strong className={item.tone}>{item.value}</strong><span>{item.label}</span></div>)}</div>
          <div className="tv-hero-events">
            <small>ATIVIDADE RECENTE</small>
            <article><span className="danger"><AlertTriangle size={13} /></span><div><strong>Botão de pânico acionado</strong><small>VTR-5221 · há 7 min</small></div></article>
            <article><span className="warn"><Activity size={13} /></span><div><strong>Fadiga detectada</strong><small>VTR-2048 · há 14 min</small></div></article>
            <article><span><ShieldAlert size={13} /></span><div><strong>Entrada em zona restrita</strong><small>VTR-3110 · há 25 min</small></div></article>
          </div>
          <div className="tv-hero-carousel-controls">
            <button aria-label="Indicador anterior" onClick={() => changeSlide(-1)}><ChevronLeft size={17} /></button>
            <div>{indicatorSlides.map((_, index) => <button aria-label={`Exibir indicador ${index + 1}`} className={slide === index ? "active" : ""} key={index} onClick={() => setSlide(index)} />)}</div>
            <button aria-label="Próximo indicador" onClick={() => changeSlide(1)}><ChevronRight size={17} /></button>
          </div>
        </aside>
      </section>

      <footer className="tv-hero-bottom">
        <div className="tv-hero-brand">AVANSAT<small>RISK OPERATIONS</small></div>
        <div className="tv-hero-status"><span className="tv-live"><i /> AO VIVO</span><time>Hoje, <strong>{clock.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}</strong> · {clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><button onClick={toggleFullscreen} aria-label="Alternar tela cheia" title="Tela cheia"><Maximize2 size={17} /></button><button onClick={closeTv} aria-label="Sair do modo TV" title="Sair do modo TV"><X size={18} /></button></div>
      </footer>
    </div>
  </main>;
}

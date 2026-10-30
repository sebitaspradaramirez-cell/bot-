const WORLD = [20, 0];
let map;
let marker;
let trafficLayer;
let incidentLayer;
export function initMap() {
  map = L.map('map', { zoomControl: false, preferCanvas: true, minZoom: 2, maxZoom: 18 }).setView(WORLD, 2);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  // TomTom tiles are proxied by the server so the API key stays private.
  trafficLayer = L.tileLayer('/api/traffic-tiles/flow/{z}/{x}/{y}.png', { maxZoom: 18, opacity: .78, attribution: '© TomTom', className: 'traffic-tiles' });
  incidentLayer = L.tileLayer('/api/traffic-tiles/incidents/{z}/{x}/{y}.png', { maxZoom: 18, opacity: .9 });
  map.on('zoomend moveend', updateCoverageLayers);
  updateCoverageLayers();
  return map;
}
function updateCoverageLayers() {
  if (!map || map.getZoom() < 6) { trafficLayer?.remove(); incidentLayer?.remove(); return; }
  trafficLayer.addTo(map);
  if (map.getZoom() >= 8) incidentLayer.addTo(map); else incidentLayer.remove();
}
export function focusLocation(place, zoom = 12) {
  const point = [Number(place.lat), Number(place.lon)];
  map.flyTo(point, zoom, { duration: .75 });
  if (marker) marker.remove();
  marker = L.circleMarker(point, { radius: 7, color: '#07111f', weight: 3, fillColor: '#62e6b4', fillOpacity: 1 }).addTo(map);
  marker.bindTooltip(escapeHtml(place.name || 'Ubicación seleccionada'), { direction: 'top', offset: [0, -8], className: 'location-tooltip' }).openTooltip();
}
export function resetMap() { if (marker) marker.remove(); marker = null; map.flyTo(WORLD, 2, { duration: .7 }); }
export function setMapZoom(delta) { map.setZoom(map.getZoom() + delta); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }


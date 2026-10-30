import { initMap, focusLocation, resetMap, setMapZoom } from './map.js';
import { getCurrentPosition } from './geolocation.js';
import { geocode, reverseGeocode, fetchTraffic, fetchIncidents } from './traffic.js';
import { bindChat, setChatLocation } from './chatbot.js';

const $ = selector => document.querySelector(selector);
const map = initMap();
let selected = null;
let toastTimer;
bindChat({ panel: $('#chat-panel'), openButton: $('#assistant-button'), mobileButton: $('#mobile-chat-button'), closeButton: $('#close-chat'), form: $('#chat-form'), input: $('#chat-input'), messages: $('#chat-messages') });
$('#search-form').addEventListener('submit', async event => { event.preventDefault(); const query = $('#city-search').value.trim(); if (!query) return; setBusy(true); try { const result = await geocode(query); const place = result.results?.[0]; if (!place) throw new Error('No encontramos ese lugar. Prueba con el nombre de una ciudad y país.'); await selectLocation(place, 11); } catch (error) { showToast(error.message); } finally { setBusy(false); } });
$('#locate-button').addEventListener('click', async () => { if (!window.isSecureContext && location.hostname !== 'localhost') return showToast('La ubicación requiere una conexión segura (HTTPS).'); const accepted = window.confirm('TRAFFICWORLD AI usará tu ubicación una sola vez para centrar el mapa y consultar el tráfico cercano. ¿Deseas continuar?'); if (!accepted) return; setBusy(true); try { const point = await getCurrentPosition(); const result = await reverseGeocode(point.lat, point.lon); const place = result.results?.[0] || { ...point, name: 'Mi ubicación' }; await selectLocation({ ...place, ...point }, 13); } catch (error) { showToast(error.message); } finally { setBusy(false); } });
$('#refresh-button').addEventListener('click', () => selected ? loadTraffic(selected) : showToast('Busca o selecciona una ciudad primero.'));
$('#zoom-in').addEventListener('click', () => setMapZoom(1)); $('#zoom-out').addEventListener('click', () => setMapZoom(-1)); $('#reset-view').addEventListener('click', () => { resetMap(); selected = null; setChatLocation(null); resetPanel(); });
$('#location-clear').addEventListener('click', () => { selected = null; setChatLocation(null); resetMap(); resetPanel(); });
$('#connection-label').textContent = 'Servicios listos';

async function selectLocation(place, zoom = 11) {
  const normalized = { name: place.name || place.address || 'Ubicación seleccionada', lat: Number(place.lat), lon: Number(place.lon), address: place.address || place.name || '' };
  if (!Number.isFinite(normalized.lat) || !Number.isFinite(normalized.lon)) throw new Error('No se recibieron coordenadas válidas para esa ubicación.');
  selected = normalized; focusLocation(normalized, zoom); setChatLocation(normalized);
  $('#map-city').textContent = normalized.name; $('#selected-location').textContent = normalized.name; $('#location-caption').textContent = normalized.address || `${normalized.lat.toFixed(3)}, ${normalized.lon.toFixed(3)}`;
  await loadTraffic(normalized);
}
async function loadTraffic(place) {
  $('#traffic-status').textContent = 'Consultando datos…'; $('#incident-status').textContent = 'Consultando datos…'; $('#roads-list').innerHTML = '<div class="empty-state"><strong class="loading-pulse">Consultando TomTom…</strong></div>'; $('#data-badge').textContent = 'ACTUALIZANDO';
  const results = await Promise.allSettled([fetchTraffic(place.lat, place.lon), fetchIncidents(place.lat, place.lon)]);
  const flow = results[0].status === 'fulfilled' ? results[0].value : null;
  const incidents = results[1].status === 'fulfilled' ? results[1].value : null;
  renderFlow(flow, incidents); $('#updated-at').textContent = `Actualizado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  if (!flow && !incidents) { $('#data-badge').textContent = 'SIN DATOS'; $('#connection-label').textContent = 'TomTom no disponible'; showToast(results[0].reason?.message || results[1].reason?.message || 'No hay datos para esta zona.'); }
  else { $('#data-badge').textContent = 'DATOS EN VIVO'; $('#data-badge').classList.add('is-live'); $('#connection-label').textContent = 'Conectado a TomTom'; }
}
function renderFlow(flow, incidents) {
  const segment = flow?.flowSegmentData;
  const current = Number(segment?.currentSpeed); const free = Number(segment?.freeFlowSpeed);
  const index = Number.isFinite(current) && Number.isFinite(free) && free > 0 ? Math.min(10, Math.max(0, Math.round((1 - current / free) * 10))) : null;
  $('#traffic-index').innerHTML = index === null ? '—<small>/ 10</small>' : `${index}<small>/ 10</small>`;
  $('#traffic-meter').style.width = index === null ? '0%' : `${index * 10}%`;
  $('#traffic-status').textContent = index === null ? 'Flujo no disponible' : index < 3 ? 'Flujo mayormente libre' : index < 6 ? 'Tráfico moderado' : index < 8 ? 'Tráfico intenso' : 'Congestión elevada';
  const list = $('#roads-list'); list.replaceChildren();
  if (segment) { const row = document.createElement('div'); row.className = 'road-row'; const color = index >= 8 ? 'var(--red)' : index >= 6 ? 'var(--orange)' : index >= 3 ? 'var(--amber)' : 'var(--mint)'; row.innerHTML = `<i class="road-dot" style="background:${color}"></i><div><div class="road-name"></div><div class="road-detail">Flujo de tráfico TomTom · condición observada</div></div><div class="road-speed"></div>`; row.querySelector('.road-name').textContent = segment.roadName || 'Vía cercana'; row.querySelector('.road-speed').innerHTML = `${Math.round(current)} <small>km/h</small>`; list.append(row); }
  const features = incidents?.incidents || [];
  $('#incident-count').textContent = incidents ? String(features.length) : '—'; $('#incident-status').textContent = incidents ? features.length ? 'En el área consultada' : 'Sin incidentes reportados' : 'No se pudo consultar'; $('#incident-meter').style.width = `${Math.min(features.length * 12, 100)}%`;
  features.slice(0, 3).forEach(item => { const row = document.createElement('div'); row.className = 'incident-row'; const detail = item.description || item.type || 'Incidente reportado'; row.innerHTML = '<span class="incident-pin">!</span><div><strong></strong><small></small></div>'; row.querySelector('strong').textContent = detail; row.querySelector('small').textContent = item.from || 'Incidente en el área consultada'; list.append(row); });
  if (!segment && !features.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.innerHTML = '<strong>Sin datos viales disponibles</strong><p>No hay información de flujo o incidentes para mostrar en esta consulta.</p>'; list.append(empty); }
  $('#insight-text').textContent = index === null ? 'TomTom no devolvió datos suficientes para calcular una condición vial en esta ubicación.' : `Velocidad observada de ${Math.round(current)} km/h frente a ${Math.round(free)} km/h de flujo libre${features.length ? `. Hay ${features.length} incidente(s) reportado(s) en el área consultada.` : '. No se reportan incidentes en el radio consultado.'}`;
}
function resetPanel() { $('#map-city').textContent = 'Vista global'; $('#selected-location').textContent = 'Explora el mapa'; $('#location-caption').textContent = 'Busca una ciudad para consultar sus vías'; $('#traffic-index').innerHTML = '—<small>/ 10</small>'; $('#traffic-status').textContent = 'Sin datos consultados'; $('#traffic-meter').style.width = '0%'; $('#incident-count').textContent = '—'; $('#incident-status').textContent = 'Sin datos consultados'; $('#incident-meter').style.width = '0%'; $('#data-badge').textContent = 'EN ESPERA'; $('#data-badge').classList.remove('is-live'); $('#roads-list').innerHTML = '<div class="empty-state"><span class="empty-icon">⌖</span><strong>Selecciona una ubicación</strong><p>Los datos de velocidad y congestión aparecerán aquí cuando consultes una ciudad.</p></div>'; $('#insight-text').textContent = 'Consulta una ciudad para obtener una lectura basada en datos de tráfico disponibles.'; $('#updated-at').textContent = 'Aún sin actualizar'; }
function setBusy(value) { $('#search-form').classList.toggle('loading-pulse', value); $('#search-submit')?.toggleAttribute('disabled', value); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200); }


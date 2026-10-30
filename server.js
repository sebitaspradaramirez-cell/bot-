import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
loadEnv();
const PORT = Number(process.env.PORT || 3000);
const TOMTOM_KEY = process.env.TOMTOM_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const rateBuckets = new Map();
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

const server = http.createServer(async (req, res) => {
  setCorsAndSecurity(res);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!['GET','POST'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
    if (url.pathname.startsWith('/api/')) {
      if (!allowRequest(req, res)) return;
      if (url.pathname === '/api/geocode' && req.method === 'GET') return await geocodeRoute(url, res);
      if (url.pathname === '/api/traffic' && req.method === 'GET') return await trafficRoute(url, res);
      if (url.pathname === '/api/incidents' && req.method === 'GET') return await incidentsRoute(url, res);
      if (url.pathname.startsWith('/api/traffic-tiles/') && req.method === 'GET') return await tileRoute(url, res);
      if (url.pathname === '/api/chat' && req.method === 'POST') return await chatRoute(req, res);
      return json(res, 404, { error: 'Endpoint no encontrado.' });
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Método no permitido.' });
    return await staticRoute(url.pathname, res);
  } catch (error) {
    console.error('Request error:', error.message);
    if (!res.headersSent) json(res, 500, { error: 'Error interno. Intenta de nuevo más tarde.' });
  }
});

server.listen(PORT, () => console.log(`TRAFFICWORLD AI listo en http://localhost:${PORT}`));

async function geocodeRoute(url, res) {
  if (!TOMTOM_KEY) return missingKey(res, 'TomTom');
  const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90), lon = parseCoordinate(url.searchParams.get('lon'), -180, 180);
  const query = (url.searchParams.get('q') || '').trim();
  if ((lat !== null) !== (lon !== null)) return json(res, 400, { error: 'Envía ambas coordenadas para geocodificación inversa.' });
  if (Number.isNaN(lat) || Number.isNaN(lon)) return json(res, 400, { error: 'Coordenadas inválidas.' });
  if (lat !== null) {
    const data = await tomtom(`/search/2/reverseGeocode/${lat},${lon}.json`, { radius: 1000, returnSpeedLimit: false });
    const address = data.addresses?.[0];
    return json(res, 200, { results: address ? [{ lat, lon, name: [address.address?.municipality, address.address?.countrySubdivision].filter(Boolean).join(', ') || address.address?.freeformAddress, address: address.address?.freeformAddress }] : [] });
  }
  if (!query || query.length > 120) return json(res, 400, { error: 'Escribe una ciudad o lugar (máximo 120 caracteres).' });
  const data = await tomtom(`/search/2/geocode/${encodeURIComponent(query)}.json`, { limit: 5, language: 'es-ES', typeahead: false });
  return json(res, 200, { results: (data.results || []).map(item => ({ lat: item.position.lat, lon: item.position.lon, name: [item.address.municipality || item.address.localName, item.address.countrySubdivision].filter(Boolean).join(', ') || item.address.freeformAddress, address: item.address.freeformAddress })) });
}
async function trafficRoute(url, res) {
  if (!TOMTOM_KEY) return missingKey(res, 'TomTom');
  const point = readPoint(url); if (!point) return json(res, 400, { error: 'Coordenadas inválidas.' });
  const radius = boundedNumber(url.searchParams.get('radius'), 300, 5000, 1200);
  const data = await tomtom(`/traffic/services/4/flowSegmentData/absolute/10/json`, { point: `${point.lat},${point.lon}`, unit: 'KMPH', thickness: 3 });
  return json(res, 200, { ...data, queriedAt: new Date().toISOString(), radiusMeters: radius });
}
async function incidentsRoute(url, res) {
  if (!TOMTOM_KEY) return missingKey(res, 'TomTom');
  const point = readPoint(url); if (!point) return json(res, 400, { error: 'Coordenadas inválidas.' });
  const radius = boundedNumber(url.searchParams.get('radius'), 500, 10000, 5000);
  const data = await tomtom('/traffic/services/5/incidentDetails', { bbox: makeBbox(point.lat, point.lon, radius), fields: '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to,startTime,endTime,roadNumbers}}}', language: 'es', timeValidityFilter: 'present', categoryFilter: '0,1,2,3,4,5,6,7,8,9,10,11,14' });
  const incidents = (data.incidents || []).map(item => ({ type: item.properties?.iconCategory, description: item.properties?.events?.map(event => event.description).filter(Boolean).join(', ') || categoryName(item.properties?.iconCategory), magnitude: item.properties?.magnitudeOfDelay, from: item.properties?.from, to: item.properties?.to, coordinates: item.geometry?.coordinates?.[0] }));
  return json(res, 200, { incidents, queriedAt: new Date().toISOString(), radiusMeters: radius });
}
async function tileRoute(url, res) {
  if (!TOMTOM_KEY) return send(res, 204, '');
  const match = url.pathname.match(/^\/api\/traffic-tiles\/(flow|incidents)\/(\d{1,2})\/(\d+)\/(\d+)\.png$/);
  if (!match) return json(res, 400, { error: 'Tesela de mapa inválida.' });
  const [, kind, zRaw, xRaw, yRaw] = match; const z = Number(zRaw), x = Number(xRaw), y = Number(yRaw), limit = 2 ** z;
  if (z > 18 || x >= limit || y >= limit) return json(res, 400, { error: 'Coordenadas de tesela fuera de rango.' });
  const layer = kind === 'flow' ? 'flow/relative0' : 'incidents/s0';
  const upstream = await fetch(`https://api.tomtom.com/traffic/map/4/tile/${layer}/${z}/${x}/${y}.png?key=${encodeURIComponent(TOMTOM_KEY)}`, { signal: AbortSignal.timeout(12000) });
  if (!upstream.ok) { if (upstream.status === 404) return send(res, 204, ''); throw new Error(`TomTom tile returned ${upstream.status}`); }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=120', 'X-Content-Type-Options': 'nosniff' }); res.end(Buffer.from(await upstream.arrayBuffer()));
}
async function chatRoute(req, res) {
  if (!OPENAI_KEY) return missingKey(res, 'OpenAI');
  const body = await readJson(req); const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 800) return json(res, 400, { error: 'Escribe una pregunta de hasta 800 caracteres.' });
  let point = null, locationLabel = 'sin ubicación identificada', flow = null, incidents = null;
  if (body.location && validPoint(body.location.lat, body.location.lon)) { point = { lat: Number(body.location.lat), lon: Number(body.location.lon) }; locationLabel = String(body.location.name || 'ubicación compartida').slice(0, 120); }
  if (!point) {
    const match = message.match(/(?:en|de|por|cerca de|tráfico de)\s+([\p{L}\s,.-]{2,70})/iu);
    const placeQuery = match?.[1]?.trim().replace(/[?.!,]+$/, '');
    if (placeQuery && TOMTOM_KEY) {
      try { const geo = await tomtom(`/search/2/geocode/${encodeURIComponent(placeQuery)}.json`, { limit: 1, language: 'es-ES' }); const first = geo.results?.[0]; if (first) { point = first.position; locationLabel = first.address?.freeformAddress || placeQuery; } } catch {}
    }
  }
  if (point && TOMTOM_KEY) {
    const [flowResult, incidentResult] = await Promise.allSettled([tomtom('/traffic/services/4/flowSegmentData/absolute/10/json', { point: `${point.lat},${point.lon}`, unit: 'KMPH', thickness: 3 }), tomtom('/traffic/services/5/incidentDetails', { bbox: makeBbox(point.lat, point.lon, 5000), fields: '{incidents{type,properties{iconCategory,magnitudeOfDelay,events{description},from,to}}}', language: 'es', timeValidityFilter: 'present' })]);
    flow = flowResult.status === 'fulfilled' ? flowResult.value.flowSegmentData : null; incidents = incidentResult.status === 'fulfilled' ? incidentResult.value.incidents || [] : null;
  }
  const data = { location: locationLabel, flow: flow ? { road: flow.roadName || null, currentSpeedKmh: flow.currentSpeed, freeFlowSpeedKmh: flow.freeFlowSpeed, confidence: flow.confidence } : null, incidents: incidents?.map(item => ({ type: categoryName(item.properties?.iconCategory), description: item.properties?.events?.map(e => e.description).filter(Boolean).join(', '), from: item.properties?.from, to: item.properties?.to, delayMagnitude: item.properties?.magnitudeOfDelay })) ?? null, retrievedAt: new Date().toISOString() };
  const dataNote = flow || incidents !== null ? `Datos consultados de TomTom · ${new Date(data.retrievedAt).toLocaleString('es-CO')}` : 'No se obtuvieron datos de tráfico suficientes para esta pregunta.';
  const prompt = `Eres TrafficWorld Assistant, un asistente vial que responde en español. Usa exclusivamente los datos JSON proporcionados para afirmar condiciones, velocidades, nombres de vías o incidentes. Nunca inventes. Si los datos no bastan, dilo claramente y pide una ciudad o ubicación concreta. Distingue que el flujo es una medición de un segmento cercano, no una estadística para toda la ciudad. Resume incidentes solo si aparecen en el JSON. No afirmes tiempos de viaje ni cierres sin datos. Pregunta del usuario: ${message}\nDatos verificados: ${JSON.stringify(data)}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: OPENAI_MODEL, input: prompt, max_output_tokens: 350 }), signal: AbortSignal.timeout(30000) });
  const result = await response.json().catch(() => ({})); if (!response.ok) { console.error('OpenAI error:', result.error?.message || response.status); return json(res, 502, { error: 'El asistente no pudo responder ahora. Verifica la configuración de OpenAI.' }); }
  const answer = result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
  return json(res, 200, { answer: answer || 'No pude generar una respuesta. Intenta de nuevo.', dataNote });
}
async function tomtom(path, params) {
  const query = new URLSearchParams({ ...params, key: TOMTOM_KEY });
  const response = await fetch(`https://api.tomtom.com${path}?${query}`, { signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({})); if (!response.ok) { console.error('TomTom error:', response.status, data.error?.description || ''); throw Object.assign(new Error('TomTom no pudo devolver datos para esta ubicación.'), { status: response.status }); } return data;
}
async function staticRoute(pathname, res) {
  const path = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = resolve(ROOT, path); if (!file.startsWith(`${resolve(ROOT)}${sep}`) && file !== resolve(ROOT, 'index.html')) return json(res, 403, { error: 'Acceso denegado.' });
  try { const content = await readFile(file); const ext = extname(file).toLowerCase(); res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.end(content); }
  catch { json(res, 404, { error: 'Archivo no encontrado.' }); }
}
function readPoint(url) { const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90), lon = parseCoordinate(url.searchParams.get('lon'), -180, 180); return lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon) ? null : { lat, lon }; }
function parseCoordinate(value, min, max) { if (value === null || value.trim() === '') return null; const num = Number(value); return Number.isFinite(num) && num >= min && num <= max ? num : NaN; }
function validPoint(lat, lon) { const a = Number(lat), b = Number(lon); return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(b) && b >= -180 && b <= 180; }
function boundedNumber(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function makeBbox(lat, lon, radius) { const dLat = radius / 111320, dLon = radius / (111320 * Math.max(.2, Math.cos(lat * Math.PI / 180))); return `${Math.max(-90, lat - dLat)},${Math.max(-180, lon - dLon)},${Math.min(90, lat + dLat)},${Math.min(180, lon + dLon)}`; }
function categoryName(code) { return ({ 0:'Accidente', 1:'Accidente', 2:'Accidente', 3:'Cierre', 4:'Obras viales', 5:'Peligro en la vía', 6:'Incidente', 7:'Restricción', 8:'Incidente', 9:'Incidente', 10:'Condición meteorológica', 11:'Incidente', 14:'Congestión' })[Number(code)] || 'Incidente vial'; }
function setCorsAndSecurity(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('Permissions-Policy', 'geolocation=(self)'); res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"); }
function allowRequest(req, res) { const key = req.socket.remoteAddress || 'unknown', now = Date.now(); const bucket = rateBuckets.get(key) || { start: now, count: 0 }; if (now - bucket.start > 60000) { bucket.start = now; bucket.count = 0; } bucket.count++; rateBuckets.set(key, bucket); if (bucket.count > 90) { json(res, 429, { error: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.' }); return false; } return true; }
function readJson(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 20000) { reject(new Error('Payload too large')); req.destroy(); } }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); } }); req.on('error', reject); }); }
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function send(res, status, body) { res.writeHead(status); res.end(body); }
function missingKey(res, provider) { return json(res, 503, { error: `Falta configurar la clave de ${provider} en el archivo .env.` }); }
function loadEnv() { try { const content = requireEnvFile(); for (const line of content.split(/\r?\n/)) { const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2'); } } catch {} }
function requireEnvFile() { return readFileSync(resolve(ROOT, '.env'), 'utf8'); }
import { readFileSync } from 'node:fs';


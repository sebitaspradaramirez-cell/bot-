export async function fetchTraffic(lat, lon, radius = 1200) {
  const query = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) });
  return request(`/api/traffic?${query}`);
}
export async function fetchIncidents(lat, lon, radius = 5000) {
  const query = new URLSearchParams({ lat: String(lat), lon: String(lon), radius: String(radius) });
  return request(`/api/incidents?${query}`);
}
export async function geocode(query) {
  const params = new URLSearchParams({ q: query });
  return request(`/api/geocode?${params}`);
}
export async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  return request(`/api/geocode?${params}`);
}
export async function askAssistant(message, location) {
  return request('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, location }) });
}
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `La solicitud falló (${response.status}).`);
  return data;
}


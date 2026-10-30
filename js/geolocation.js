export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este navegador no ofrece geolocalización. Puedes buscar una ciudad manualmente.'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy }),
      error => reject(new Error(error.code === 1 ? 'No se autorizó el acceso a tu ubicación. Puedes buscar una ciudad manualmente.' : error.code === 3 ? 'La ubicación tardó demasiado. Intenta de nuevo o busca una ciudad.' : 'No se pudo obtener tu ubicación. Revisa los permisos del navegador.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}


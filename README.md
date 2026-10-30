# TRAFFICWORLD AI

Aplicación web de movilidad con mapa global, tráfico TomTom en vivo, geolocalización bajo solicitud y asistente con OpenAI. La interfaz usa HTML, CSS y JavaScript vanilla; el servidor usa Node.js sin dependencias de ejecución.

## Requisitos

- Node.js 20 o superior.
- Una clave de TomTom con acceso a Geocoding, Traffic Flow, Traffic Incidents y Traffic Map.
- Una clave de OpenAI para las respuestas del asistente.

## Configurar y ejecutar

1. Copia `.env.example` como `.env`.
2. Completa `TOMTOM_API_KEY` y `OPENAI_API_KEY`. Puedes cambiar `OPENAI_MODEL` y `PORT`.
3. Ejecuta `npm start` y abre `http://localhost:3000`.

Las claves solo se leen desde el servidor y nunca se envían al navegador. No subas `.env` al repositorio. Para geolocalización fuera de `localhost`, sirve la aplicación bajo HTTPS.

## Publicar en Render

El repositorio incluye `render.yaml` como Blueprint para desplegar el servidor Node y la interfaz en un solo servicio. En Render, conecta tu cuenta de GitHub, crea un Blueprint nuevo y selecciona este repositorio. Durante la configuración inicial, Render solicitará `TOMTOM_API_KEY` y `OPENAI_API_KEY`; introdúcelas como secretos en el panel de Render, nunca en GitHub. Al terminar el primer despliegue, Render asignará una dirección pública `onrender.com` y podrá reconstruir el sitio cuando se actualice la rama `main`.

## Funciones

- Búsqueda mundial de ciudades con geocodificación TomTom.
- Mapa Leaflet con calles de OpenStreetMap y capas TomTom de flujo e incidentes, servidas por un proxy del backend.
- Panel con la velocidad del segmento consultado e incidentes dentro del área consultada. El índice es una comparación de velocidad observada con velocidad de flujo libre, no un promedio de ciudad.
- Geolocalización de una sola vez tras confirmación del usuario y permiso del navegador.
- Chat de movilidad contextualizado con datos TomTom. Si faltan datos, el asistente debe decirlo.
- Validación de parámetros, límites básicos de solicitudes, errores controlados y cabeceras de seguridad.

## Privacidad y datos

La ubicación solo se solicita después de pulsar el botón y confirmar el aviso. Las coordenadas se usan para una consulta puntual y no se guardan. Los mapas base usan OpenStreetMap; tráfico e incidentes dependen de la cobertura, disponibilidad y cuota de las APIs configuradas. Las capas de tráfico aparecen al acercar el mapa a nivel de ciudad.

## APIs

- TomTom Search API: geocodificación y geocodificación inversa.
- TomTom Traffic Flow Segment Data API: velocidad actual y flujo libre del segmento cercano.
- TomTom Traffic Incident Details API y Traffic Map API: incidentes y teselas de tráfico.
- OpenAI Responses API: respuesta en español usando el contexto vial consultado.


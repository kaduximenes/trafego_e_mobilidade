// Provedores de tiles públicos do Leaflet, sem chave de API.
// A ordem do array define a ordem dos botões no filtro "Tipo de mapa".
// Observação: os placeholders são os do Leaflet — {s} subdomínio e {z}/{x}/{y}
// coordenadas. {r} (variante retina) é evitado de propósito porque depende de
// detectRetina. O ArcGIS usa {z}/{y}/{x} (linha antes da coluna).
// O cinza vem da Esri justamente por NÃO depender de basemaps.cartocdn.com, que
// não carrega em algumas redes corporativas.
export const BASEMAPS = [
  {
    id: 'street',
    label: 'Rua',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  {
    id: 'gray',
    label: 'Cinza',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, DeLorme, HERE',
    maxZoom: 16,
  },
]

export function getBasemap(id) {
  return BASEMAPS.find((basemap) => basemap.id === id) || BASEMAPS[0]
}

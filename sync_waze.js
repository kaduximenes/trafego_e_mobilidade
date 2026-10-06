import fs from 'fs';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

const WAZE_URL = 'https://www.waze.com/row-partnerhub-api/partners/11633596527/waze-feeds/e8185b12-350b-47cc-88fd-44b72765d111';
export const OUTPUT_PATH = './waze_irregularities.geojson';

// O feed cobre a região metropolitana; o painel usa somente o município do Rio.
// Itens sem cidade informada pelo Waze ficam de fora, por não ser possível confirmar o município.
const MUNICIPIO = 'Rio de Janeiro';
const noMunicipio = (item) => item.city === MUNICIPIO;

// Rótulos dos subtipos de alerta do Waze
const TITULOS_ALERTA = {
  ACCIDENT_MINOR: 'Acidente leve',
  ACCIDENT_MAJOR: 'Acidente grave',
  ROAD_CLOSED_EVENT: 'Via interditada (evento)',
  ROAD_CLOSED_CONSTRUCTION: 'Via interditada (obra)',
  ROAD_CLOSED_HAZARD: 'Via interditada (perigo)',
  JAM_MODERATE_TRAFFIC: 'Trânsito moderado',
  JAM_HEAVY_TRAFFIC: 'Trânsito intenso',
  JAM_STAND_STILL_TRAFFIC: 'Trânsito parado',
  HAZARD_ON_ROAD: 'Perigo na pista',
  HAZARD_ON_ROAD_POT_HOLE: 'Buraco na pista',
  HAZARD_ON_ROAD_LANE_CLOSED: 'Faixa interditada',
  HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT: 'Semáforo com defeito',
  HAZARD_ON_ROAD_CONSTRUCTION: 'Obra na pista',
  HAZARD_ON_ROAD_OBJECT: 'Objeto na pista',
  HAZARD_ON_ROAD_CAR_STOPPED: 'Carro parado na pista',
  HAZARD_ON_SHOULDER_CAR_STOPPED: 'Carro parado no acostamento',
  HAZARD_ON_SHOULDER_ANIMALS: 'Animais no acostamento',
  HAZARD_WEATHER: 'Clima adverso',
  HAZARD_WEATHER_FLOOD: 'Alagamento',
  HAZARD_WEATHER_FOG: 'Neblina'
};
const TITULOS_GRUPO = {
  acidente: 'Acidente',
  interdicao: 'Via interditada',
  transito: 'Trânsito reportado',
  outros: 'Perigo na via'
};

// Pino oficial do Waze para cada subtipo de alerta (mesmo mapeamento do Live Map do Waze);
// o nome corresponde a um arquivo map-pin-{nome}.svg da biblioteca de ícones web do Waze
const PINOS_SUBTIPO = {
  ACCIDENT_MINOR: 'accident-minor',
  ACCIDENT_MAJOR: 'accident-major',
  JAM_LIGHT_TRAFFIC: 'jam-level-1',
  JAM_MODERATE_TRAFFIC: 'jam-level-2',
  JAM_HEAVY_TRAFFIC: 'jam-level-3',
  JAM_STAND_STILL_TRAFFIC: 'jam-level-4',
  HAZARD_ON_ROAD: 'hazard-on-road',
  HAZARD_ON_ROAD_CAR_STOPPED: 'car-stopped',
  HAZARD_ON_ROAD_CONSTRUCTION: 'construction',
  HAZARD_ON_ROAD_EMERGENCY_VEHICLE: 'emergency-vehicle',
  HAZARD_ON_ROAD_ICE: 'ice-on-road',
  HAZARD_ON_ROAD_LANE_CLOSED: 'lane-closure',
  HAZARD_ON_ROAD_OBJECT: 'object-on-road',
  HAZARD_ON_ROAD_OIL: 'slippery-road',
  HAZARD_ON_ROAD_POT_HOLE: 'pothole',
  HAZARD_ON_ROAD_ROAD_KILL: 'roadkill',
  HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT: 'broken-light',
  HAZARD_ON_SHOULDER_ANIMALS: 'animals',
  HAZARD_ON_SHOULDER_CAR_STOPPED: 'car-stopped',
  HAZARD_WEATHER: 'bad-weather',
  HAZARD_WEATHER_FLOOD: 'flood',
  HAZARD_WEATHER_FOG: 'fog',
  HAZARD_WEATHER_HAIL: 'hail',
  HAZARD_WEATHER_HEAVY_SNOW: 'unplowed-road'
};
const PINOS_TIPO = {
  ACCIDENT: 'accident-major',
  JAM: 'jam-level-4',
  HAZARD: 'hazard',
  ROAD_CLOSED: 'closure'
};

// Grupo do alerta, usado nos filtros do painel
function grupoDoAlerta(alerta) {
  if (alerta.type === 'ACCIDENT') return 'acidente';
  if (alerta.type === 'ROAD_CLOSED') return 'interdicao';
  if (alerta.type === 'JAM') return 'transito';
  if (alerta.subtype === 'HAZARD_WEATHER_FLOOD') return 'alagamento';
  if (alerta.subtype === 'HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT') return 'semaforo';
  if (alerta.subtype === 'HAZARD_ON_ROAD_POT_HOLE') return 'buraco';
  return 'outros';
}

// Consulta o feed do Waze e devolve em GeoJSON as irregularidades (trânsito atípico, categoria "unusual"),
// os engarrafamentos comuns (categoria "engarrafamento"), ambos com jamLevel de 1 a 5,
// e os alertas reportados pelos usuários (categoria "alerta": acidentes, interdições, perigos).
// metadata.versao muda somente quando o conteúdo muda.
export async function lerWaze() {
  const res = await fetch(WAZE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) COR-Rio/1.0'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${res.statusText}`);
  }

  const data = await res.json();
  const irregularities = (data.irregularities || []).filter(noMunicipio);

  // Converter para GeoJSON
  const features = [];

  for (const item of irregularities) {
    if (!item.line || item.line.length < 2) continue;

    // Converter pontos [{x, y}, ...] em coordenadas GeoJSON [[lng, lat], ...]
    const coordinates = item.line.map(pt => [pt.x, pt.y]);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: coordinates
      },
      properties: {
        categoria: 'unusual',
        id: item.id,
        street: item.street || 'Via sem nome',
        city: item.city || 'Rio de Janeiro',
        speed: item.speed ? Math.round(item.speed) : 0,
        regularSpeed: item.regularSpeed ? Math.round(item.regularSpeed) : 0,
        delaySeconds: item.delaySeconds || 0,
        delayMinutes: Math.round((item.delaySeconds || 0) / 60),
        jamLevel: item.jamLevel || 1,
        severity: item.severity || 1,
        driversCount: item.driversCount || 0,
        type: item.type || 'TRAFFIC_JAM',
        detectionDate: item.detectionDate || '',
        detectionMillis: Number(item.detectionDateMillis) || 0,
        endNode: item.endNode || '',
        length: item.length || 0,
        trend: item.trend || 0 // -1 = melhorando, 0 = estável, 1 = piorando
      }
    });
  }

  const totalUnusual = features.length;

  for (const jam of (data.jams || []).filter(noMunicipio)) {
    if (!jam.line || jam.line.length < 2) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: jam.line.map(pt => [pt.x, pt.y])
      },
      properties: {
        categoria: 'engarrafamento',
        id: jam.uuid,
        street: jam.street || 'Via sem nome',
        city: jam.city || '',
        speed: jam.speedKMH ? Math.round(jam.speedKMH) : 0,
        delaySeconds: jam.delay || 0, // -1 = via bloqueada
        delayMinutes: Math.round(Math.max(jam.delay || 0, 0) / 60),
        jamLevel: jam.level || 1,
        length: jam.length || 0
      }
    });
  }

  const totalEngarrafamentos = features.length - totalUnusual;

  for (const alerta of (data.alerts || []).filter(noMunicipio)) {
    if (!alerta.location) continue;
    const grupo = grupoDoAlerta(alerta);

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [alerta.location.x, alerta.location.y]
      },
      properties: {
        categoria: 'alerta',
        id: alerta.uuid,
        grupo,
        pino: PINOS_SUBTIPO[alerta.subtype] || PINOS_TIPO[alerta.type] || 'hazard',
        titulo: TITULOS_ALERTA[alerta.subtype] || TITULOS_GRUPO[grupo] || 'Alerta',
        street: alerta.street || 'Via sem nome',
        city: alerta.city || '',
        pubMillis: alerta.pubMillis || 0,
        reliability: alerta.reliability || 0, // confiabilidade do relato, de 0 a 10
        nThumbsUp: alerta.nThumbsUp || 0,
        reportDescription: alerta.reportDescription || '',
        reportByMunicipalityUser: alerta.reportByMunicipalityUser === 'true'
      }
    });
  }

  const agora = new Date().toISOString();
  return {
    type: 'FeatureCollection',
    metadata: {
      atualizadoEm: agora, // última leitura do feed
      geradoEm: data.endTimeMillis ? new Date(data.endTimeMillis).toISOString() : agora, // momento em que o Waze gerou o feed
      alteradoEm: agora,   // última vez em que o conteúdo mudou
      versao: crypto.createHash('sha1').update(JSON.stringify(features)).digest('hex'),
      total: features.length,
      totalUnusual,
      totalEngarrafamentos,
      totalAlertas: features.length - totalUnusual - totalEngarrafamentos
    },
    features: features
  };
}

export function salvarWaze(geojson) {
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson, null, 2), 'utf8');
}

// Execução direta: node sync_waze.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Consultando feed de irregularidades do Waze...');
  try {
    const geojson = await lerWaze();
    salvarWaze(geojson);
    console.log(`Salvo com sucesso em ${OUTPUT_PATH} com ${geojson.features.length} ocorrências de trânsito.`);
  } catch (err) {
    console.error('Erro ao sincronizar Waze:', err.message);
    // Se falhar e não existir arquivo, criar um GeoJSON vazio válido
    if (!fs.existsSync(OUTPUT_PATH)) {
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ type: 'FeatureCollection', features: [] }), 'utf8');
    }
  }
}

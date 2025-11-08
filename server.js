// server.js - VERSION AVEC BIOMES DIVERSIFIÉS
const fastify = require('fastify')({ logger: true });
const fs = require('fs');
const path = require('path');

// Charger les données au démarrage
let gameMapData;
let biomeMappingData;
let resourceMappingData;

try {
  gameMapData = JSON.parse(fs.readFileSync(path.join(__dirname, 'map', 'game_map.json'), 'utf8'));
  biomeMappingData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mapping', 'var_biome_map.json'), 'utf8'));
  resourceMappingData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mapping', 'biome_ressource_map.json'), 'utf8'));
  console.log('✅ Fichiers JSON chargés avec succès');
} catch (error) {
  console.error('❌ Erreur lors du chargement des fichiers JSON:', error);
  process.exit(1);
}

const CELL_SIZE = gameMapData.metadata.cell_size || gameMapData.metadata.hex_size || 1.0;

// ========================================
// NOUVELLE LOGIQUE DE DIVERSIFICATION
// ========================================

/**
 * Hash simple pour générer un nombre pseudo-aléatoire déterministe à partir de coordonnées
 */
function coordHash(q, r) {
  // Utilise une combinaison de q et r pour générer un hash
  const x = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Groupes de biomes compatibles (biomes qui peuvent coexister dans des zones similaires)
 */
const biomeGroups = {
  'polaire': ['polaire', 'toundra', 'montagneuse', 'ocean_polaire'],
  'toundra': ['toundra', 'polaire', 'taiga', 'montagneuse', 'ocean_polaire'],
  'taiga': ['taiga', 'toundra', 'temperee_humide', 'montagneuse', 'ocean_tempere'],
  'temperee_humide': ['temperee_humide', 'taiga', 'temperee_seche', 'cotiere', 'ocean_tempere'],
  'temperee_seche': ['temperee_seche', 'temperee_humide', 'mediterraneenne', 'savane'],
  'mediterraneenne': ['mediterraneenne', 'temperee_seche', 'cotiere', 'desertique', 'ocean_tempere'],
  'desertique': ['desertique', 'mediterraneenne', 'savane'],
  'savane': ['savane', 'desertique', 'temperee_seche', 'tropicale_humide'],
  'tropicale_humide': ['tropicale_humide', 'savane', 'equatoriale', 'cotiere', 'ocean_tropical'],
  'equatoriale': ['equatoriale', 'tropicale_humide', 'ocean_tropical'],
  'montagneuse': ['montagneuse', 'polaire', 'toundra', 'taiga', 'temperee_humide'],
  'cotiere': ['cotiere', 'ocean_tempere', 'ocean_tropical', 'temperee_humide', 'mediterraneenne', 'tropicale_humide'],
  'ocean_polaire': ['ocean_polaire', 'polaire', 'toundra', 'ocean_tempere', 'ocean_profond'],
  'ocean_tempere': ['ocean_tempere', 'ocean_polaire', 'ocean_tropical', 'cotiere', 'temperee_humide', 'ocean_profond'],
  'ocean_tropical': ['ocean_tropical', 'ocean_tempere', 'equatoriale', 'tropicale_humide', 'cotiere', 'ocean_profond'],
  'ocean_profond': ['ocean_profond', 'ocean_polaire', 'ocean_tempere', 'ocean_tropical']
};

/**
 * Calcule le score de correspondance d'une cellule avec un biome
 */
function calculateBiomeScore(cell, biomeRanges) {
  let score = 0;
  let totalVariables = 0;

  const variables = ['t2m', 'd2m', 'tp', 'ssr', 'sst', 'msl', 'cl', 'u10', 'v10'];

  for (const variable of variables) {
    if (cell[variable] && biomeRanges[variable]) {
      totalVariables++;
      const value = cell[variable].mean;
      const min = biomeRanges[variable].min;
      const max = biomeRanges[variable].max;

      if (value >= min && value <= max) {
        score++;
      } else {
        const range = max - min;
        let distance;
        if (value < min) {
          distance = (min - value) / range;
        } else {
          distance = (value - max) / range;
        }
        score += Math.max(0, 1 - distance);
      }
    }
  }

  return totalVariables > 0 ? score / totalVariables : 0;
}

/**
 * Détermine si une cellule est terrestre ou marine basé sur les données
 * Approche basée sur l'écart-type (std) de SST : océan = plus stable
 */
function isLandCell(cell) {
  // MÉTHODE 1: Vérifier l'écart-type de SST
  // L'océan a une SST très stable (std proche de 0)
  // La terre a des variations importantes
  if (cell.sst && cell.sst.std !== undefined) {
    // Si SST a un std très faible (<0.5K), c'est probablement de l'océan
    if (cell.sst.std < 0.5) {
      // Double-vérification: température cohérente avec l'eau
      if (cell.sst.mean > 271) { // Eau liquide
        return false; // C'est l'océan
      }
    }
    
    // Si SST varie beaucoup (std > 2K), c'est de la terre
    if (cell.sst.std > 2.0) {
      return true;
    }
  }
  
  // MÉTHODE 2: Différence absolue entre t2m et sst
  if (cell.t2m && cell.t2m.mean && cell.sst && cell.sst.mean) {
    const tempDiff = Math.abs(cell.t2m.mean - cell.sst.mean);
    
    // Sur océan, t2m et sst sont généralement très proches (<3K)
    // Sur terre, la différence peut être grande (>10K)
    if (tempDiff > 10) {
      return true; // Terre
    }
    
    // Si SST beaucoup plus chaud que t2m en zone froide = terre gelée
    if (cell.t2m.mean < 273 && cell.sst.mean > cell.t2m.mean + 15) {
      return true;
    }
  }
  
  // MÉTHODE 3: Pression atmosphérique
  if (cell.msl && cell.msl.mean) {
    // Haute altitude = terre
    if (cell.msl.mean < 95000) {
      return true;
    }
    
    // Pression très haute et constante = possible haute mer
    if (cell.msl.mean > 102000 && cell.msl.std < 50) {
      return false;
    }
  }
  
  // MÉTHODE 4: Précipitations très faibles + SST stable = océan calme
  if (cell.tp && cell.tp.mean && cell.sst && cell.sst.std !== undefined) {
    if (cell.tp.mean < 0.001 && cell.sst.std < 1.0) {
      return false; // Océan
    }
  }
  
  // MÉTHODE 5: Vitesse du vent très élevée + SST stable = océan ouvert
  if (cell.u10 && cell.v10 && cell.sst && cell.sst.std !== undefined) {
    const windSpeed = Math.sqrt(cell.u10.mean ** 2 + cell.v10.mean ** 2);
    if (windSpeed > 15 && cell.sst.std < 1.0) {
      return false; // Océan
    }
  }
  
  // Par défaut : considérer comme terre si incertain
  // (préférable d'avoir un biome terrestre incorrect qu'un océan sur terre)
  return true;
}

/**
 * Biomes terrestres uniquement
 */
const landBiomes = [
  'polaire', 'toundra', 'taiga', 'temperee_humide', 'temperee_seche',
  'mediterraneenne', 'desertique', 'savane', 'tropicale_humide',
  'equatoriale', 'montagneuse', 'cotiere'
];

/**
 * Biomes marins uniquement
 */
const oceanBiomes = [
  'ocean_polaire', 'ocean_tempere', 'ocean_tropical', 'ocean_profond'
];

/**
 * NOUVELLE FONCTION : Détermine le biome avec diversification basée sur les coordonnées
 */
function determineBiomeWithDiversity(cell, q, r) {
  // 0. Déterminer si c'est terre ou mer
  const isLand = isLandCell(cell);
  
  // 1. Calculer les scores pour tous les biomes appropriés
  const biomeScores = [];
  const allowedBiomes = isLand ? landBiomes : oceanBiomes;
  
  for (const [biomeName, biomeRanges] of Object.entries(biomeMappingData)) {
    if (!allowedBiomes.includes(biomeName)) continue;
    
    const score = calculateBiomeScore(cell, biomeRanges);
    biomeScores.push({ biome: biomeName, score });
  }
  
  // Si aucun biome trouvé, fallback
  if (biomeScores.length === 0) {
    return {
      biome: isLand ? 'temperee_humide' : 'ocean_tempere',
      score: 0,
      alternatives: [],
      diversity_factor: '0.000',
      isLand: isLand
    };
  }
  
  // Trier par score décroissant
  biomeScores.sort((a, b) => b.score - a.score);
  
  // 2. Obtenir les top 3 biomes
  const topBiomes = biomeScores.slice(0, 3);
  
  // 3. Filtrer pour garder seulement les biomes compatibles entre eux
  const primaryBiome = topBiomes[0].biome;
  const compatibleBiomes = biomeGroups[primaryBiome] || [primaryBiome];
  
  const candidateBiomes = topBiomes.filter(b => 
    compatibleBiomes.includes(b.biome) && 
    allowedBiomes.includes(b.biome) && 
    b.score > 0.3
  );
  
  // Si pas assez de candidats, utiliser les top biomes
  const finalCandidates = candidateBiomes.length > 0 ? candidateBiomes : topBiomes.slice(0, 2);
  
  // 4. Utiliser le hash des coordonnées pour choisir parmi les candidats
  const hash = coordHash(q, r);
  const index = Math.floor(hash * finalCandidates.length);
  
  const selectedBiome = finalCandidates[index].biome;
  
  return {
    biome: selectedBiome,
    score: finalCandidates[index].score,
    alternatives: finalCandidates.map(b => b.biome),
    diversity_factor: hash.toFixed(3),
    isLand: isLand
  };
}

/**
 * AMÉLIORATION : Génère des ressources avec variation basée sur les coordonnées
 */
function generateResourcesWithVariation(biome, q, r) {
  const baseResources = resourceMappingData[biome] || {};
  const hash = coordHash(q * 1.5, r * 2.3); // Hash différent pour les ressources
  
  const resources = {};
  
  for (const [resource, baseProbability] of Object.entries(baseResources)) {
    // Variation de ±20% autour de la probabilité de base
    const variation = (hash - 0.5) * 0.4;
    const adjustedProb = Math.max(0.05, Math.min(0.95, baseProbability + variation));
    
    // Déterminer la quantité/qualité
    const resourceHash = coordHash(q * 3.7 + resource.length, r * 5.1);
    
    let abundance, quality;
    if (adjustedProb > 0.25) {
      if (resourceHash > 0.7) {
        abundance = 'high';
        quality = resourceHash > 0.85 ? 'excellent' : 'good';
      } else if (resourceHash > 0.3) {
        abundance = 'medium';
        quality = resourceHash > 0.5 ? 'good' : 'average';
      } else {
        abundance = 'low';
        quality = 'average';
      }
      
      resources[resource] = {
        abundance,
        quality,
        probability: adjustedProb.toFixed(3)
      };
    }
  }
  
  return resources;
}

// ========================================
// FONCTIONS DE CONVERSION (inchangées)
// ========================================

function latLonToGridCoords(lat, lon, cellSize) {
  const q = Math.floor((lon + 180) / cellSize);
  
  let r = 0;
  let currentLat = -85;
  
  while (currentLat < lat && currentLat < 85) {
    const latRad = (currentLat * Math.PI) / 180;
    const latHeight = cellSize * Math.cos(latRad);
    
    if (currentLat + latHeight > lat) {
      break;
    }
    
    currentLat += latHeight;
    r++;
  }
  
  return { q, r };
}

function gridCoordsToLatLon(q, r, cellSize) {
  const lon = -180 + (q * cellSize);
  
  let lat = -85;
  for (let i = 0; i < r; i++) {
    const latRad = (lat * Math.PI) / 180;
    const latHeight = cellSize * Math.cos(latRad);
    lat += latHeight;
  }
  
  return { lat, lon };
}

function findNearestCell(lat, lon) {
  let nearestCell = null;
  let minDistance = Infinity;
  let nearestId = null;

  for (const [id, cellData] of Object.entries(gameMapData.tiles)) {
    const distance = Math.sqrt(
      Math.pow(cellData.lat - lat, 2) + 
      Math.pow(cellData.lon - lon, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestCell = cellData;
      nearestId = id;
    }
  }

  return { cell: nearestCell, id: nearestId, distance: minDistance };
}

// ========================================
// ROUTES API (modifiées)
// ========================================

fastify.register(require('@fastify/cors'), {
  origin: '*'
});

// Route 1: Obtenir les données d'une cellule par coordonnées de grille (q,r)
fastify.get('/cell/grid/:q/:r', async (request, reply) => {
  try {
    const q = parseInt(request.params.q);
    const r = parseInt(request.params.r);
    
    if (isNaN(q) || isNaN(r)) {
      return reply.code(400).send({ error: 'Coordonnées invalides' });
    }

    const { lat, lon } = gridCoordsToLatLon(q, r, CELL_SIZE);
    const { cell, id, distance } = findNearestCell(lat, lon);
    
    if (!cell) {
      return reply.code(404).send({ 
        error: 'Aucune donnée disponible',
        gridCoords: { q, r },
        calculatedPosition: { lat, lon }
      });
    }

    // NOUVELLE LOGIQUE : Biome diversifié
    const biomeInfo = determineBiomeWithDiversity(cell, q, r);
    const resources = generateResourcesWithVariation(biomeInfo.biome, q, r);

    return {
      gridCoords: { q, r },
      position: {
        calculated: { lat, lon },
        actual: { lat: cell.lat, lon: cell.lon }
      },
      biome: biomeInfo.biome,
      biome_info: {
        score: biomeInfo.score,
        alternatives: biomeInfo.alternatives,
        diversity_factor: biomeInfo.diversity_factor
      },
      resources,
      data: cell,
      metadata: {
        dataId: id,
        distance: distance.toFixed(4),
        algorithm: 'climate_with_coord_diversity'
      }
    };
  } catch (error) {
    console.error('Erreur:', error);
    reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Route 2: Obtenir les données d'une cellule par lat/lon
fastify.get('/cell/latlon', async (request, reply) => {
  try {
    const { lat, lon } = request.query;
    
    if (!lat || !lon) {
      return reply.code(400).send({ error: 'Paramètres lat et lon requis' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    
    const { q, r } = latLonToGridCoords(latitude, longitude, CELL_SIZE);
    const { cell, id, distance } = findNearestCell(latitude, longitude);
    
    if (!cell) {
      return reply.code(404).send({ 
        error: 'Aucune donnée disponible',
        queriedPosition: { lat: latitude, lon: longitude },
        gridCoords: { q, r }
      });
    }

    const biomeInfo = determineBiomeWithDiversity(cell, q, r);
    const resources = generateResourcesWithVariation(biomeInfo.biome, q, r);

    return {
      queriedPosition: { lat: latitude, lon: longitude },
      gridCoords: { q, r },
      actualPosition: { lat: cell.lat, lon: cell.lon },
      biome: biomeInfo.biome,
      biome_info: {
        score: biomeInfo.score,
        alternatives: biomeInfo.alternatives,
        diversity_factor: biomeInfo.diversity_factor
      },
      resources,
      data: cell,
      metadata: {
        dataId: id,
        distance: distance.toFixed(4),
        cellSize: CELL_SIZE,
        algorithm: 'climate_with_coord_diversity'
      }
    };
  } catch (error) {
    console.error('Erreur:', error);
    reply.code(500).send({ error: 'Erreur serveur' });
  }
});

// Route 3: Métadonnées de la map
fastify.get('/map/metadata', async (request, reply) => {
  return {
    cellSize: CELL_SIZE,
    tileCount: gameMapData.metadata.tile_count,
    variables: gameMapData.metadata.variables,
    gridType: 'square',
    biomeAlgorithm: 'climate_with_coord_diversity',
    bounds: {
      lat: { min: -85, max: 85 },
      lon: { min: -180, max: 180 }
    }
  };
});

// Route 4: Stats générales (AMÉLIORÉE)
fastify.get('/map/stats', async (request, reply) => {
  try {
    const biomeStats = {};
    let totalCells = 0;
    const variableRanges = {};
    const sampleSize = 5000; // Échantillon pour performance

    // Prendre un échantillon de cellules
    const cellIds = Object.keys(gameMapData.tiles);
    const step = Math.max(1, Math.floor(cellIds.length / sampleSize));

    for (let i = 0; i < cellIds.length; i += step) {
      const id = cellIds[i];
      const cellData = gameMapData.tiles[id];
      
      // Extraire q,r depuis l'ID (format "q,r")
      const [q, r] = id.split(',').map(Number);
      
      const biomeInfo = determineBiomeWithDiversity(cellData, q, r);
      const biome = biomeInfo.biome;
      
      if (!biomeStats[biome]) {
        biomeStats[biome] = 0;
      }
      biomeStats[biome]++;
      totalCells++;

      // Calculer les ranges de variables
      for (const variable of gameMapData.metadata.variables || []) {
        if (cellData[variable] && cellData[variable].mean !== undefined) {
          if (!variableRanges[variable]) {
            variableRanges[variable] = {
              min: cellData[variable].mean,
              max: cellData[variable].mean
            };
          } else {
            variableRanges[variable].min = Math.min(variableRanges[variable].min, cellData[variable].mean);
            variableRanges[variable].max = Math.max(variableRanges[variable].max, cellData[variable].mean);
          }
        }
      }
    }

    return {
      totalCellsSampled: totalCells,
      totalCellsInMap: cellIds.length,
      biomes: biomeStats,
      cellSize: CELL_SIZE,
      gridType: 'square',
      variableRanges,
      algorithm: 'climate_with_coord_diversity'
    };
  } catch (error) {
    console.error('Erreur:', error);
    reply.code(500).send({ error: 'Erreur lors du calcul des statistiques' });
  }
});

// Route 5: Health check
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    gridType: 'square',
    cellSize: CELL_SIZE,
    tilesLoaded: Object.keys(gameMapData.tiles).length,
    algorithm: 'climate_with_coord_diversity'
  };
});

// Route BONUS: Tester la diversité pour une région
fastify.get('/debug/region/:q/:r/:radius', async (request, reply) => {
  const centerQ = parseInt(request.params.q);
  const centerR = parseInt(request.params.r);
  const radius = parseInt(request.params.radius) || 5;
  
  const results = [];
  
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      const q = centerQ + dq;
      const r = centerR + dr;
      
      const { lat, lon } = gridCoordsToLatLon(q, r, CELL_SIZE);
      const { cell } = findNearestCell(lat, lon);
      
      if (cell) {
        const biomeInfo = determineBiomeWithDiversity(cell, q, r);
        results.push({
          coords: { q, r },
          biome: biomeInfo.biome,
          score: biomeInfo.score,
          diversity_factor: biomeInfo.diversity_factor
        });
      }
    }
  }
  
  // Compter la diversité
  const uniqueBiomes = new Set(results.map(r => r.biome));
  
  return {
    center: { q: centerQ, r: centerR },
    radius,
    totalCells: results.length,
    uniqueBiomes: uniqueBiomes.size,
    biomes: Array.from(uniqueBiomes),
    cells: results
  };
});

// Démarrer le serveur
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('');
    console.log('🚀 Serveur démarré sur http://localhost:3000');
    console.log('🗺️ Grille carrée mondiale avec BIOMES DIVERSIFIÉS');
    console.log(`📏 Taille de cellule: ${CELL_SIZE}°`);
    console.log(`📊 ${Object.keys(gameMapData.tiles).length} cellules avec données chargées`);
    console.log('🎨 Algorithme: climate_with_coord_diversity');
    console.log('');
    console.log('📡 Routes disponibles:');
    console.log('   GET /cell/grid/:q/:r              - Données par coordonnées de grille');
    console.log('   GET /cell/latlon?lat=X&lon=Y      - Données par position géographique');
    console.log('   GET /map/metadata                 - Métadonnées de la carte');
    console.log('   GET /map/stats                    - Statistiques globales');
    console.log('   GET /debug/region/:q/:r/:radius   - Tester la diversité d\'une région');
    console.log('   GET /health                       - État du serveur');
    console.log('');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
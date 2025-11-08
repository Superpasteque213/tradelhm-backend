// server.js
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
} catch (error) {
  console.error('Erreur lors du chargement des fichiers JSON:', error);
  process.exit(1);
}

// Fonction pour calculer le score de correspondance d'un hexagone avec un biome
function calculateBiomeScore(hexagon, biomeRanges) {
  let score = 0;
  let totalVariables = 0;

  const variables = ['t2m', 'd2m', 'tp', 'ssr', 'sst', 'msl', 'cl', 'u10', 'v10'];

  for (const variable of variables) {
    if (hexagon[variable] && biomeRanges[variable]) {
      totalVariables++;
      const value = hexagon[variable].mean;
      const min = biomeRanges[variable].min;
      const max = biomeRanges[variable].max;

      // Si la valeur est dans l'intervalle, ajouter 1 point
      if (value >= min && value <= max) {
        score++;
      } else {
        // Calculer la distance normalisée si hors intervalle
        const range = max - min;
        let distance;
        if (value < min) {
          distance = (min - value) / range;
        } else {
          distance = (value - max) / range;
        }
        // Pénalité inversement proportionnelle à la distance
        score += Math.max(0, 1 - distance);
      }
    }
  }

  // Retourner le score normalisé (pourcentage de correspondance)
  return totalVariables > 0 ? score / totalVariables : 0;
}

// Fonction pour déterminer le biome d'un hexagone
function determineBiome(hexagon) {
  let bestBiome = null;
  let bestScore = -1;

  for (const [biomeName, biomeRanges] of Object.entries(biomeMappingData)) {
    const score = calculateBiomeScore(hexagon, biomeRanges);
    
    if (score > bestScore) {
      bestScore = score;
      bestBiome = biomeName;
    }
  }

  return bestBiome;
}

// CORS
fastify.register(require('@fastify/cors'), {
  origin: '*'
});

// Route 1: Liste de tous les hexagones (ID + coordonnées uniquement)
fastify.get('/hexagons/list', async (request, reply) => {
  try {
    const hexagonsList = Object.entries(gameMapData.tiles).map(([id, data]) => ({
      id,
      lat: data.lat,
      lon: data.lon
    }));

    return {
      count: hexagonsList.length,
      hexagons: hexagonsList
    };
  } catch (error) {
    reply.code(500).send({ error: 'Erreur lors de la récupération des hexagones' });
  }
});

// Route 2: Détails d'un hexagone spécifique (biome + ressources)
fastify.get('/hexagon/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    const hexagon = gameMapData.tiles[id];

    if (!hexagon) {
      return reply.code(404).send({ error: 'Hexagone non trouvé' });
    }

    // Déterminer le biome
    const biome = determineBiome(hexagon);

    // Récupérer les ressources pour ce biome
    const resources = resourceMappingData[biome] || {};

    return {
      id,
      lat: hexagon.lat,
      lon: hexagon.lon,
      biome,
      resources
    };
  } catch (error) {
    console.error('Erreur:', error);
    reply.code(500).send({ error: 'Erreur lors de la récupération des détails de l\'hexagone' });
  }
});

// Route 3: Métadonnées de la map
fastify.get('/map/metadata', async (request, reply) => {
  return {
    hex_size: gameMapData.metadata.hex_size,
    tile_count: gameMapData.metadata.tile_count,
    variables: gameMapData.metadata.variables
  };
});

// Démarrer le serveur
const start = async () => {
  try {
    await fastify.listen({ port: 5432, host: '0.0.0.0' });
    console.log('Serveur démarré sur http://localhost:5432');
    console.log(`${Object.keys(gameMapData.tiles).length} hexagones chargés`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

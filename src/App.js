import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Info } from 'lucide-react';

const NetCDFHexViewer = () => {
  const [file, setFile] = useState(null);
  const [hexData, setHexData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hexSize, setHexSize] = useState(1.0);
  const [selectedVar, setSelectedVar] = useState('');
  const [variables, setVariables] = useState([]);
  const canvasRef = useRef(null);

  // Système de coordonnées hexagonales
  const hexToPixel = (q, r, size, centerX, centerY) => {
    const x = size * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r) + centerX;
    const y = size * (3/2 * r) + centerY;
    return { x, y };
  };

  const latLonToHex = (lat, lon, size) => {
    const q = (lon * Math.sqrt(3)/3 - lat / 3) / size;
    const r = (2 * lat / 3) / size;
    return hexRound(q, r);
  };

  const hexRound = (q, r) => {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);

    const q_diff = Math.abs(rq - q);
    const r_diff = Math.abs(rr - r);
    const s_diff = Math.abs(rs - s);

    if (q_diff > r_diff && q_diff > s_diff) {
      rq = -rr - rs;
    } else if (r_diff > s_diff) {
      rr = -rq - rs;
    }

    return `${rq},${rr}`;
  };

  // Lecture du fichier NetCDF via backend Python
  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);
    setError(null);

    try {
      // D'abord, obtenir les infos du fichier
      const infoFormData = new FormData();
      infoFormData.append('file', uploadedFile);

      const infoResponse = await fetch('http://localhost:5000/info', {
        method: 'POST',
        body: infoFormData
      });

      if (!infoResponse.ok) {
        throw new Error('Erreur lors de la lecture du fichier');
      }

      const info = await infoResponse.json();
      console.log('Infos NetCDF:', info);

      // Traiter le fichier
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('hex_size', hexSize.toString());
      formData.append('variables', info.variables.join(','));

      const response = await fetch('http://localhost:5000/process', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors du traitement');
      }

      const data = await response.json();
      
      setVariables(data.variables);
      setSelectedVar(data.variables[0]);
      setHexData(data.tiles);
      
      setError(null);
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        setError('Impossible de se connecter au backend Python. Assurez-vous que le serveur Flask tourne sur http://localhost:5000');
      } else {
        setError(`Erreur: ${err.message}`);
      }
      
      // En cas d'erreur, utiliser des données de démo
      console.log('Utilisation de données simulées...');
      const mockData = generateMockNetCDFData();
      processNetCDFData(mockData);
    } finally {
      setLoading(false);
    }
  };

  // Génération de données NetCDF simulées
  const generateMockNetCDFData = () => {
    const lats = [];
    const lons = [];
    const temp = [];
    const precip = [];
    
    // Grille 50x50 couvrant une région (ex: Europe)
    for (let i = 0; i < 50; i++) {
      const lat = 35 + i * 0.5; // 35°N à 60°N
      for (let j = 0; j < 50; j++) {
        const lon = -10 + j * 0.5; // -10°E à 15°E
        lats.push(lat);
        lons.push(lon);
        
        // Température simulée avec gradient
        temp.push(15 + Math.sin(lat * 0.1) * 10 + Math.random() * 3);
        
        // Précipitations simulées
        precip.push(Math.max(0, 50 + Math.cos(lon * 0.2) * 30 + Math.random() * 20));
      }
    }

    return {
      variables: ['temperature', 'precipitation'],
      data: {
        lat: lats,
        lon: lons,
        temperature: temp,
        precipitation: precip
      }
    };
  };

  // Traitement des données NetCDF vers grille hexagonale
  const processNetCDFData = (ncData) => {
    const hexGrid = {};
    const vars = ncData.variables;
    
    setVariables(vars);
    setSelectedVar(vars[0]);

    // Agrégation des données par hexagone
    for (let i = 0; i < ncData.data.lat.length; i++) {
      const lat = ncData.data.lat[i];
      const lon = ncData.data.lon[i];
      const hexCoord = latLonToHex(lat, lon, hexSize);

      if (!hexGrid[hexCoord]) {
        hexGrid[hexCoord] = {
          count: 0,
          lat: 0,
          lon: 0
        };
        vars.forEach(v => {
          hexGrid[hexCoord][v] = 0;
        });
      }

      hexGrid[hexCoord].count++;
      hexGrid[hexCoord].lat += lat;
      hexGrid[hexCoord].lon += lon;
      
      vars.forEach(v => {
        hexGrid[hexCoord][v] += ncData.data[v][i];
      });
    }

    // Calcul des moyennes
    Object.keys(hexGrid).forEach(coord => {
      const tile = hexGrid[coord];
      tile.lat /= tile.count;
      tile.lon /= tile.count;
      vars.forEach(v => {
        tile[v] /= tile.count;
      });
    });

    setHexData(hexGrid);
  };

  // Dessin de la grille hexagonale
  useEffect(() => {
    if (!hexData || !canvasRef.current || !selectedVar) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Trouver les valeurs min/max pour la normalisation
    const values = Object.values(hexData).map(tile => tile[selectedVar]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // Dessiner chaque hexagone
    Object.entries(hexData).forEach(([coord, tile]) => {
      const [q, r] = coord.split(',').map(Number);
      const { x, y } = hexToPixel(q, r, 15, width/2, height/2);

      // Couleur basée sur la valeur
      const normalized = (tile[selectedVar] - minVal) / (maxVal - minVal);
      const hue = 240 - normalized * 240; // Bleu à rouge
      ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;

      // Dessiner l'hexagone
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 3 * i;
        const hx = x + 15 * Math.cos(angle);
        const hy = y + 15 * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    // Légende
    drawLegend(ctx, width, height, minVal, maxVal, selectedVar);
  }, [hexData, selectedVar]);

  const drawLegend = (ctx, width, height, minVal, maxVal, varName) => {
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = width - legendWidth - 20;
    const legendY = 20;

    // Gradient
    const gradient = ctx.createLinearGradient(legendX, 0, legendX + legendWidth, 0);
    gradient.addColorStop(0, 'hsl(240, 70%, 50%)');
    gradient.addColorStop(0.5, 'hsl(120, 70%, 50%)');
    gradient.addColorStop(1, 'hsl(0, 70%, 50%)');

    ctx.fillStyle = gradient;
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

    // Labels
    ctx.fillStyle = '#000';
    ctx.font = '12px Arial';
    ctx.fillText(minVal.toFixed(1), legendX, legendY + legendHeight + 15);
    ctx.fillText(maxVal.toFixed(1), legendX + legendWidth - 30, legendY + legendHeight + 15);
    ctx.fillText(varName, legendX + legendWidth/2 - 30, legendY - 5);
  };

  const exportJSON = () => {
    if (!hexData) return;
    
    const exportData = {
      metadata: {
        hex_size: hexSize,
        source: 'Copernicus (simulated)',
        variables: variables,
        tile_count: Object.keys(hexData).length
      },
      tiles: hexData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hex_grid_data.json';
    a.click();
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Visualiseur NetCDF → Grille Hexagonale</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Panneau de contrôle */}
          <div className="bg-gray-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">Contrôles</h2>
            
            <div>
              <label className="block mb-2 text-sm">Charger fichier .nc</label>
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition">
                <div className="text-center">
                  <Upload className="mx-auto mb-2" size={32} />
                  <span className="text-sm">{file ? file.name : 'Cliquez pour charger'}</span>
                </div>
                <input
                  type="file"
                  accept=".nc"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div>
              <label className="block mb-2 text-sm">Taille hexagone (degrés)</label>
              <input
                type="number"
                value={hexSize}
                onChange={(e) => setHexSize(parseFloat(e.target.value))}
                step="0.1"
                min="0.1"
                max="5"
                className="w-full bg-gray-700 rounded px-3 py-2"
              />
            </div>

            {variables.length > 0 && (
              <div>
                <label className="block mb-2 text-sm">Variable à afficher</label>
                <select
                  value={selectedVar}
                  onChange={(e) => setSelectedVar(e.target.value)}
                  className="w-full bg-gray-700 rounded px-3 py-2"
                >
                  {variables.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {hexData && (
              <button
                onClick={exportJSON}
                className="w-full bg-blue-600 hover:bg-blue-700 rounded px-4 py-2 flex items-center justify-center gap-2"
              >
                <Download size={20} />
                Exporter JSON
              </button>
            )}

            {loading && (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
                <p className="mt-2 text-sm">Traitement...</p>
              </div>
            )}

            {error && (
              <div className="bg-yellow-900/50 border border-yellow-600 rounded p-3 text-sm">
                <Info size={16} className="inline mr-2" />
                {error}
              </div>
            )}
          </div>

          {/* Canvas de visualisation */}
          <div className="lg:col-span-2 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Grille Hexagonale</h2>
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="w-full border border-gray-700 rounded bg-gray-900"
            />
            
            {hexData && (
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="bg-gray-700 rounded p-3">
                  <div className="text-gray-400">Tuiles générées</div>
                  <div className="text-2xl font-bold">{Object.keys(hexData).length}</div>
                </div>
                <div className="bg-gray-700 rounded p-3">
                  <div className="text-gray-400">Variables</div>
                  <div className="text-2xl font-bold">{variables.length}</div>
                </div>
              </div>
            )}

            {hexData && (
              <div className="mt-4 bg-gray-700 rounded p-3 text-xs">
                <h3 className="font-semibold mb-2">Exemple de tuile:</h3>
                <pre className="overflow-x-auto">
{JSON.stringify(
  Object.entries(hexData)[0], 
  null, 
  2
).slice(0, 300)}...
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-4 text-sm">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <Info size={20} />
            Guide d'utilisation
          </h3>
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li><strong>Backend requis:</strong> Lancez le serveur Flask Python avec <code className="bg-gray-800 px-2 py-1 rounded">python backend.py</code></li>
            <li>Le serveur doit tourner sur <code className="bg-gray-800 px-2 py-1 rounded">http://localhost:5000</code></li>
            <li>Chargez vos fichiers .nc de Copernicus (ERA5, Sentinel, etc.)</li>
            <li>Ajustez la taille des hexagones pour modifier la résolution de la grille</li>
            <li>Chaque hexagone agrège les valeurs NetCDF de sa zone géographique</li>
            <li>Exportez le JSON pour l'intégrer dans votre jeu de stratégie</li>
            <li><strong>Fallback:</strong> Si le backend n'est pas disponible, des données de démo seront utilisées</li>
          </ul>
        </div>

        {/* Instructions backend */}
        <div className="bg-gray-800 rounded-lg p-4 mt-4 text-sm">
          <h3 className="font-semibold mb-2">📋 Installation du backend Python</h3>
          <pre className="bg-gray-900 p-3 rounded overflow-x-auto text-xs">
{`# Installer les dépendances
pip install flask flask-cors xarray netCDF4 numpy

# Lancer le serveur
python backend.py

# Le serveur démarre sur http://localhost:5000`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default NetCDFHexViewer;
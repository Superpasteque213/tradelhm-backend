from flask import Flask, request, jsonify
from flask_cors import CORS
import xarray as xr
import numpy as np
import tempfile
import os

app = Flask(__name__)
CORS(app)

def latlon_to_square(lat, lon, size):
    """
    Convertit des coordonnées lat/lon en coordonnées de grille carrée
    
    Args:
        lat: Latitude
        lon: Longitude
        size: Taille de la cellule en degrés
    
    Returns:
        str: Coordonnées de la cellule "x,y"
    """
    x = int(np.floor(lon / size))
    y = int(np.floor(lat / size))
    return f"{x},{y}"

@app.route('/process', methods=['POST'])
def process_netcdf():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    cell_size = float(request.form.get('cell_size', 1.0))
    variables = request.form.get('variables', '').split(',')
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.nc') as tmp_file:
        file.save(tmp_file.name)
        tmp_path = tmp_file.name
    
    try:
        ds = xr.open_dataset(tmp_path)
        
        lat_names = ['lat', 'latitude', 'y']
        lon_names = ['lon', 'longitude', 'x']
        
        lat_var = next((name for name in lat_names if name in ds.coords), None)
        lon_var = next((name for name in lon_names if name in ds.coords), None)
        
        if not lat_var or not lon_var:
            return jsonify({'error': f'Coordonnées non trouvées. Variables: {list(ds.coords.keys())}'}), 400
        
        if not variables or variables == ['']:
            variables = [var for var in ds.data_vars if len(ds[var].dims) >= 2]
        
        square_grid = {}
        lats = ds[lat_var].values
        lons = ds[lon_var].values
        
        for var in variables:
            if var not in ds.variables:
                continue
            
            data = ds[var].values
            if len(data.shape) > 2:
                data = data[0]
            
            for i in range(len(lats)):
                for j in range(len(lons)):
                    lat = float(lats[i])
                    lon = float(lons[j])
                    square_coord = latlon_to_square(lat, lon, cell_size)
                    
                    if square_coord not in square_grid:
                        square_grid[square_coord] = {
                            'count': 0,
                            'lat': 0,
                            'lon': 0
                        }
                    
                    if var not in square_grid[square_coord]:
                        square_grid[square_coord][var] = []
                    
                    value = data[i, j]
                    if not np.isnan(value):
                        square_grid[square_coord][var].append(float(value))
                        square_grid[square_coord]['count'] += 1
                        square_grid[square_coord]['lat'] += lat
                        square_grid[square_coord]['lon'] += lon
        
        # Calculer les moyennes
        for coord in list(square_grid.keys()):
            tile = square_grid[coord]
            if tile['count'] == 0:
                del square_grid[coord]
                continue
                
            tile['lat'] /= tile['count']
            tile['lon'] /= tile['count']
            
            for var in variables:
                if var in tile and isinstance(tile[var], list):
                    if len(tile[var]) > 0:
                        values = tile[var]
                        tile[var] = {
                            'mean': float(np.mean(values)),
                            'min': float(np.min(values)),
                            'max': float(np.max(values)),
                            'std': float(np.std(values))
                        }
        
        ds.close()
        
        return jsonify({
            'tiles': square_grid,
            'variables': variables,
            'metadata': {
                'tile_count': len(square_grid),
                'cell_size': cell_size,
                'grid_type': 'square'
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.route('/info', methods=['POST'])
def get_nc_info():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.nc') as tmp_file:
        file.save(tmp_file.name)
        tmp_path = tmp_file.name
    
    try:
        ds = xr.open_dataset(tmp_path)
        
        # Obtenir des infos détaillées sur les variables
        variables_info = {}
        for var in ds.data_vars:
            variables_info[var] = {
                'dimensions': list(ds[var].dims),
                'shape': list(ds[var].shape),
                'dtype': str(ds[var].dtype),
                'attributes': dict(ds[var].attrs) if hasattr(ds[var], 'attrs') else {}
            }
        
        info = {
            'dimensions': dict(ds.dims),
            'coordinates': list(ds.coords.keys()),
            'variables': list(ds.data_vars.keys()),
            'variables_info': variables_info,
            'attributes': dict(ds.attrs)
        }
        ds.close()
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.route('/convert-to-square', methods=['POST'])
def convert_to_square():
    """
    Endpoint pour convertir directement des coordonnées lat/lon en grille carrée
    """
    data = request.get_json()
    
    if not data or 'lat' not in data or 'lon' not in data:
        return jsonify({'error': 'lat and lon required'}), 400
    
    lat = float(data['lat'])
    lon = float(data['lon'])
    cell_size = float(data.get('cell_size', 1.0))
    
    square_coord = latlon_to_square(lat, lon, cell_size)
    x, y = map(int, square_coord.split(','))
    
    return jsonify({
        'square_coord': square_coord,
        'x': x,
        'y': y,
        'cell_size': cell_size,
        'original': {'lat': lat, 'lon': lon}
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'grid_type': 'square'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
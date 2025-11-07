from flask import Flask, request, jsonify
from flask_cors import CORS
import xarray as xr
import numpy as np
import tempfile
import os

app = Flask(__name__)
CORS(app)

def latlon_to_hex(lat, lon, size):
    q = (lon * np.sqrt(3)/3 - lat / 3) / size
    r = (2 * lat / 3) / size
    return hex_round(q, r)

def hex_round(q, r):
    s = -q - r
    rq = round(q)
    rr = round(r)
    rs = round(s)
    
    q_diff = abs(rq - q)
    r_diff = abs(rr - r)
    s_diff = abs(rs - s)
    
    if q_diff > r_diff and q_diff > s_diff:
        rq = -rr - rs
    elif r_diff > s_diff:
        rr = -rq - rs
    
    return f"{int(rq)},{int(rr)}"

@app.route('/process', methods=['POST'])
def process_netcdf():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    hex_size = float(request.form.get('hex_size', 1.0))
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
        
        hex_grid = {}
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
                    hex_coord = latlon_to_hex(lat, lon, hex_size)
                    
                    if hex_coord not in hex_grid:
                        hex_grid[hex_coord] = {
                            'count': 0,
                            'lat': 0,
                            'lon': 0
                        }
                    
                    if var not in hex_grid[hex_coord]:
                        hex_grid[hex_coord][var] = []
                    
                    value = data[i, j]
                    if not np.isnan(value):
                        hex_grid[hex_coord][var].append(float(value))
                        hex_grid[hex_coord]['count'] += 1
                        hex_grid[hex_coord]['lat'] += lat
                        hex_grid[hex_coord]['lon'] += lon
        
        for coord in list(hex_grid.keys()):
            tile = hex_grid[coord]
            if tile['count'] == 0:
                del hex_grid[coord]
                continue
                
            tile['lat'] /= tile['count']
            tile['lon'] /= tile['count']
            
            for var in variables:
                if var in tile and isinstance(tile[var], list):
                    if len(tile[var]) > 0:
                        tile[var] = float(np.mean(tile[var]))
        
        ds.close()
        
        return jsonify({
            'tiles': hex_grid,
            'variables': variables,
            'metadata': {
                'tile_count': len(hex_grid),
                'hex_size': hex_size
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
        info = {
            'dimensions': dict(ds.dims),
            'coordinates': list(ds.coords.keys()),
            'variables': list(ds.data_vars.keys()),
            'attributes': dict(ds.attrs)
        }
        ds.close()
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
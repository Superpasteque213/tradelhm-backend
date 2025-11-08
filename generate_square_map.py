import xarray as xr
import numpy as np
import json
import sys
from pathlib import Path
from glob import glob

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

def process_single_file(file_path, cell_size, variables=None, time_aggregation='first'):
    """
    Traite un seul fichier NetCDF
    
    Args:
        file_path: Chemin vers le fichier .nc
        cell_size: Taille des cellules en degrés
        variables: Liste des variables à extraire (None = toutes)
        time_aggregation: 'first', 'mean', 'all'
    
    Returns:
        dict: {variable: {square_coord: [values]}}
    """
    print(f"\n📂 Lecture de {Path(file_path).name}...")
    ds = xr.open_dataset(file_path)
    
    # Détecter les coordonnées
    lat_names = ['lat', 'latitude', 'y']
    lon_names = ['lon', 'longitude', 'x']
    
    lat_var = next((name for name in lat_names if name in ds.coords), None)
    lon_var = next((name for name in lon_names if name in ds.coords), None)
    
    if not lat_var or not lon_var:
        raise ValueError(f"❌ Coordonnées non trouvées dans {file_path}. Disponibles: {list(ds.coords.keys())}")
    
    print(f"   ✅ Coordonnées: {lat_var}, {lon_var}")
    
    # Sélectionner les variables
    if variables is None:
        variables = [var for var in ds.data_vars if len(ds[var].dims) >= 2]
    else:
        # Filtrer les variables qui existent réellement
        variables = [var for var in variables if var in ds.data_vars]
    
    if not variables:
        print(f"   ⚠️  Aucune variable valide trouvée")
        ds.close()
        return {}
    
    print(f"   📊 Variables: {variables}")
    
    file_data = {}
    lats = ds[lat_var].values
    lons = ds[lon_var].values
    
    total_points = len(lats) * len(lons)
    
    # Traiter chaque variable
    for var in variables:
        print(f"   🔄 Traitement de {var}...")
        data = ds[var].values
        
        # Gérer les dimensions temporelles
        if len(data.shape) > 2:
            if time_aggregation == 'mean':
                print(f"      Moyenne temporelle ({data.shape[0]} périodes)")
                data = np.mean(data, axis=0)
            elif time_aggregation == 'first':
                print(f"      Première période ({data.shape[0]} disponibles)")
                data = data[0]
            elif time_aggregation == 'all':
                print(f"      Conservation de toutes les périodes ({data.shape[0]})")
                # On garde la structure 3D
                pass
        
        file_data[var] = {}
        processed = 0
        
        # Cas 2D (ou déjà agrégé)
        if len(data.shape) == 2:
            for i in range(len(lats)):
                for j in range(len(lons)):
                    lat = float(lats[i])
                    lon = float(lons[j])
                    square_coord = latlon_to_square(lat, lon, cell_size)
                    
                    if square_coord not in file_data[var]:
                        file_data[var][square_coord] = []
                    
                    value = data[i, j]
                    if not np.isnan(value):
                        file_data[var][square_coord].append({
                            'value': float(value),
                            'lat': lat,
                            'lon': lon
                        })
                    
                    processed += 1
                    if processed % 100000 == 0:
                        print(f"      {processed}/{total_points} ({processed*100//total_points}%)")
        
        # Cas 3D (toutes les périodes)
        elif len(data.shape) == 3:
            for t in range(data.shape[0]):
                for i in range(len(lats)):
                    for j in range(len(lons)):
                        lat = float(lats[i])
                        lon = float(lons[j])
                        square_coord = latlon_to_square(lat, lon, cell_size)
                        
                        if square_coord not in file_data[var]:
                            file_data[var][square_coord] = []
                        
                        value = data[t, i, j]
                        if not np.isnan(value):
                            file_data[var][square_coord].append({
                                'value': float(value),
                                'lat': lat,
                                'lon': lon,
                                'time': t
                            })
    
    ds.close()
    return file_data

def merge_file_data(all_files_data):
    """
    Fusionne les données de plusieurs fichiers
    
    Args:
        all_files_data: Liste de dict {variable: {square_coord: [values]}}
    
    Returns:
        dict: square_grid fusionné
    """
    print("\n🔀 Fusion des données de tous les fichiers...")
    
    square_grid = {}
    all_variables = set()
    
    # Collecter toutes les variables
    for file_data in all_files_data:
        all_variables.update(file_data.keys())
    
    print(f"   Variables totales: {sorted(all_variables)}")
    
    # Fusionner les données par cellule
    for file_data in all_files_data:
        for var, square_data in file_data.items():
            for square_coord, values in square_data.items():
                if square_coord not in square_grid:
                    square_grid[square_coord] = {
                        'count': 0,
                        'lat': 0,
                        'lon': 0
                    }
                
                if var not in square_grid[square_coord]:
                    square_grid[square_coord][var] = []
                
                square_grid[square_coord][var].extend(values)
    
    # Calculer les moyennes
    print("   📈 Calcul des statistiques...")
    for coord in list(square_grid.keys()):
        tile = square_grid[coord]
        
        # Calculer lat/lon moyen
        all_lats = []
        all_lons = []
        
        for var in all_variables:
            if var in tile and isinstance(tile[var], list):
                for item in tile[var]:
                    all_lats.append(item['lat'])
                    all_lons.append(item['lon'])
        
        if all_lats:
            tile['lat'] = float(np.mean(all_lats))
            tile['lon'] = float(np.mean(all_lons))
            tile['count'] = len(all_lats)
        else:
            del square_grid[coord]
            continue
        
        # Calculer les statistiques pour chaque variable
        for var in all_variables:
            if var in tile and isinstance(tile[var], list):
                values = [item['value'] for item in tile[var]]
                if values:
                    tile[var] = {
                        'mean': float(np.mean(values)),
                        'min': float(np.min(values)),
                        'max': float(np.max(values)),
                        'std': float(np.std(values)),
                        'count': len(values)
                    }
                else:
                    tile[var] = None
    
    return square_grid

def process_multiple_netcdf(input_pattern, output_file, cell_size=1.0, variables=None, time_aggregation='first'):
    """
    Traite plusieurs fichiers NetCDF et les fusionne en une grille carrée
    
    Args:
        input_pattern: Pattern glob ou liste de fichiers (ex: "*.nc" ou "file1.nc,file2.nc")
        output_file: Chemin vers le fichier JSON de sortie
        cell_size: Taille des cellules en degrés
        variables: Liste des variables à extraire (None = toutes)
        time_aggregation: 'first', 'mean', 'all'
    """
    print("=" * 70)
    print("🗺️  GÉNÉRATEUR DE CARTE EN GRILLE CARRÉE MULTI-FICHIERS NetCDF")
    print("=" * 70)
    
    # Résoudre les fichiers
    if ',' in input_pattern:
        # Liste explicite de fichiers
        files = [f.strip() for f in input_pattern.split(',')]
    else:
        # Pattern glob
        files = glob(input_pattern)
    
    if not files:
        raise ValueError(f"❌ Aucun fichier trouvé pour le pattern: {input_pattern}")
    
    print(f"\n📁 Fichiers trouvés: {len(files)}")
    for f in files:
        print(f"   • {Path(f).name}")
    
    # Traiter chaque fichier
    all_files_data = []
    for file_path in files:
        try:
            file_data = process_single_file(file_path, cell_size, variables, time_aggregation)
            if file_data:
                all_files_data.append(file_data)
        except Exception as e:
            print(f"   ⚠️  Erreur avec {file_path}: {e}")
            continue
    
    if not all_files_data:
        raise ValueError("❌ Aucun fichier n'a pu être traité avec succès")
    
    # Fusionner toutes les données
    square_grid = merge_file_data(all_files_data)
    
    # Créer la structure de sortie
    output_data = {
        'metadata': {
            'source_files': [str(Path(f).name) for f in files],
            'cell_size': cell_size,
            'tile_count': len(square_grid),
            'time_aggregation': time_aggregation,
            'variables': sorted(set(var for file_data in all_files_data for var in file_data.keys())),
            'grid_type': 'square'
        },
        'tiles': square_grid
    }
    
    # Sauvegarder en JSON
    print(f"\n💾 Sauvegarde vers {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)
    
    file_size = Path(output_file).stat().st_size / 1024 / 1024
    
    print("\n" + "=" * 70)
    print("✅ TERMINÉ !")
    print("=" * 70)
    print(f"🎯 Cellules générées: {len(square_grid)}")
    print(f"📦 Taille du fichier: {file_size:.2f} MB")
    print(f"📊 Variables: {', '.join(output_data['metadata']['variables'])}")
    print("=" * 70)
    
    return output_data

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("""
Usage: python generate_square_map.py <input_pattern> <output.json> [cell_size] [variables] [time_agg]

Arguments:
  input_pattern : Pattern glob ou liste de fichiers séparés par des virgules
                  Exemples: "*.nc"
                           "data/*.nc"
                           "file1.nc,file2.nc,file3.nc"
  
  output.json   : Fichier de sortie JSON
  
  cell_size     : Taille des cellules carrées en degrés (défaut: 1.0)
  
  variables     : Variables à extraire, séparées par des virgules
                  (défaut: toutes les variables)
  
  time_agg      : Agrégation temporelle: 'first', 'mean', 'all'
                  (défaut: 'first')

Exemples:
  # Tous les fichiers .nc du dossier
  python generate_square_map.py "data/*.nc" map.json 0.5
  
  # Fichiers spécifiques
  python generate_square_map.py "file1.nc,file2.nc" map.json 0.5 tp,ssr mean
  
  # Avec pattern et variables spécifiques
  python generate_square_map.py "copernicus_*.nc" map.json 1.0 temperature,precipitation first
  
  # Exemple pour votre projet
  python generate_square_map.py "game_resources_data/*.nc" game_map.json 0.5
        """)
        sys.exit(1)
    
    input_pattern = sys.argv[1]
    output_file = sys.argv[2]
    cell_size = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
    variables = sys.argv[4].split(',') if len(sys.argv) > 4 else None
    time_agg = sys.argv[5] if len(sys.argv) > 5 else 'first'
    
    try:
        process_multiple_netcdf(input_pattern, output_file, cell_size, variables, time_agg)
    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

        
"""python generate_square_map.py "game_resources_data/*.nc" game_map.json 0.5"""
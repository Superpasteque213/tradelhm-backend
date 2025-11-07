import xarray as xr

def inspect_netcdf(file_path):
    """Inspecte un fichier NetCDF et affiche sa structure"""
    print(f"🔍 Inspection de {file_path}\n")
    
    ds = xr.open_dataset(file_path)
    
    print("=" * 60)
    print("📐 DIMENSIONS")
    print("=" * 60)
    for dim, size in ds.dims.items():
        print(f"  {dim}: {size}")
    
    print("\n" + "=" * 60)
    print("📍 COORDONNÉES")
    print("=" * 60)
    for coord in ds.coords:
        coord_data = ds.coords[coord]
        print(f"  {coord}:")
        print(f"    - Dimensions: {coord_data.dims}")
        print(f"    - Taille: {coord_data.size}")
        if coord_data.size < 10:
            print(f"    - Valeurs: {coord_data.values}")
        else:
            print(f"    - Min: {coord_data.min().values}, Max: {coord_data.max().values}")
    
    print("\n" + "=" * 60)
    print("📊 VARIABLES DE DONNÉES")
    print("=" * 60)
    for var in ds.data_vars:
        var_data = ds[var]
        print(f"  {var}:")
        print(f"    - Dimensions: {var_data.dims}")
        print(f"    - Shape: {var_data.shape}")
        print(f"    - Type: {var_data.dtype}")
        if 'long_name' in var_data.attrs:
            print(f"    - Description: {var_data.attrs['long_name']}")
        if 'units' in var_data.attrs:
            print(f"    - Unités: {var_data.attrs['units']}")
    
    print("\n" + "=" * 60)
    print("📝 ATTRIBUTS GLOBAUX")
    print("=" * 60)
    for attr, value in ds.attrs.items():
        print(f"  {attr}: {value}")
    
    ds.close()
    
    print("\n" + "=" * 60)
    print("💡 SUGGESTION DE COMMANDE")
    print("=" * 60)
    variables = list(ds.data_vars.keys())
    if variables:
        print(f"python generate_hex_map.py {file_path} game_map.json 0.5 {','.join(variables[:3])}")

if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print("Usage: python inspect_netcdf.py <fichier.nc>")
        sys.exit(1)
    
    inspect_netcdf(sys.argv[1])
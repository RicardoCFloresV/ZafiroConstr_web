#!/bin/bash

# Configuration
SERVER="localhost"
ADMIN_USER="Thunktshy"
ADMIN_PASSWORD="eWUmX8owfovKPAR3rWoAww"  # Replace with the actual password
DB_NAME="almacen"

echo "=== Testing InsertProductWithComponents Procedure ==="

# Check if sqlcmd is available
if ! command -v sqlcmd &> /dev/null; then
    echo "Error: sqlcmd is not installed. Please install it first."
    exit 1
fi

# Create a temporary SQL file for the test
SQL_FILE="/tmp/test_procedure.sql"

cat > "$SQL_FILE" << 'EOF'
-- Test the InsertProductWithComponents procedure
DECLARE @return_code INT;
DECLARE @error_message NVARCHAR(4000);

BEGIN TRY
    EXEC @return_code = InsertProductWithComponents
        @letra = 'K',
        @cara = 2,  -- atras
        @nivel = 2, -- abajo
        @nombre = 'Adaptador Roscado Macho PVC 1 1/2',
        @descripcion = ' ',
        @precio = 16.0,
        @categoria_nombre = 'Plomeria',
        @categoria_secundaria_nombre = 'PVC',
        @subcategoria_nombre = NULL,
        @unit_nombre = 'Pieza',  -- Changed from ' ' to 'Pieza'
        @unit_value = 1,         -- Changed from 0 to 1
        @size_nombre = 'Pulgadas',
        @size_value = '1 1/2',
        @brand_nombre = 'Sin Marca',  -- Changed from ' ' to 'Sin Marca'
        @stock_inicial = 2;

    PRINT 'Procedure executed successfully.';
    PRINT 'Return code: ' + CAST(@return_code AS NVARCHAR(10));
END TRY
BEGIN CATCH
    PRINT 'Error occurred: ' + ERROR_MESSAGE();
    PRINT 'Error number: ' + CAST(ERROR_NUMBER() AS NVARCHAR(10));
    PRINT 'Error procedure: ' + COALESCE(ERROR_PROCEDURE(), 'N/A');
END CATCH

-- Verify the insertion with corrected column names
PRINT 'Verifying the inserted product...';
SELECT
    p.producto_id,
    p.nombre,
    p.descripcion,
    p.precio,
    c.nombre as categoria,
    cs.nombre as categoria_secundaria,
    s.nombre as subcategoria,
    u.nombre as unidad,
    p.unit_value,
    sz.nombre as tamaño,
    p.size_value,
    b.nombre as marca,
    st.cantidad as stock,
    -- Get caja information from stock table
    (SELECT letra FROM cajas WHERE caja_id = st.caja_id) as letra,
    (SELECT cara FROM cajas WHERE caja_id = st.caja_id) as cara,
    (SELECT nivel FROM cajas WHERE caja_id = st.caja_id) as nivel
FROM productos p
LEFT JOIN categorias c ON p.categoria_principal_id = c.categoria_id
LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
LEFT JOIN subcategorias s ON p.subcategoria_id = s.subcategoria_id
LEFT JOIN units u ON p.unit_id = u.unit_id
LEFT JOIN sizes sz ON p.size_id = sz.size_id
LEFT JOIN brands b ON p.brand_id = b.brand_id
LEFT JOIN stock st ON p.producto_id = st.producto_id
WHERE p.nombre = 'Adaptador Roscado Macho PVC 1 1/2';
EOF

# Execute the test
echo "Running test..."
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -d "$DB_NAME" -i "$SQL_FILE"

# Check result
if [ $? -eq 0 ]; then
    echo "Test completed successfully."
else
    echo "Error occurred during test execution."
    exit 1
fi

# Clean up
rm -f "$SQL_FILE"

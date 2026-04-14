#!/bin/bash

# Configuration
SERVER="localhost"
ADMIN_USER="Thunktshy"
ADMIN_PASSWORD="eWUmX8owfovKPAR3rWoAww"  # Replace with the actual password
DB_NAME="almacen"

echo "=== Executing olddata.sql ==="

# Check if sqlcmd is available
if ! command -v sqlcmd &> /dev/null; then
    echo "Error: sqlcmd is not installed. Please install it first."
    exit 1
fi

# Check if olddata.sql exists
if [ ! -f "olddata.sql" ]; then
    echo "Error: olddata.sql not found in the current directory."
    exit 1
fi

# Execute the SQL file directly
echo "Executing olddata.sql..."
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -d "$DB_NAME" -i "olddata.sql"

# Check result
if [ $? -eq 0 ]; then
    echo "Successfully executed olddata.sql."
else
    echo "Error occurred during execution."
    exit 1
fi

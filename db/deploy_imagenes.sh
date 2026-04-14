#!/bin/bash

# ==========================================
# CONFIGURACIÓN DE CONEXIÓN Y RUTAS
# ==========================================
DB_SERVER="localhost"
DB_USER="Thunktshy"
DB_PASS="eWUmX8owfovKPAR3rWoAww"  # Asegúrate de que esta sea la contraseña correcta
DB_NAME="almacen"
SQL_FILE="/usr/local/lsws/serverZafiro/ZafiroConstr_web/db/imagenes.sql"

# ==========================================
# VALIDACIÓN DEL ARCHIVO
# ==========================================
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: El archivo SQL no se encuentra en la ruta especificada:"
    echo "   $SQL_FILE"
    exit 1
fi

echo "📂 Archivo encontrado: $SQL_FILE"
echo "🚀 Conectando a $DB_SERVER para ejecutar el script..."

# ==========================================
# EJECUCIÓN DE SQLCMD
# ==========================================
# Explicación de flags:
# -S : Servidor
# -U : Usuario
# -P : Contraseña
# -d : Base de datos
# -i : Archivo de entrada (Input file)
# -b : Detenerse si ocurre un error (Batch abort)
# -C : Confiar en el certificado del servidor (Trust Server Certificate) <- Importante

sqlcmd -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASS" -d "$DB_NAME" -i "$SQL_FILE" -b -C

# ==========================================
# VERIFICACIÓN DE ESTADO
# ==========================================
if [ $? -eq 0 ]; then
    echo "✅ ÉXITO: El script imagenes.sql se ha ejecutado correctamente."
else
    echo "❌ ERROR: Hubo un problema al ejecutar el script."
    exit 1
fi


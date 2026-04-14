#!/bin/bash

# Configuración
SERVER="localhost"
ADMIN_USER="Thunktshy"
ADMIN_PASSWORD="eWUmX8owfovKPAR3rWoAww"  # Reemplaza con la contraseña real
DB_NAME="almacen"
NEW_USER="ricardo"
NEW_USER_PASSWORD="0A0R*%6dJkpR3U%!#ira"  # Cambia por una contraseña segura
SCRIPT_PATH="/usr/local/lsws/serverZafiro/ZafiroConstr_web/db/almacen.sql"

# Paso 1: Crear la base de datos
echo "Creando base de datos..."
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -Q "IF DB_ID('$DB_NAME') IS NULL CREATE DATABASE [$DB_NAME];"

# Paso 2: Crear el login y usuario
echo "Creando usuario..."
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -Q "IF SUSER_ID('$NEW_USER') IS NULL CREATE LOGIN [$NEW_USER] WITH PASSWORD = '$NEW_USER_PASSWORD';"
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -Q "USE [$DB_NAME]; IF USER_ID('$NEW_USER') IS NULL CREATE USER [$NEW_USER] FOR LOGIN [$NEW_USER];"

# Paso 3: Asignar propietario de la base de datos (recomendado)
echo "Asignando propietario..."
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -Q "ALTER AUTHORIZATION ON DATABASE::[$DB_NAME] TO [$NEW_USER];"

# Paso 4: Revocar permisos públicos (aislamiento) - opcional
echo "Revocando permisos públicos..."
# Ajusta estos REVOKE según tus necesidades reales de seguridad
sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -Q "USE [$DB_NAME]; REVOKE SELECT, INSERT, UPDATE, DELETE, EXECUTE TO PUBLIC;"

# Paso 5: Ejecutar script almacen.sql con SETs necesarios al inicio (omite primeras 4 líneas del archivo original)
echo "Ejecutando script de base de datos con SETs requeridos..."
(
  cat <<'SQL'
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
SQL
  # Ahora concatenamos el script original a partir de la línea 5
  tail -n +5 "$SCRIPT_PATH"
) | sqlcmd -S "$SERVER" -U "$ADMIN_USER" -P "$ADMIN_PASSWORD" -C -d "$DB_NAME"

echo "Proceso completado."


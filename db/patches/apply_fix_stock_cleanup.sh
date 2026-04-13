#!/usr/bin/env bash
# =====================================================================
# Aplica el patch fix_stock_cleanup.sql contra la base del proyecto.
#
# Uso:
#   ./apply_fix_stock_cleanup.sh             # pide contraseña de forma segura
#   ./apply_fix_stock_cleanup.sh -P 'miPwd'  # no recomendado (queda en history)
#
# Requiere:
#   - sqlcmd instalado
#   - Acceso al servidor SQL Server donde corre Zafiro
# =====================================================================
set -euo pipefail

SERVER="${SQLSERVER:-localhost}"
USER="${SQLUSER:-Thunktshy}"
DATABASE="${SQLDB:-ZafiroConstr}"   # <-- ajusta si tu BD se llama distinto

# Ubicación canónica del patch en el servidor de producción:
#   /usr/local/lsws/serverZafiro/ZafiroConstr_web/db/patches/fix_stock_cleanup.sql
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/fix_stock_cleanup.sql"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "ERROR: No se encontró el patch en $PATCH_FILE" >&2
  exit 1
fi

# Contraseña: argumento -P, variable SQLPASS, o prompt interactivo
PASS=""
if [[ "${1:-}" == "-P" && -n "${2:-}" ]]; then
  PASS="$2"
elif [[ -n "${SQLPASS:-}" ]]; then
  PASS="$SQLPASS"
else
  read -rsp "Password para $USER@$SERVER: " PASS
  echo
fi

echo ">> Servidor:   $SERVER"
echo ">> Usuario:    $USER"
echo ">> Base:       $DATABASE"
echo ">> Patch file: $PATCH_FILE"
echo ">> Aplicando..."

sqlcmd -S "$SERVER" -U "$USER" -P "$PASS" -C -d "$DATABASE" -b -i "$PATCH_FILE"

echo ">> Listo. Patch aplicado."

// Server/utils/dbError.js
// ─────────────────────────────────────────────────────────────────────────────
// Helper para extraer el mensaje de error de un error de mssql/tedious y
// determinar el código HTTP apropiado.
//
// Reglas:
//   • Error de SP (THROW / RAISERROR en SQL Server)
//       err.originalError.info.message  → 400 Bad Request
//       (es un error de negocio intencional del procedimiento)
//
//   • Error inesperado de servidor / red / JS
//       err.message                     → 500 Internal Server Error
//
// Uso en cada catch:
//
//   } catch (err) {
//     console.error('mi_sp error:', err);
//     const { message, status } = extractDbError(err, 'Error al hacer X');
//     return res.status(status).json({ success: false, message });
//   }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Error} err        - El error capturado en el catch
 * @param {string} fallback  - Mensaje genérico si no hay uno mejor
 * @returns {{ message: string, status: number }}
 */
function extractDbError(err, fallback = 'Error interno del servidor') {
  // Mensaje lanzado desde el SP (THROW / RAISERROR con mensaje personalizado)
  const spMsg = err?.originalError?.info?.message;
  if (spMsg) {
    return { message: spMsg, status: 400 };
  }
  // Cualquier otro error (conexión, tipo de dato, etc.) → 500
  return { message: err?.message || fallback, status: 500 };
}

module.exports = { extractDbError };

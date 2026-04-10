// server.js
'use strict';

require('dotenv').config();

/**
 * Importación de módulos
 */
const express  = require('express');     // Servidor HTTP
const cors     = require('cors');        // CORS
const session  = require('express-session'); // Sesiones de usuario
const path     = require('path');        // Rutas de archivos

// Conector con la base de datos (pool + utilidades)
const { db } = require('./db/dbconnector.js');

/**
 * APP y MIDDLEWARES BASE
 */
const app = express();
app.use(express.static('Public'));                 // estáticos públicos
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configuración de sesiones
app.use(session({
  secret: process.env.SESSION_SECRET, // Clave secreta para firmar la cookie de sesión
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { maxAge: 60 * 60 * 1000 } // 1h
}));

const PUBLIC_DIR = path.resolve(process.cwd(), 'Public'); // Ruta absoluta a /Public

// Servir archivos estáticos (css/, scripts/, imágenes, etc.)
app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',      // sirve /Public/index.html en "/"
  maxAge: '1d',             // cache estáticos (opcional)
}));

// Ruta explícita a "/" 
app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});


/**
 * ENDPOINTS DE NEGOCIO
 */

// RUTA DE AUTENTICACIÓN
// Exporta el router principal (login/logout/status) y, además, middlewares de autorización.
const authRouter = require('./Server/Routes/authRouter.js');
// Extrae los middlewares del mismo módulo (evita un segundo require)
const { requireAuth, requireAdmin, requireUser } = authRouter;

// Monta /auth después de tener el router definido
app.use('/auth', authRouter);

/**
 * RECURSOS ESTÁTICOS PROTEGIDOS
 * - /admin-resources: requiere rol Admin (p.ej., paneles internos, reportes sensibles)
 * - /user-resources: requiere solo usuario autenticado
 *
 * Ambos sirven estáticos sin índice por defecto y con caché privada de 1h.
 */

// Admin-only
const PROTECTED_DIR = path.resolve(process.cwd(), 'Protected');
const adminStatic = express.static(PROTECTED_DIR, {
  index: false,
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=3600'),
});
// requiereAdmin valida sesión + rol admin
app.use('/admin-resources', requireAdmin, adminStatic);

// Users (autenticados, no admin)
const USERS_DIR = path.resolve(process.cwd(), 'Usuarios');
const userStatic = express.static(USERS_DIR, {
  index: false,
  maxAge: '1h',
  setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=3600'),
});
// requireUser valida sesión + asegura que no sea admin 
app.use('/user-resources', requireAuth, userStatic);

/**
 * Rutas de dominio
 * Cada router encapsula CRUD/operaciones del recurso y se monta bajo su prefijo.
 */
const cajasRouter = require('./Server/Routes/cajasRouter.js');                   // Cajas y movimientos
app.use('/cajas', cajasRouter);

const categoriasRouter = require('./Server/Routes/categoriasRouter.js');                   // Categorías primarias
app.use('/categorias', categoriasRouter);

const categoriasSecundariasRouter = require('./Server/Routes/categorias_secundariasRouter.js'); // Categorías secundarias
app.use('/categorias_secundarias', categoriasSecundariasRouter);

const subcategoriasRouter = require('./Server/Routes/subcategoriasRouter.js');  // Subcategorías
app.use('/subcategorias', subcategoriasRouter);

const brandsRouter = require('./Server/Routes/brandsRouter.js');                 // Marcas
app.use('/brands', brandsRouter);

const sizesRouter = require('./Server/Routes/sizesRouter.js');                   // Unidades de tamaños
app.use('/sizes', sizesRouter);

const unitsRouter = require('./Server/Routes/unitsRouter.js');                   // Unidades de medida
app.use('/units', unitsRouter);

const productosRouter = require('./Server/Routes/productosRouter.js');           // Productos (CRUD y consultas)
app.use('/productos', productosRouter);

const stockRouter = require('./Server/Routes/stockRouter.js');                   // Operaciones de stock (entradas/salidas/ajustes)
app.use('/stock', stockRouter);

const reportesStockRouter = require('./Server/Routes/reportes_stockRouter.js');  // Reportes e indicadores de stock
app.use('/reportes-stock', reportesStockRouter);

const usuariosRouter = require('./Server/Routes/usuariosRouter.js');             // Gestión de usuarios
app.use('/usuarios', usuariosRouter);

// Extensiones sobre /productos (p.ej., inserción compuesta producto+stock)
const insertProductoWithStockRouter = require('./Server/Routes/insert_producto_with_stock.js');
app.use('/productos', insertProductoWithStockRouter);

/**
 * HEALTHCHECK (para orquestadores/monitoreo)
 * - 200 { ok: true,  status: 'up' } si el proceso está vivo y DB conectada
 * - 503 { ok: false, status: 'db_not_connected' } si no hay conexión a DB
 */
app.get('/health', (req, res) => {
  if (!db || !db.pool || db.pool.connected === false) {
    return res.status(503).json({ ok: false, status: 'db_not_connected' });
  }
  return res.json({ ok: true, status: 'up' });
});


/**
 * ERROR HANDLER GLOBAL 
 * Si algún router hace next(err), respondemos JSON consistente.
 * Si integraste mapSqlError en cada router, esto sirve como red de seguridad.
 */
app.use((err, _req, res, _next) => {
  // Intenta extraer número de error de MSSQL (cuando existe)
  const e = err && (typeof err.number === 'number' ? err : err.originalError);
  if (e && typeof e.number === 'number') {
    // Puedes unificar aquí con un pequeño mapa mínimo o delegar a 500 genérico
    return res.status(500).json({ success:false, message: err.message || 'Error en operación SQL', data:null });
  }
  return res.status(500).json({ success:false, message: err?.message || 'Error inesperado', data:null });
});

/**
 * ARRANQUE CONDICIONADO A LA BD
 */
const port = parseInt(process.env.PORT, 10) || 3000;
let httpServer = null;
let shuttingDown = false;

async function start() {
  try {
    // 1) Verificación de variables críticas
    const requiredEnv = ['DB_USER', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME'];
    const missing = requiredEnv.filter(k => !process.env[k]);
    if (missing.length) {
      console.error('FATAL: Variables de entorno faltantes:', missing.join(', '));
      process.exit(1);
    }

    // 2) Espera a que la BD conecte
    console.log('Esperando conexión a la base de datos...');
    await db.poolReady;

    // 3) Arranca HTTP
    httpServer = app.listen(port, () => {
      console.log(`Servidor corriendo en el puerto ${port}`);
    });

    httpServer.on('error', (err) => {
      console.error('Error del servidor HTTP:', err);
      safeShutdown('http_server_error', 1);
    });

  } catch (err) {
    console.error('FATAL: No se pudo conectar con la base de datos. El servidor no arrancará.', err);
    process.exit(1);
  }
}

/**
 * APAGADO ORDENADO
 */
async function safeShutdown(reason = 'shutdown', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[${reason}] Cerrando servidor...`);

  // 1) Cierra HTTP
  await new Promise((resolve) => {
    if (!httpServer) return resolve();
    httpServer.close((err) => {
      if (err) console.error('Error al cerrar HTTP:', err);
      resolve();
    });
  });

  // 2) Cierra pool SQL
  if (db && typeof db.close === 'function') {
    try { await db.close(); } catch (e) { console.error('Error al cerrar pool SQL:', e); }
  }

  console.log('Apagado completo.');
  process.exit(exitCode);
}

// Señales y errores no controlados
process.on('SIGINT',  () => safeShutdown('SIGINT', 0));
process.on('SIGTERM', () => safeShutdown('SIGTERM', 0));
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
  safeShutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  safeShutdown('uncaughtException', 1);
});

// Inicia
start();

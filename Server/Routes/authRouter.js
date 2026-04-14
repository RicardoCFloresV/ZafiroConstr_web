// Routes/authRoute.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');

// ajusta la ruta a tu conector
const { db, sql } = require('../../db/dbconnector.js');

const router = express.Router();
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'connect.sid';

// Updated paths:
const ADMIN_HOME = '/admin-resources/pages/admin.html';
const USER_HOME  = '/user-resources/pages/miCuenta.html';

// ---------------------------
// Helpers 
// ---------------------------
function saveSession(req) {
  return new Promise((resolve, reject) =>
    req.session.save(err => (err ? reject(err) : resolve()))
  );
}
function regenerateSession(req) {
  return new Promise((resolve, reject) =>
    req.session.regenerate(err => (err ? reject(err) : resolve()))
  );
}
function isHtmlRequest(req) {
  return (req.headers.accept || '').includes('text/html');
}

// ---------------------------
// POST /login
// ---------------------------
router.post('/login', [
  // Change validation from 'email' to 'login'
  body('login').trim().isLength({ min: 1, max: 150 }).withMessage('Usuario o email requerido'),
  body('password').notEmpty().withMessage('Se requiere contraseña').isLength({ min: 6 })
], async (req, res) => {
  // Marcador único por request para correlacionar líneas de log
  const reqId = `login#${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const log = (...args) => console.log(`[auth ${reqId}]`, ...args);
  const warn = (...args) => console.warn(`[auth ${reqId}]`, ...args);

  log('--- INICIO /auth/login ---');
  log('IP:', req.ip, '| UA:', (req.headers['user-agent'] || '').slice(0, 80));
  log('Content-Type:', req.headers['content-type'] || '(ninguno)');
  log('Body keys:', Object.keys(req.body || {}));
  log('login recibido:', JSON.stringify(req.body?.login));
  log('password length:', (req.body?.password || '').length);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    warn('422 Validación fallida ->', errors.array());
    return res.status(422).json({
      success: false,
      message: 'Errores de validación',
      errors: errors.array()
    });
  }

  const { login, password } = req.body; // Changed from email to login

  try {
    log('Ejecutando SP buscar_id_para_login con login=', login);
    const rows = await db.executeProc('buscar_id_para_login', {
      login: { type: sql.NVarChar(150), value: login } // Changed parameter name
    });
    log('SP devolvió', rows?.length || 0, 'fila(s).');

    if (!rows?.length) {
      warn('401 -> usuario no encontrado o inactivo (rows vacío)');
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    // Log de la primera fila SIN exponer la contraseña en texto plano
    const rawRow = rows[0] || {};
    log('Fila[0] keys:', Object.keys(rawRow));
    log('Fila[0] preview:', {
      id: rawRow.id,
      nombre: rawRow.nombre,
      email: rawRow.email,
      tipo: rawRow.tipo,
      estado: rawRow.estado,
      contrasena_present: rawRow.contrasena != null,
      contrasena_length: rawRow.contrasena ? String(rawRow.contrasena).length : 0,
      contrasena_looks_bcrypt: /^\$2[aby]\$/.test(String(rawRow.contrasena || ''))
    });

    const { id, contrasena, tipo, nombre } = rawRow;
    if (!id || !contrasena || !tipo) {
      warn('401 -> fila incompleta. id?', !!id, 'contrasena?', !!contrasena, 'tipo?', !!tipo);
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    log('Comparando password con bcrypt.compare...');
    let ok = false;
    try {
      ok = await bcrypt.compare(password, contrasena);
    } catch (cmpErr) {
      warn('bcrypt.compare lanzó error:', cmpErr && cmpErr.message);
      // Posible causa: el hash no es bcrypt (texto plano en BD) -> log explícito
      if (!/^\$2[aby]\$/.test(String(contrasena))) {
        warn('La contrasena almacenada NO tiene formato bcrypt ($2a/$2b/$2y). Revisa cómo se insertó el usuario.');
      }
    }
    log('Resultado bcrypt.compare =', ok);

    if (!ok) {
      warn('401 -> contraseña incorrecta');
      return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    }

    const normTipo = String(tipo).trim().toLowerCase(); // "usuario" | "admin"
    const isUser  = normTipo === 'usuario';
    const isAdmin = normTipo === 'admin';
    log('Tipo normalizado:', normTipo, '| isUser:', isUser, '| isAdmin:', isAdmin);

    await regenerateSession(req);
    log('Sesión regenerada. sid:', req.sessionID);

    req.session.userID   = id;
    req.session.userType = tipo;
    req.session.username = nombre || null;
    req.session.isAdmin  = isAdmin;
    req.session.isUser   = isUser || (!isAdmin && !isUser);
    req.session.isAuth   = req.session.isUser || req.session.isAdmin;

    await saveSession(req);
    log('Sesión guardada. Flags:', {
      userID: req.session.userID,
      userType: req.session.userType,
      isUser: req.session.isUser,
      isAdmin: req.session.isAdmin,
      isAuth: req.session.isAuth
    });

    if (isHtmlRequest(req)) {
      log('Request HTML -> redirect 303 a', req.session.isAdmin ? ADMIN_HOME : USER_HOME);
      return res.redirect(303, req.session.isAdmin ? ADMIN_HOME : USER_HOME);
    }

    log('200 -> login OK (JSON). --- FIN ---');
    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso.',
      userID: req.session.userID,
      username: req.session.username || 'Bienvenido',
      userType: req.session.userType,
      isUser: req.session.isUser === true,
      isAdmin: req.session.isAdmin === true,
      isAuth: req.session.isAuth === true
    });
  } catch (err) {
    console.error(`[auth ${reqId}] Error en el login:`, err);
    return res.status(500).json({ success: false, message: 'Error en el servidor.' });
  }
});

// ---------------------------
// POST /logout  &  GET /logout
// ---------------------------
function logoutHandler(req, res) {
  if (!req.session) {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return res.json({ success: true, message: 'Sesión cerrada correctamente' });
  }

  req.session.destroy(err => {
    if (err) {
      console.error('Error al destruir la sesión:', err);
      return res.status(500).json({ success: false, message: 'Error al cerrar sesión.' });
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    if (isHtmlRequest(req)) {
      return res.redirect(303, '/'); // para clics directos
    }
    return res.json({ success: true, message: 'Sesión cerrada correctamente' });
  });
}

router.post('/logout', logoutHandler);
router.get('/logout', logoutHandler);

// ---------------------------
// GET /auth/status  (para menu.js)
// ---------------------------
router.get('/auth/status', (req, res) => {
  const authenticated = !!req.session?.userID;
  res.set('Cache-Control', 'no-store');
  return res.json({
    authenticated,
    userType: authenticated ? (req.session.userType || 'Usuario') : 'guest',
    isAdmin:  !!req.session?.isAdmin,
    isUser:   !!req.session?.isUser,
    isAuth:   !!req.session?.isAuth,
    userID:   authenticated ? (req.session.userID || null) : null,
    username: authenticated ? (req.session.username || null) : null
  });
});

// ---------------------------
// Middlewares de autorización
// ---------------------------
function requireAuth(req, res, next) {
  const hasSession = !!req.session?.userID;
  const hasAllowedRole = !!(req.session?.isAdmin || req.session?.isUser);

  if (hasSession && hasAllowedRole) return next();

  // No autenticado
  if (isHtmlRequest(req)) return res.redirect('/index.html');
  return res.status(401).json({ success: false, message: 'No autenticado.' });
}

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) {
    if (isHtmlRequest(req)) return res.redirect('/index.html');
    return res.status(403).json({ success: false, message: 'Prohibido: se requieren privilegios de administrador' });
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.session?.isUser) {
    if (isHtmlRequest(req)) return res.redirect('/index.html');
    return res.status(403).json({ success: false, message: 'Prohibido: solo para Usuarios' });
  }
  next();
}

// Exportaciones
module.exports = router;
module.exports.requireAuth  = requireAuth;   // acepta Usuario o Admin
module.exports.requireAdmin = requireAdmin;
module.exports.requireUser  = requireUser;

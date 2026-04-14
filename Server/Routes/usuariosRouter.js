// Server/routes/usuariosRouter.js
// Stored Procedures usados (parámetros y retorno esperado):
//
// - usuarios_insert(@nombre NVARCHAR(100), @contrasena NVARCHAR(255), @email NVARCHAR(150), @tipo NVARCHAR(10)=NULL)
//     -> RETURNS: [ { usuario_id, nombre, email, estado, tipo } ]
//
// - usuarios_update(@usuario_id INT, @nombre NVARCHAR(100), @email NVARCHAR(150), @tipo NVARCHAR(10)=NULL)
//     -> RETURNS: [ { usuario_id, nombre, email, estado, tipo } ]
//
// - usuarios_delete(@usuario_id INT)
//     -> RETURNS: none
//
// - usuarios_get_all()
//     -> RETURNS: [ { usuario_id, nombre, email, fecha_registro, estado, tipo }, ... ]
//
// - usuario_por_id(@usuario_id INT)
//     -> RETURNS: [ { usuario_id, nombre, contrasena, email, fecha_registro, estado, tipo } ] (0/1)
//
// - usuario_por_email(@email NVARCHAR(150))
//     -> RETURNS: [ { usuario_id, nombre, email, fecha_registro, estado, tipo } ] (0/1)
//
// - buscar_id_para_login(@email NVARCHAR(150))   **(público)**
//     -> RETURNS: TOP(1) [ { id (NVARCHAR), contrasena, nombre, email, tipo } ]  (solo estado=1)
//
// Protecciones (sugeridas):
//   - insert/update → requireAuth
//   - delete/get_all/set_tipo/set_admin → requireAdmin
//   - por_id / por_email → requireAuth
//   - login_lookup → público (sin auth/admin)
const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { requireAuth, requireAdmin } = require('./authRouter.js'); // ajusta a authRouter.js si aplica
const {
  InsertRules,
  UpdateRules,
  DeleteRules,
  PorIdRules,
  PorEmailRules,
  SetTipoRules,
  SetAdminRules,
  LoginLookupRules
} = require('../Validators/Rulesets/usuarios.js');

const Router = express.Router();

function BuildParams(entries) {
  const p = {};
  for (const e of entries) p[e.name] = { type: e.type, value: e.value };
  return p;
}

/**
 * Normaliza el campo `tipo` al enum aceptado por los SPs de usuarios.
 * Acepta mayúsculas/minúsculas y sinónimos en inglés:
 *   '', null, undefined       -> null     (el SP aplicará el default 'Usuario')
 *   'usuario','user'          -> 'Usuario'
 *   'admin','administrador'   -> 'Admin'
 *   cualquier otro valor      -> lanza Error con 400
 */
function normalizeTipo(raw) {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const k = t.toLowerCase();
  if (k === 'usuario' || k === 'user')            return 'Usuario';
  if (k === 'admin'   || k === 'administrador')   return 'Admin';
  const err = new Error("tipo inválido: solo se permite 'Usuario' o 'Admin'");
  err.status = 400;
  throw err;
}

/* ============================== INSERT (auth) ============================== */
Router.post('/insert', requireAdmin, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, InsertRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (insert)', errors });

    let tipo;
    try { tipo = normalizeTipo(B.tipo); }
    catch (e) { return res.status(400).json({ success:false, message: e.message }); }

    const params = BuildParams([
      { name:'nombre',      type: sql.NVarChar(100), value: B.nombre },
      { name:'contrasena',  type: sql.NVarChar(255), value: B.contrasena },
      { name:'email',       type: sql.NVarChar(150), value: B.email },
      { name:'tipo',        type: sql.NVarChar(10),  value: tipo }
    ]);

    const data = await db.executeProc('usuarios_insert', params);
    return res.status(201).json({ success:true, message:'Usuario creado', data });
  } catch (err) {
    console.error('usuarios_insert error:', err);
    return res.status(500).json({ success:false, message:'Error al crear el usuario' });
  }
});

/* ============================== UPDATE (auth) ============================== */
Router.post('/update', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, UpdateRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (update)', errors });

    let tipo;
    try { tipo = normalizeTipo(B.tipo); }
    catch (e) { return res.status(400).json({ success:false, message: e.message }); }

    const params = BuildParams([
      { name:'usuario_id', type: sql.Int,            value: Number(B.usuario_id) },
      { name:'nombre',     type: sql.NVarChar(100),  value: B.nombre },
      { name:'email',      type: sql.NVarChar(150),  value: B.email },
      { name:'tipo',       type: sql.NVarChar(10),   value: tipo }
    ]);

    const data = await db.executeProc('usuarios_update', params);
    return res.status(200).json({ success:true, message:'Usuario actualizado', data });
  } catch (err) {
    console.error('usuarios_update error:', err);
    return res.status(500).json({ success:false, message:'Error al actualizar el usuario' });
  }
});

/* =============================== DELETE (admin) =========================== */
Router.post('/delete', requireAdmin, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, DeleteRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (delete)', errors });

    await db.executeProc('usuarios_delete', {
      usuario_id: { type: sql.Int, value: Number(B.usuario_id) }
    });

    return res.status(200).json({ success:true, message:'Usuario eliminado' });
  } catch (err) {
    console.error('usuarios_delete error:', err);
    return res.status(500).json({ success:false, message:'Error al eliminar el usuario' });
  }
});

/* =============================== GET ALL (admin) ========================== */
Router.get('/get_all', requireAdmin, async (_req, res) => {
  try {
    const data = await db.executeProc('usuarios_get_all', {});
    return res.status(200).json({ success:true, message:'Listado de usuarios', data });
  } catch (err) {
    console.error('usuarios_get_all error:', err);
    return res.status(500).json({ success:false, message:'Error al obtener usuarios' });
  }
});

/* =============================== GET por_id (auth) ======================== */
Router.get('/por_id/:usuario_id', requireAuth, async (req, res) => {
  try {
    const B = { usuario_id: Number(req.params.usuario_id) };
    const { isValid, errors } = await ValidationService.validateData(B, PorIdRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_id)', errors });

    const data = await db.executeProc('usuario_por_id', {
      usuario_id: { type: sql.Int, value: B.usuario_id }
    });

    if (!data?.length) return res.status(404).json({ success:false, message:'Usuario no encontrado' });

    // Por seguridad, no devolvemos contrasena si viene en el result set
    const { contrasena, ...safe } = data[0];
    return res.status(200).json({ success:true, message:'Usuario obtenido', data: safe });
  } catch (err) {
    console.error('usuario_por_id error:', err);
    return res.status(500).json({ success:false, message:'Error al obtener el usuario' });
  }
});

/* ============================== GET por_email (auth) ====================== */
Router.get('/por_email/:email', requireAuth, async (req, res) => {
  try {
    const B = { email: String(req.params.email) };
    const { isValid, errors } = await ValidationService.validateData(B, PorEmailRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_email)', errors });

    const data = await db.executeProc('usuario_por_email', {
      email: { type: sql.NVarChar(150), value: B.email }
    });

    if (!data?.length) return res.status(404).json({ success:false, message:'Usuario no encontrado' });
    return res.status(200).json({ success:true, message:'Usuario obtenido por email', data: data[0] });
  } catch (err) {
    console.error('usuario_por_email error:', err);
    return res.status(500).json({ success:false, message:'Error al obtener el usuario por email' });
  }
});

/* ======================= GET login_lookup (público) ======================= */
// SP: buscar_id_para_login(@email NVARCHAR(150))
// RETURNS: TOP(1) { id (NVARCHAR), contrasena, nombre, email, tipo } (solo estado=1)
Router.get('/login_lookup/:email', async (req, res) => {
  try {
    const B = { email: String(req.params.email) };
    const { isValid, errors } = await ValidationService.validateData(B, LoginLookupRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (login_lookup)', errors });

    const data = await db.executeProc('buscar_id_para_login', {
      email: { type: sql.NVarChar(150), value: B.email }
    });

    if (!data?.length) return res.status(404).json({ success:false, message:'Usuario no encontrado o inactivo' });

    // Seguridad: evitar exponer 'contrasena' públicamente
    const { contrasena, ...safe } = data[0];
    return res.status(200).json({ success:true, message:'Lookup de login', data: safe });

    // Si deseas devolver 'contrasena' (p.ej., hash) elimina el filtrado anterior.
  } catch (err) {
    console.error('buscar_id_para_login error:', err);
    return res.status(500).json({ success:false, message:'Error en login lookup' });
  }
});

/* ================================ SET TIPO (admin) ======================== */
Router.post('/set_tipo', requireAdmin, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, SetTipoRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (set_tipo)', errors });

    let tipo;
    try { tipo = normalizeTipo(B.tipo); }
    catch (e) { return res.status(400).json({ success:false, message: e.message }); }
    if (tipo == null) {
      return res.status(400).json({ success:false, message:"tipo es requerido ('Usuario' o 'Admin')" });
    }

    const data = await db.executeProc('usuarios_set_tipo', {
      usuario_id: { type: sql.Int, value: Number(B.usuario_id) },
      tipo:       { type: sql.NVarChar(10), value: tipo }
    });

    return res.status(200).json({ success:true, message:'Tipo de usuario actualizado', data });
  } catch (err) {
    console.error('usuarios_set_tipo error:', err);
    return res.status(500).json({ success:false, message:'Error al actualizar tipo de usuario' });
  }
});

/* ================================ SET ADMIN (admin) ======================= */
Router.post('/set_admin', requireAdmin, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, SetAdminRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (set_admin)', errors });

    const data = await db.executeProc('usuarios_set_admin', {
      usuario_id: { type: sql.Int, value: Number(B.usuario_id) }
    });

    return res.status(200).json({ success:true, message:'Usuario marcado como admin', data });
  } catch (err) {
    console.error('usuarios_set_admin error:', err);
    return res.status(500).json({ success:false, message:'Error al marcar admin' });
  }
});

module.exports = Router;

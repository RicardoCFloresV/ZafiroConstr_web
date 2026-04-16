// Server/routes/categorias_secundariasRouter.js
// Stored Procedures usados (con @parámetros y retorno):
// - categorias_secundarias_insert(@nombre NVARCHAR(100))
//     -> RETURNS: [ { categoria_secundaria_id, nombre } ]
// - categorias_secundarias_update(@categoria_secundaria_id INT, @nombre NVARCHAR(100))
//     -> RETURNS: [ { categoria_secundaria_id, nombre } ]
// - categorias_secundarias_delete(@categoria_secundaria_id INT)
//     -> RETURNS: none
// - categorias_secundarias_get_all()
//     -> RETURNS: [ { categoria_secundaria_id, nombre }, ... ]
// - categorias_secundarias_get_list()
//     -> RETURNS: [ { categoria_secundaria_id, nombre }, ... ]
// - categorias_secundarias_get_by_id(@categoria_secundaria_id INT)
//     -> RETURNS: [ { categoria_secundaria_id, nombre } ]  (0 o 1)

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const {
  InsertRules,
  UpdateRules,
  DeleteRules,
  PorIdRules
} = require('../Validators/Rulesets/categorias_secundarias.js');

const { requireAuth, requireAdmin } = require('./authRouter.js'); // ajusta si tu archivo es authRouter.js
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

function BuildParams(entries) {
  const params = {};
  for (const e of entries) params[e.name] = { type: e.type, value: e.value };
  return params;
}

/* INSERT (auth) */
Router.post('/insert', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, InsertRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (insert)', errors });

    const params = BuildParams([
      { name: 'nombre', type: sql.NVarChar(100), value: body.nombre }
    ]);

    const data = await db.executeProc('categorias_secundarias_insert', params);
    return res.status(201).json({ success: true, message: 'Categoría secundaria creada', data });
  } catch (err) {
    console.error('categorias_secundarias_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al crear la categoría secundaria');
    return res.status(status).json({ success: false, message });
  }
});

/* UPDATE (auth) */
Router.post('/update', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, UpdateRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (update)', errors });

    const params = BuildParams([
      { name: 'categoria_secundaria_id', type: sql.Int,           value: Number(body.categoria_secundaria_id) },
      { name: 'nombre',                  type: sql.NVarChar(100), value: body.nombre }
    ]);

    const data = await db.executeProc('categorias_secundarias_update', params);
    return res.status(200).json({ success: true, message: 'Categoría secundaria actualizada', data });
  } catch (err) {
    console.error('categorias_secundarias_update error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar la categoría secundaria');
    return res.status(status).json({ success: false, message });
  }
});

/* DELETE (admin) */
Router.post('/delete', requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, DeleteRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (delete)', errors });

    const params = BuildParams([
      { name: 'categoria_secundaria_id', type: sql.Int, value: Number(body.categoria_secundaria_id) }
    ]);

    await db.executeProc('categorias_secundarias_delete', params);
    return res.status(200).json({ success: true, message: 'Categoría secundaria eliminada' });
  } catch (err) {
    console.error('categorias_secundarias_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar la categoría secundaria');
    return res.status(status).json({ success: false, message });
  }
});

/* GET ALL (public) */
Router.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('categorias_secundarias_get_all', {});
    return res.status(200).json({ success: true, message: 'Listado de categorías secundarias', data });
  } catch (err) {
    console.error('categorias_secundarias_get_all error:', err);
    const { message, status } = extractDbError(err, 'Error al listar categorías secundarias');
    return res.status(status).json({ success: false, message });
  }
});

/* GET LIST (public) */
Router.get('/get_list', async (_req, res) => {
  try {
    const data = await db.executeProc('categorias_secundarias_get_list', {});
    return res.status(200).json({ success: true, message: 'Listado simple de categorías secundarias', data });
  } catch (err) {
    console.error('categorias_secundarias_get_list error:', err);
    const { message, status } = extractDbError(err, 'Error al listar categorías secundarias (simple)');
    return res.status(status).json({ success: false, message });
  }
});

/* GET BY ID (public) */
Router.get('/por_id/:categoria_secundaria_id', async (req, res) => {
  try {
    const body = { categoria_secundaria_id: Number(req.params.categoria_secundaria_id) };
    const { isValid, errors } = await ValidationService.validateData(body, PorIdRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (por_id)', errors });

    const data = await db.executeProc('categorias_secundarias_get_by_id', {
      categoria_secundaria_id: { type: sql.Int, value: body.categoria_secundaria_id }
    });

    if (!Array.isArray(data) || !data.length)
      return res.status(404).json({ success: false, message: 'Categoría secundaria no encontrada' });

    return res.status(200).json({ success: true, message: 'Categoría secundaria obtenida', data: data[0] });
  } catch (err) {
    console.error('categorias_secundarias_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener la categoría secundaria');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

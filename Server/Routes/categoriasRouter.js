// Server/routes/categoriasRouter.js
// Rutas para PROCEDIMIENTOS de CATEGORÍAS
//
// SPs usados (con @parámetros y retorno):
// - categorias_insert(@nombre NVARCHAR(100), @descripcion NVARCHAR(255)=NULL)
//   -> SELECT categoria_id, nombre, descripcion (fila creada)                                  [INSERT] 201
// - categorias_update(@categoria_id INT, @nombre NVARCHAR(100), @descripcion NVARCHAR(255)=NULL)
//   -> SELECT categoria_id, nombre, descripcion (fila actualizada)                              [UPDATE] 200
// - categorias_delete(@categoria_id INT)
//   -> Sin filas; 200 en éxito                                                                   [DELETE] 200
// - categorias_get_all()
//   -> SELECT categoria_id, nombre, descripcion (n filas)                                        [GET]    200
// - categorias_get_list()
//   -> SELECT categoria_id, nombre (n filas)                                                     [GET]    200
// - categorias_get_by_id(@categoria_id INT)
//   -> SELECT categoria_id, nombre, descripcion (0 o 1 fila)                                     [GET]    200/404

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');            // mismo patrón de rutas que el resto
const ValidationService = require('../Validators/validatorService.js');
const {
  InsertRules,
  UpdateRules,
  DeleteRules,
  PorIdRules
} = require('../Validators/Rulesets/categorias.js');

const { requireAuth, requireAdmin } = require('./authRouter.js');
const { extractDbError } = require('../utils/dbError.js');

const CategoriasRouter = express.Router();

// Helper params { name, type, value } -> { [name]: { type, value } }
function BuildParams(entries) {
  const params = {};
  for (const e of entries) params[e.name] = { type: e.type, value: e.value };
  return params;
}


/* ============================================================================
   POST /categorias/insert  -> SP: categorias_insert
   @nombre NVARCHAR(100), @descripcion NVARCHAR(255)=NULL
   Return: [{ categoria_id, nombre, descripcion }]
   Protección: requireAuth
============================================================================ */
CategoriasRouter.post('/insert', requireAuth, async (req, res) => {
  try {
    const Body = req.body;
    const { isValid, errors } = await ValidationService.validateData(Body, InsertRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (insert)', errors });

    const Params = BuildParams([
      { name: 'nombre',      type: sql.NVarChar(100), value: Body.nombre },
      { name: 'descripcion', type: sql.NVarChar(255), value: Body.descripcion ?? null }
    ]);

    const data = await db.executeProc('categorias_insert', Params);
    return res.status(201).json({ success: true, message: 'Categoría creada', data });
  } catch (err) {
    console.error('categorias_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al crear la categoría');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   POST /categorias/update  -> SP: categorias_update
   @categoria_id INT, @nombre NVARCHAR(100), @descripcion NVARCHAR(255)=NULL
   Return: [{ categoria_id, nombre, descripcion }]
   Protección: requireAuth
============================================================================ */
CategoriasRouter.post('/update', requireAuth, async (req, res) => {
  try {
    const Body = req.body;
    console.log('Received update request:', Body);
    const { isValid, errors } = await ValidationService.validateData(Body, UpdateRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (update)', errors });

    const Params = BuildParams([
      { name: 'categoria_id', type: sql.Int,            value: Body.categoria_id },
      { name: 'nombre',       type: sql.NVarChar(100),  value: Body.nombre },
      { name: 'descripcion',  type: sql.NVarChar(255),  value: Body.descripcion ?? null }
    ]);

    const data = await db.executeProc('categorias_update', Params);
    return res.status(200).json({ success: true, message: 'Categoría actualizada', data });
  } catch (err) {
    console.log('categorias_update error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar la categoría');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   POST /categorias/delete  -> SP: categorias_delete
   @categoria_id INT
   Return: sin filas; 200 en éxito
   Protección: requireAdmin
============================================================================ */
CategoriasRouter.post('/delete', requireAdmin, async (req, res) => {
  try {
    const Body = req.body;
    const { isValid, errors } = await ValidationService.validateData(Body, DeleteRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (delete)', errors });

    const Params = BuildParams([{ name: 'categoria_id', type: sql.Int, value: Body.categoria_id }]);
    await db.executeProc('categorias_delete', Params);
    return res.status(200).json({ success: true, message: 'Categoría eliminada' });
  } catch (err) {
    console.error('categorias_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar la categoría');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   GET /categorias/get_all  -> SP: categorias_get_all
   Params: none
   Return: [{ categoria_id, nombre, descripcion }, ...]
   Protección: ninguna (lectura)
============================================================================ */
CategoriasRouter.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('categorias_get_all', {});
    return res.status(200).json({ success: true, message: 'Listado de categorías', data });
  } catch (err) {
    console.error('categorias_get_all error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener las categorías');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   GET /categorias/get_list  -> SP: categorias_get_list
   Params: none
   Return: [{ categoria_id, nombre }, ...]
   Protección: ninguna (lectura)
============================================================================ */
CategoriasRouter.get('/get_list', async (_req, res) => {
  try {
    const data = await db.executeProc('categorias_get_list', {});
    return res.status(200).json({ success: true, message: 'Listado simple de categorías', data });
  } catch (err) {
    console.error('categorias_get_list error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener la lista de categorías');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   GET /categorias/por_id/:categoria_id  -> SP: categorias_get_by_id
   @categoria_id INT (via URL)
   Return: { categoria_id, nombre, descripcion } | 404
   Protección: ninguna (lectura)
============================================================================ */
CategoriasRouter.get('/por_id/:categoria_id', async (req, res) => {
  try {
    const Body = { categoria_id: Number(req.params.categoria_id) };
    const { isValid, errors } = await ValidationService.validateData(Body, PorIdRules);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (por_id)', errors });

    const Params = BuildParams([{ name: 'categoria_id', type: sql.Int, value: Body.categoria_id }]);
    const data = await db.executeProc('categorias_get_by_id', Params);
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    }
    return res.status(200).json({ success: true, message: 'Categoría obtenida', data: data[0] });
  } catch (err) {
    console.error('categorias_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener la categoría');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = CategoriasRouter;

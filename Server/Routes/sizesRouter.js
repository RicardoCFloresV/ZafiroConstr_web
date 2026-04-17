// Server/routes/sizesRouter.js
// Stored procedures (params y retorno esperado):
// - sizes_insert(@nombre NVARCHAR(50))
//     -> RETURNS: [ { size_id, nombre } ]
// - sizes_update(@size_id INT, @nombre NVARCHAR(50))
//     -> RETURNS: none
// - sizes_delete(@size_id INT)
//     -> RETURNS: none
// - sizes_get_all()
//     -> RETURNS: [ { size_id, nombre }, ... ]
// - sizes_get_by_id(@size_id INT)   (creado previamente)
//     -> RETURNS: [ { size_id, nombre } ]  (0 o 1)

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { InsertRules, UpdateRules, DeleteRules, PorIdRules } =
  require('../Validators/Rulesets/sizes.js');

const { requireAuth, requireAdmin } = require('./authRouter.js');
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

function BuildParams(entries) {
  const p = {}; for (const e of entries) p[e.name] = { type: e.type, value: e.value }; return p;
}

/* INSERT (auth) */
Router.post('/insert', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    console.log('sizes_insert body:', body); // Debug log
    const { isValid, errors } = await ValidationService.validateData(body, InsertRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (insert)', errors });

    const params = BuildParams([{ name:'nombre', type: sql.NVarChar(50), value: body.nombre }]);
    const data = await db.executeProc('sizes_insert', params);
    return res.status(201).json({ success:true, message:'Talla creada', data });
  } catch (err) {
    console.error('sizes_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al crear la talla');
    return res.status(status).json({ success: false, message });
  }
});

// Nombres reservados que no pueden modificarse ni eliminarse
const PROTECTED_SIZES = ['Sin Dimensiones'];

/* UPDATE (auth) */
Router.post('/update', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, UpdateRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (update)', errors });

    // Proteger valores predeterminados del sistema
    const existing = await db.executeProc('sizes_get_by_id', { size_id: { type: sql.Int, value: Number(body.size_id) } });
    if (existing?.length && PROTECTED_SIZES.includes(existing[0].nombre)) {
      return res.status(400).json({ success:false, message:`"${existing[0].nombre}" es un valor predeterminado del sistema y no puede modificarse.` });
    }

    const params = BuildParams([
      { name:'size_id', type: sql.Int,           value: Number(body.size_id) },
      { name:'nombre',  type: sql.NVarChar(50),  value: body.nombre }
    ]);
    await db.executeProc('sizes_update', params);
    return res.status(200).json({ success:true, message:'Talla actualizada' });
  } catch (err) {
    console.error('sizes_update error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar la talla');
    return res.status(status).json({ success: false, message });
  }
});

/* DELETE (admin) */
Router.post('/delete', requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, DeleteRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (delete)', errors });

    // Proteger valores predeterminados del sistema
    const existing = await db.executeProc('sizes_get_by_id', { size_id: { type: sql.Int, value: Number(body.size_id) } });
    if (existing?.length && PROTECTED_SIZES.includes(existing[0].nombre)) {
      return res.status(400).json({ success:false, message:`"${existing[0].nombre}" es un valor predeterminado del sistema y no puede eliminarse.` });
    }

    const params = BuildParams([{ name:'size_id', type: sql.Int, value: Number(body.size_id) }]);
    await db.executeProc('sizes_delete', params);
    return res.status(200).json({ success:true, message:'Talla eliminada' });
  } catch (err) {
    console.error('sizes_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar la talla');
    return res.status(status).json({ success: false, message });
  }
});

/* GET ALL (public) */
Router.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('sizes_get_all', {});
    return res.status(200).json({ success:true, message:'Listado de tallas', data });
  } catch (err) {
    console.error('sizes_get_all error:', err);
    const { message, status } = extractDbError(err, 'Error al listar tallas');
    return res.status(status).json({ success: false, message });
  }
});

/* GET BY ID (public) */
Router.get('/por_id/:size_id', async (req, res) => {
  try {
    const body = { size_id: Number(req.params.size_id) };
    console.log('sizes_get_by_id body:', body); // Debug log
    const { isValid, errors } = await ValidationService.validateData(body, PorIdRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_id)', errors });

    const data = await db.executeProc('sizes_get_by_id', {
      size_id: { type: sql.Int, value: body.size_id }
    });

    if (!data?.length) return res.status(404).json({ success:false, message:'Talla no encontrada' });
    return res.status(200).json({ success:true, message:'Talla obtenida', data: data[0] });
  } catch (err) {
    console.error('sizes_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener la talla');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

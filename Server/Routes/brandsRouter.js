// Server/routes/brandsRouter.js
// Stored procedures (params y retorno esperado):
// - brands_insert(@nombre NVARCHAR(50))
//     -> RETURNS: [ { brand_id, nombre } ]
// - brands_update(@brand_id INT, @nombre NVARCHAR(50))
//     -> RETURNS: none (si prefieres consistencia, puedes ajustar el SP para que devuelva la fila actualizada)
// - brands_delete(@brand_id INT)
//     -> RETURNS: none
// - brands_get_all()
//     -> RETURNS: [ { brand_id, nombre }, ... ]
// - brands_get_by_id(@brand_id INT)   (creado previamente)
//     -> RETURNS: [ { brand_id, nombre } ]  (0 o 1)

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { InsertRules, UpdateRules, DeleteRules, PorIdRules } = require('../Validators/Rulesets/brands.js');

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
    const { isValid, errors } = await ValidationService.validateData(body, InsertRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (insert)', errors });

    const params = BuildParams([{ name:'nombre', type: sql.NVarChar(50), value: body.nombre }]);
    const data = await db.executeProc('brands_insert', params);
    return res.status(201).json({ success:true, message:'Marca creada', data });
  } catch (err) {
    console.error('brands_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al crear la marca');
    return res.status(status).json({ success: false, message });
  }
});

/* UPDATE (auth) */
Router.post('/update', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, UpdateRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (update)', errors });

    const params = BuildParams([
      { name:'brand_id', type: sql.Int,           value: Number(body.brand_id) },
      { name:'nombre',   type: sql.NVarChar(50),  value: body.nombre }
    ]);
    await db.executeProc('brands_update', params);
    return res.status(200).json({ success:true, message:'Marca actualizada' });
  } catch (err) {
    console.error('brands_update error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar la marca');
    return res.status(status).json({ success: false, message });
  }
});

/* DELETE (admin) */
Router.post('/delete', requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, DeleteRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (delete)', errors });

    const params = BuildParams([{ name:'brand_id', type: sql.Int, value: Number(body.brand_id) }]);
    await db.executeProc('brands_delete', params);
    return res.status(200).json({ success:true, message:'Marca eliminada' });
  } catch (err) {
    console.error('brands_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar la marca');
    return res.status(status).json({ success: false, message });
  }
});

/* GET ALL (public) */
Router.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('brands_get_all', {});
    return res.status(200).json({ success:true, message:'Listado de marcas', data });
  } catch (err) {
    console.error('brands_get_all error:', err);
    const { message, status } = extractDbError(err, 'Error al listar marcas');
    return res.status(status).json({ success: false, message });
  }
});

/* GET BY ID (public) */
Router.get('/por_id/:brand_id', async (req, res) => {
  try {
    const body = { brand_id: Number(req.params.brand_id) };
    const { isValid, errors } = await ValidationService.validateData(body, PorIdRules);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_id)', errors });

    const data = await db.executeProc('brands_get_by_id', {
      brand_id: { type: sql.Int, value: body.brand_id }
    });

    if (!data?.length) return res.status(404).json({ success:false, message:'Marca no encontrada' });
    return res.status(200).json({ success:true, message:'Marca obtenida', data: data[0] });
  } catch (err) {
    console.error('brands_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener la marca');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

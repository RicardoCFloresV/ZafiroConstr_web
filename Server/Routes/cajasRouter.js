// Server/routes/cajasRouter.js
// Rutas para Cajas — basadas en stored procedures existentes:

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js'); // DB pool + types
const ValidationService = require('../Validators/validatorService.js'); // validateData
const { InsertRules, UpdateRules, DeleteRules, PorIdRules } = require('../Validators/Rulesets/cajas.js');

const { requireAuth, requireAdmin } = require('./authRouter.js'); // middlewares

const CajasRouter = express.Router();

// Helper para construir params { name, type, value } -> { name: {type, value} }
function BuildParams(entries) {
  const params = {};
  for (const e of entries) params[e.name] = { type: e.type, value: e.value };
  return params;
}

/* ============================================================================
   POST /cajas/insert  (Auth requerido)
============================================================================ */
CajasRouter.post('/insert', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, InsertRules);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Datos inválidos (insert)', errors });
    }

    const params = BuildParams([
      { name: 'letra', type: sql.VarChar(2), value: body.letra },
      { name: 'cara',  type: sql.TinyInt,   value: Number(body.cara) },
      { name: 'nivel', type: sql.TinyInt,   value: Number(body.nivel) }
    ]);

    const data = await db.executeProc('cajas_insert', params);
    return res.status(201).json({
      success: true,
      message: 'Caja creada exitosamente',
      data
    });
  } catch (err) {
    console.error('cajas_insert error:', err);
    // Extracción dinámica del mensaje de error
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al crear la caja';
    return res.status(400).json({ success: false, message: mensajeError });
  }
});

/* ============================================================================
   POST /cajas/update  (Auth requerido)
============================================================================ */
CajasRouter.post('/update', requireAuth, async (req, res) => {
  try {
    const body = req.body;
    const { isValid, errors } = await ValidationService.validateData(body, UpdateRules);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Datos inválidos (update)', errors });
    }

    const params = BuildParams([
      { name: 'caja_id', type: sql.Int,       value: Number(body.caja_id) },
      { name: 'letra',   type: sql.VarChar(2), value: body.letra },
      { name: 'cara',    type: sql.TinyInt,    value: Number(body.cara) },
      { name: 'nivel',   type: sql.TinyInt,    value: Number(body.nivel) }
    ]);

    const data = await db.executeProc('cajas_update', params);
    return res.status(200).json({
      success: true,
      message: 'Caja actualizada',
      data
    });
  } catch (err) {
    console.error('cajas_update error:', err);
    // Extracción dinámica del mensaje de error
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al actualizar la caja';
    return res.status(400).json({ success: false, message: mensajeError });
  }
});


/* ============================================================================
   DELETE /cajas/delete/:id  (Solo Admin)
============================================================================ */
CajasRouter.delete('/delete/:id', requireAdmin, async (req, res) => {
  try {
    const cajaId = req.params.id;  

    if (!cajaId) {
      return res.status(400).json({ success: false, message: 'ID de caja requerido' });
    }

    const params = BuildParams([{ name: 'caja_id', type: sql.Int, value: Number(cajaId) }]);
    await db.executeProc('cajas_delete', params);

    return res.status(200).json({ success: true, message: 'Caja eliminada' });
  } catch (err) {
    console.error('cajas_delete error:', err);
    // Extracción dinámica del mensaje de error
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al eliminar la caja';
    return res.status(400).json({ success: false, message: mensajeError });
  }
});

/* ============================================================================
   GET /cajas/get_all
============================================================================ */
CajasRouter.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('cajas_get_all', {});
    return res.status(200).json({
      success: true,
      message: data.length ? 'Cajas listadas' : 'Sin cajas registradas',
      data
    });
  } catch (err) {
    console.error('cajas_get_all error:', err);
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al listar cajas';
    return res.status(400).json({ success: false, message: mensajeError, data: [] });
  }
});

/* ============================================================================
   GET /cajas/get_list
============================================================================ */
CajasRouter.get('/get_list', async (_req, res) => {
  try {
    const data = await db.executeProc('cajas_get_list', {});
    return res.status(200).json({
      success: true,
      message: data.length ? 'Listado de etiquetas de cajas' : 'Sin cajas registradas',
      data
    });
  } catch (err) {
    console.error('cajas_get_list error:', err);
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al listar etiquetas de cajas';
    return res.status(400).json({ success: false, message: mensajeError, data: [] });
  }
});

/* ============================================================================
   GET /cajas/por_id/:caja_id
============================================================================ */
CajasRouter.get('/por_id/:caja_id', async (req, res) => {
  try {
    const body = { caja_id: Number(req.params.caja_id) };
    const { isValid, errors } = await ValidationService.validateData(body, PorIdRules);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Datos inválidos (por_id)', errors });
    }

    const data = await db.executeProc('cajas_get_by_id', {
      caja_id: { type: sql.Int, value: body.caja_id }
    });

    if (!data.length) return res.status(404).json({ success: false, message: 'Caja no encontrada' });
    return res.status(200).json({ success: true, message: 'Caja obtenida', data: data[0] });
  } catch (err) {
    console.error('cajas_get_by_id error:', err);
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al obtener la caja';
    return res.status(400).json({ success: false, message: mensajeError });
  }
});

/* ============================================================================
   GET /cajas/por_componentes
============================================================================ */
CajasRouter.get('/por_componentes', async (req, res) => {
  try {
    const { letra, cara, nivel } = req.query;
    
    if (!letra || !cara || !nivel) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requieren los parámetros letra, cara y nivel' 
      });
    }
    
    const caraNum = Number(cara);
    const nivelNum = Number(nivel);
    
    if (isNaN(caraNum) || (caraNum !== 1 && caraNum !== 2)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cara debe ser 1 (FRENTE) o 2 (ATRAS)' 
      });
    }
    
    if (isNaN(nivelNum) || (nivelNum !== 1 && nivelNum !== 2)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nivel debe ser 1 (ARRIBA) o 2 (ABAJO)' 
      });
    }

    const params = BuildParams([
      { name: 'letra', type: sql.VarChar(2), value: letra },
      { name: 'cara',  type: sql.TinyInt,   value: caraNum },
      { name: 'nivel', type: sql.TinyInt,   value: nivelNum }
    ]);

    const data = await db.executeProc('cajas_get_by_components', params);

    if (!data.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Caja no encontrada con los parámetros proporcionados' 
      });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Caja encontrada', 
      data: data[0] 
    });
  } catch (err) {
    console.error('cajas_get_by_components error:', err);
    const mensajeError = err.originalError?.info?.message || err.message || 'Error al buscar la caja';
    return res.status(400).json({ success: false, message: mensajeError });
  }
});

module.exports = CajasRouter;
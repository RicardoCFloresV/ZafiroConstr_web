// Server/routes/cajasRouter.js
// Rutas para Cajas — basadas en stored procedures existentes:
//   - cajas_insert(@letra VARCHAR(2), @cara TINYINT, @nivel TINYINT)
//       -> RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ]
//   - cajas_update(@caja_id INT, @letra VARCHAR(2), @cara TINYINT, @nivel TINYINT)
//       -> RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ]
//   - cajas_delete(@caja_id INT)
//       -> RETURNS: none
//   - cajas_get_all()
//       -> RETURNS: [ { caja_id, letra, cara, nivel, etiqueta }, ... ]
//   - cajas_get_list()
//       -> RETURNS: [ { caja_id, etiqueta }, ... ]
//   - cajas_get_by_id(@caja_id INT)
//       -> RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ]  (0 o 1 fila)

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js'); // DB pool + types  :contentReference[oaicite:7]{index=7}
const ValidationService = require('../Validators/validatorService.js');         // validateData   :contentReference[oaicite:8]{index=8}
const { InsertRules, UpdateRules, DeleteRules, PorIdRules } = require('../Validators/Rulesets/cajas.js');

const { requireAuth, requireAdmin } = require('./authRouter.js'); // middlewares  :contentReference[oaicite:9]{index=9}

const CajasRouter = express.Router();

// Helper para construir params { name, type, value } -> { name: {type, value} }
function BuildParams(entries) {
  const params = {};
  for (const e of entries) params[e.name] = { type: e.type, value: e.value };
  return params;
}

/* ============================================================================
   POST /cajas/insert  (Auth requerido)
   SP: cajas_insert(@letra VARCHAR(2), @cara TINYINT, @nivel TINYINT)
   RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ]
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
      message: 'Caja creada',
      data
    });
  } catch (err) {
    console.error('cajas_insert error:', err);
    return res.status(500).json({ success: false, message: 'Error al crear la caja' });
  }
});

/* ============================================================================
   POST /cajas/update  (Auth requerido)
   SP: cajas_update(@caja_id INT, @letra VARCHAR(2), @cara TINYINT, @nivel TINYINT)
   RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ]
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
    return res.status(500).json({ success: false, message: 'Error al actualizar la caja' });
  }
});


/* ============================================================================
   DELETE /cajas/delete/:id  (Solo Admin)
   SP: cajas_delete(@caja_id INT)
   RETURNS: none
============================================================================ */
// Changed .post to .delete and added /:id to the route
CajasRouter.delete('/delete/:id', requireAdmin, async (req, res) => {
  try {
    // Extract ID from the URL params instead of req.body
    const cajaId = req.params.id; 
    console.log('cajas_delete ID:', cajaId); 

    // Validación básica del ID
    if (!cajaId) {
      return res.status(400).json({ success: false, message: 'ID de caja requerido' });
    }

    const params = BuildParams([{ name: 'caja_id', type: sql.Int, value: Number(cajaId) }]);
    await db.executeProc('cajas_delete', params);

    return res.status(200).json({ success: true, message: 'Caja eliminada' });
  } catch (err) {
    console.error('cajas_delete error:', err);
    return res.status(500).json({ success: false, message: 'Error al eliminar la caja' });
  }
});

/* ============================================================================
   GET /cajas/get_all
   SP: cajas_get_all()
   RETURNS: [ { caja_id, letra, cara, nivel, etiqueta }, ... ]
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
    return res.status(500).json({ success: false, message: 'Error al listar cajas', data: [] });
  }
});

/* ============================================================================
   GET /cajas/get_list
   SP: cajas_get_list()
   RETURNS: [ { caja_id, etiqueta }, ... ]
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
    return res.status(500).json({ success: false, message: 'Error al listar etiquetas de cajas', data: [] });
  }
});

/* ============================================================================
   GET /cajas/por_id/:caja_id
   SP: cajas_get_by_id(@caja_id INT)
   RETURNS: [ { caja_id, letra, cara, nivel, etiqueta } ] (0 o 1)
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
    return res.status(500).json({ success: false, message: 'Error al obtener la caja' });
  }
});

/* ============================================================================
   GET /cajas/por_componentes
   SP: cajas_get_by_components(@letra VARCHAR(2), @cara TINYINT, @nivel TINYINT)
   RETURNS: [ { caja_id } ] (0 o 1 fila)
============================================================================ */
CajasRouter.get('/por_componentes', async (req, res) => {
  try {
    const { letra, cara, nivel } = req.query;
    
    // Validaciones - convertir a números
    if (!letra || !cara || !nivel) {
      return res.status(400).json({ 
        success: false, 
        message: 'Se requieren los parámetros letra, cara y nivel' 
      });
    }
    
    // Convertir a números para validación
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
    return res.status(500).json({ 
      success: false, 
      message: 'Error al buscar la caja' 
    });
  }
});

module.exports = CajasRouter;

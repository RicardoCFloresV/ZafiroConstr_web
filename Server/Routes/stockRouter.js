// Server/routes/stockRouter.js
// Operaciones de STOCK (mutaciones y consultas por producto/detalle)
// Stored Procedures usados:
// - productos_get_stock(@producto_id INT)
//     -> RETURNS: [ { detalle_id, etiqueta, producto_id, stock }, ... ]
// - get_stock_by_id(@producto_id INT)           (alias de productos_get_stock)
// - cajas_detalles_get_by_producto(@producto_id INT)
//     -> RETURNS: [ { detalle_id, etiqueta, producto_id, stock }, ... ]
// - cajas_detalles_get_by_id(@detalle_id INT)
//     -> RETURNS: [ { detalle_id, caja_id, etiqueta, producto_id, stock } ]
// - productos_add_stock(@caja_id INT, @producto_id INT, @delta INT)
//     -> RETURNS: [ { detalle_id, caja_id, producto_id, stock } ] (fila afectada)
// - productos_remove_stock(@caja_id INT, @producto_id INT, @delta INT)
//     -> RETURNS: [ { detalle_id, caja_id, producto_id, stock } ]
// - productos_set_stock_by_detalle(@detalle_id INT, @producto_id INT, @stock INT)
//     -> RETURNS: [ { detalle_id, etiqueta, producto_id, stock } ]
// - productos_move_stock(@producto_id INT, @caja_origen INT, @caja_destino INT, @cantidad INT)
//     -> RETURNS: [ { tipo:'origen'|'destino', detalle_id, etiqueta, producto_id, stock }, ... ]

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { requireAuth } = require('./authRouter.js'); // cambios de stock requieren auth
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

const Rules = {
  ByProducto: { producto_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'producto_id inválido' } },
  ByDetalle:  { detalle_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'detalle_id inválido' } },
  AddRemove: {
    caja_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'caja_id inválido' },
    producto_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'producto_id inválido' },
    delta: { required:true, custom: v => (Number.isInteger(Number(v)) && Math.abs(Number(v))>0) || 'delta debe ser entero != 0' }
  },
  SetByDetalle: {
    detalle_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'detalle_id inválido' },
    producto_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'producto_id inválido' },
    stock: { required:true, custom: v => (Number.isInteger(Number(v)) && Number(v)>=0) || 'stock debe ser entero >= 0' }
  },
  Move: {
    producto_id: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'producto_id inválido' },
    caja_origen: { required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'caja_origen inválido' },
    caja_destino:{ required:true, custom: v => (Number.isInteger(Number(v)) && v>0) || 'caja_destino inválido' },
    cantidad:    { required:true, custom: v => (Number.isInteger(Number(v)) && Number(v)>0) || 'cantidad debe ser entero > 0' }
  }
};

function BuildParams(entries){ const p={}; for(const e of entries) p[e.name]={type:e.type,value:e.value}; return p; }

/* ============================== READS ============================== */
Router.get('/producto/:producto_id', async (req, res) => {
  try {
    const B = { producto_id: Number(req.params.producto_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.ByProducto);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (stock por producto)', errors });

    const data = await db.executeProc('productos_get_stock', {
      producto_id: { type: sql.Int, value: B.producto_id }
    });
    return res.status(200).json({ success:true, message:'Stock por producto', data });
  } catch (err) {
    console.error('productos_get_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener stock por producto');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/detalles_por_producto/:producto_id', async (req, res) => {
  try {
    const B = { producto_id: Number(req.params.producto_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.ByProducto);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (detalles_por_producto)', errors });

    const data = await db.executeProc('cajas_detalles_get_by_producto', {
      producto_id: { type: sql.Int, value: B.producto_id }
    });
    return res.status(200).json({ success:true, message:'Detalles de cajas por producto', data });
  } catch (err) {
    console.error('cajas_detalles_get_by_producto error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener detalles por producto');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/detalle_por_id/:detalle_id', async (req, res) => {
  try {
    const B = { detalle_id: Number(req.params.detalle_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.ByDetalle);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (detalle_por_id)', errors });

    const data = await db.executeProc('cajas_detalles_get_by_id', {
      detalle_id: { type: sql.Int, value: B.detalle_id }
    });
    if (!data?.length) return res.status(404).json({ success:false, message:'Detalle no encontrado' });
    return res.status(200).json({ success:true, message:'Detalle de caja', data: data[0] });
  } catch (err) {
    console.error('cajas_detalles_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener el detalle');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================ MUTACIONES =========================== */
Router.post('/add', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.AddRemove);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (add)', errors });

    const params = BuildParams([
      { name:'caja_id', type: sql.Int, value: Number(B.caja_id) },
      { name:'producto_id', type: sql.Int, value: Number(B.producto_id) },
      { name:'delta', type: sql.Int, value: Number(B.delta) }
    ]);
    const data = await db.executeProc('productos_add_stock', params);
    return res.status(200).json({ success:true, message:'Stock agregado', data });
  } catch (err) {
    console.error('productos_add_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al agregar stock');
    return res.status(status).json({ success: false, message });
  }
});

Router.post('/remove', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.AddRemove);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (remove)', errors });

    const params = BuildParams([
      { name:'caja_id', type: sql.Int, value: Number(B.caja_id) },
      { name:'producto_id', type: sql.Int, value: Number(B.producto_id) },
      { name:'delta', type: sql.Int, value: Number(B.delta) }
    ]);
    const data = await db.executeProc('productos_remove_stock', params);
    return res.status(200).json({ success:true, message:'Stock retirado', data });
  } catch (err) {
    console.error('productos_remove_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al retirar stock');
    return res.status(status).json({ success: false, message });
  }
});

Router.post('/set_by_detalle', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.SetByDetalle);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (set_by_detalle)', errors });

    const params = BuildParams([
      { name:'detalle_id', type: sql.Int, value: Number(B.detalle_id) },
      { name:'producto_id', type: sql.Int, value: Number(B.producto_id) },
      { name:'stock', type: sql.Int, value: Number(B.stock) }
    ]);
    const data = await db.executeProc('productos_set_stock_by_detalle', params);
    return res.status(200).json({ success:true, message:'Stock ajustado por detalle', data });
  } catch (err) {
    console.error('productos_set_stock_by_detalle error:', err);
    const { message, status } = extractDbError(err, 'Error al ajustar stock por detalle');
    return res.status(status).json({ success: false, message });
  }
});

Router.post('/move', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.Move);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (move)', errors });

    const params = BuildParams([
      { name:'producto_id',  type: sql.Int, value: Number(B.producto_id) },
      { name:'caja_origen',  type: sql.Int, value: Number(B.caja_origen) },
      { name:'caja_destino', type: sql.Int, value: Number(B.caja_destino) },
      { name:'cantidad',     type: sql.Int, value: Number(B.cantidad) }
    ]);
    const data = await db.executeProc('productos_move_stock', params);
    return res.status(200).json({ success:true, message:'Stock movido', data });
  } catch (err) {
    console.error('productos_move_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al mover stock');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

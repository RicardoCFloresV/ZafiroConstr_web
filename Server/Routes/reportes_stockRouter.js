// Server/routes/reportes_stockRouter.js
// Reportes (solo lectura):
// - get_all_stock()
//     -> RETURNS: [ { producto_id, nombre, precio, stock, valor_inventario }, ... ]
// - get_stock()           // solo activos
//     -> RETURNS: [ { producto_id, producto_nombre, stock_total }, ... ]
// - get_stock_by_categoria_id(@categoria_id INT)
//     -> RETURNS: [ { producto_id, producto_nombre, categoria_id, categoria_nombre, stock_total }, ... ]

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

Router.get('/get_all_stock', async (_req, res) => {
  try {
    const data = await db.executeProc('get_all_stock', {});
    return res.status(200).json({ success:true, message:'Reporte valor inventario', data });
  } catch (err) {
    console.error('get_all_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener el reporte de inventario');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/get_stock', async (_req, res) => {
  try {
    const data = await db.executeProc('get_stock', {});
    return res.status(200).json({ success:true, message:'Stock total (activos)', data });
  } catch (err) {
    console.error('get_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener el stock total');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/get_stock_por_categoria/:categoria_id', async (req, res) => {
  try {
    const categoria_id = Number(req.params.categoria_id);
    if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
      return res.status(400).json({ success:false, message:'categoria_id inválido' });
    }
    const data = await db.executeProc('get_stock_by_categoria_id', {
      categoria_id: { type: sql.Int, value: categoria_id }
    });
    return res.status(200).json({ success:true, message:'Stock por categoría', data });
  } catch (err) {
    console.error('get_stock_by_categoria_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener stock por categoría');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

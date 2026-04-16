// Server/routes/insert_producto_with_stock.js
const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { requireAuth } = require('./authRouter.js');
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

const Rules = {
  InsertWithStock: {
    nombre: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 },
    descripcion: { required: false, type: 'string', trim: true, maxLength: 255 },
    precio: { required: true, type: 'number', min: 0 },
    categoria_principal_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'categoria_principal_id inválido' },
    categoria_secundaria_id: { required: false, custom: v => (v == null || Number.isInteger(Number(v))) || 'categoria_secundaria_id inválido' },
    subcategoria_id: { required: false, custom: v => (v == null || Number.isInteger(Number(v))) || 'subcategoria_id inválido' },
    unit_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'unit_id inválido' },
    unit_value: { required: true, type: 'number', min: 0 },
    size_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'size_id inválido' },
    size_value: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 50 },
    brand_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'brand_id inválido' },
    caja_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'caja_id inválido' },
    stock_inicial: { required: true, custom: v => (Number.isInteger(Number(v)) && v >= 0) || 'stock_inicial debe ser entero >= 0' }
  }
};

function BuildParams(entries) {
  const p = {};
  for (const e of entries) p[e.name] = { type: e.type, value: e.value };
  return p;
}

Router.post('/insert_with_stock', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.InsertWithStock);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (insert with stock)', errors });

    const params = BuildParams([
      { name: 'nombre', type: sql.NVarChar(100), value: B.nombre },
      { name: 'descripcion', type: sql.NVarChar(255), value: B.descripcion ?? null },
      { name: 'precio', type: sql.Decimal(10, 2), value: Number(B.precio) },
      { name: 'categoria_principal_id', type: sql.Int, value: Number(B.categoria_principal_id) },
      { name: 'categoria_secundaria_id', type: sql.Int, value: B.categoria_secundaria_id != null ? Number(B.categoria_secundaria_id) : null },
      { name: 'subcategoria_id', type: sql.Int, value: B.subcategoria_id != null ? Number(B.subcategoria_id) : null },
      { name: 'unit_id', type: sql.Int, value: Number(B.unit_id) },
      { name: 'unit_value', type: sql.Decimal(10, 2), value: Number(B.unit_value) },
      { name: 'size_id', type: sql.Int, value: Number(B.size_id) },
      { name: 'size_value', type: sql.NVarChar(50), value: B.size_value },
      { name: 'brand_id', type: sql.Int, value: Number(B.brand_id) },
      { name: 'caja_id', type: sql.Int, value: Number(B.caja_id) },
      { name: 'stock_inicial', type: sql.Int, value: Number(B.stock_inicial) }
    ]);

    const data = await db.executeProc('producto_insert_with_stock', params);
    return res.status(201).json({ success: true, message: 'Producto creado con stock inicial', data });
  } catch (err) {
    console.error('producto_insert_with_stock error:', err);
    const { message, status } = extractDbError(err, 'Error al crear el producto con stock inicial');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;
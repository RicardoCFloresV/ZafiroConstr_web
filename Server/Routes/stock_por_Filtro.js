// Server/routes/stock_por_Filtro.js
const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const { extractDbError } = require('../utils/dbError.js');

const Router = express.Router();

// GET BY CATEGORIA PRINCIPAL
Router.get('/por_categoria_principal/:categoria_id', async (req, res) => {
  try {
    const categoria_id = Number(req.params.categoria_id);
    console.log('productos_get_by_categoria_principal categoria_id:', categoria_id); // Debug log
    if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
      return res.status(400).json({ success: false, message: 'categoria_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_categoria_principal', {
      categoria_principal_id: { type: sql.Int, value: categoria_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por categoría principal', data });
  } catch (err) {
    console.error('productos_get_by_categoria_principal error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por categoría principal');
    return res.status(status).json({ success: false, message });
  }
});

// GET BY CATEGORIA SECUNDARIA
Router.get('/por_categoria_secundaria/:categoria_id', async (req, res) => {
  try {
    const categoria_id = Number(req.params.categoria_id);
    console.log('productos_get_by_categoria_secundaria categoria_id:', categoria_id); // Debug log
    if (!Number.isInteger(categoria_id) || categoria_id <= 0) {
      return res.status(400).json({ success: false, message: 'categoria_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_categoria_secundaria', {
      categoria_secundaria_id: { type: sql.Int, value: categoria_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por categoría secundaria', data });
  } catch (err) {
    console.error('productos_get_by_categoria_secundaria error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por categoría secundaria');
    return res.status(status).json({ success: false, message });
  }
});

// GET BY SUBCATEGORIA
Router.get('/por_subcategoria/:subcategoria_id', async (req, res) => {
  try {
    const subcategoria_id = Number(req.params.subcategoria_id);
    console.log('productos_get_by_subcategoria subcategoria_id:', subcategoria_id); // Debug log
    if (!Number.isInteger(subcategoria_id) || subcategoria_id <= 0) {
      return res.status(400).json({ success: false, message: 'subcategoria_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_subcategoria', {
      subcategoria_id: { type: sql.Int, value: subcategoria_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por subcategoría', data });
  } catch (err) {
    console.error('productos_get_by_subcategoria error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por subcategoría');
    return res.status(status).json({ success: false, message });
  }
});

// GET BY UNIT
Router.get('/por_unit/:unit_id', async (req, res) => {
  try {
    const unit_id = Number(req.params.unit_id);
    console.log('productos_get_by_unit unit_id:', unit_id); // Debug log
    if (!Number.isInteger(unit_id) || unit_id <= 0) {
      return res.status(400).json({ success: false, message: 'unit_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_unit', {
      unit_id: { type: sql.Int, value: unit_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por unidad', data });
  } catch (err) {
    console.error('productos_get_by_unit error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por unidad');
    return res.status(status).json({ success: false, message });
  }
});

// GET BY SIZE
Router.get('/por_size/:size_id', async (req, res) => {
  try {
    const size_id = Number(req.params.size_id);
    console.log('productos_get_by_size size_id:', size_id); // Debug log
    if (!Number.isInteger(size_id) || size_id <= 0) {
      return res.status(400).json({ success: false, message: 'size_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_size', {
      size_id: { type: sql.Int, value: size_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por tamaño', data });
  } catch (err) {
    console.error('productos_get_by_size error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por tamaño');
    return res.status(status).json({ success: false, message });
  }
});

// GET BY BRAND
Router.get('/por_brand/:brand_id', async (req, res) => {
  try {
    const brand_id = Number(req.params.brand_id);
    console.log('productos_get_by_brand brand_id:', brand_id); // Debug log
    if (!Number.isInteger(brand_id) || brand_id <= 0) {
      return res.status(400).json({ success: false, message: 'brand_id inválido' });
    }

    const data = await db.executeProc('productos_get_by_brand', {
      brand_id: { type: sql.Int, value: brand_id }
    });
    
    return res.status(200).json({ success: true, message: 'Productos por marca', data });
  } catch (err) {
    console.error('productos_get_by_brand error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por marca');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;
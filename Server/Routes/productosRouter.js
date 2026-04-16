// Server/routes/productosRouter.js
// Stored Procedures usados (parámetros y retorno esperado):
// - productos_insert(
//     @nombre NVARCHAR(100),
//     @descripcion NVARCHAR(255)=NULL,
//     @precio DECIMAL(10,2),
//     @categoria_principal_id INT,
//     @categoria_secundaria_id INT = NULL,
//     @subcategoria_id INT = NULL,
//     @unit_id INT,
//     @unit_value DECIMAL(10,2),
//     @size_id INT,
//     @size_value NVARCHAR(50),
//     @brand_id INT
//   )
//   -> RETURNS: [ { producto_id, nombre, descripcion, precio, estado,
//                  categoria_principal_id, categoria_principal_nombre,
//                  categoria_secundaria_id, categoria_secundaria_nombre,
//                  subcategoria_id, subcategoria_nombre,
//                  unit_id, unit_nombre, unit_value,
//                  size_id, size_nombre, size_value,
//                  brand_id, brand_nombre, fecha_creacion } ]
//
// - productos_update(
//     @producto_id INT, @nombre NVARCHAR(100), @descripcion NVARCHAR(255)=NULL,
//     @precio DECIMAL(10,2), @categoria_principal_id INT,
//     @categoria_secundaria_id INT=NULL, @subcategoria_id INT=NULL,
//     @unit_id INT, @unit_value DECIMAL(10,2),
//     @size_id INT, @size_value NVARCHAR(50),
//     @brand_id INT, @estado BIT = NULL
//   )
//   -> RETURNS: (misma fila unida que insert)
//
// - productos_soft_delete(@producto_id INT)
//   -> RETURNS: [ { producto_id, nombre, descripcion, precio, estado } ]
//
// - productos_delete(@producto_id INT, @force BIT = 0)  // cauteloso
//   -> RETURNS: [ { producto_id, estado_operacion = 'Eliminado' } ]
//
// - productos_get_all()
//   -> RETURNS: (filas unidas + stock_total)
//
// - productos_get_all_active()
//   -> RETURNS: (filas unidas + stock_total) WHERE estado=1
//
// - productos_get_list()
//   -> RETURNS: [ { producto_id, nombre, categoria_principal_id, categoria_principal_nombre, brand_id, brand_nombre } ]
//
// - productos_get_by_id(@producto_id INT)
//   -> RETURNS: (fila unida + stock_total) 0/1
//
// - productos_get_list_by_category_id(@categoria_principal_id INT)
//   -> RETURNS: lista simple (activos)
//
// - productos_get_by_caja_id(@caja_id INT)
//   -> RETURNS: [ { detalle_id, producto_id, producto_nombre, descripcion, precio,
//                   categoria_principal_id, categoria_principal_nombre,
//                   brand_id, brand_nombre, stock, caja_etiqueta } ]
//
// - productos_search_by_price_range(@precio_min DECIMAL(10,2)=NULL, @precio_max DECIMAL(10,2)=NULL)
//   -> RETURNS: lista con stock_total
//
// - productos_search_by_nombre(@search_term NVARCHAR(100))
//   -> RETURNS: lista con stock_total
//
// - productos_get_by_cajas()
//   -> RETURNS: [ { caja_id, caja_etiqueta, producto_id, producto_nombre, stock, categoria_principal_nombre, precio, valor_en_caja } ]

const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { requireAuth, requireAdmin } = require('./authRouter.js'); // cambia a authRouter.js si aplica
const { extractDbError } = require('../utils/dbError.js');

// Reglas de validación (simples y auto-contenidas)
const Rules = {
  Insert: {
    nombre: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 },
    descripcion: { required: false, type: 'string', trim: true, maxLength: 255 },
    precio: { required: true, type: 'number', min: 0 },
    categoria_principal_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'categoria_principal_id inválido' },
    categoria_secundaria_id: { required: false, custom: v => (v==null || Number.isInteger(Number(v))) || 'categoria_secundaria_id inválido' },
    subcategoria_id: { required: false, custom: v => (v==null || Number.isInteger(Number(v))) || 'subcategoria_id inválido' },
    unit_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'unit_id inválido' },
    unit_value: { required: true, type: 'number', min: 0 },
    size_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'size_id inválido' },
    size_value: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 50 },
    brand_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'brand_id inválido' }
  },
  Update: {
    producto_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'producto_id inválido' },
    nombre: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 },
    descripcion: { required: false, type: 'string', trim: true, maxLength: 255 },
    precio: { required: true, type: 'number', min: 0 },
    categoria_principal_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'categoria_principal_id inválido' },
    categoria_secundaria_id: { required: false, custom: v => (v==null || Number.isInteger(Number(v))) || 'categoria_secundaria_id inválido' },
    subcategoria_id: { required: false, custom: v => (v==null || Number.isInteger(Number(v))) || 'subcategoria_id inválido' },
    unit_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'unit_id inválido' },
    unit_value: { required: true, type: 'number', min: 0 },
    size_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'size_id inválido' },
    size_value: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 50 },
    brand_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'brand_id inválido' },
    estado: { required: false, custom: v => (v===undefined || v===null || v===0 || v===1 || v===true || v===false) || 'estado inválido' }
  },
  PorId: { producto_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'producto_id inválido' } },
  Delete: {
    producto_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'producto_id inválido' },
    force: { required: false, custom: v => (v===undefined || v===null || v===0 || v===1 || v===true || v===false) || 'force inválido' }
  },
  SoftDelete: { producto_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'producto_id inválido' } },
  ByCategoria: { categoria_principal_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'categoria_principal_id inválido' } },
  ByCaja: { caja_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'caja_id inválido' } },
  SearchNombre: { search_term: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 } },
  SearchPrecio: {
    precio_min: { required: false, type: 'number', min: 0 },
    precio_max: { required: false, type: 'number', min: 0 }
  },
  SetPrecio: {
    producto_id: { required: true, custom: v => (Number.isInteger(Number(v)) && v > 0) || 'producto_id inválido' },
    precio: { required: true, type: 'number', min: 0 }
  }
};

const Router = express.Router();

function BuildParams(entries) {
  const p = {};
  for (const e of entries) p[e.name] = { type: e.type, value: e.value };
  return p;
}

/* ============================= INSERT (auth) ============================== */
Router.post('/insert', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.Insert);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (insert)', errors });

    const params = BuildParams([
      { name:'nombre',  type: sql.NVarChar(100), value: B.nombre },
      { name:'descripcion', type: sql.NVarChar(255), value: B.descripcion ?? null },
      { name:'precio',  type: sql.Decimal(10,2), value: Number(B.precio) },
      { name:'categoria_principal_id', type: sql.Int, value: Number(B.categoria_principal_id) },
      { name:'categoria_secundaria_id', type: sql.Int, value: B.categoria_secundaria_id!=null ? Number(B.categoria_secundaria_id) : null },
      { name:'subcategoria_id',        type: sql.Int, value: B.subcategoria_id!=null ? Number(B.subcategoria_id) : null },
      { name:'unit_id',   type: sql.Int, value: Number(B.unit_id) },
      { name:'unit_value',type: sql.Decimal(10,2), value: Number(B.unit_value) },
      { name:'size_id',   type: sql.Int, value: Number(B.size_id) },
      { name:'size_value',type: sql.NVarChar(50), value: B.size_value },
      { name:'brand_id',  type: sql.Int, value: Number(B.brand_id) }
    ]);

    const data = await db.executeProc('productos_insert', params);
    return res.status(201).json({ success:true, message:'Producto creado', data });
  } catch (err) {
    console.error('productos_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al crear el producto');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================= UPDATE (auth) ============================== */
Router.post('/update', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.Update);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (update)', errors });

    const params = BuildParams([
      { name:'producto_id', type: sql.Int, value: Number(B.producto_id) },
      { name:'nombre',      type: sql.NVarChar(100), value: B.nombre },
      { name:'descripcion', type: sql.NVarChar(255), value: B.descripcion ?? null },
      { name:'precio',      type: sql.Decimal(10,2), value: Number(B.precio) },
      { name:'categoria_principal_id', type: sql.Int, value: Number(B.categoria_principal_id) },
      { name:'categoria_secundaria_id', type: sql.Int, value: B.categoria_secundaria_id!=null ? Number(B.categoria_secundaria_id) : null },
      { name:'subcategoria_id',        type: sql.Int, value: B.subcategoria_id!=null ? Number(B.subcategoria_id) : null },
      { name:'unit_id',   type: sql.Int, value: Number(B.unit_id) },
      { name:'unit_value',type: sql.Decimal(10,2), value: Number(B.unit_value) },
      { name:'size_id',   type: sql.Int, value: Number(B.size_id) },
      { name:'size_value',type: sql.NVarChar(50), value: B.size_value },
      { name:'brand_id',  type: sql.Int, value: Number(B.brand_id) },
      { name:'estado',    type: sql.Bit, value: B.estado===undefined? null : (B.estado ? 1 : 0) }
    ]);

    const data = await db.executeProc('productos_update', params);
    return res.status(200).json({ success:true, message:'Producto actualizado', data });
  } catch (err) {
    console.error('productos_update error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar el producto');
    return res.status(status).json({ success: false, message });
  }
});

/* ========================== SOFT DELETE (auth) ============================ */
Router.post('/soft_delete', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.SoftDelete);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (soft_delete)', errors });

    const data = await db.executeProc('productos_soft_delete', {
      producto_id: { type: sql.Int, value: Number(B.producto_id) }
    });
    return res.status(200).json({ success:true, message:'Producto desactivado (soft delete)', data });
  } catch (err) {
    console.error('productos_soft_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al desactivar el producto');
    return res.status(status).json({ success: false, message });
  }
});

/* =========================== HARD DELETE (admin) ========================== */
Router.post('/delete', requireAdmin, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.Delete);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (delete)', errors });

    const params = {
      producto_id: { type: sql.Int, value: Number(B.producto_id) },
      force: { type: sql.Bit, value: B.force ? 1 : 0 }
    };
    const data = await db.executeProc('productos_delete', params);
    return res.status(200).json({ success:true, message:'Producto eliminado', data });
  } catch (err) {
    console.error('productos_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar el producto');
    return res.status(status).json({ success: false, message });
  }
});

/* ================================ READS ================================== */
Router.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('productos_get_all', {});
    return res.status(200).json({ success:true, message:'Listado de productos', data });
  } catch (err) {
    console.error('productos_get_all error:', err);
    const { message, status } = extractDbError(err, 'Error al listar productos');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/get_all_active', async (_req, res) => {
  try {
    const data = await db.executeProc('productos_get_all_active', {});
    return res.status(200).json({ success:true, message:'Listado de productos activos', data });
  } catch (err) {
    console.error('productos_get_all_active error:', err);
    const { message, status } = extractDbError(err, 'Error al listar productos activos');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/get_list', async (_req, res) => {
  try {
    const data = await db.executeProc('productos_get_list', {});
    return res.status(200).json({ success:true, message:'Listado simple de productos', data });
  } catch (err) {
    console.error('productos_get_list error:', err);
    const { message, status } = extractDbError(err, 'Error al listar productos (simple)');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/por_id/:producto_id', async (req, res) => {
  try {
    const B = { producto_id: Number(req.params.producto_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.PorId);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_id)', errors });

    const data = await db.executeProc('productos_get_by_id', {
      producto_id: { type: sql.Int, value: B.producto_id }
    });
    if (!data?.length) return res.status(404).json({ success:false, message:'Producto no encontrado' });
    return res.status(200).json({ success:true, message:'Producto obtenido', data: data[0] });
  } catch (err) {
    console.error('productos_get_by_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener el producto');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/por_categoria/:categoria_principal_id', async (req, res) => {
  try {
    const B = { categoria_principal_id: Number(req.params.categoria_principal_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.ByCategoria);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_categoria)', errors });

    const data = await db.executeProc('productos_get_list_by_category_id', {
      categoria_principal_id: { type: sql.Int, value: B.categoria_principal_id }
    });
    return res.status(200).json({ success:true, message:'Productos por categoría', data });
  } catch (err) {
    console.error('productos_get_list_by_category_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por categoría');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/por_caja/:caja_id', async (req, res) => {
  try {
    const B = { caja_id: Number(req.params.caja_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.ByCaja);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (por_caja)', errors });

    const data = await db.executeProc('productos_get_by_caja_id', {
      caja_id: { type: sql.Int, value: B.caja_id }
    });
    return res.status(200).json({ success:true, message:'Productos por caja', data });
  } catch (err) {
    console.error('productos_get_by_caja_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por caja');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/buscar_por_nombre/:search_term', async (req, res) => {
  try {
    const B = { search_term: String(req.params.search_term) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.SearchNombre);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (buscar_por_nombre)', errors });

    const data = await db.executeProc('productos_search_by_nombre', {
      search_term: { type: sql.NVarChar(100), value: B.search_term }
    });
    return res.status(200).json({ success:true, message:'Búsqueda por nombre', data });
  } catch (err) {
    console.error('productos_search_by_nombre error:', err);
    const { message, status } = extractDbError(err, 'Error en la búsqueda por nombre');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/buscar_por_precio', async (req, res) => {
  try {
    // /buscar_por_precio?min=10&max=100
    const precio_min = req.query.min != null ? Number(req.query.min) : null;
    const precio_max = req.query.max != null ? Number(req.query.max) : null;
    const B = { precio_min, precio_max };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.SearchPrecio);
    if (!isValid) return res.status(400).json({ success:false, message:'Datos inválidos (buscar_por_precio)', errors });

    const data = await db.executeProc('productos_search_by_price_range', {
      precio_min: { type: sql.Decimal(10,2), value: precio_min },
      precio_max: { type: sql.Decimal(10,2), value: precio_max }
    });
    return res.status(200).json({ success:true, message:'Búsqueda por rango de precio', data });
  } catch (err) {
    console.error('productos_search_by_price_range error:', err);
    const { message, status } = extractDbError(err, 'Error en la búsqueda por precio');
    return res.status(status).json({ success: false, message });
  }
});

Router.get('/por_cajas', async (_req, res) => {
  try {
    const data = await db.executeProc('productos_get_by_cajas', {});
    return res.status(200).json({ success:true, message:'Productos por cajas (resumen)', data });
  } catch (err) {
    console.error('productos_get_by_cajas error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener productos por cajas');
    return res.status(status).json({ success: false, message });
  }
});

Router.post('/set_precio', requireAuth, async (req, res) => {
  try {
    const B = req.body;
    const { isValid, errors } = await ValidationService.validateData(B, Rules.SetPrecio);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (set_precio)', errors });

    const data = await db.executeProc('productos_set_precio', {
      producto_id: { type: sql.Int, value: Number(B.producto_id) },
      precio: { type: sql.Decimal(10, 2), value: Number(B.precio) }
    });
    
    return res.status(200).json({ success: true, message: 'Precio actualizado', data });
  } catch (err) {
    console.error('productos_set_precio error:', err);
    const { message, status } = extractDbError(err, 'Error al actualizar el precio');
    return res.status(status).json({ success: false, message });
  }
});

/* GET DETALLE COMPLETO (public) */
Router.get('/detalle_completo/:producto_id', async (req, res) => {
  try {
    const B = { producto_id: Number(req.params.producto_id) };
    const { isValid, errors } = await ValidationService.validateData(B, Rules.PorId);
    if (!isValid) return res.status(400).json({ success: false, message: 'Datos inválidos (detalle_completo)', errors });

    const data = await db.executeProc('productos_get_detalle_completo', {
      producto_id: { type: sql.Int, value: B.producto_id }
    });

    if (!data.length) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    return res.status(200).json({ success: true, message: 'Detalle completo obtenido', data: data[0] });
  } catch (err) {
    console.error('productos_get_detalle_completo error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener el detalle completo');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = Router;

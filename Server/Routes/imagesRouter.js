// Server/Routes/imagenesRouter.js
const express = require('express');
const multer = require('multer');
const { db, sql } = require('../../db/dbconnector.js');
const imageService = require('../services/imageService.js');
const { requireAuth } = require('./authRouter.js'); // Middleware de auth
const { extractDbError } = require('../utils/dbError.js');

const ImagenesRouter = express.Router();

// Configuración de Multer (Memoria)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Helper para construir params (estilo CajasRouter)
function BuildParams(entries) {
  const params = {};
  for (const e of entries) params[e.name] = { type: e.type, value: e.value };
  return params;
}

/* ============================================================================
   GET /imagenes/producto/:id
   SP: imagenes_get_by_producto_id(@producto_id INT)
   RETURNS: [ { imagen_id, producto_id, image_path }, ... ]
============================================================================ */
ImagenesRouter.get('/producto/:id', async (req, res) => {
  try {
    const productoId = Number(req.params.id);
    
    if (!productoId || isNaN(productoId)) {
      return res.status(400).json({ success: false, message: 'ID de producto inválido' });
    }

    const params = BuildParams([
      { name: 'producto_id', type: sql.Int, value: productoId }
    ]);

    const data = await db.executeProc('imagenes_get_by_producto_id', params);

    return res.status(200).json({
      success: true,
      message: data.length ? 'Imágenes obtenidas' : 'No hay imágenes para este producto',
      data
    });
  } catch (err) {
    console.error('imagenes_get_by_producto_id error:', err);
    const { message, status } = extractDbError(err, 'Error al obtener imágenes');
    return res.status(status).json({ success: false, message, data: [] });
  }
});

/* ============================================================================
   POST /imagenes/producto/:id  (Auth requerido)
   Desc: Sube archivo a disco -> Crea variantes -> Inserta en BD
   SP: imagenes_insert(@producto_id INT, @image_path NVARCHAR(255))
   RETURNS: { imagen_id, producto_id, image_path }
============================================================================ */
ImagenesRouter.post('/producto/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const productoId = Number(req.params.id);

    // 1. Validaciones básicas
    if (!productoId || isNaN(productoId)) {
      return res.status(400).json({ success: false, message: 'ID de producto inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se envió ningún archivo de imagen' });
    }

    // 2. Guardar en Disco (ImageService)
    const savedInfo = await imageService.saveImage(
      productoId,
      req.file.buffer,
      req.file.originalname
    );

    // 3. Insertar en BD
    const params = BuildParams([
      { name: 'producto_id', type: sql.Int,      value: productoId },
      { name: 'image_path',  type: sql.NVarChar, value: savedInfo.canonicalPath }
    ]);

    const data = await db.executeProc('imagenes_insert', params);

    return res.status(201).json({
      success: true,
      message: 'Imagen subida correctamente',
      data: data[0] // El SP retorna la fila insertada
    });

  } catch (err) {
    console.error('imagenes_insert error:', err);
    const { message, status } = extractDbError(err, 'Error al procesar la imagen');
    return res.status(status).json({ success: false, message });
  }
});

/* ============================================================================
   DELETE /imagenes/:id  (Auth requerido)
   Desc: Obtiene ruta -> Borra de disco -> Borra de BD
   SP: imagenes_delete(@imagen_id INT)
   RETURNS: none
============================================================================ */
ImagenesRouter.delete('/:id', requireAuth, async (req, res) => {
  try {
    const imagenId = Number(req.params.id);

    if (!imagenId || isNaN(imagenId)) {
      return res.status(400).json({ success: false, message: 'ID de imagen inválido' });
    }

    // 1. Obtener path para borrar del disco (Query directa necesaria pues delete SP no retorna path)
    const checkQuery = `SELECT image_path FROM imagenes WHERE imagen_id = @id`;
    // Usamos el pool directamente para una query simple
    const pool = await db.poolReady;
    const resultCheck = await pool.request()
      .input('id', sql.Int, imagenId)
      .query(checkQuery);

    if (resultCheck.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Imagen no encontrada' });
    }

    const imagePath = resultCheck.recordset[0].image_path;

    // 2. Borrar archivos físicos
    await imageService.removeByCanonical(imagePath);

    // 3. Borrar registro en BD
    const params = BuildParams([
      { name: 'imagen_id', type: sql.Int, value: imagenId }
    ]);
    await db.executeProc('imagenes_delete', params);

    return res.status(200).json({ success: true, message: 'Imagen eliminada correctamente' });

  } catch (err) {
    console.error('imagenes_delete error:', err);
    const { message, status } = extractDbError(err, 'Error al eliminar la imagen');
    return res.status(status).json({ success: false, message });
  }
});

module.exports = ImagenesRouter;
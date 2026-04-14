-- /usr/local/lsws/serverZafiro/ZafiroConstr_web/db/tests.sql
-- Suite de pruebas para la base 'almacen' (sin prefijos de esquema)
-- Cambia @PERSIST a 0 si quieres revertir los cambios al final.

USE [almacen];

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Requisitos de SET para objetos con índices filtrados / columnas calculadas / vistas indexadas
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

DECLARE @PERSIST bit = 1;  -- 1 = COMMIT; 0 = ROLLBACK

BEGIN TRY
  PRINT '=============================================';
  PRINT 'INICIANDO PRUEBAS DE BASE DE DATOS (sin dbo.)';
  PRINT 'Persistencia: ' + CASE WHEN @PERSIST=1 THEN 'ON (COMMIT)' ELSE 'OFF (ROLLBACK)' END;
  PRINT '=============================================';

  BEGIN TRAN;

  -------------------------------------------------
  -- Helper inline: ejecuta un proc si existe (sin esquema)
  -------------------------------------------------
  DECLARE @proc sysname;

  -------------------------------------------------
  -- PRUEBAS UNITS
  -------------------------------------------------
  PRINT '--- PRUEBAS UNITS ---';

  SET @proc = N'units_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC units_insert @nombre = N'Kilogramos'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'units_get_all';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC units_get_all; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'units_update';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC units_update @unit_id = 1, @nombre = N'Gramos'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS SIZES
  -------------------------------------------------
  PRINT '--- PRUEBAS SIZES ---';

  SET @proc = N'sizes_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC sizes_insert @nombre = N'Grande'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'sizes_get_all';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC sizes_get_all; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS BRANDS
  -------------------------------------------------
  PRINT '--- PRUEBAS BRANDS ---';

  SET @proc = N'brands_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC brands_insert @nombre = N'Nike'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'brands_get_all';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC brands_get_all; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS CATEGORÍAS
  -------------------------------------------------
  PRINT '--- PRUEBAS CATEGORÍAS ---';

  SET @proc = N'categorias_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC categorias_insert @nombre = N'Electrónicos', @descripcion = N'Dispositivos electrónicos'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'categorias_secundarias_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC categorias_secundarias_insert @nombre = N'Audio'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'subcategorias_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC subcategorias_insert @nombre = N'Auriculares'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS CAJAS
  -------------------------------------------------
  PRINT '--- PRUEBAS CAJAS ---';

  SET @proc = N'cajas_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC cajas_insert @letra = N'A', @cara = 1, @nivel = 1; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'cajas_get_all';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC cajas_get_all; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS USUARIOS
  -------------------------------------------------
  PRINT '--- PRUEBAS USUARIOS ---';

  SET @proc = N'usuarios_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN
    PRINT N'→ ' + @proc;
    EXEC usuarios_insert
      @nombre = N'admin',
      @contrasena = N'admin123',
      @email = N'admin@almacen.com',
      @tipo = N'Admin';
  END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'usuarios_insert';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN
    PRINT N'→ ' + @proc;
    EXEC usuarios_insert
      @nombre = N'usuario1',
      @contrasena = N'user123',
      @email = N'usuario1@almacen.com';
  END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS PRODUCTOS
  -------------------------------------------------
  PRINT '--- PRUEBAS PRODUCTOS ---';

  SET @proc = N'producto_insert_with_stock';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN
    PRINT N'→ ' + @proc;
    EXEC producto_insert_with_stock
      @nombre = N'Laptop HP Pavilion',
      @descripcion = N'Laptop 15.6 pulgadas, 8GB RAM, 512GB SSD',
      @precio = 899.99,
      @categoria_principal_id = 1,
      @unit_id = 1,
      @unit_value = 1,
      @size_id = 1,
      @size_value = N'15.6"',
      @brand_id = 1,
      @caja_id = 1,
      @stock_inicial = 10;
  END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'productos_search_by_nombre';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC productos_search_by_nombre @search_term = N'Laptop'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'productos_get_all_active';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC productos_get_all_active; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS STOCK
  -------------------------------------------------
  PRINT '--- PRUEBAS STOCK ---';

  SET @proc = N'productos_add_stock';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC productos_add_stock @caja_id = 1, @producto_id = 1, @delta = 5; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'productos_move_stock';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN
    PRINT N'→ ' + @proc;
    EXEC productos_move_stock
      @producto_id = 1,
      @caja_origen = 1,
      @caja_destino = 2,
      @cantidad = 3;
  END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'get_all_stock';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC get_all_stock; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- PRUEBAS COMPLEMENTARIAS
  -------------------------------------------------
  PRINT '--- PRUEBAS COMPLEMENTARIAS ---';

  SET @proc = N'productos_get_detalle_completo';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC productos_get_detalle_completo @producto_id = 1; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'productos_get_list_by_category_id';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC productos_get_list_by_category_id @categoria_principal_id = 1; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'get_stock_by_categoria_id';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC get_stock_by_categoria_id @categoria_id = 1; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  SET @proc = N'buscar_id_para_login';
  IF OBJECT_ID(@proc, 'P') IS NOT NULL
  BEGIN PRINT N'→ ' + @proc; EXEC buscar_id_para_login @email = N'admin@almacen.com'; END
  ELSE PRINT N'⚠ Falta ' + @proc;

  -------------------------------------------------
  -- FIN / CONFIRMACIÓN
  -------------------------------------------------
  IF @PERSIST = 1
  BEGIN
    COMMIT TRAN;
    PRINT '✅ PRUEBAS COMPLETADAS. CAMBIOS CONFIRMADOS (COMMIT).';
  END
  ELSE
  BEGIN
    ROLLBACK TRAN;
    PRINT '🔁 PRUEBAS COMPLETADAS. CAMBIOS REVERTIDOS (ROLLBACK).';
  END
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0 ROLLBACK TRAN;

  PRINT '❌ ERROR DURANTE LAS PRUEBAS';
  PRINT 'Mensaje: ' + ERROR_MESSAGE();
  PRINT 'Número: ' + CAST(ERROR_NUMBER() AS varchar(10)) + ' | Estado: ' + CAST(ERROR_STATE() AS varchar(10));
  PRINT 'Severidad: ' + CAST(ERROR_SEVERITY() AS varchar(10)) + ' | Línea: ' + CAST(ERROR_LINE() AS varchar(10));
END CATCH;


/* ================================================================
   PATCH: auto-limpieza de cajas_detalles cuando stock llega a 0
   ----------------------------------------------------------------
   Actualiza 3 SPs para que, cuando el stock resultante sea 0,
   el registro correspondiente se ELIMINE de cajas_detalles en vez
   de quedarse como fila fantasma con stock=0.

   SPs afectados:
     - productos_remove_stock
     - productos_set_stock_by_detalle
     - productos_move_stock   (solo la fila de origen)

   Ejecutar (ejemplo):
     sqlcmd -S localhost -U Thunktshy -P '<pwd>' -C -d <BASE> \
            -i /usr/local/lsws/serverZafiro/ZafiroConstr_web/db/patches/fix_stock_cleanup.sql
   ================================================================ */

SET NOCOUNT ON;
GO

/* ----------------------------------------------------------------
   productos_remove_stock
   ---------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE productos_remove_stock
  @caja_id INT, @producto_id INT, @delta INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    IF @delta IS NULL OR @delta <= 0 THROW 54004,'La cantidad a remover debe ser mayor a 0.',1;
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 54005,'Producto no existe o está inactivo.',1;
    IF NOT EXISTS (SELECT 1 FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id)
      THROW 54006,'No existe stock del producto en la caja indicada.',1;

    DECLARE @actual INT;
    SELECT @actual = stock FROM cajas_detalles WITH (UPDLOCK)
    WHERE caja_id=@caja_id AND producto_id=@producto_id;
    IF @actual < @delta THROW 54007,'Stock insuficiente para remover.',1;

    DECLARE @nuevo INT = @actual - @delta;

    IF @nuevo = 0
    BEGIN
      -- Limpieza: eliminar el detalle cuando el stock resultante es 0
      DELETE FROM cajas_detalles
      WHERE caja_id=@caja_id AND producto_id=@producto_id;
    END
    ELSE
    BEGIN
      UPDATE cajas_detalles SET stock = @nuevo
      WHERE caja_id=@caja_id AND producto_id=@producto_id;
    END

    COMMIT;

    -- Devolvemos la fila actualizada si aún existe, o un resultado vacío si se eliminó
    SELECT detalle_id, caja_id, producto_id, stock
    FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_remove_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* ----------------------------------------------------------------
   productos_set_stock_by_detalle
   ---------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE productos_set_stock_by_detalle
  @detalle_id INT, @producto_id INT, @stock INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @stock IS NULL OR @stock < 0 THROW 54008,'Stock inválido (no puede ser negativo).',1;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 54009,'Producto no existe o está inactivo.',1;
    IF NOT EXISTS (SELECT 1 FROM cajas_detalles WHERE detalle_id=@detalle_id AND producto_id=@producto_id)
      THROW 54010,'La relación entre el detalle de stock y el producto no existe.',1;

    IF @stock = 0
    BEGIN
      -- Limpieza: eliminar el detalle cuando se ajusta a 0
      DELETE FROM cajas_detalles
      WHERE detalle_id=@detalle_id AND producto_id=@producto_id;
    END
    ELSE
    BEGIN
      UPDATE cajas_detalles SET stock=@stock
      WHERE detalle_id=@detalle_id AND producto_id=@producto_id;
    END

    COMMIT;

    -- Devolvemos la fila si todavía existe; 0 filas si fue eliminada
    SELECT d.detalle_id, c.etiqueta, d.producto_id, d.stock
    FROM cajas_detalles d JOIN cajas c ON c.caja_id=d.caja_id
    WHERE d.detalle_id=@detalle_id AND d.producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_set_stock_by_detalle', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* ----------------------------------------------------------------
   productos_move_stock
   Solo limpiamos la fila ORIGEN si queda en 0.
   La fila DESTINO nunca puede terminar en 0 porque @cantidad > 0.
   ---------------------------------------------------------------- */
CREATE OR ALTER PROCEDURE productos_move_stock
  @producto_id INT, @caja_origen INT, @caja_destino INT, @cantidad INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  IF @cantidad IS NULL OR @cantidad <= 0
    THROW 54020,'La cantidad a mover debe ser mayor a 0.',1;
  IF @caja_origen=@caja_destino
    THROW 54023,'La caja de origen y destino deben ser distintas.',1;

  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 54024,'Producto no existe o está inactivo.',1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_origen)
      THROW 54025,'Caja de origen no existe.',1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_destino)
      THROW 54026,'Caja de destino no existe.',1;

    DECLARE @actual INT;
    SELECT @actual=stock FROM cajas_detalles WITH (UPDLOCK)
    WHERE caja_id=@caja_origen AND producto_id=@producto_id;
    IF @actual IS NULL THROW 54021,'No existe stock del producto en la caja de origen.',1;
    IF @actual < @cantidad THROW 54022,'Stock insuficiente en la caja de origen.',1;

    DECLARE @nuevoOrigen INT = @actual - @cantidad;

    IF @nuevoOrigen = 0
    BEGIN
      -- Limpieza: eliminar la fila de origen cuando queda en 0
      DELETE FROM cajas_detalles
      WHERE caja_id=@caja_origen AND producto_id=@producto_id;
    END
    ELSE
    BEGIN
      UPDATE cajas_detalles SET stock = @nuevoOrigen
      WHERE caja_id=@caja_origen AND producto_id=@producto_id;
    END

    -- Upsert en destino (igual que antes)
    MERGE INTO cajas_detalles WITH (HOLDLOCK) AS target
    USING (SELECT @caja_destino AS caja_id, @producto_id AS producto_id, @cantidad AS cantidad) AS source
    ON (target.caja_id = source.caja_id AND target.producto_id = source.producto_id)
    WHEN MATCHED THEN
        UPDATE SET stock = target.stock + source.cantidad
    WHEN NOT MATCHED THEN
        INSERT (caja_id, producto_id, stock)
        VALUES (source.caja_id, source.producto_id, source.cantidad);

    COMMIT;

    -- Devolvemos filas resultantes (origen puede estar vacío si se eliminó)
    SELECT 'origen' AS tipo, d.detalle_id, c.etiqueta, d.producto_id, d.stock
    FROM cajas_detalles d JOIN cajas c ON c.caja_id=d.caja_id
    WHERE d.caja_id=@caja_origen AND d.producto_id=@producto_id
    UNION ALL
    SELECT 'destino', d.detalle_id, c.etiqueta, d.producto_id, d.stock
    FROM cajas_detalles d JOIN cajas c ON c.caja_id=d.caja_id
    WHERE d.caja_id=@caja_destino AND d.producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje)
    VALUES(N'productos_move_stock',
           CONCAT('N°',ERROR_NUMBER(),' L',ERROR_LINE(),' [',ISNULL(ERROR_PROCEDURE(),'-'),'] ',ERROR_MESSAGE()));
    THROW;
  END CATCH
END;
GO

/* ----------------------------------------------------------------
   Limpieza retroactiva: eliminar filas existentes con stock=0
   (opcional pero recomendado — esto arregla las filas viejas que
    quedaron con stock=0 antes del patch, como el detalle #3 de la
    captura del usuario).
   ---------------------------------------------------------------- */
DECLARE @huérfanas INT;
SELECT @huérfanas = COUNT(*) FROM cajas_detalles WHERE stock = 0;
PRINT CONCAT('Filas con stock=0 a eliminar: ', @huérfanas);

DELETE FROM cajas_detalles WHERE stock = 0;

PRINT 'Patch fix_stock_cleanup.sql aplicado correctamente.';
GO

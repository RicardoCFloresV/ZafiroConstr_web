/* ============================
   Tabla de LOG de errores
   ============================ */
DROP TABLE IF EXISTS logs;
GO
CREATE TABLE logs (
  log_id  INT IDENTITY(1,1) PRIMARY KEY,
  fecha   DATETIME      NOT NULL DEFAULT GETDATE(),
  origen  NVARCHAR(100) NOT NULL,
  mensaje NVARCHAR(MAX) NOT NULL,
  usuario NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME()
);
GO

-- Unidad de Medida
DROP TABLE IF EXISTS unidad;
GO
CREATE TABLE unidad (
  unit_id    INT IDENTITY(1,1) PRIMARY KEY,
  nombre       NVARCHAR(50) NOT NULL
);
GO


/* ============================
   CATEGORIAS
   ============================ */
DROP TABLE IF EXISTS categorias;
GO
CREATE TABLE categorias (
  categoria_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre       NVARCHAR(100) UNIQUE NOT NULL
);
GO


-- Brands
DROP TABLE IF EXISTS marcas;
GO
CREATE TABLE marcas (
  marca_id   INT IDENTITY(1,1) PRIMARY KEY,
  nombre       NVARCHAR(50) NOT NULL
);
GO

/* ============================
   PRODUCTOS
   ============================ */
DROP TABLE IF EXISTS productos;
GO
CREATE TABLE productos (
  producto_id               INT           IDENTITY(1,1) PRIMARY KEY,
  nombre                    NVARCHAR(100) NOT NULL,
  descripcion               NVARCHAR(255) NULL,
  precio                    DECIMAL(10,2) NOT NULL 
                               CONSTRAINT ck_productos_precio_nonneg CHECK (precio >= 0),
  estado                    BIT           NOT NULL 
                               CONSTRAINT df_productos_estado DEFAULT (1),
  categoria_principal_id    INT           NOT NULL,
  categoria_secundaria_id   INT           NULL,
  subcategoria_id           INT           NULL,
  unidad_id                   INT           NOT NULL,
  unidad_valor                DECIMAL(10,2) NOT NULL,
  marca_id                  INT           NOT NULL,
  fecha_creacion            DATETIME2     NOT NULL 
                               CONSTRAINT df_productos_fecha_creacion DEFAULT (GETDATE()),

  CONSTRAINT uq_productos_nombre UNIQUE (nombre),

  CONSTRAINT fk_productos_cat_prin 
    FOREIGN KEY (categoria_principal_id) 
    REFERENCES categorias(categoria_id),
  CONSTRAINT fk_productos_cat_sec  
    FOREIGN KEY (categoria_secundaria_id) 
    REFERENCES categorias_secundarias(categoria_secundaria_id),
  CONSTRAINT fk_productos_subcat   
    FOREIGN KEY (subcategoria_id) 
    REFERENCES subcategorias(subcategoria_id),
  CONSTRAINT fk_productos_unit    
    FOREIGN KEY (unit_id) 
    REFERENCES units(unit_id),
  CONSTRAINT fk_productos_size    
    FOREIGN KEY (size_id) 
    REFERENCES sizes(size_id),
  CONSTRAINT fk_productos_brand   
    FOREIGN KEY (brand_id) 
    REFERENCES brands(brand_id)
);
GO

/* ============================
   CAJAS
   ============================ */
DROP TABLE IF EXISTS cajas;
GO
CREATE TABLE cajas (
  caja_id INT IDENTITY(1,1) PRIMARY KEY,
  letra VARCHAR(2) NOT NULL
    CHECK (LEN(letra) BETWEEN 1 AND 2 AND letra COLLATE Latin1_General_CS_AS NOT LIKE '%[^A-Z]%'),
  cara  TINYINT NOT NULL CHECK (cara  IN (1,2)), -- 1=FRENTE, 2=ATRAS
  nivel TINYINT NOT NULL CHECK (nivel IN (1,2)), -- 1=ARRIBA, 2=ABAJO
  etiqueta AS (
    'caja ' + letra + ' ' +
    CASE cara  WHEN 1 THEN 'FRENTE' ELSE 'ATRAS' END + ' ' +
    CASE nivel WHEN 1 THEN 'ARRIBA' ELSE 'ABAJO' END
  ) PERSISTED,
  CONSTRAINT UQ_cajas_letra_cara_nivel UNIQUE (letra, cara, nivel)
);
GO

/* ============================
   CAJAS_DETALLES (Stock por caja/producto)
   ============================ */
DROP TABLE IF EXISTS cajas_detalles;
GO
CREATE TABLE cajas_detalles (
  detalle_id  INT IDENTITY(1,1) PRIMARY KEY,
  caja_id     INT NOT NULL,
  producto_id INT NOT NULL,
  stock       INT NOT NULL DEFAULT (0) CONSTRAINT ck_cajas_detalles_stock_nonneg CHECK (stock >= 0),
  CONSTRAINT fk_cajas_detalles_caja FOREIGN KEY (caja_id) REFERENCES cajas(caja_id),
  CONSTRAINT fk_cajas_detalles_prod FOREIGN KEY (producto_id) REFERENCES productos(producto_id),
  CONSTRAINT uq_cajas_detalles UNIQUE (caja_id, producto_id)
);
GO

/* ============================
   USUARIOS
   ============================ */
DROP TABLE IF EXISTS usuarios;
GO
CREATE TABLE usuarios (
  usuario_id     INT IDENTITY(1,1) PRIMARY KEY,
  nombre         NVARCHAR(100) NOT NULL UNIQUE,
  contrasena     NVARCHAR(255) NOT NULL,
  email          NVARCHAR(150) NOT NULL UNIQUE,
  fecha_registro DATETIME      NOT NULL DEFAULT GETDATE(),
  estado         BIT           NOT NULL DEFAULT 1 CHECK (estado IN (0,1)),
  tipo           NVARCHAR(10)  NOT NULL DEFAULT N'Usuario'
);
GO

/* =========================================================
   PROCEDIMIENTOS: CAJAS
   ========================================================= */
CREATE OR ALTER PROCEDURE cajas_insert
  @letra VARCHAR(2),
  @cara  TINYINT,
  @nivel TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @letra = UPPER(LTRIM(RTRIM(@letra)));
    IF @letra IS NULL OR LEN(@letra) NOT BETWEEN 1 AND 2
      THROW 52001, 'letra debe tener 1 o 2 caracteres.', 1;
    IF @cara NOT IN (1,2)  THROW 52002, 'cara inválida. Use 1=FRENTE, 2=ATRAS.', 1;
    IF @nivel NOT IN (1,2) THROW 52003, 'nivel inválido. Use 1=ARRIBA, 2=ABAJO.', 1;
    IF EXISTS (SELECT 1 FROM cajas WHERE letra=@letra AND cara=@cara AND nivel=@nivel)
      THROW 52004, 'Ya existe una caja con la misma letra, cara y nivel.', 1;
    INSERT INTO cajas (letra, cara, nivel) VALUES (@letra, @cara, @nivel);
    COMMIT;
    SELECT caja_id, letra, cara, nivel, etiqueta
    FROM cajas WHERE caja_id = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_update
  @caja_id INT, @letra VARCHAR(2), @cara TINYINT, @nivel TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id)
      THROW 52005, 'La caja ya no se encuentra en la base de datos.', 1;
    SET @letra = UPPER(LTRIM(RTRIM(@letra)));
    IF @letra IS NULL OR LEN(@letra) NOT BETWEEN 1 AND 2
      THROW 52006, 'letra debe tener 1 o 2 caracteres.', 1;
    IF @cara NOT IN (1,2)  THROW 52007, 'cara inválida. Use 1=FRENTE, 2=ATRAS.', 1;
    IF @nivel NOT IN (1,2) THROW 52008, 'nivel inválido. Use 1=ARRIBA, 2=ABAJO.', 1;
    IF EXISTS (
      SELECT 1 FROM cajas
      WHERE letra=@letra AND cara=@cara AND nivel=@nivel AND caja_id<>@caja_id
    ) THROW 52009, 'Otra caja ya usa esa combinación de letra, cara y nivel.', 1;
    UPDATE cajas SET letra=@letra, cara=@cara, nivel=@nivel WHERE caja_id=@caja_id;
    COMMIT;
    SELECT caja_id, letra, cara, nivel, etiqueta FROM cajas WHERE caja_id=@caja_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_delete
  @caja_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id)
      THROW 52010, 'La caja ya no se encuentra en la base de datos.', 1;
    IF EXISTS (SELECT 1 FROM cajas_detalles WHERE caja_id=@caja_id)
      THROW 52011, 'No se puede eliminar: la caja tiene stock o referencias.', 1;
    DELETE FROM cajas WHERE caja_id=@caja_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen,mensaje) VALUES(N'cajas_delete',ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT caja_id, letra, cara, nivel, etiqueta
  FROM cajas
  ORDER BY LEN(letra), letra,
           CASE cara WHEN 1 THEN 1 ELSE 2 END,
           CASE nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

CREATE OR ALTER PROCEDURE cajas_get_list
AS
BEGIN
  SET NOCOUNT ON;
  SELECT caja_id, etiqueta
  FROM cajas
  ORDER BY LEN(letra), letra,
           CASE cara WHEN 1 THEN 1 ELSE 2 END,
           CASE nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

CREATE OR ALTER PROCEDURE cajas_get_by_id
  @caja_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT caja_id, letra, cara, nivel, etiqueta
  FROM cajas WHERE caja_id=@caja_id;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: CATEGORIAS
   ========================================================= */
CREATE OR ALTER PROCEDURE categorias_insert
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51001,'El nombre de categoría es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM categorias WHERE nombre=@nombre)
      THROW 51006,'Ya existe otra categoría con ese nombre.',1;
    INSERT INTO categorias(nombre, descripcion) VALUES(@nombre, @descripcion);
    COMMIT;
    SELECT categoria_id, nombre, descripcion
    FROM categorias WHERE categoria_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_update
  @categoria_id INT, @nombre NVARCHAR(100), @descripcion NVARCHAR(255) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id=@categoria_id)
      THROW 51002,'Categoría no encontrada.',1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51003,'El nombre de categoría es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM categorias WHERE nombre=@nombre AND categoria_id<>@categoria_id)
      THROW 51004,'Ya existe otra categoría con ese nombre.',1;
    UPDATE categorias SET nombre=@nombre, descripcion=@descripcion WHERE categoria_id=@categoria_id;
    COMMIT;
    SELECT categoria_id, nombre, descripcion FROM categorias WHERE categoria_id=@categoria_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_delete
  @categoria_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM productos WHERE categoria_principal_id=@categoria_id)
      THROW 51005,'No se puede eliminar: hay productos en esta categoría.',1;
    DELETE FROM categorias WHERE categoria_id=@categoria_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_id, nombre, descripcion
  FROM categorias
  ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE categorias_get_list
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_id, nombre FROM categorias ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE categorias_get_by_id
  @categoria_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_id, nombre, descripcion
  FROM categorias WHERE categoria_id=@categoria_id;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: CATEGORIAS_SECUNDARIAS
   ========================================================= */
CREATE OR ALTER PROCEDURE categorias_secundarias_insert
  @nombre NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 52001, 'El nombre de la categoría secundaria es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM categorias_secundarias WHERE nombre=@nombre)
      THROW 52006, 'Ya existe otra categoría secundaria con ese nombre.', 1;
    INSERT INTO categorias_secundarias(nombre) VALUES(@nombre);
    COMMIT;
    SELECT categoria_secundaria_id, nombre
    FROM categorias_secundarias WHERE categoria_secundaria_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_secundarias_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_secundarias_update
  @categoria_secundaria_id INT,
  @nombre NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id)
      THROW 52002, 'Categoría secundaria no encontrada.', 1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 52003, 'El nombre de la categoría secundaria es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM categorias_secundarias WHERE nombre=@nombre AND categoria_secundaria_id<>@categoria_secundaria_id)
      THROW 52004, 'Ya existe otra categoría secundaria con ese nombre.', 1;
    UPDATE categorias_secundarias SET nombre=@nombre WHERE categoria_secundaria_id=@categoria_secundaria_id;
    COMMIT;
    SELECT categoria_secundaria_id, nombre FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_secundarias_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_secundarias_delete
  @categoria_secundaria_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM productos WHERE categoria_secundaria_id=@categoria_secundaria_id)
      THROW 52005, 'No se puede eliminar: hay productos en esta categoría secundaria.', 1;
    DELETE FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_secundarias_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE categorias_secundarias_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_secundaria_id, nombre
  FROM categorias_secundarias
  ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE categorias_secundarias_get_list
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_secundaria_id, nombre FROM categorias_secundarias ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE categorias_secundarias_get_by_id
  @categoria_secundaria_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT categoria_secundaria_id, nombre
  FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: SUBCATEGORIAS
   ========================================================= */
CREATE OR ALTER PROCEDURE subcategorias_insert
  @nombre NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 53001, 'El nombre de la subcategoría es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM subcategorias WHERE nombre=@nombre)
      THROW 53006, 'Ya existe otra subcategoría con ese nombre.', 1;
    INSERT INTO subcategorias(nombre) VALUES(@nombre);
    COMMIT;
    SELECT subcategoria_id, nombre
    FROM subcategorias WHERE subcategoria_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'subcategorias_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE subcategorias_update
  @subcategoria_id INT,
  @nombre NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM subcategorias WHERE subcategoria_id=@subcategoria_id)
      THROW 53002, 'Subcategoría no encontrada.', 1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 53003, 'El nombre de la subcategoría es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM subcategorias WHERE nombre=@nombre AND subcategoria_id<>@subcategoria_id)
      THROW 53004, 'Ya existe otra subcategoría con ese nombre.', 1;
    UPDATE subcategorias SET nombre=@nombre WHERE subcategoria_id=@subcategoria_id;
    COMMIT;
    SELECT subcategoria_id, nombre FROM subcategorias WHERE subcategoria_id=@subcategoria_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'subcategorias_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE subcategorias_delete
  @subcategoria_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM productos WHERE subcategoria_id=@subcategoria_id)
      THROW 53005, 'No se puede eliminar: hay productos en esta subcategoría.', 1;
    DELETE FROM subcategorias WHERE subcategoria_id=@subcategoria_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'subcategorias_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE subcategorias_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT subcategoria_id, nombre
  FROM subcategorias
  ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE subcategorias_get_list
AS
BEGIN
  SET NOCOUNT ON;
  SELECT subcategoria_id, nombre FROM subcategorias ORDER BY nombre;
END;
GO

CREATE OR ALTER PROCEDURE subcategorias_get_by_id
  @subcategoria_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT subcategoria_id, nombre
  FROM subcategorias WHERE subcategoria_id=@subcategoria_id;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: PRODUCTOS (CRUD + consultas) - UPDATED
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_insert
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_principal_id INT,
  @categoria_secundaria_id INT = NULL,
  @subcategoria_id INT = NULL,
  @unit_id INT,
  @unit_value DECIMAL(10,2),
  @size_id INT,
  @size_value NVARCHAR(50),
  @brand_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    -- Validations
    IF @nombre IS NULL OR @nombre=''   THROW 52031, 'El nombre del producto es obligatorio.', 1;
    IF @precio IS NULL OR @precio < 0  THROW 52012, 'Precio inválido.', 1;
    IF @unit_value IS NULL OR @unit_value <= 0  THROW 52032, 'El valor de unidad debe ser mayor a cero.', 1;
    IF @size_value IS NULL OR LTRIM(RTRIM(@size_value)) = ''  THROW 52033, 'El valor de tamaño es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id=@categoria_principal_id) THROW 52013, 'Categoría principal no existe.', 1;
    IF @categoria_secundaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id) THROW 52034, 'Categoría secundaria no existe.', 1;
    IF @subcategoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subcategorias WHERE subcategoria_id=@subcategoria_id) THROW 52035, 'Subcategoría no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM units WHERE unit_id=@unit_id) THROW 52036, 'Unidad de medida no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM sizes WHERE size_id=@size_id) THROW 52037, 'Tamaño no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM brands WHERE brand_id=@brand_id) THROW 52038, 'Marca no existe.', 1;

    INSERT INTO productos (
        nombre, descripcion, precio, categoria_principal_id, categoria_secundaria_id,
        subcategoria_id, unit_id, unit_value, size_id, size_value, brand_id
    ) VALUES (
        @nombre, @descripcion, @precio, @categoria_principal_id, @categoria_secundaria_id,
        @subcategoria_id, @unit_id, @unit_value, @size_id, @size_value, @brand_id
    );

    COMMIT;
    -- Return the full new record with all joins for confirmation
    SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
           p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
           p.subcategoria_id, sc.nombre AS subcategoria_nombre,
           p.unit_id, u.nombre AS unit_nombre, p.unit_value,
           p.size_id, s.nombre AS size_nombre, p.size_value,
           p.brand_id, b.nombre AS brand_nombre,
           p.fecha_creacion
    FROM productos p
    INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
    LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
    LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
    INNER JOIN units u ON p.unit_id = u.unit_id
    INNER JOIN sizes s ON p.size_id = s.size_id
    INNER JOIN brands b ON p.brand_id = b.brand_id
    WHERE p.producto_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE productos_update
  @producto_id INT,
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_principal_id INT,
  @categoria_secundaria_id INT = NULL,
  @subcategoria_id INT = NULL,
  @unit_id INT,
  @unit_value DECIMAL(10,2),
  @size_id INT,
  @size_value NVARCHAR(50),
  @brand_id INT,
  @estado BIT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52014, 'Producto no encontrado.', 1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre=''  THROW 52015, 'El nombre del producto es obligatorio.', 1;
    IF @precio IS NULL OR @precio < 0 THROW 52016, 'Precio inválido.', 1;
    IF @unit_value IS NULL OR @unit_value <= 0  THROW 52032, 'El valor de unidad debe ser mayor a cero.', 1;
    IF @size_value IS NULL OR LTRIM(RTRIM(@size_value)) = ''  THROW 52033, 'El valor de tamaño es obligatorio.', 1;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id=@categoria_principal_id) THROW 52017, 'Categoría principal no existe.', 1;
    IF @categoria_secundaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id) THROW 52034, 'Categoría secundaria no existe.', 1;
    IF @subcategoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subcategorias WHERE subcategoria_id=@subcategoria_id) THROW 52035, 'Subcategoría no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM units WHERE unit_id=@unit_id) THROW 52036, 'Unidad de medida no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM sizes WHERE size_id=@size_id) THROW 52037, 'Tamaño no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM brands WHERE brand_id=@brand_id) THROW 52038, 'Marca no existe.', 1;
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre AND producto_id<>@producto_id) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;

    IF @estado IS NULL SELECT @estado = estado FROM productos WHERE producto_id=@producto_id;

    UPDATE productos
    SET nombre=@nombre, descripcion=@descripcion, precio=@precio,
        categoria_principal_id=@categoria_principal_id, categoria_secundaria_id=@categoria_secundaria_id,
        subcategoria_id=@subcategoria_id, unit_id=@unit_id, unit_value=@unit_value,
        size_id=@size_id, size_value=@size_value, brand_id=@brand_id, estado=@estado
    WHERE producto_id=@producto_id;

    COMMIT;
    -- Return the full updated record with all joins
    SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
           p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
           p.subcategoria_id, sc.nombre AS subcategoria_nombre,
           p.unit_id, u.nombre AS unit_nombre, p.unit_value,
           p.size_id, s.nombre AS size_nombre, p.size_value,
           p.brand_id, b.nombre AS brand_nombre,
           p.fecha_creacion
    FROM productos p
    INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
    LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
    LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
    INNER JOIN units u ON p.unit_id = u.unit_id
    INNER JOIN sizes s ON p.size_id = s.size_id
    INNER JOIN brands b ON p.brand_id = b.brand_id
    WHERE p.producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE productos_soft_delete
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52020, 'Producto no encontrado.', 1;
    UPDATE productos SET estado = 0 WHERE producto_id=@producto_id;
    COMMIT;
    -- Return basic info after soft delete
    SELECT producto_id, nombre, descripcion, precio, estado FROM productos WHERE producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_soft_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE productos_set_precio
  @producto_id INT, @precio DECIMAL(10,2)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @precio IS NULL OR @precio < 0 THROW 52019, 'Precio inválido.', 1;
    UPDATE productos SET precio=@precio WHERE producto_id=@producto_id;
    IF @@ROWCOUNT=0 THROW 52020, 'Producto no encontrado.', 1;
    COMMIT;
    SELECT producto_id, nombre, precio FROM productos WHERE producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_set_precio', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- Listados y consultas 
CREATE OR ALTER PROCEDURE productos_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
         p.subcategoria_id, sc.nombre AS subcategoria_nombre,
         p.unit_id, u.nombre AS unit_nombre, p.unit_value,
         p.size_id, s.nombre AS size_nombre, p.size_value,
         p.brand_id, b.nombre AS brand_nombre,
         p.fecha_creacion,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
  LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
  INNER JOIN units u ON p.unit_id = u.unit_id
  INNER JOIN sizes s ON p.size_id = s.size_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_principal_id, cp.nombre, p.categoria_secundaria_id, cs.nombre,
           p.subcategoria_id, sc.nombre, p.unit_id, u.nombre, p.unit_value,
           p.size_id, s.nombre, p.size_value, p.brand_id, b.nombre, p.fecha_creacion
  ORDER BY p.estado DESC, p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_all_active
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
         p.subcategoria_id, sc.nombre AS subcategoria_nombre,
         p.unit_id, u.nombre AS unit_nombre, p.unit_value,
         p.size_id, s.nombre AS size_nombre, p.size_value,
         p.brand_id, b.nombre AS brand_nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
  LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
  INNER JOIN units u ON p.unit_id = u.unit_id
  INNER JOIN sizes s ON p.size_id = s.size_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE p.estado=1
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio,
           p.categoria_principal_id, cp.nombre, p.categoria_secundaria_id, cs.nombre,
           p.subcategoria_id, sc.nombre, p.unit_id, u.nombre, p.unit_value,
           p.size_id, s.nombre, p.size_value, p.brand_id, b.nombre
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_list
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.brand_id, b.nombre AS brand_nombre
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  WHERE p.estado=1
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_by_id
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
         p.subcategoria_id, sc.nombre AS subcategoria_nombre,
         p.unit_id, u.nombre AS unit_nombre, p.unit_value,
         p.size_id, s.nombre AS size_nombre, p.size_value,
         p.brand_id, b.nombre AS brand_nombre,
         p.fecha_creacion,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
  LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
  INNER JOIN units u ON p.unit_id = u.unit_id
  INNER JOIN sizes s ON p.size_id = s.size_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE p.producto_id=@producto_id
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_principal_id, cp.nombre, p.categoria_secundaria_id, cs.nombre,
           p.subcategoria_id, sc.nombre, p.unit_id, u.nombre, p.unit_value,
           p.size_id, s.nombre, p.size_value, p.brand_id, b.nombre, p.fecha_creacion;
END;
GO

-- Note: This procedure now filters by categoria_principal_id. You might want additional procedures for secundaria/subcategoria.
CREATE OR ALTER PROCEDURE productos_get_list_by_category_id
  @categoria_principal_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.brand_id, b.nombre AS brand_nombre
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  WHERE p.estado=1 AND p.categoria_principal_id=@categoria_principal_id
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_by_caja_id
  @caja_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT cd.detalle_id,
         p.producto_id, p.nombre AS producto_nombre, p.descripcion, p.precio,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.brand_id, b.nombre AS brand_nombre,
         cd.stock, c.etiqueta AS caja_etiqueta
  FROM cajas_detalles cd
  JOIN productos p  ON cd.producto_id=p.producto_id
  JOIN categorias cp ON p.categoria_principal_id=cp.categoria_id
  JOIN brands b ON p.brand_id = b.brand_id
  JOIN cajas c ON cd.caja_id=c.caja_id
  WHERE cd.caja_id=@caja_id AND p.estado=1
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_search_by_price_range
  @precio_min DECIMAL(10,2) = NULL,
  @precio_max DECIMAL(10,2) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.brand_id, b.nombre AS brand_nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  JOIN categorias cp ON p.categoria_principal_id=cp.categoria_id
  JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id=cd.producto_id
  WHERE p.estado=1
    AND (@precio_min IS NULL OR p.precio>=@precio_min)
    AND (@precio_max IS NULL OR p.precio<=@precio_max)
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio,
           p.categoria_principal_id, cp.nombre, p.brand_id, b.nombre
  ORDER BY p.precio, p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_search_by_nombre
  @search_term NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  IF @search_term IS NULL OR LTRIM(RTRIM(@search_term))='' THROW 55001,'El término de búsqueda no puede estar vacío.',1;

  SELECT p.producto_id, p.nombre, p.descripcion, p.precio,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.brand_id, b.nombre AS brand_nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  JOIN categorias cp ON p.categoria_principal_id=cp.categoria_id
  JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id=cd.producto_id
  WHERE p.estado=1 AND (p.nombre LIKE '%'+@search_term+'%' OR p.descripcion LIKE '%'+@search_term+'%')
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio,
           p.categoria_principal_id, cp.nombre, p.brand_id, b.nombre
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_by_cajas
AS
BEGIN
  SET NOCOUNT ON;
  SELECT c.caja_id, c.etiqueta AS caja_etiqueta,
         p.producto_id, p.nombre AS producto_nombre,
         cd.stock, cp.nombre AS categoria_principal_nombre, p.precio,
         (cd.stock * p.precio) AS valor_en_caja
  FROM cajas c
  LEFT JOIN cajas_detalles cd ON c.caja_id=cd.caja_id
  LEFT JOIN productos p ON cd.producto_id=p.producto_id
  LEFT JOIN categorias cp ON p.categoria_principal_id=cp.categoria_id
  WHERE p.estado=1 OR p.estado IS NULL
  ORDER BY LEN(c.letra), c.letra,
           CASE c.cara WHEN 1 THEN 1 ELSE 2 END,
           CASE c.nivel WHEN 1 THEN 1 ELSE 2 END,
           p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_detalle_completo
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  -- cabecera (now with all new fields)
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
         p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
         p.subcategoria_id, sc.nombre AS subcategoria_nombre,
         p.unit_id, u.nombre AS unit_nombre, p.unit_value,
         p.size_id, s.nombre AS size_nombre, p.size_value,
         p.brand_id, b.nombre AS brand_nombre,
         p.fecha_creacion,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
  LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
  LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
  INNER JOIN units u ON p.unit_id = u.unit_id
  INNER JOIN sizes s ON p.size_id = s.size_id
  INNER JOIN brands b ON p.brand_id = b.brand_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE p.producto_id=@producto_id
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_principal_id, cp.nombre, p.categoria_secundaria_id, cs.nombre,
           p.subcategoria_id, sc.nombre, p.unit_id, u.nombre, p.unit_value,
           p.size_id, s.nombre, p.size_value, p.brand_id, b.nombre, p.fecha_creacion;

  -- detalle por caja (unchanged, as it's about stock location)
  SELECT cd.detalle_id, c.caja_id, c.etiqueta AS caja_etiqueta,
         cd.stock, (cd.stock * p.precio) AS valor_en_caja
  FROM cajas_detalles cd
  JOIN cajas c ON cd.caja_id=c.caja_id
  JOIN productos p ON cd.producto_id=p.producto_id
  WHERE cd.producto_id=@producto_id
  ORDER BY LEN(c.letra), c.letra,
           CASE c.cara WHEN 1 THEN 1 ELSE 2 END,
           CASE c.nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: STOCK (detalle)
   ========================================================= */
CREATE OR ALTER PROCEDURE cajas_detalles_insert
  @caja_id INT, @producto_id INT, @stock INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @stock IS NULL OR @stock < 0 THROW 53001,'Stock inválido (negativo).',1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 53002,'Caja no existe.',1;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 53003,'Producto no existe o está inactivo.',1;
    IF EXISTS (SELECT 1 FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id)
      THROW 53004,'Ya existe stock para ese producto en la caja.',1;

    INSERT INTO cajas_detalles(caja_id, producto_id, stock) VALUES(@caja_id, @producto_id, @stock);
    COMMIT;
    SELECT detalle_id, caja_id, producto_id, stock
    FROM cajas_detalles WHERE detalle_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_detalles_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_detalles_update
  @detalle_id INT, @caja_id INT, @producto_id INT, @stock INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas_detalles WHERE detalle_id=@detalle_id)
      THROW 53005,'Detalle no encontrado.',1;
    IF @stock IS NULL OR @stock < 0 THROW 53006,'Stock inválido (negativo).',1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 53007,'Caja no existe.',1;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 53008,'Producto no existe o está inactivo.',1;
    IF EXISTS (SELECT 1 FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id AND detalle_id<>@detalle_id)
      THROW 53009,'Otra fila ya tiene ese (caja, producto).',1;

    UPDATE cajas_detalles
    SET caja_id=@caja_id, producto_id=@producto_id, stock=@stock
    WHERE detalle_id=@detalle_id;
    COMMIT;
    SELECT detalle_id, caja_id, producto_id, stock
    FROM cajas_detalles WHERE detalle_id=@detalle_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_detalles_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_detalles_delete
  @detalle_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF EXISTS (SELECT 1 FROM cajas_detalles WHERE detalle_id=@detalle_id AND stock>0)
      THROW 53020,'No se puede eliminar un detalle con stock > 0.',1;
    DELETE FROM cajas_detalles WHERE detalle_id=@detalle_id;
    IF @@ROWCOUNT=0 THROW 53021,'Detalle no encontrado.',1;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_detalles_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE cajas_detalles_get_by_id
  @detalle_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT d.detalle_id, d.caja_id, c.etiqueta, d.producto_id, d.stock
  FROM cajas_detalles d
  JOIN cajas c ON c.caja_id=d.caja_id
  WHERE d.detalle_id=@detalle_id;
END;
GO

CREATE OR ALTER PROCEDURE cajas_detalles_get_by_producto
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT d.detalle_id, c.etiqueta, d.producto_id, d.stock
  FROM cajas_detalles d
  JOIN cajas c ON c.caja_id=d.caja_id
  WHERE d.producto_id=@producto_id
  ORDER BY LEN(c.letra), c.letra,
           CASE c.cara WHEN 1 THEN 1 ELSE 2 END,
           CASE c.nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: CONTROL DE STOCK (agregar, remover, mover)
   ========================================================= */
CREATE OR ALTER PROCEDURE get_stock_by_id
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT d.detalle_id, c.etiqueta, d.producto_id, d.stock
  FROM cajas_detalles d
  JOIN cajas c ON c.caja_id=d.caja_id
  WHERE d.producto_id=@producto_id
  ORDER BY LEN(c.letra), c.letra,
           CASE c.cara WHEN 1 THEN 1 ELSE 2 END,
           CASE c.nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

CREATE OR ALTER PROCEDURE productos_get_stock
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  EXEC get_stock_by_id @producto_id=@producto_id;
END;
GO

CREATE OR ALTER PROCEDURE productos_add_stock
  @caja_id INT, @producto_id INT, @delta INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    IF @delta IS NULL OR @delta <= 0 THROW 54001,'La cantidad a agregar debe ser mayor a 0.',1;
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id AND estado=1)
      THROW 54002,'Producto no existe o está inactivo.',1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id)
      THROW 54003,'Caja no existe.',1;

    -- Use MERGE (UPSERT) for atomicity and clarity
    MERGE INTO cajas_detalles WITH (HOLDLOCK) AS target
    USING (SELECT @caja_id AS caja_id, @producto_id AS producto_id, @delta AS delta) AS source
    ON (target.caja_id = source.caja_id AND target.producto_id = source.producto_id)
    WHEN MATCHED THEN
        UPDATE SET stock = target.stock + source.delta
    WHEN NOT MATCHED THEN
        INSERT (caja_id, producto_id, stock)
        VALUES (source.caja_id, source.producto_id, source.delta)
    OUTPUT inserted.detalle_id, inserted.caja_id, inserted.producto_id, inserted.stock;

    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_add_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

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

    -- Perform the move (limpieza del origen si queda en 0)
    IF @nuevoOrigen = 0
    BEGIN
      DELETE FROM cajas_detalles
      WHERE caja_id=@caja_origen AND producto_id=@producto_id;
    END
    ELSE
    BEGIN
      UPDATE cajas_detalles SET stock = @nuevoOrigen
      WHERE caja_id=@caja_origen AND producto_id=@producto_id;
    END

    MERGE INTO cajas_detalles WITH (HOLDLOCK) AS target
    USING (SELECT @caja_destino AS caja_id, @producto_id AS producto_id, @cantidad AS cantidad) AS source
    ON (target.caja_id = source.caja_id AND target.producto_id = source.producto_id)
    WHEN MATCHED THEN
        UPDATE SET stock = target.stock + source.cantidad
    WHEN NOT MATCHED THEN
        INSERT (caja_id, producto_id, stock)
        VALUES (source.caja_id, source.producto_id, source.cantidad);

    COMMIT;

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

/* =========================================================
   PROCEDIMIENTOS: REPORTES DE STOCK (no auditoría)
   ========================================================= */
CREATE OR ALTER PROCEDURE get_all_stock
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.precio,
         COALESCE(SUM(cd.stock),0) AS stock,
         CAST(COALESCE(SUM(cd.stock),0) * p.precio AS DECIMAL(18,2)) AS valor_inventario
  FROM productos p
  LEFT JOIN cajas_detalles cd ON cd.producto_id=p.producto_id
  GROUP BY p.producto_id, p.nombre, p.precio
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE get_stock
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre AS producto_nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  LEFT JOIN cajas_detalles cd ON cd.producto_id=p.producto_id
  WHERE p.estado=1
  GROUP BY p.producto_id, p.nombre
  ORDER BY p.nombre;
END;
GO

CREATE OR ALTER PROCEDURE get_stock_by_categoria_id
  @categoria_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre AS producto_nombre,
         c.categoria_id, c.nombre AS categoria_nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  JOIN categorias c ON c.categoria_id = p.categoria_principal_id 
  LEFT JOIN cajas_detalles cd ON cd.producto_id=p.producto_id
  WHERE p.estado=1 AND p.categoria_principal_id=@categoria_id 
  GROUP BY p.producto_id, p.nombre, c.categoria_id, c.nombre
  ORDER BY p.nombre;
END;
GO

/* =========================================================
   PROCEDIMIENTOS: USUARIOS (sin auditoría ni triggers)
   ========================================================= */

-- INSERT con @tipo (opcional) y validación
CREATE OR ALTER PROCEDURE usuarios_insert
  @nombre NVARCHAR(100),
  @contrasena NVARCHAR(255),
  @email NVARCHAR(150),
  @tipo NVARCHAR(10) = NULL  -- 'Usuario' (default) o 'Admin'
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    SELECT @tipo = COALESCE(NULLIF(LTRIM(RTRIM(@tipo)), N''), N'Usuario');
    IF @tipo NOT IN (N'Usuario', N'Admin')
      THROW 56012, 'Tipo inválido. Use ''Usuario'' o ''Admin''.', 1;

    IF @email NOT LIKE '%_@__%.__%' THROW 56001,'Formato de email inválido.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE nombre=@nombre)
      THROW 56002,'El nombre de usuario ya existe.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE email=@email)
      THROW 56003,'El email ya está registrado.',1;

    INSERT INTO usuarios(nombre, contrasena, email, tipo)
    VALUES(@nombre, @contrasena, @email, @tipo);

    COMMIT;
    SELECT usuario_id, nombre, email, estado, tipo
    FROM usuarios WHERE usuario_id = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- UPDATE con @tipo (opcional)
CREATE OR ALTER PROCEDURE usuarios_update
  @usuario_id INT,
  @nombre NVARCHAR(100),
  @email NVARCHAR(150),
  @tipo NVARCHAR(10) = NULL  -- si viene NULL, se mantiene el actual
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario_id=@usuario_id)
      THROW 56004,'usuario_id no existe.',1;

    IF EXISTS (SELECT 1 FROM usuarios WHERE nombre=@nombre AND usuario_id<>@usuario_id)
      THROW 56005,'El nombre ya está en uso por otro usuario.',1;

    IF EXISTS (SELECT 1 FROM usuarios WHERE email=@email AND usuario_id<>@usuario_id)
      THROW 56006,'El email ya está en uso por otro usuario.',1;

    IF @tipo IS NOT NULL AND @tipo NOT IN (N'Usuario', N'Admin')
      THROW 56012, 'Tipo inválido. Use ''Usuario'' o ''Admin''.', 1;

    UPDATE usuarios
      SET nombre = @nombre,
          email  = @email,
          tipo   = COALESCE(@tipo, tipo)
    WHERE usuario_id = @usuario_id;

    COMMIT;
    SELECT usuario_id, nombre, email, estado, tipo
    FROM usuarios WHERE usuario_id=@usuario_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- Cambiar rol genéricamente
CREATE OR ALTER PROCEDURE usuarios_set_tipo
  @usuario_id INT,
  @tipo NVARCHAR(10)  -- 'Usuario' o 'Admin'
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario_id=@usuario_id)
      THROW 56013,'usuario_id no existe.',1;

    IF @tipo NOT IN (N'Usuario', N'Admin')
      THROW 56012, 'Tipo inválido. Use ''Usuario'' o ''Admin''.', 1;

    UPDATE usuarios SET tipo=@tipo WHERE usuario_id=@usuario_id;

    COMMIT;
    SELECT usuario_id, nombre, email, estado, tipo
    FROM usuarios WHERE usuario_id=@usuario_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_set_tipo', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- Atajo: poner al usuario como 'Admin'
CREATE OR ALTER PROCEDURE usuarios_set_admin
  @usuario_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario_id=@usuario_id)
      THROW 56013,'usuario_id no existe.',1;

    UPDATE usuarios SET tipo = N'Admin' WHERE usuario_id=@usuario_id;

    COMMIT;
    SELECT usuario_id, nombre, email, estado, tipo
    FROM usuarios WHERE usuario_id=@usuario_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_set_admin', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE usuario_por_id
  @usuario_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT usuario_id, nombre, contrasena, email, fecha_registro, estado, tipo
  FROM usuarios WHERE usuario_id=@usuario_id;
END;
GO

CREATE OR ALTER PROCEDURE usuario_por_email
  @email NVARCHAR(150)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP (1)
    usuario_id, nombre, email, fecha_registro, estado, tipo
  FROM usuarios
  WHERE email = @email;
END;
GO

CREATE OR ALTER PROCEDURE buscar_id_para_login
  @email NVARCHAR(150)
AS
BEGIN
  SET NOCOUNT ON;
  IF @email IS NULL OR LTRIM(RTRIM(@email)) = '' RETURN;

  SELECT TOP (1)
    CAST(usuario_id AS NVARCHAR(50)) AS id,
    contrasena,
    nombre,
    email,
    tipo
  FROM usuarios
  WHERE estado = 1
    AND email = @email;
END;
GO

-- ================================
-- UNITS
-- ================================

-- Insert a unit
CREATE OR ALTER PROCEDURE units_insert
  @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO units (nombre)
  VALUES (@nombre);
  SELECT SCOPE_IDENTITY() AS unit_id;
END;
GO

-- Update a unit by ID
CREATE OR ALTER PROCEDURE units_update
  @unit_id INT,
  @nombre    NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE units
    SET nombre = @nombre
  WHERE unit_id = @unit_id;
END;
GO

-- Delete a unit by ID
CREATE OR ALTER PROCEDURE units_delete
  @unit_id INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM units
  WHERE unit_id = @unit_id;
END;
GO

-- Select all units
CREATE OR ALTER PROCEDURE units_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT unit_id, nombre
  FROM units;
END;
GO


-- ================================
-- SIZES
-- ================================

-- Insert a size
CREATE OR ALTER PROCEDURE sizes_insert
  @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO sizes (nombre)
  VALUES (@nombre);
  SELECT SCOPE_IDENTITY() AS size_id;
END;
GO

-- Update a size by ID
CREATE OR ALTER PROCEDURE sizes_update
  @size_id INT,
  @nombre    NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE sizes
    SET nombre = @nombre
  WHERE size_id = @size_id;
END;
GO

-- Delete a size by ID
CREATE OR ALTER PROCEDURE sizes_delete
  @size_id INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM sizes
  WHERE size_id = @size_id;
END;
GO

-- Select all sizes
CREATE OR ALTER PROCEDURE sizes_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT size_id, nombre
  FROM sizes;
END;
GO


-- ================================
-- BRANDS
-- ================================

-- Insert a brand
CREATE OR ALTER PROCEDURE brands_insert
  @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO brands (nombre)
  VALUES (@nombre);
  SELECT SCOPE_IDENTITY() AS brand_id;
END;
GO

-- Update a brand by ID
CREATE OR ALTER PROCEDURE brands_update
  @brand_id INT,
  @nombre     NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE brands
    SET nombre = @nombre
  WHERE brand_id = @brand_id;
END;
GO

-- Delete a brand by ID
CREATE OR ALTER PROCEDURE brands_delete
  @brand_id INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM brands
  WHERE brand_id = @brand_id;
END;
GO

-- Select all brands
CREATE OR ALTER PROCEDURE brands_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT brand_id, nombre
  FROM brands;
END;
GO


-- By category principal
CREATE OR ALTER PROCEDURE productos_get_by_categoria_principal
  @categoria_principal_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE categoria_principal_id = @categoria_principal_id;
END;
GO

-- By secondary category
CREATE OR ALTER PROCEDURE productos_get_by_categoria_secundaria
  @categoria_secundaria_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE categoria_secundaria_id = @categoria_secundaria_id;
END;
GO

-- By subcategory
CREATE OR ALTER PROCEDURE productos_get_by_subcategoria
  @subcategoria_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE subcategoria_id = @subcategoria_id;
END;
GO

-- By unit
CREATE OR ALTER PROCEDURE productos_get_by_unit
  @unit_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE unit_id = @unit_id;
END;
GO

-- By size
CREATE OR ALTER PROCEDURE productos_get_by_size
  @size_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE size_id = @size_id;
END;
GO

-- By brand
CREATE OR ALTER PROCEDURE productos_get_by_brand
  @brand_id INT
AS
BEGIN
  SELECT * FROM productos
  WHERE brand_id = @brand_id;
END;
GO

/* ============================
   UNITS / SIZES / BRANDS: get_by_id
   ============================ */

-- units_get_by_id
CREATE OR ALTER PROCEDURE units_get_by_id
  @unit_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT unit_id, nombre
  FROM units
  WHERE unit_id = @unit_id;
END;
GO

-- sizes_get_by_id
CREATE OR ALTER PROCEDURE sizes_get_by_id
  @size_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT size_id, nombre
  FROM sizes
  WHERE size_id = @size_id;
END;
GO

-- brands_get_by_id
CREATE OR ALTER PROCEDURE brands_get_by_id
  @brand_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT brand_id, nombre
  FROM brands
  WHERE brand_id = @brand_id;
END;
GO


/* ============================
   USUARIOS: get_all + delete
   ============================ */

-- usuarios_get_all
CREATE OR ALTER PROCEDURE usuarios_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT usuario_id, nombre, email, fecha_registro, estado, tipo
  FROM usuarios
  ORDER BY nombre;
END;
GO

-- usuarios_delete (hard delete con validación básica)
CREATE OR ALTER PROCEDURE usuarios_delete
  @usuario_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    DELETE FROM usuarios
    WHERE usuario_id = @usuario_id;

    IF @@ROWCOUNT = 0
      THROW 56014, 'Usuario no encontrado.', 1;

    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje)
    VALUES(N'usuarios_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


/* ============================
   CAJAS_DETALLES: get_all
   ============================ */

CREATE OR ALTER PROCEDURE cajas_detalles_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT d.detalle_id, d.caja_id, c.etiqueta, d.producto_id, d.stock
  FROM cajas_detalles d
  JOIN cajas c ON c.caja_id = d.caja_id
  ORDER BY
    LEN(c.letra), c.letra,
    CASE c.cara  WHEN 1 THEN 1 ELSE 2 END,
    CASE c.nivel WHEN 1 THEN 1 ELSE 2 END,
    d.producto_id;
END;
GO


/* ============================
   PRODUCTOS: delete (cautious hard delete)
   - Reglas:
     1) Debe existir el producto.
     2) Si hay stock > 0 en cualquier caja => bloquear.
     3) Si el producto sigue activo (estado=1), exigir soft delete previo
        (productos_soft_delete) a menos que @force = 1.
     4) Elimina filas de cajas_detalles (si existieran con stock=0),
        luego elimina el producto.
   ============================ */

CREATE OR ALTER PROCEDURE productos_delete
  @producto_id INT,
  @force BIT = 0  -- poner 1 para omitir el requisito de estado=0
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id = @producto_id)
      THROW 52020, 'Producto no encontrado.', 1;

    DECLARE @estado BIT;
    SELECT @estado = estado FROM productos WHERE producto_id = @producto_id;

    IF (@estado = 1 AND @force = 0)
      THROW 52043, 'El producto está activo. Use productos_soft_delete primero o pase @force = 1.', 1;

    IF EXISTS (
      SELECT 1
      FROM cajas_detalles
      WHERE producto_id = @producto_id
        AND stock > 0
    )
      THROW 52041, 'No se puede eliminar: hay stock > 0 en alguna caja.', 1;

    -- Limpia detalles (si existiesen con stock=0)
    DELETE FROM cajas_detalles
    WHERE producto_id = @producto_id;

    -- Eliminar producto
    DELETE FROM productos
    WHERE producto_id = @producto_id;

    COMMIT;

    -- Respuesta mínima de confirmación
    SELECT @producto_id AS producto_id, N'Eliminado' AS estado_operacion;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje)
    VALUES(N'productos_delete',
           CONCAT('N°',ERROR_NUMBER(),' L',ERROR_LINE(),' [',ISNULL(ERROR_PROCEDURE(),'-'),'] ',ERROR_MESSAGE()));
    THROW;
  END CATCH
END;
GO

CREATE OR ALTER PROCEDURE producto_insert_with_stock
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_principal_id INT,
  @categoria_secundaria_id INT = NULL,
  @subcategoria_id INT = NULL,
  @unit_id INT,
  @unit_value DECIMAL(10,2),
  @size_id INT,
  @size_value NVARCHAR(50),
  @brand_id INT,
  @caja_id INT,
  @stock_inicial INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  
  BEGIN TRY
    BEGIN TRANSACTION;
    
    -- Validaciones para el producto (replicadas de productos_insert)
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre=''   THROW 52031, 'El nombre del producto es obligatorio.', 1;
    IF @precio IS NULL OR @precio < 0  THROW 52012, 'Precio inválido.', 1;
    IF @unit_value IS NULL OR @unit_value <= 0  THROW 52032, 'El valor de unidad debe ser mayor a cero.', 1;
    IF @size_value IS NULL OR LTRIM(RTRIM(@size_value)) = ''  THROW 52033, 'El valor de tamaño es obligatorio.', 1;
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id=@categoria_principal_id) THROW 52013, 'Categoría principal no existe.', 1;
    IF @categoria_secundaria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM categorias_secundarias WHERE categoria_secundaria_id=@categoria_secundaria_id) THROW 52034, 'Categoría secundaria no existe.', 1;
    IF @subcategoria_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subcategorias WHERE subcategoria_id=@subcategoria_id) THROW 52035, 'Subcategoría no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM units WHERE unit_id=@unit_id) THROW 52036, 'Unidad de medida no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM sizes WHERE size_id=@size_id) THROW 52037, 'Tamaño no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM brands WHERE brand_id=@brand_id) THROW 52038, 'Marca no existe.', 1;
    
    -- Validaciones para el stock
    IF @stock_inicial IS NULL OR @stock_inicial < 0 THROW 53001, 'Stock inicial inválido (debe ser >= 0).', 1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 53002, 'Caja no existe.', 1;

    -- Insertar producto
    INSERT INTO productos (
        nombre, descripcion, precio, categoria_principal_id, categoria_secundaria_id,
        subcategoria_id, unit_id, unit_value, size_id, size_value, brand_id
    ) VALUES (
        @nombre, @descripcion, @precio, @categoria_principal_id, @categoria_secundaria_id,
        @subcategoria_id, @unit_id, @unit_value, @size_id, @size_value, @brand_id
    );

    DECLARE @nuevo_producto_id INT = SCOPE_IDENTITY();

    -- Insertar stock inicial
    INSERT INTO cajas_detalles (caja_id, producto_id, stock)
    VALUES (@caja_id, @nuevo_producto_id, @stock_inicial);

    -- Devolver datos completos del producto con stock
    SELECT 
        p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
        p.categoria_principal_id, cp.nombre AS categoria_principal_nombre,
        p.categoria_secundaria_id, cs.nombre AS categoria_secundaria_nombre,
        p.subcategoria_id, sc.nombre AS subcategoria_nombre,
        p.unit_id, u.nombre AS unit_nombre, p.unit_value,
        p.size_id, s.nombre AS size_nombre, p.size_value,
        p.brand_id, b.nombre AS brand_nombre,
        p.fecha_creacion,
        cd.stock AS stock_inicial,
        c.etiqueta AS caja_etiqueta,
        c.caja_id
    FROM productos p
    INNER JOIN categorias cp ON p.categoria_principal_id = cp.categoria_id
    LEFT JOIN categorias_secundarias cs ON p.categoria_secundaria_id = cs.categoria_secundaria_id
    LEFT JOIN subcategorias sc ON p.subcategoria_id = sc.subcategoria_id
    INNER JOIN units u ON p.unit_id = u.unit_id
    INNER JOIN sizes s ON p.size_id = s.size_id
    INNER JOIN brands b ON p.brand_id = b.brand_id
    INNER JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
    INNER JOIN cajas c ON cd.caja_id = c.caja_id
    WHERE p.producto_id = @nuevo_producto_id;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    INSERT INTO logs(origen, mensaje) VALUES(N'producto_insert_with_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* ============================
   IMÁGENES
   ============================ */
DROP TABLE IF EXISTS imagenes;
GO
CREATE TABLE imagenes (
  imagen_id     INT IDENTITY(1,1) PRIMARY KEY,
  producto_id   INT NOT NULL,
  image_path    NVARCHAR(255) NOT NULL,

  CONSTRAINT fk_imagenes_productos
    FOREIGN KEY (producto_id)
    REFERENCES productos(producto_id)
);
GO

/* =========================================================
   PROCEDIMIENTOS: IMAGENES
   ========================================================= */

------------------------------------------------------------
-- INSERT
------------------------------------------------------------
CREATE OR ALTER PROCEDURE imagenes_insert
  @producto_id INT,
  @image_path  NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    -- Normalización y validaciones
    SET @image_path = LTRIM(RTRIM(@image_path));
    IF @producto_id IS NULL OR @producto_id <= 0
      THROW 53001, 'El producto_id es obligatorio y debe ser mayor que 0.', 1;

    IF @image_path IS NULL OR @image_path = ''
      THROW 53002, 'El image_path es obligatorio.', 1;

    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id = @producto_id)
      THROW 53003, 'Producto no encontrado.', 1;

    -- Evitar duplicados por producto + ruta
    IF EXISTS (
      SELECT 1 FROM imagenes 
      WHERE producto_id = @producto_id AND image_path = @image_path
    )
      THROW 53004, 'Ya existe una imagen con ese path para el producto indicado.', 1;

    INSERT INTO imagenes(producto_id, image_path)
    VALUES(@producto_id, @image_path);

    COMMIT;

    SELECT imagen_id, producto_id, image_path
    FROM imagenes
    WHERE imagen_id = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'imagenes_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


------------------------------------------------------------
-- UPDATE
------------------------------------------------------------
CREATE OR ALTER PROCEDURE imagenes_update
  @imagen_id   INT,
  @producto_id INT,
  @image_path  NVARCHAR(255)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM imagenes WHERE imagen_id = @imagen_id)
      THROW 53005, 'Imagen no encontrada.', 1;

    SET @image_path = LTRIM(RTRIM(@image_path));

    IF @producto_id IS NULL OR @producto_id <= 0
      THROW 53006, 'El producto_id es obligatorio y debe ser mayor que 0.', 1;

    IF @image_path IS NULL OR @image_path = ''
      THROW 53007, 'El image_path es obligatorio.', 1;

    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id = @producto_id)
      THROW 53008, 'Producto no encontrado.', 1;

    -- Evitar duplicados (mismo producto + path en otra fila)
    IF EXISTS (
      SELECT 1 FROM imagenes
      WHERE producto_id = @producto_id
        AND image_path  = @image_path
        AND imagen_id  <> @imagen_id
    )
      THROW 53009, 'Ya existe otra imagen con ese path para el producto indicado.', 1;

    UPDATE imagenes
      SET producto_id = @producto_id,
          image_path  = @image_path
    WHERE imagen_id = @imagen_id;

    COMMIT;

    SELECT imagen_id, producto_id, image_path
    FROM imagenes
    WHERE imagen_id = @imagen_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'imagenes_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


------------------------------------------------------------
-- DELETE
------------------------------------------------------------
CREATE OR ALTER PROCEDURE imagenes_delete
  @imagen_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;

    IF NOT EXISTS (SELECT 1 FROM imagenes WHERE imagen_id = @imagen_id)
      THROW 53010, 'Imagen no encontrada.', 1;

    DELETE FROM imagenes WHERE imagen_id = @imagen_id;

    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'imagenes_delete', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


------------------------------------------------------------
-- GET BY PRODUCTO_ID
------------------------------------------------------------
CREATE OR ALTER PROCEDURE imagenes_get_by_producto_id
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;

  IF @producto_id IS NULL OR @producto_id <= 0
    THROW 53011, 'El producto_id es obligatorio y debe ser mayor que 0.', 1;

  SELECT imagen_id, producto_id, image_path
  FROM imagenes
  WHERE producto_id = @producto_id
  ORDER BY imagen_id;
END;
GO


------------------------------------------------------------
-- GET ALL
------------------------------------------------------------
CREATE OR ALTER PROCEDURE imagenes_get_all
AS
BEGIN
  SET NOCOUNT ON;

  SELECT imagen_id, producto_id, image_path
  FROM imagenes
  ORDER BY producto_id, imagen_id;
END;
GO

/* =========================================================
   PROCEDIMIENTO: productos_sin_imagenes_get
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_sin_imagenes_get
AS
BEGIN
  SET NOCOUNT ON;

  SELECT 
    p.producto_id,
    p.nombre
  FROM productos p
  WHERE p.estado = 1
    AND NOT EXISTS (
      SELECT 1 
      FROM imagenes i
      WHERE i.producto_id = p.producto_id
    )
  ORDER BY p.producto_id;
END;
GO
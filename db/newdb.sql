/* ============================
   LIMPIEZA DE TABLAS EXISTENTES
   ============================ */

DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS subcategorias;         
DROP TABLE IF EXISTS categorias_secundarias; 
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS marcas;
DROP TABLE IF EXISTS unidad;
GO

/* ============================
   TABLAS DE LOGS (ERRORES, AUDITORÍA, ETC.)
   ============================ */
CREATE TABLE logs (
  log_id  INT IDENTITY(1,1) PRIMARY KEY,
  fecha   DATETIME      NOT NULL DEFAULT GETDATE(),
  origen  NVARCHAR(100) NOT NULL,
  mensaje NVARCHAR(MAX) NOT NULL,
  usuario NVARCHAR(128) NOT NULL DEFAULT SUSER_SNAME()
);
GO

/* ============================
   TABLAS DE MEDIDAS
   ============================ */
CREATE TABLE unidad (
  unidad_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre    NVARCHAR(50) NOT NULL
);
GO

/* ============================
   TABLAS DE MARCAS
   ============================ */

CREATE TABLE marcas (
  marca_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre   NVARCHAR(50) NOT NULL
);
GO

/* ============================
   CATEGORÍAS (Jerarquía)
   ============================ */

CREATE TABLE categorias (
  categoria_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre       NVARCHAR(100) UNIQUE NOT NULL
);
GO

CREATE TABLE categorias_secundarias (
  categoria_secundaria_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre                  NVARCHAR(100) NOT NULL,
  categoria_padre_id      INT NULL, -- Opcional: para vincular con la principal
  CONSTRAINT fk_cat_sec_padre FOREIGN KEY (categoria_padre_id) REFERENCES categorias(categoria_id)
);
GO

CREATE TABLE subcategorias (
  subcategoria_id         INT IDENTITY(1,1) PRIMARY KEY,
  nombre                  NVARCHAR(100) NOT NULL,
  categoria_secundaria_id INT NULL, -- Opcional: para vincular con la secundaria
  CONSTRAINT fk_subcat_padre FOREIGN KEY (categoria_secundaria_id) REFERENCES categorias_secundarias(categoria_secundaria_id)
);
GO

/* ============================
   PRODUCTOS
   ============================ */
CREATE TABLE productos (
  producto_id             INT IDENTITY(1,1) PRIMARY KEY,
  nombre                  NVARCHAR(100) NOT NULL,
  descripcion             NVARCHAR(255) NULL,
  -- Precios
  precio                  DECIMAL(10,2) NOT NULL 
                          CONSTRAINT ck_productos_precio_nonneg CHECK (precio >= 0),
  estado                  BIT NOT NULL 
                          CONSTRAINT df_productos_estado DEFAULT (1),
  -- Categorización
  categoria_principal_id  INT NOT NULL,
  categoria_secundaria_id INT NULL,
  subcategoria_id         INT NULL,
  -- Detalles físicos
  unidad_id               INT NOT NULL,       -- Corregido: unit_id -> unidad_id
  unidad_valor            DECIMAL(10,2) NOT NULL,
  marca_id                INT NOT NULL,       -- Corregido: brand_id -> marca_id
  -- Auditoría
  fecha_modificacion          DATETIME2 NOT NULL 
                          CONSTRAINT df_productos_fecha_modificacion DEFAULT (GETDATE()),
  -- Restricciones
  CONSTRAINT uq_productos_nombre UNIQUE (nombre),
  -- Claves Foráneas (Foreign Keys)
  CONSTRAINT fk_productos_cat_prin 
    FOREIGN KEY (categoria_principal_id) 
    REFERENCES categorias(categoria_id),
  CONSTRAINT fk_productos_cat_sec  
    FOREIGN KEY (categoria_secundaria_id) 
    REFERENCES categorias_secundarias(categoria_secundaria_id),
  CONSTRAINT fk_productos_subcat   
    FOREIGN KEY (subcategoria_id) 
    REFERENCES subcategorias(subcategoria_id),
  CONSTRAINT fk_productos_unidad
    FOREIGN KEY (unidad_id) 
    REFERENCES unidad(unidad_id),
  CONSTRAINT fk_productos_marca
    FOREIGN KEY (marca_id) 
    REFERENCES marcas(marca_id)
  
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
  tipo           INT           NOT NULL CHECK (tipo IN (1,2)) -- 1=ADMIN, 2=USUARIO
);
GO


/* ============================
  PROCEDIMIENTOS ALMACENADOS
   ============================ */

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
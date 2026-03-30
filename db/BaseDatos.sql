/* ============================
   LIMPIEZA DE TABLAS EXISTENTES
   ============================ */
DROP TABLE IF EXISTS logs;
DROP TABLE IF EXISTS cajas_detalles;
DROP TABLE IF EXISTS cajas;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS marcas;
DROP TABLE IF EXISTS unidad;
DROP TABLE IF EXISTS usuarios;
GO

/* ============================
   TABLAS DE LOGS (ERRORES, AUDITORÍA, ETC.)
   ============================ */
CREATE TABLE logs (
  log_id  INT IDENTITY(1,1) PRIMARY KEY,
  fecha   DATETIME2     NOT NULL DEFAULT GETDATE(),
  origen  NVARCHAR(100) NOT NULL,
  mensaje NVARCHAR(MAX) NOT NULL
);
GO

-- get_all_logs + (ninguno) = log_id, fecha, origen, mensaje
CREATE OR ALTER PROCEDURE get_all_logs
AS
BEGIN
  SET NOCOUNT ON;
  SELECT log_id, fecha, origen, mensaje FROM logs ORDER BY fecha DESC;
END;

--get_logs_by_origen + @origen = log_id, fecha, origen, mensaje
CREATE OR ALTER PROCEDURE get_logs_by_origen
  @origen NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT log_id, fecha, origen, mensaje FROM logs WHERE origen = @origen ORDER BY fecha DESC;
END;
GO

-- get_logs_by_date_range + @fecha_inicio, @fecha_fin = log_id, fecha, origen, mensaje
CREATE OR ALTER PROCEDURE get_logs_by_date_range
  @fecha_inicio DATETIME2,
  @fecha_fin DATETIME2
AS
BEGIN
  SET NOCOUNT ON;
  SELECT log_id, fecha, origen, mensaje FROM logs WHERE fecha BETWEEN @fecha_inicio AND @fecha_fin ORDER BY fecha DESC;
END;
GO

--clear_logs + (ninguno) = (ninguno)
CREATE OR ALTER PROCEDURE clear_logs
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM logs;
END;
GO

/* ============================
   TABLAS DE MEDIDAS
   ============================ */
CREATE TABLE unidad (
  unidad_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre    NVARCHAR(50) NOT NULL,
  estado    BIT NOT NULL CONSTRAINT df_unidad_estado DEFAULT (1)
);
GO

/* ============================
   TABLAS DE MARCAS
   ============================ */
CREATE TABLE marcas (
  marca_id INT IDENTITY(1,1) PRIMARY KEY,
  nombre   NVARCHAR(50) NOT NULL,
  estado   BIT NOT NULL CONSTRAINT df_marcas_estado DEFAULT (1)
);
GO

/* ============================
   CATEGORÍAS (Jerarquía)
   ============================ */
CREATE TABLE categorias (
  categoria_id       INT IDENTITY(1,1) PRIMARY KEY,
  nombre             NVARCHAR(100) NOT NULL,
  categoria_padre_id INT NULL,
  nivel              TINYINT NOT NULL CHECK (nivel IN (1, 2, 3)), 
                     -- 1 = Categoría Principal, 2 = Categoría Secundaria, 3 = Subcategoría
  estado             BIT NOT NULL CONSTRAINT df_categorias_estado DEFAULT (1),
  -- Llave foránea recursiva (apunta a la misma tabla)
  CONSTRAINT fk_categorias_padre FOREIGN KEY (categoria_padre_id) REFERENCES categorias(categoria_id),
  -- Evitar nombres duplicados dentro del mismo "padre"
  CONSTRAINT uq_categorias_nombre_padre UNIQUE (nombre, categoria_padre_id)
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
  -- Categorización Unificada
  categoria_id            INT NOT NULL,
  -- Detalles físicos
  unidad_id               INT NOT NULL,
  unidad_valor            DECIMAL(10,2) NOT NULL,
  marca_id                INT NOT NULL,
  -- Auditoría
  fecha_modificacion      DATETIME2 NOT NULL 
                          CONSTRAINT df_productos_fecha_modificacion DEFAULT (GETDATE()),
  -- Restricciones
  CONSTRAINT uq_productos_nombre UNIQUE (nombre),
  -- Claves Foráneas
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(categoria_id),
  CONSTRAINT fk_productos_unidad    FOREIGN KEY (unidad_id) REFERENCES unidad(unidad_id),
  CONSTRAINT fk_productos_marca     FOREIGN KEY (marca_id) REFERENCES marcas(marca_id)
);
GO

/* ============================
   CAJAS
   ============================ */
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
  CONSTRAINT UQ_cajas_letra_cara_nivel UNIQUE (letra, cara, nivel),
  estado BIT NOT NULL CONSTRAINT df_cajas_estado DEFAULT (1)
);
GO

/* ============================
   CAJAS_DETALLES (Stock por caja/producto)
   ============================ */
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
CREATE TABLE usuarios (
  usuario_id     INT IDENTITY(1,1) PRIMARY KEY,
  nombre         NVARCHAR(100) NOT NULL UNIQUE,
  contrasena     NVARCHAR(255) NOT NULL,
  email          NVARCHAR(150) NOT NULL UNIQUE,
  fecha_registro DATETIME2     NOT NULL DEFAULT GETDATE(),
  tipo           TINYINT       NOT NULL CHECK (tipo IN (1,2)) -- 1=ADMIN, 2=USUARIO,
  estado         BIT           NOT NULL DEFAULT (1) -- 1=ACTIVO, 0=INACTIVO
);
GO


/*============================
   PROCEDIMIENTOS ALMACENADOS USUARIOS
   ============================ */

-- usuarios_insert + @nombre, @contrasena, @email, @tipo = usuario_id, nombre, email, tipo
CREATE OR ALTER PROCEDURE usuarios_insert
  @nombre NVARCHAR(100),
  @contrasena NVARCHAR(255),
  @email NVARCHAR(150),
  @tipo TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    SET @email = LTRIM(RTRIM(@email));
    IF @nombre IS NULL OR @nombre='' THROW 50001,'El nombre de usuario es obligatorio.',1;
    IF @contrasena IS NULL OR @contrasena='' THROW 50002,'La contraseña es obligatoria.',1;
    IF @email IS NULL OR @email='' THROW 50003,'El email es obligatorio.',1;
    IF @tipo NOT IN (1,2) THROW 50004,'Tipo de usuario inválido.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE nombre=@nombre) THROW 50005,'Ya existe otro usuario con ese nombre.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE email=@email) THROW 50006,'Ya existe otro usuario con ese email.',1;

    INSERT INTO usuarios(nombre, contrasena, email, tipo) VALUES(@nombre, @contrasena, @email, @tipo);
    COMMIT;
    
    SELECT usuario_id, nombre, email, tipo FROM usuarios WHERE usuario_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- usuarios_get_all + (ninguno) = usuario_id, nombre, email, tipo
CREATE OR ALTER PROCEDURE usuarios_get_all
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SELECT usuario_id, nombre, email, tipo FROM usuarios WHERE estado=1 ORDER BY nombre;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_get_all', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- usuarios_get_by_id + @usuario_id = usuario_id, nombre, email, tipo
CREATE OR ALTER PROCEDURE usuarios_get_by_id
  @usuario_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SELECT usuario_id, nombre, email, tipo FROM usuarios WHERE usuario_id=@usuario_id AND estado=1;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_get_by_id', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO
-- usuarios_get_by_nombre / email + @nombre = usuario_id, nombre, email, tipo (PARA LOGIN)
CREATE OR ALTER PROCEDURE usuarios_get_by_nombre
  @nombre NVARCHAR(100) = NULL,
  @email NVARCHAR(150) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @nombre IS NULL AND @email IS NULL THROW 50010,'Debe proporcionar nombre o email para buscar.',1;
    
    SELECT usuario_id, nombre, email, tipo FROM usuarios 
    WHERE (@nombre IS NOT NULL AND nombre=@nombre) OR (@email IS NOT NULL AND email=@email);
    
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_get_by_nombre', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- usuario_get_password + @nombre/@email = contrasena (PARA LOGIN)
CREATE OR ALTER PROCEDURE usuario_get_password
  @nombre NVARCHAR(100) = NULL,
  @email NVARCHAR(150) = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @nombre IS NULL AND @email IS NULL THROW 50010,'Debe proporcionar nombre o email para buscar.',1;
    
    SELECT contrasena FROM usuarios 
    WHERE (@nombre IS NOT NULL AND nombre=@nombre) OR (@email IS NOT NULL AND email=@email);
    
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuario_get_password', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- usuarios_soft_delete + @usuario_id = (ninguno)
CREATE OR ALTER PROCEDURE usuarios_soft_delete
  @usuario_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario_id=@usuario_id) THROW 50020,'El usuario no se encuentra.',1;
    
    UPDATE usuarios SET estado=0 WHERE usuario_id=@usuario_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen,mensaje) VALUES(N'usuarios_soft_delete',ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- usuarios_update + @usuario_id, @nombre, @contrasena, @email, @tipo = usuario_id, nombre, email, tipo
CREATE OR ALTER PROCEDURE usuarios_update
  @usuario_id INT,
  @nombre NVARCHAR(100),
  @contrasena NVARCHAR(255),
  @email NVARCHAR(150),
  @tipo TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE usuario_id=@usuario_id) THROW 50020,'El usuario no se encuentra.',1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    SET @email = LTRIM(RTRIM(@email));
    IF @nombre IS NULL OR @nombre='' THROW 50001,'El nombre de usuario es obligatorio.',1;
    IF @contrasena IS NULL OR @contrasena='' THROW 50002,'La contraseña es obligatoria.',1;
    IF @email IS NULL OR @email='' THROW 50003,'El email es obligatorio.',1;
    IF @tipo NOT IN (1,2) THROW 50004,'Tipo de usuario inválido.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE nombre=@nombre AND usuario_id<>@usuario_id) THROW 50005,'Ya existe otro usuario con ese nombre.',1;
    IF EXISTS (SELECT 1 FROM usuarios WHERE email=@email AND usuario_id<>@usuario_id) THROW 50006,'Ya existe otro usuario con ese email.',1;

    UPDATE usuarios SET nombre=@nombre, contrasena=@contrasena, email=@email, tipo=@tipo 
    WHERE usuario_id=@usuario_id;
    
    COMMIT;
    
    SELECT usuario_id, nombre, email, tipo FROM usuarios WHERE usuario_id=@usuario_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'usuarios_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;



/* =========================================================
   PROCEDIMIENTOS ALMACENADOS UNIDADES
   ========================================================= */

-- unidades_insert + @nombre = unidad_id, nombre
CREATE OR ALTER PROCEDURE unidades_insert
  @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51001,'El nombre de unidad es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM unidad WHERE nombre=@nombre) THROW 51002,'Ya existe otra unidad con ese nombre.',1;
    
    INSERT INTO unidad(nombre) VALUES(@nombre);
    COMMIT;
    
    SELECT unidad_id, nombre FROM unidad WHERE unidad_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'unidades_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- unidades_update + @unidad_id, @nombre = unidad_id, nombre
CREATE OR ALTER PROCEDURE unidades_update
  @unidad_id INT, @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM unidad WHERE unidad_id=@unidad_id) THROW 51003,'La unidad ya no se encuentra.',1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51004,'El nombre de unidad es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM unidad WHERE nombre=@nombre AND unidad_id<>@unidad_id) THROW 51002,'Ya existe otra unidad con ese nombre.',1;
    
    UPDATE unidad SET nombre=@nombre WHERE unidad_id=@unidad_id;
    COMMIT;
    
    SELECT unidad_id, nombre FROM unidad WHERE unidad_id=@unidad_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'unidades_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- unidades_disable + @unidad_id = (ninguno)
CREATE OR ALTER PROCEDURE unidades_disable
  @unidad_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM unidad WHERE unidad_id=@unidad_id) THROW 51003,'La unidad ya no se encuentra.',1;
    
    UPDATE unidad SET estado=0 WHERE unidad_id=@unidad_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'unidades_disable', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


-- unidades_get_all + (ninguno) = unidad_id, nombre
CREATE OR ALTER PROCEDURE unidades_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT unidad_id, nombre FROM unidad WHERE estado=1 ORDER BY nombre;
END;
GO

-- unidades_get_by_id + @unidad_id = unidad_id, nombre
CREATE OR ALTER PROCEDURE unidades_get_by_id
  @unidad_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SELECT unidad_id, nombre FROM unidad WHERE unidad_id=@unidad_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'unidades_get_by_id', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* =========================================================
   PROCEDIMIENTOS ALMACENADOS MARCAS
   ========================================================= */

-- marcas_insert + @nombre = marca_id, nombre
CREATE OR ALTER PROCEDURE marcas_insert
  @nombre NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51001,'El nombre de marca es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM marcas WHERE nombre=@nombre) THROW 51002,'Ya existe otra marca con ese nombre.',1;
    
    INSERT INTO marcas(nombre) VALUES(@nombre);
    COMMIT;
    
    SELECT marca_id, nombre FROM marcas WHERE marca_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'marcas_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- marcas_update + @marca_id, @nombre = marca_id, nombre
CREATE OR ALTER PROCEDURE marcas_update
  @marca_id INT, @nombre NVARCHAR(50) 
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM marcas WHERE marca_id=@marca_id) THROW 51003,'La marca ya no se encuentra.',1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 51004,'El nombre de marca es obligatorio.',1;
    IF EXISTS (SELECT 1 FROM marcas WHERE nombre=@nombre AND marca_id<>@marca_id) THROW 51002,'Ya existe otra marca con ese nombre.',1;
    
    UPDATE marcas SET nombre=@nombre WHERE marca_id=@marca_id;
    COMMIT;
    
    SELECT marca_id, nombre FROM marcas WHERE marca_id=@marca_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'marcas_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- marcas_disable + @marca_id = (ninguno)
CREATE OR ALTER PROCEDURE marcas_disable
  @marca_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM marcas WHERE marca_id=@marca_id) THROW 51003,'La marca ya no se encuentra.',1;
    
    UPDATE marcas SET estado=0 WHERE marca_id=@marca_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'marcas_disable', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- marcas_get_all + (ninguno) = marca_id, nombre
CREATE OR ALTER PROCEDURE marcas_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT marca_id, nombre FROM marcas WHERE estado=1 ORDER BY nombre;
END;

-- marcas_get_by_id + @marca_id = marca_id, nombre
CREATE OR ALTER PROCEDURE marcas_get_by_id
  @marca_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT marca_id, nombre FROM marcas WHERE marca_id=@marca_id AND estado=1;
END;
GO



/* ============================
   PROCEDIMIENTOS ALMACENADOS: CATEGORÍAS
   ============================ */

-- categorias_insert + @nombre, @nivel, @categoria_padre_id = categoria_id, nombre, categoria_padre_id, nivel, estado
CREATE OR ALTER PROCEDURE categorias_insert
  @nombre NVARCHAR(100),
  @nivel TINYINT,
  @categoria_padre_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre = '' THROW 51001, 'El nombre de la categoría es obligatorio.', 1;
    IF @nivel NOT IN (1, 2, 3) THROW 51002, 'El nivel debe ser 1 (Principal), 2 (Secundaria) o 3 (Subcategoría).', 1;
    
    IF @nivel = 1 AND @categoria_padre_id IS NOT NULL 
        THROW 51003, 'Una categoría principal (Nivel 1) no puede tener un padre.', 1;
        
    IF @nivel IN (2, 3)
    BEGIN
        IF @categoria_padre_id IS NULL 
            THROW 51004, 'Las categorías secundarias y subcategorías deben estar asignadas a un padre.', 1;
            
        DECLARE @nivel_padre TINYINT;
        SELECT @nivel_padre = nivel FROM categorias WHERE categoria_id = @categoria_padre_id AND estado = 1;
        
        IF @nivel_padre IS NULL 
            THROW 51005, 'La categoría padre especificada no existe o está inactiva.', 1;
            
        IF @nivel_padre <> (@nivel - 1) 
            THROW 51006, 'Error de jerarquía: El padre debe ser un nivel superior.', 1;
    END

    INSERT INTO categorias (nombre, categoria_padre_id, nivel) 
    VALUES (@nombre, @categoria_padre_id, @nivel);
    
    COMMIT;
    
    SELECT categoria_id, nombre, categoria_padre_id, nivel, estado 
    FROM categorias WHERE categoria_id = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- categorias_update + @categoria_id, @nombre, @estado = categoria_id, nombre, categoria_padre_id, nivel, estado
CREATE OR ALTER PROCEDURE categorias_update
  @categoria_id INT,
  @nombre NVARCHAR(100),
  @estado BIT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id = @categoria_id) 
        THROW 51010, 'La categoría no se encuentra.', 1;
        
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre = '' THROW 51011, 'El nombre es obligatorio.', 1;
    
    IF @estado IS NULL 
        SELECT @estado = estado FROM categorias WHERE categoria_id = @categoria_id;
    
    UPDATE categorias 
    SET nombre = @nombre, estado = @estado 
    WHERE categoria_id = @categoria_id;
    
    COMMIT;
    
    SELECT categoria_id, nombre, categoria_padre_id, nivel, estado 
    FROM categorias WHERE categoria_id = @categoria_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- categorias_disable + @categoria_id = Sin retorno (Throw error en fallo)
CREATE OR ALTER PROCEDURE categorias_disable
  @categoria_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE categoria_id = @categoria_id) 
        THROW 51020, 'La categoría no existe.', 1;
        
    IF EXISTS (SELECT 1 FROM categorias WHERE categoria_padre_id = @categoria_id AND estado = 1)
        THROW 51021, 'No se puede desactivar la categoría porque tiene subcategorías activas dependiendo de ella.', 1;

    UPDATE categorias SET estado = 0 WHERE categoria_id = @categoria_id;
    
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'categorias_disable', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- categorias_get_all + (ninguno) = categoria_id, nombre, nivel, estado, categoria_padre_id, nombre_padre
CREATE OR ALTER PROCEDURE categorias_get_all
AS
BEGIN
  SET NOCOUNT ON;
  
  SELECT 
    c.categoria_id, 
    c.nombre, 
    c.nivel, 
    c.estado,
    c.categoria_padre_id,
    p.nombre AS nombre_padre
  FROM categorias c
  LEFT JOIN categorias p ON c.categoria_padre_id = p.categoria_id
  ORDER BY c.nivel, c.nombre;
END;
GO

--categorias_get_by_id + @categoria_id = categoria_id, nombre, nivel, estado, categoria_padre_id, nombre_padre
CREATE OR ALTER PROCEDURE categorias_get_by_id
  @categoria_id INT
AS
BEGIN
  SET NOCOUNT ON;
  
  SELECT 
    c.categoria_id, 
    c.nombre, 
    c.nivel, 
    c.estado,
    c.categoria_padre_id,
    p.nombre AS nombre_padre
  FROM categorias c
  LEFT JOIN categorias p ON c.categoria_padre_id = p.categoria_id
  WHERE c.categoria_id = @categoria_id;
END;
GO

/* =========================================================
   PROCEDIMIENTOS ALMACENADOS CAJAS
   ========================================================= */

-- cajas_insert + @letra, @cara, @nivel = caja_id, letra, cara, nivel, etiqueta
CREATE OR ALTER PROCEDURE cajas_insert
  @letra VARCHAR(2), @cara TINYINT, @nivel TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @letra = UPPER(LTRIM(RTRIM(@letra)));
    IF @letra IS NULL OR LEN(@letra) NOT BETWEEN 1 AND 2 THROW 52001, 'letra debe tener 1 o 2 caracteres.', 1;
    IF @cara NOT IN (1,2)  THROW 52002, 'cara inválida. Use 1=FRENTE, 2=ATRAS.', 1;
    IF @nivel NOT IN (1,2) THROW 52003, 'nivel inválido. Use 1=ARRIBA, 2=ABAJO.', 1;
    IF EXISTS (SELECT 1 FROM cajas WHERE letra=@letra AND cara=@cara AND nivel=@nivel) THROW 52004, 'Ya existe una caja con la misma configuración.', 1;
    
    INSERT INTO cajas (letra, cara, nivel) VALUES (@letra, @cara, @nivel);
    COMMIT;
    
    SELECT caja_id, letra, cara, nivel, etiqueta FROM cajas WHERE caja_id = SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- cajas_update + @caja_id, @letra, @cara, @nivel = caja_id, letra, cara, nivel, etiqueta
CREATE OR ALTER PROCEDURE cajas_update
  @caja_id INT, @letra VARCHAR(2), @cara TINYINT, @nivel TINYINT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 52005, 'La caja ya no se encuentra.', 1;
    SET @letra = UPPER(LTRIM(RTRIM(@letra)));
    IF @letra IS NULL OR LEN(@letra) NOT BETWEEN 1 AND 2 THROW 52006, 'letra debe tener 1 o 2 caracteres.', 1;
    IF @cara NOT IN (1,2)  THROW 52007, 'cara inválida.', 1;
    IF @nivel NOT IN (1,2) THROW 52008, 'nivel inválido.', 1;
    IF EXISTS (SELECT 1 FROM cajas WHERE letra=@letra AND cara=@cara AND nivel=@nivel AND caja_id<>@caja_id)
      THROW 52009, 'Otra caja ya usa esa combinación.', 1;
      
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


-- cajas_get_all + (ninguno) = caja_id, letra, cara, nivel, etiqueta
CREATE OR ALTER PROCEDURE cajas_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT caja_id, letra, cara, nivel, etiqueta FROM cajas WHERE estado=1
  ORDER BY CASE cara WHEN 1 THEN 1 ELSE 2 END, CASE nivel WHEN 1 THEN 1 ELSE 2 END, letra;
END;
GO

-- cajas_get_by_id + @caja_id = caja_id, letra, cara, nivel, etiqueta
CREATE OR ALTER PROCEDURE cajas_get_by_id
  @caja_id INT 
AS
BEGIN
  SET NOCOUNT ON;
  SELECT caja_id, letra, cara, nivel, etiqueta FROM cajas WHERE caja_id=@caja_id;
END;
GO

-- cajas_get_by_letra + @letra = caja_id, letra, cara, nivel, etiqueta
CREATE OR ALTER PROCEDURE cajas_get_by_letra
  @letra VARCHAR(2)
AS
BEGIN 
  SET NOCOUNT ON;
  SELECT caja_id, letra, cara, nivel, etiqueta FROM cajas WHERE letra=UPPER(LTRIM(RTRIM(@letra)))
  ORDER BY CASE cara WHEN 1 THEN 1 ELSE 2 END, CASE nivel WHEN 1 THEN 1 ELSE 2 END;
END;
GO

-- cajas_disable + @caja_id = (ninguno)
CREATE OR ALTER PROCEDURE cajas_disable
  @caja_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 52005, 'La caja ya no se encuentra.', 1;
    
    UPDATE cajas SET estado=0 WHERE caja_id=@caja_id;
    COMMIT;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'cajas_disable', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO


/* =========================================================
   PROCEDIMIENTOS ALMACENADOS PRODUCTOS
   ========================================================= */

-- productos_insert + @nombre, @descripcion, @precio, @categoria_id, @unidad_id, @unidad_valor, @marca_id = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_insert
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_id INT,
  @unidad_id INT,
  @unidad_valor DECIMAL(10,2),
  @marca_id INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 52031, 'El nombre del producto es obligatorio.', 1;
    IF @precio IS NULL OR @precio < 0 THROW 52012, 'Precio inválido.', 1;
    IF @unidad_valor IS NULL OR @unidad_valor <= 0 THROW 52032, 'El valor de unidad debe ser mayor a cero.', 1;
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;

    INSERT INTO productos (
        nombre, descripcion, precio, categoria_id, unidad_id, unidad_valor, marca_id
    ) VALUES (
        @nombre, @descripcion, @precio, @categoria_id, @unidad_id, @unidad_valor, @marca_id
    );

    COMMIT;
    
    SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre AS categoria_nombre,
           p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
           p.marca_id, m.nombre AS marca_nombre,
           p.fecha_modificacion
    FROM productos p
    INNER JOIN categorias c ON p.categoria_id = c.categoria_id
    INNER JOIN unidad u ON p.unidad_id = u.unidad_id
    INNER JOIN marcas m ON p.marca_id = m.marca_id
    WHERE p.producto_id=SCOPE_IDENTITY();
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_insert', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- productos_update + @producto_id, @nombre, @descripcion, @precio, @categoria_id, @unidad_id, @unidad_valor, @marca_id, @estado = todas las columnas cruzadas
CREATE OR ALTER PROCEDURE productos_update
  @producto_id INT,
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_id INT,
  @unidad_id INT,
  @unidad_valor DECIMAL(10,2),
  @marca_id INT,
  @estado BIT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52014, 'Producto no encontrado.', 1;
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre AND producto_id<>@producto_id) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;

    IF @estado IS NULL SELECT @estado = estado FROM productos WHERE producto_id=@producto_id;

    UPDATE productos
    SET nombre=@nombre, descripcion=@descripcion, precio=@precio,
        categoria_id=@categoria_id, unidad_id=@unidad_id, unidad_valor=@unidad_valor,
        marca_id=@marca_id, estado=@estado, fecha_modificacion=GETDATE()
    WHERE producto_id=@producto_id;

    COMMIT;
    
    SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre AS categoria_nombre,
           p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
           p.marca_id, m.nombre AS marca_nombre,
           p.fecha_modificacion
    FROM productos p
    INNER JOIN categorias c ON p.categoria_id = c.categoria_id
    INNER JOIN unidad u ON p.unidad_id = u.unidad_id
    INNER JOIN marcas m ON p.marca_id = m.marca_id
    WHERE p.producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_update', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- productos_disable + @producto_id = producto_id, nombre, descripcion, precio, estado
CREATE OR ALTER PROCEDURE productos_disable
  @producto_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52020, 'Producto no encontrado.', 1;
    UPDATE productos SET estado = 0, fecha_modificacion = GETDATE() WHERE producto_id=@producto_id;
    COMMIT;
    
    SELECT producto_id, nombre, descripcion, precio, estado FROM productos WHERE producto_id=@producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_disable', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

-- productos_get_all + (ninguno) = detalles cruzados de todos los productos y stock total
CREATE OR ALTER PROCEDURE productos_get_all
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre, p.fecha_modificacion,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado, 
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor, 
           p.marca_id, m.nombre, p.fecha_modificacion
  ORDER BY p.estado DESC, p.nombre;
END;
GO

-- productos_get_by_id + @producto_id = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_get_by_id
  @producto_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  WHERE p.producto_id=@producto_id;
END;
GO

-- productos_get_by_nombre + @nombre = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_get_by_nombre
  @nombre NVARCHAR(100) = NULL
AS
BEGIN 
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  WHERE (@nombre IS NULL OR p.nombre LIKE '%' + @nombre + '%')
  ORDER BY p.estado DESC, p.nombre;
END;
GO

-- productos_get_by_categoria + @categoria_id = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_get_by_categoria
  @categoria_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  WHERE (@categoria_id IS NULL OR p.categoria_id = @categoria_id)
  ORDER BY p.estado DESC, p.nombre;
END;
GO

-- productos_get_by_marca + @marca_id = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_get_by_marca
  @marca_id INT = NULL
AS
BEGIN   
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  WHERE (@marca_id IS NULL OR p.marca_id = @marca_id)
  ORDER BY p.estado DESC, p.nombre;
END;
GO

-- productos_get_by_unidad + @unidad_id = todas las columnas de producto con nombres cruzados
CREATE OR ALTER PROCEDURE productos_get_by_unidad
  @unidad_id INT = NULL 
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  WHERE (@unidad_id IS NULL OR p.unidad_id = @unidad_id)
  ORDER BY p.estado DESC, p.nombre;
END;
GO

-- productos_get_ids_by_caja_id + @caja_id = producto_id, nombre, stock
CREATE OR ALTER PROCEDURE productos_get_ids_by_caja_id
  @caja_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, cd.stock
  FROM cajas_detalles cd
  INNER JOIN productos p ON cd.producto_id = p.producto_id
  WHERE cd.caja_id = @caja_id;
END;
GO

-- productos_get_stock_by_id + @producto_id = producto_id, nombre, stock_total
CREATE OR ALTER PROCEDURE productos_get_stock_by_id
  @producto_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre,
         COALESCE(SUM(cd.stock),0) AS stock_total
  FROM productos p
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE p.producto_id=@producto_id 
  GROUP BY p.producto_id, p.nombre;
END;
GO

-- productos_update_stock + @caja_id, @producto_id, @stock = producto_id, nombre, stock
CREATE OR ALTER PROCEDURE productos_update_stock
  @caja_id INT, @producto_id INT, @stock INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 52040, 'Caja no encontrada.', 1;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52041, 'Producto no encontrado.', 1;
    IF @stock < 0 THROW 52042, 'Stock no puede ser negativo.', 1;

    MERGE INTO cajas_detalles AS target
    USING (SELECT @caja_id AS caja_id, @producto_id AS producto_id) AS source
    ON (target.caja_id = source.caja_id AND target.producto_id = source.producto_id)
    WHEN MATCHED THEN 
      UPDATE SET stock = @stock
    WHEN NOT MATCHED THEN
      INSERT (caja_id, producto_id, stock) VALUES (@caja_id, @producto_id, @stock);

    COMMIT;

    SELECT p.producto_id, p.nombre, cd.stock
    FROM cajas_detalles cd
    INNER JOIN productos p ON cd.producto_id = p.producto_id
    WHERE cd.caja_id = @caja_id AND cd.producto_id = @producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_update_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* =========================================================
   1. INSERTAR PRODUCTO CON STOCK INICIAL
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_insert_with_stock
  @nombre NVARCHAR(100),
  @descripcion NVARCHAR(255) = NULL,
  @precio DECIMAL(10,2),
  @categoria_id INT,
  @unidad_id INT,
  @unidad_valor DECIMAL(10,2),
  @marca_id INT,
  @caja_id INT,
  @stock INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    
    -- Validaciones de producto
    SET @nombre = LTRIM(RTRIM(@nombre));
    IF @nombre IS NULL OR @nombre='' THROW 52031, 'El nombre del producto es obligatorio.', 1;
    IF @precio IS NULL OR @precio < 0 THROW 52012, 'Precio inválido.', 1;
    IF @unidad_valor IS NULL OR @unidad_valor <= 0 THROW 52032, 'El valor de unidad debe ser mayor a cero.', 1;
    IF EXISTS (SELECT 1 FROM productos WHERE nombre=@nombre) THROW 52018, 'Ya existe otro producto con ese nombre.', 1;
    
    -- Validaciones de stock
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 52040, 'Caja no encontrada.', 1;
    IF @stock < 0 THROW 52042, 'Stock no puede ser negativo.', 1;

    -- 1. Insertar el producto
    INSERT INTO productos (
        nombre, descripcion, precio, categoria_id, unidad_id, unidad_valor, marca_id
    ) VALUES (
        @nombre, @descripcion, @precio, @categoria_id, @unidad_id, @unidad_valor, @marca_id
    );

    DECLARE @nuevo_producto_id INT = SCOPE_IDENTITY();

    -- 2. Insertar el stock inicial
    INSERT INTO cajas_detalles (caja_id, producto_id, stock) 
    VALUES (@caja_id, @nuevo_producto_id, @stock);

    COMMIT;
    
    -- Retornar el producto creado con su stock
    SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre AS categoria_nombre,
           p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
           p.marca_id, m.nombre AS marca_nombre,
           p.fecha_modificacion,
           cd.stock, cd.caja_id
    FROM productos p
    INNER JOIN categorias c ON p.categoria_id = c.categoria_id
    INNER JOIN unidad u ON p.unidad_id = u.unidad_id
    INNER JOIN marcas m ON p.marca_id = m.marca_id
    INNER JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
    WHERE p.producto_id = @nuevo_producto_id AND cd.caja_id = @caja_id;

  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_insert_with_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* =========================================================
   2. AGREGAR UNIDADES DE STOCK
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_add_stock
  @caja_id INT, 
  @producto_id INT, 
  @cantidad INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @cantidad <= 0 THROW 52045, 'La cantidad a agregar debe ser mayor a cero.', 1;
    IF NOT EXISTS (SELECT 1 FROM cajas WHERE caja_id=@caja_id) THROW 52040, 'Caja no encontrada.', 1;
    IF NOT EXISTS (SELECT 1 FROM productos WHERE producto_id=@producto_id) THROW 52041, 'Producto no encontrado.', 1;

    MERGE INTO cajas_detalles AS target
    USING (SELECT @caja_id AS caja_id, @producto_id AS producto_id) AS source
    ON (target.caja_id = source.caja_id AND target.producto_id = source.producto_id)
    WHEN MATCHED THEN 
      UPDATE SET stock = target.stock + @cantidad
    WHEN NOT MATCHED THEN
      INSERT (caja_id, producto_id, stock) VALUES (@caja_id, @producto_id, @cantidad);

    COMMIT;

    SELECT p.producto_id, p.nombre, cd.stock
    FROM cajas_detalles cd
    INNER JOIN productos p ON cd.producto_id = p.producto_id
    WHERE cd.caja_id = @caja_id AND cd.producto_id = @producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_add_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* =========================================================
   3. RETIRAR UNIDADES DE STOCK
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_remove_stock
  @caja_id INT, 
  @producto_id INT, 
  @cantidad INT
AS
BEGIN
  SET NOCOUNT ON; SET XACT_ABORT ON;
  BEGIN TRY
    BEGIN TRAN;
    IF @cantidad <= 0 THROW 52046, 'La cantidad a retirar debe ser mayor a cero.', 1;
    IF NOT EXISTS (SELECT 1 FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id) 
        THROW 52047, 'No hay registro de stock para este producto en la caja indicada.', 1;

    DECLARE @stock_actual INT;
    SELECT @stock_actual = stock FROM cajas_detalles WHERE caja_id=@caja_id AND producto_id=@producto_id;

    IF (@stock_actual - @cantidad) < 0 
        THROW 52048, 'Stock insuficiente. No se puede retirar más cantidad de la que existe.', 1;

    UPDATE cajas_detalles 
    SET stock = stock - @cantidad
    WHERE caja_id=@caja_id AND producto_id=@producto_id;

    COMMIT;

    SELECT p.producto_id, p.nombre, cd.stock
    FROM cajas_detalles cd
    INNER JOIN productos p ON cd.producto_id = p.producto_id
    WHERE cd.caja_id = @caja_id AND cd.producto_id = @producto_id;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK;
    INSERT INTO logs(origen, mensaje) VALUES(N'productos_remove_stock', ERROR_MESSAGE());
    THROW;
  END CATCH
END;
GO

/* =========================================================
   4. GETS INCLUYENDO STOCK Y ACTIVOS (estado = 1)
   ========================================================= */

-- get_by_id_and_stock
CREATE OR ALTER PROCEDURE productos_get_by_id_and_stock
  @producto_id INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion,
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE p.producto_id = @producto_id 
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor,
           p.marca_id, m.nombre, p.fecha_modificacion;
END;
GO

-- get_by_nombre_and_stock
CREATE OR ALTER PROCEDURE productos_get_by_nombre_and_stock
  @nombre NVARCHAR(100) = NULL
AS
BEGIN 
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion,
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE (@nombre IS NULL OR p.nombre LIKE '%' + @nombre + '%')
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor,
           p.marca_id, m.nombre, p.fecha_modificacion
  ORDER BY p.nombre;
END;
GO

-- get_by_categoria_and_stock
CREATE OR ALTER PROCEDURE productos_get_by_categoria_and_stock
  @categoria_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion,
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE (@categoria_id IS NULL OR p.categoria_id = @categoria_id)
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor,
           p.marca_id, m.nombre, p.fecha_modificacion
  ORDER BY p.nombre;
END;
GO

-- get_by_marca_and_stock
CREATE OR ALTER PROCEDURE productos_get_by_marca_and_stock
  @marca_id INT = NULL
AS
BEGIN   
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion,
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE (@marca_id IS NULL OR p.marca_id = @marca_id)
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor,
           p.marca_id, m.nombre, p.fecha_modificacion
  ORDER BY p.nombre;
END;
GO

-- get_by_unidad_and_stock
CREATE OR ALTER PROCEDURE productos_get_by_unidad_and_stock
  @unidad_id INT = NULL 
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
         p.categoria_id, c.nombre AS categoria_nombre,
         p.unidad_id, u.nombre AS unidad_nombre, p.unidad_valor,
         p.marca_id, m.nombre AS marca_nombre,
         p.fecha_modificacion,
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  INNER JOIN categorias c ON p.categoria_id = c.categoria_id
  INNER JOIN unidad u ON p.unidad_id = u.unidad_id
  INNER JOIN marcas m ON p.marca_id = m.marca_id
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE (@unidad_id IS NULL OR p.unidad_id = @unidad_id)
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre, p.descripcion, p.precio, p.estado,
           p.categoria_id, c.nombre, p.unidad_id, u.nombre, p.unidad_valor,
           p.marca_id, m.nombre, p.fecha_modificacion
  ORDER BY p.nombre;
END;
GO

/* =========================================================
   5. GET STOCK (Solo Activos)
   ========================================================= */
CREATE OR ALTER PROCEDURE productos_get_stock
  @producto_id INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SELECT p.producto_id, 
         p.nombre, 
         COALESCE(SUM(cd.stock), 0) AS stock_total
  FROM productos p
  LEFT JOIN cajas_detalles cd ON p.producto_id = cd.producto_id
  WHERE (@producto_id IS NULL OR p.producto_id = @producto_id)
    AND p.estado = 1 -- Solo productos activos
  GROUP BY p.producto_id, p.nombre
  ORDER BY p.nombre;
END;
GO
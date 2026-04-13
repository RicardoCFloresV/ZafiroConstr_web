# Zafiro Home - Admin Dashboard: Documentacion Tecnica

## 1. Resumen del Proyecto

Zafiro Home es un sistema de gestion de inventario para una ferreteria. El panel de administracion permite gestionar **productos, categorias, marcas, unidades, cajas (ubicaciones fisicas)** y **stock** a traves de una interfaz web con autenticacion basada en sesiones.

### Alcance del rework

El rework cubrio la construccion y estandarizacion de los modulos administrativos:

- **Productos**: listado completo con DataTables, busqueda por ID/nombre, CRUD, soft delete, columna unificada de categorias (principal + secundaria + subcategoria).
- **Editar Producto**: formulario de edicion con cascada de categorias, visualizacion del inventario actual (stock por caja con badges), link directo al modulo de Stock.
- **Nuevo Producto**: formulario de creacion con seleccion de caja por componentes (letra, cara, nivel), stock inicial, carga resiliente de selects.
- **Stock**: modulo principal de gestion con busqueda multifiltro (ID/nombre + categoria + marca + unidad + tamano), toggle activos/todos, seleccion de producto, y 4 operaciones de mutacion via modales (Agregar, Retirar, Ajustar, Mover).
- **Categorias, Marcas, Unidades, Cajas, Usuarios**: modulos CRUD estandar con el mismo patron de arquitectura.

### Stack tecnologico

| Capa | Tecnologia |
|---|---|
| Frontend layout/estilos | Tailwind CSS 3 (CDN) + tema personalizado |
| Frontend logica | ES Modules nativos (`type="module"`) |
| DOM / DataTables | jQuery 3.7.1 + DataTables 1.13.8 |
| Iconos | Font Awesome 6.5.2 |
| Backend | Express.js (Node.js) |
| Base de datos | SQL Server (via `mssql` / `tedious`) |
| Autenticacion | express-session + cookies HttpOnly |

---

## 2. Arquitectura de Modulos

Cada modulo del dashboard sigue un patron de 4 capas:

```
HTML (pagina)  -->  control.js (logica de UI)  -->  api manager (fetch)  -->  server router (Express)  -->  SP (SQL Server)
```

### 2.1 Capa HTML (`Protected/pages/panels/*.html`)

Cada pagina es un documento HTML completo con:

```
<!DOCTYPE html>
<html>
<head>
  <!-- CDNs: Tailwind, FontAwesome, DataTables CSS -->
  <!-- Tailwind config inline (colores del tema) -->
  <!-- dashboards.css (modales, toasts, overrides DataTables) -->
</head>
<body>
  <div class="flex min-h-screen">

    <!-- Sidebar (identico en todas las paginas) -->
    <aside id="sidebar">
      <!-- Logo, navegacion, item activo con border-accent -->
    </aside>

    <div class="flex-1 lg:ml-[260px]">
      <!-- Header: avatar, nombre, rol, boton logout -->
      <header>...</header>

      <main>
        <!-- Contenido especifico del modulo -->
        <!-- Secciones: busqueda, tabla, formulario, etc. -->
      </main>
    </div>
  </div>

  <!-- Modales (fuera del main, display:none hasta .show) -->
  <div class="modal" id="modalXxx">...</div>

  <!-- Toast container -->
  <div id="toastContainer"></div>

  <!-- Scripts (orden importante) -->
  <script src="jquery"></script>
  <script src="datatables"></script>
  <script src="sessionManager.js"></script>           <!-- NO module -->
  <script type="module" src="api/xxxManager.js"></script>
  <script type="module" src="control/panel-adm-xxx.js"></script>
</body>
</html>
```

**Puntos clave:**
- El sidebar se repite manualmente en cada HTML (no hay framework de componentes).
- Tailwind config se repite inline en cada pagina para definir los colores del tema.
- `sessionManager.js` se carga como script normal (IIFE), no como module. Los API managers y el control script son ES modules.
- Los modales estan en el DOM desde el inicio pero ocultos con `display:none` (clase `.modal` en `dashboards.css`).

### 2.2 Capa API Manager (`Protected/scripts/api/*Manager.js`)

Cada recurso tiene su propio archivo API. El patron comun es un objeto literal con metodos async que envuelven `fetch`:

```javascript
// Ejemplo: productosManager.js
const productosAPI = {
    async getAll() {
        const response = await fetch('/productos/get_all', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'    // <-- CRITICO: envia la cookie de sesion
        });
        return await response.json();
    },

    async update(data) {
        const response = await fetch('/productos/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        return await response.json();
    },
    // ...
};

export { productosAPI };
```

**Archivos existentes:**

| Archivo | Recurso |
|---|---|
| `productosManager.js` | Productos CRUD + busquedas |
| `nuevoProductoManager.js` | Insercion compuesta + obtener catalogos (categorias, marcas, etc.) |
| `stockManager.js` | Operaciones de stock (add/remove/set/move) |
| `cajasManager.js` | Cajas CRUD |
| `categoriasManager.js` | Categorias CRUD |
| `marcasManager.js` | Marcas CRUD |
| `unidadesManager.js` | Unidades de medida |
| `sizesManager.js` | Tamanos |
| `usuariosManager.js` | Usuarios |

**Patron especial en `stockManager.js`:**

A diferencia de los demas, este usa un wrapper `apiFetch()` centralizado que:
- Agrega el `BASE` path (`/stock`) automaticamente
- Lee el content-type de la respuesta para parsear JSON o texto
- Lanza `Error` automaticamente si `!res.ok`
- Valida parametros con helpers (`toIntOrThrow`, `toPosInt`, `toNonNegInt`) antes de enviar

```javascript
const BASE = '/stock';

async function apiFetch(path, { method = 'GET', body } = {}) {
    const opts = { method, credentials: 'include', headers: { 'Accept': 'application/json' } };
    if (body != null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, opts);
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(extractErrorMessage(data, res));
    return data;
}
```

### 2.3 Capa Control (`Protected/scripts/control/panel-adm-*.js`)

Cada control script es un ES module que:
1. Importa los API managers que necesita
2. Define helpers de envelope (`assertOk`, `toArrayData`)
3. Referencia elementos DOM por ID
4. Define la estructura de columnas para DataTables
5. Carga datos al `DOMContentLoaded`
6. Conecta event listeners (botones, formularios, cambios en selects)

```javascript
// Ejemplo simplificado: panel-adm-productos.js
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";

// Helpers de envelope
function toArrayData(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  return Array.isArray(r) ? r : (r ? [r] : []);
}

// Normalizacion de datos
function normalizeProducto(row) {
  return {
    id: Number(row.producto_id ?? row.id),
    nombre: row.nombre || "",
    // ...mapear todos los campos
  };
}

// Definicion de columnas DataTable
const columnsGeneral = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { data: null, title: "Categoria", render: (row) => renderCategoriaBadges(row) },
  // ...
];

// Inicializacion
document.addEventListener("DOMContentLoaded", async () => {
  tablaProductos = renderDataTable("#tablaProductos", [], columnsGeneral);
  await cargarTabla();
});
```

**Archivos existentes:**

| Archivo | Modulo |
|---|---|
| `panel-adm-productos.js` | Listado y busqueda de productos |
| `panel-adm-nuevoProducto.js` | Formulario de creacion |
| `panel-adm-editarProducto.js` | Formulario de edicion |
| `panel-adm-stock.js` | Gestion de stock (el mas complejo) |
| `panel-adm-cajas.js` | CRUD de cajas |
| `panel-adm-categorias.js` | CRUD de categorias |
| `panel-adm-marcas.js` | CRUD de marcas |
| `panel-adm-unidades.js` | CRUD de unidades |
| `panel-adm-sizes.js` | CRUD de tamanos |
| `panel-adm-usuarios.js` | CRUD de usuarios |

### 2.4 Capa Server (`Server/Routes/*Router.js`)

Cada router Express sigue este patron:

```javascript
const express = require('express');
const { db, sql } = require('../../db/dbconnector.js');
const ValidationService = require('../Validators/validatorService.js');
const { requireAuth, requireAdmin } = require('./authRouter.js');

const Router = express.Router();

// Reglas de validacion por operacion
const Rules = {
  Insert: { nombre: { required: true, type: 'string', maxLength: 100 }, ... },
  Update: { id: { required: true, custom: v => ... }, ... },
};

// Helper para construir parametros de SP
function BuildParams(entries) {
  const p = {};
  for (const e of entries) p[e.name] = { type: e.type, value: e.value };
  return p;
}

// GET (publico o con auth)
Router.get('/get_all', async (_req, res) => {
  try {
    const data = await db.executeProc('recurso_get_all', {});
    return res.status(200).json({ success: true, message: '...', data });
  } catch (err) {
    return res.status(500).json({ success: false, message: '...' });
  }
});

// POST (requiere auth)
Router.post('/insert', requireAuth, async (req, res) => {
  const body = req.body;
  const { isValid, errors } = await ValidationService.validateData(body, Rules.Insert);
  if (!isValid) return res.status(400).json({ success: false, message: '...', errors });
  // ... ejecutar SP y responder
});

module.exports = Router;
```

**Montaje en `server.js`:**

```javascript
app.use('/productos', productosRouter);
app.use('/stock', stockRouter);
app.use('/categorias', categoriasRouter);
app.use('/categorias_secundarias', categoriasSecundariasRouter);
app.use('/subcategorias', subcategoriasRouter);
app.use('/brands', brandsRouter);
app.use('/sizes', sizesRouter);
app.use('/units', unitsRouter);
app.use('/cajas', cajasRouter);
app.use('/usuarios', usuariosRouter);
app.use('/reportes-stock', reportesStockRouter);
```

**Proteccion de archivos estaticos:**

```javascript
// Paginas admin: requiere rol Admin para servir cualquier archivo de /Protected
app.use('/admin-resources', requireAdmin, express.static('Protected'));

// Paginas usuario: requiere autenticacion
app.use('/user-resources', requireAuth, express.static('Usuarios'));
```

---

## 3. Estructura de Request / Response

### 3.1 Formato de respuesta (envelope)

**Todas** las respuestas del backend siguen esta estructura:

```json
{
  "success": true | false,
  "message": "Descripcion legible de lo que paso",
  "data": <array | object | null>
}
```

- `success: true` + HTTP 200/201 = operacion exitosa
- `success: false` + HTTP 400 = validacion fallida (incluye campo `errors`)
- `success: false` + HTTP 404 = recurso no encontrado
- `success: false` + HTTP 500 = error del servidor/SP

**Ejemplo exitoso (GET):**
```json
{
  "success": true,
  "message": "Listado de productos",
  "data": [
    { "producto_id": 1, "nombre": "Adaptador PVC", "precio": 5.50, "stock_total": 42, ... },
    { "producto_id": 2, "nombre": "Codo 90", "precio": 3.20, "stock_total": 0, ... }
  ]
}
```

**Ejemplo exitoso (GET por ID) - data es objeto, no array:**
```json
{
  "success": true,
  "message": "Producto obtenido",
  "data": { "producto_id": 1, "nombre": "Adaptador PVC", ... }
}
```

**Ejemplo fallido (validacion):**
```json
{
  "success": false,
  "message": "Datos invalidos (update)",
  "errors": {
    "nombre": ["nombre es requerido"],
    "precio": ["precio debe ser numerico"]
  }
}
```

### 3.2 Desempaquetado en el frontend (envelope unwrap)

Todos los control scripts incluyen estos helpers para manejar la respuesta:

```javascript
// Valida que success === true, lanza Error si no
function assertOk(resp) {
  if (resp && typeof resp === "object" && "success" in resp) {
    if (!resp.success) throw new Error(resp.message || "Operacion no exitosa");
  }
  return resp;
}

// Extrae .data del envelope y garantiza que sea array
function toArrayData(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (Array.isArray(r)) return r;
  if (!r) return [];
  return [r];   // objeto unico -> array de 1
}

// Extrae .data y devuelve el primer elemento (para por_id)
function unwrapOne(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (Array.isArray(r)) return r[0] || null;
  return r || null;
}
```

**Flujo tipico de uso:**

```javascript
const resp = assertOk(await productosAPI.getAll());   // lanza si success=false
const productos = toArrayData(resp).map(normalizeProducto).filter(Boolean);
```

### 3.3 Normalizacion de datos

Cada modulo define una funcion `normalizeProducto(row)` (o equivalente) que:
- Resuelve variantes de nombre de campo (`producto_id` vs `id`, `nombre` vs `Nombre`)
- Convierte tipos (`Number()`, `String()`)
- Asigna defaults para campos opcionales
- Retorna `null` para filas invalidas (filtradas despues con `.filter(Boolean)`)

---

## 4. DataTables

### 4.1 Patron de renderizado

```javascript
function renderDataTable(selector, data, columns) {
  const table = $(selector);

  // Si ya existe, reutilizar (clear + add)
  if ($.fn.DataTable.isDataTable(selector)) {
    const dt = table.DataTable();
    dt.clear();
    if (data && data.length > 0) dt.rows.add(data).draw();
    else dt.draw();
    return dt;
  }

  // Primera vez: crear
  return table.DataTable({
    data: data || [],
    columns,
    pageLength: 10,
    autoWidth: false,
    language: { /* traducciones al espanol */ }
  });
}
```

**Importante:** La tabla se inicializa vacia en `DOMContentLoaded` y se llena cuando los datos llegan. Esto evita el error de DataTables de re-inicializar sobre la misma tabla.

### 4.2 Definicion de columnas

Las columnas se definen como arrays de objetos con el formato de DataTables:

```javascript
const columnsGeneral = [
  // Columna simple: lee directamente del objeto de datos
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },

  // Columna con render personalizado
  {
    data: "precio",
    title: "Precio",
    render: (data) => `$${Number(data).toFixed(2)}`
  },

  // Columna con badges HTML (categoria unificada)
  {
    data: null,
    title: "Categoria",
    orderable: false,
    render: (row) => renderCategoriaBadges(row)
  },

  // Columna de estado con pill
  {
    data: "estado",
    title: "Estado",
    render: (d) => {
      const on = Number(d) === 1;
      return `<span class="pill ${on ? 'pill-on' : 'pill-off'}">${on ? 'Activo' : 'Inactivo'}</span>`;
    }
  },

  // Columna de acciones (botones)
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) => `
      <div class="btn-group">
        <a class="btn-row warning" href="editarProducto.html?id=${row.id}">
          <i class="fa-solid fa-pen-to-square"></i> Editar
        </a>
        <button class="btn-row danger js-eliminar" data-id="${row.id}">
          <i class="fa-solid fa-trash-can"></i> Eliminar
        </button>
      </div>`
  }
];
```

### 4.3 Delegacion de eventos en tablas

DataTables destruye y recrea filas al paginar/buscar, por lo que los event listeners directos se pierden. Se usa delegacion con jQuery:

```javascript
$(document).on("click", "#tablaBusqueda tbody .js-seleccionar", function () {
  const id = Number(this.dataset.id);
  if (!id) return;
  seleccionarProductoPorId(id);
});
```

### 4.4 Columnas con badges (patron reutilizado)

Se usa en dos columnas: **Categorias** y **Cajas**.

```javascript
// Categorias unificadas (principal + secundaria + subcategoria)
function renderCategoriaBadges(row) {
  const niveles = [
    { nombre: row.categoria_principal_nombre, cls: "bg-primary/10 text-primary ..." },
    { nombre: row.categoria_secundaria_nombre, cls: "bg-secondary/10 text-secondary ..." },
    { nombre: row.subcategoria_nombre, cls: "bg-accent/10 text-accent-dark ..." }
  ].filter(n => n.nombre);

  return niveles.map(n =>
    `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${n.cls}">
       <i class="fa-solid fa-layer-group"></i> ${escapeHtml(n.nombre)}
     </span>`
  ).join("");
}

// Cajas con stock por producto (mapa precalculado)
function renderCajasBadges(producto_id) {
  const list = cajasPorProducto.get(Number(producto_id)) || [];
  return list.map(c =>
    `<span class="... bg-primary/10 text-primary ...">
       <i class="fa-solid fa-box"></i> ${eti}
       <span class="... bg-primary text-white">${stock}</span>
     </span>`
  ).join("");
}
```

---

## 5. Modales y Manejo de Errores

### 5.1 Estructura de modales

Los modales usan CSS puro (sin JS de Bootstrap). La clase `.modal` vive en `dashboards.css`:

```css
.modal       { display: none !important; position: fixed; inset: 0; z-index: 2000;
               background: rgba(17,24,39,.55); backdrop-filter: blur(6px); }
.modal.show  { display: flex !important; animation: zh-fade .18s ease-out; }
.modal-dialog{ background: #fff; border-radius: .75rem; max-width: 560px;
               box-shadow: 0 20px 40px rgba(0,0,0,.25); padding: 1.5rem; }
```

**HTML de un modal:**

```html
<div class="modal" id="modalAddStock" aria-hidden="true" role="dialog">
  <div class="modal-dialog">
    <!-- Boton cerrar -->
    <button data-close-modal="modalAddStock" aria-label="Cerrar">
      <i class="fa-solid fa-xmark"></i>
    </button>

    <!-- Icono + titulo -->
    <div class="text-success text-4xl mb-3"><i class="fa-solid fa-circle-plus"></i></div>
    <h3>Agregar stock</h3>
    <p class="text-textMuted">Descripcion de la accion.</p>

    <!-- Formulario -->
    <form id="formAddStock">
      <select id="addCajaSelect">...</select>
      <input type="number" id="addDelta" />
      <button type="button" data-close-modal="modalAddStock">Cancelar</button>
      <button type="submit">Agregar</button>
    </form>
  </div>
</div>
```

### 5.2 Apertura y cierre

```javascript
function openModal(id) {
  const m = document.getElementById(id);
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  document.querySelector("main")?.setAttribute("inert", "");  // bloquea interaccion detras
  document.body.classList.add("modal-open");                   // overflow:hidden en body
}

function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
  document.querySelector("main")?.removeAttribute("inert");
  document.body.classList.remove("modal-open");
}
```

**Cierre por multiples vias:**

```javascript
// 1. Boton con data-close-modal="modalId"
document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});

// 2. Click fuera del modal-dialog (en el backdrop)
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); });
});

// 3. Tecla Escape
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.show").forEach(m => closeModal(m.id));
  }
});
```

### 5.3 Flujo de una accion con modal (ejemplo: Agregar stock)

```
1. Usuario click "Agregar"
   --> Guard: producto seleccionado?  Si no -> toast info
   --> Guard: producto activo?         Si no -> toast error
   --> Llenar select de cajas (fillCajaSelect)
   --> Limpiar input de cantidad
   --> openModal("modalAddStock")

2. Usuario llena el form y click "Agregar" (submit)
   --> preventDefault()
   --> Extraer valores del form
   --> Validar localmente (caja seleccionada? cantidad > 0?)
   --> assertOk(await stockAPI.add({ caja_id, producto_id, delta }))
   --> closeModal("modalAddStock")
   --> refrescarTodo()   // recarga catalogo + tabla + stock del producto
   --> showToast("Stock agregado", "success")

3. Si hay error en cualquier paso:
   --> catch (err)
   --> showToast(friendlyError(err), "error")
   --> El modal NO se cierra (el usuario puede reintentar)
```

### 5.4 Toasts (notificaciones)

```javascript
function showToast(message, type = "info", icon = null, timeout = 3500) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;      // toast-success | toast-error | toast-info | toast-warning
  el.innerHTML = `${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${message}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 180);
  }, timeout);
}
```

Los toasts se posicionan en la esquina inferior derecha (`position:fixed; right; bottom`). Se auto-destruyen despues de 3.5 segundos.

### 5.5 Manejo de errores del backend

El patron estandar para mostrar errores del servidor:

```javascript
function friendlyError(err) {
  const msg = (err && err.message) ? String(err.message) : "";
  return msg || "No hay conexion con el servidor";
}
```

Para el modulo de editar producto, hay un manejo mas detallado que lee errores de validacion del backend:

```javascript
const respBody = await updateResp.json();

if (!updateResp.ok || respBody.success === false) {
  const serverMsg = respBody.message || `HTTP ${updateResp.status}`;
  const errors = respBody.errors;
  const detail = errors
    ? " -- " + Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ")
    : "";
  throw new Error(serverMsg + detail);
}
```

---

## 6. Session Manager

`sessionManager.js` es un script global (IIFE, no module) cargado en **todas** las paginas admin. Se encarga de:

1. **Cargar sesion**: `GET /auth/status` -> si no hay sesion, redirige a `/index.html`
2. **Llenar header**: nombre, rol, avatar (ui-avatars.com) en desktop y sidebar movil
3. **Logout**: `POST /auth/logout` + redirect a index
4. **Sidebar movil**: toggle hamburguesa, overlay, cierre con X o click fuera

---

## 7. Base de Datos

### 7.1 Tablas principales

```
categorias                     -- Jerarquia nivel 1
categorias_secundarias         -- Jerarquia nivel 2 (categoria_padre_id -> categorias)
subcategorias                  -- Jerarquia nivel 3 (categoria_secundaria_id -> categorias_secundarias)
productos                      -- Producto con FK a las 3 categorias, unidad, tamano, marca
cajas                          -- Ubicacion fisica (letra, cara, nivel, etiqueta computed)
cajas_detalles                 -- Relacion N:M producto-caja con stock (se elimina al llegar a 0)
usuarios                       -- Usuarios con hash bcrypt
logs                           -- Registro de errores de SPs
```

### 7.2 Stored Procedures (principales)

| SP | Operacion |
|---|---|
| `productos_get_all` | Todos los productos con JOINs a categorias/marca/unidad/tamano + stock_total |
| `productos_get_all_active` | Solo los activos (estado=1) |
| `productos_get_by_id` | Producto completo por ID |
| `productos_insert` | Insertar producto |
| `productos_update` | Actualizar producto (incluyendo @estado BIT nullable) |
| `productos_get_by_cajas` | Distribucion de todos los productos por caja |
| `productos_add_stock` | Agregar stock (MERGE upsert en cajas_detalles) |
| `productos_remove_stock` | Retirar stock (DELETE si llega a 0) |
| `productos_set_stock_by_detalle` | Ajustar stock exacto (DELETE si se pone en 0) |
| `productos_move_stock` | Mover entre cajas (DELETE origen si llega a 0, MERGE upsert destino) |
| `categorias_secundarias_get_all` | Todas las cat. secundarias (id, nombre) |
| `subcategorias_get_all` | Todas las subcategorias (id, nombre) |

### 7.3 Patches

Los patches de SQL se guardan en `db/patches/` con nombre descriptivo y se aplican con:

```bash
sqlcmd -S localhost -U <user> -P '<pwd>' -C -d <database> -b -i db/patches/<nombre>.sql
```

---

## 8. Estructura de Archivos

```
ZafiroConstr_web/
|
|-- server.js                              # Entry point Express
|-- db/
|   |-- dbconnector.js                     # Pool mssql + executeProc
|   |-- almacen.sql                        # Schema + SPs principal (produccion)
|   |-- newdb.sql                          # Schema alternativo (con tablas de categorias)
|   |-- patches/                           # Patches incrementales de SQL
|       |-- fix_stock_cleanup.sql
|
|-- Server/
|   |-- Routes/
|   |   |-- authRouter.js                  # Login/logout/status + middlewares requireAuth/requireAdmin
|   |   |-- productosRouter.js
|   |   |-- stockRouter.js
|   |   |-- cajasRouter.js
|   |   |-- categoriasRouter.js
|   |   |-- categorias_secundariasRouter.js
|   |   |-- subcategoriasRouter.js
|   |   |-- brandsRouter.js
|   |   |-- sizesRouter.js
|   |   |-- unitsRouter.js
|   |   |-- usuariosRouter.js
|   |   |-- reportes_stockRouter.js
|   |   |-- insert_producto_with_stock.js
|   |
|   |-- Validators/
|       |-- validatorService.js            # Motor de validacion generico
|       |-- Rulesets/                      # Reglas por recurso
|
|-- Protected/                             # Servido bajo /admin-resources (requireAdmin)
|   |-- css/
|   |   |-- dashboards.css                # Modales, toasts, DataTables overrides, pills, botones
|   |
|   |-- scripts/
|   |   |-- sessionManager.js             # Sesion + sidebar (IIFE, no module)
|   |   |-- api/
|   |   |   |-- productosManager.js
|   |   |   |-- stockManager.js
|   |   |   |-- nuevoProductoManager.js
|   |   |   |-- cajasManager.js
|   |   |   |-- categoriasManager.js
|   |   |   |-- marcasManager.js
|   |   |   |-- unidadesManager.js
|   |   |   |-- sizesManager.js
|   |   |   |-- usuariosManager.js
|   |   |
|   |   |-- control/
|   |       |-- panel-adm-productos.js
|   |       |-- panel-adm-nuevoProducto.js
|   |       |-- panel-adm-editarProducto.js
|   |       |-- panel-adm-stock.js
|   |       |-- panel-adm-cajas.js
|   |       |-- panel-adm-categorias.js
|   |       |-- panel-adm-marcas.js
|   |       |-- panel-adm-unidades.js
|   |       |-- panel-adm-sizes.js
|   |       |-- panel-adm-usuarios.js
|   |
|   |-- pages/
|       |-- admin.html                     # Pagina principal admin
|       |-- panels/
|           |-- productos.html
|           |-- nuevo_producto.html
|           |-- editarProducto.html
|           |-- stock.html
|           |-- categorias.html
|           |-- marcas.html
|           |-- cajas.html
|           |-- unidadesTamano.html
|           |-- unidadesVolumen.html
|           |-- usuarios.html
|
|-- Public/                                # Estaticos publicos (login, landing)
|-- Usuarios/                              # Servido bajo /user-resources (requireAuth)
```

---

## 9. Guia para Crear un Nuevo Modulo

Para agregar un nuevo modulo CRUD al dashboard (por ejemplo: "Proveedores"), los pasos son:

### Paso 1: Base de datos

1. Crear la tabla `proveedores` en `almacen.sql`
2. Crear SPs: `proveedores_insert`, `proveedores_update`, `proveedores_delete`, `proveedores_get_all`, `proveedores_get_by_id`
3. Cada SP debe usar `SET NOCOUNT ON; SET XACT_ABORT ON;` y wrappear con `BEGIN TRY / BEGIN CATCH` con logging a tabla `logs`
4. Crear un patch en `db/patches/` y ejecutarlo en el servidor

### Paso 2: Validacion (backend)

1. Crear `Server/Validators/Rulesets/proveedores.js` con las reglas por operacion:
```javascript
const InsertRules = {
  nombre: { required: true, type: 'string', trim: true, minLength: 1, maxLength: 100 }
};
module.exports = { InsertRules, UpdateRules, DeleteRules, PorIdRules };
```

### Paso 3: Router (backend)

1. Crear `Server/Routes/proveedoresRouter.js` siguiendo el patron de los existentes
2. Usar `requireAuth` para escrituras, dejar GETs publicos o protegerlos segun necesidad
3. Montar en `server.js`: `app.use('/proveedores', proveedoresRouter);`

### Paso 4: API Manager (frontend)

1. Crear `Protected/scripts/api/proveedoresManager.js`
2. **Siempre incluir** `credentials: 'include'` en cada fetch
3. Exportar el objeto API: `export { proveedoresAPI };`

### Paso 5: Pagina HTML

1. Crear `Protected/pages/panels/proveedores.html`
2. Copiar el layout base (sidebar + header + main) de una pagina existente
3. Marcar el item activo en el sidebar (`text-white bg-white/10 border-l-4 border-accent`)
4. Agregar la tabla HTML con `<thead>` que coincida con las columnas del DataTable
5. Agregar los modales necesarios (insert, update, delete)
6. Cargar scripts en orden: jQuery -> DataTables -> sessionManager -> API module -> control module

### Paso 6: Control script (frontend)

1. Crear `Protected/scripts/control/panel-adm-proveedores.js`
2. Incluir los helpers estandar: `assertOk`, `toArrayData`, `showToast`, `friendlyError`
3. Definir las columnas del DataTable
4. Implementar `renderDataTable` (o copiar la funcion estandar)
5. Conectar event listeners para botones y formularios de modales
6. Inicializar tablas vacias en `DOMContentLoaded`, luego cargar datos

### Paso 7: Navegacion

1. Agregar el link al sidebar en **todas** las paginas admin existentes (son ~10 archivos HTML con sidebar manual)

---

## 10. Colores del Tema (Tailwind Config)

Cada pagina incluye esta configuracion inline en el `<head>`:

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: 'rgb(45, 71, 120)',         // Azul oscuro (sidebar, encabezados)
        'primary-dark': 'rgb(30, 48, 82)',   // Mas oscuro (header sidebar, hover)
        secondary: 'rgb(100, 140, 188)',     // Azul claro (botones buscar, badges)
        accent: '#f08a5d',                   // Naranja (item activo sidebar, hover)
        'accent-dark': '#d87245',            // Naranja oscuro
        danger: '#a5230c',                   // Rojo (eliminar, errores)
        success: '#16a34a',                  // Verde (activo, agregar, toggles)
        bg: '#f6f7fb',                       // Fondo general
        card: '#ffffff',                     // Fondo de tarjetas/secciones
        textMain: '#333333',                 // Texto principal
        textMuted: '#737b90',                // Texto secundario
      },
      fontFamily: {
        body: ['Open Sans', 'sans-serif'],   // Texto general
        heading: ['Poppins', 'sans-serif'],  // Titulos
      }
    }
  }
}
```

---

## 11. Notas y Limitaciones Conocidas

1. **Sidebar duplicado**: el sidebar se repite manualmente en cada HTML. Un cambio de navegacion requiere editar ~10 archivos.

2. **Categorias sin cascada real**: Los SPs `categorias_secundarias_get_all` y `subcategorias_get_all` no devuelven el ID del padre (`categoria_padre_id` / `categoria_secundaria_id`). Los selects muestran todas las opciones sin filtrar por jerarquia. Para habilitar cascada real, los SPs deben incluir esas columnas en su SELECT.

3. **Sin framework de componentes**: todo el frontend es HTML plano + JS vanilla + Tailwind. No hay estado reactivo, no hay virtual DOM, no hay bundler. Esto lo hace simple y directo pero significa mas codigo repetido entre modulos.

4. **Limpieza de stock a 0**: los SPs de stock (`remove`, `set_by_detalle`, `move`) ahora eliminan automaticamente las filas de `cajas_detalles` cuando el stock resultante es 0, evitando filas fantasma.

5. **Autenticacion por cookies**: todos los endpoints protegidos requieren `credentials: 'include'` en el fetch del frontend. Olvidar esto causa 401/403 silenciosos.

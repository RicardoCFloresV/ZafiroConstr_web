// Control de panel: Stock
import { stockAPI } from "/admin-resources/scripts/api/stockManager.js";
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";
import { cajasAPI } from "/admin-resources/scripts/api/cajasManager.js";
import { nuevoProductoAPI } from "/admin-resources/scripts/api/nuevoProductoManager.js";

/* =========================
   Helpers de envelope
   ========================= */
function assertOk(resp) {
  if (resp && typeof resp === "object" && "success" in resp) {
    if (!resp.success) throw new Error(resp.message || "Operación no exitosa");
  }
  return resp;
}
function toArrayData(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (Array.isArray(r)) return r;
  if (!r) return [];
  return [r];
}
function unwrapOne(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (Array.isArray(r)) return r[0] || null;
  return r || null;
}

/* =========================
   Toasts
   ========================= */
const toastContainer = document.getElementById("toastContainer");
function showToast(message, type = "info", icon = null, timeout = 3500) {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${message}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(4px)";
    setTimeout(() => el.remove(), 180);
  }, timeout);
}
function friendlyError(err) {
  const msg = err && err.message ? String(err.message) : "";
  return msg || "No hay conexión con el servidor";
}

/* =========================
   Estado
   ========================= */
let productosAll = [];          // catálogo completo (productos_get_all)
let cajasPorProducto = new Map(); // producto_id -> [{ caja_id, etiqueta, stock }, ...]
let cajasList = [];             // lista de todas las cajas

let currentProducto = null;     // producto seleccionado
let currentDetalles = [];       // detalles (caja+stock) del producto

let tablaBusqueda = null;
let tablaStock = null;

/* =========================
   Referencias DOM
   ========================= */
const inputBuscar = document.getElementById("inputBuscar");
const tipoBusqueda = document.getElementById("tipoBusqueda");
const btnBuscar = document.getElementById("btnBuscar");
const btnLimpiarFiltros = document.getElementById("btnLimpiarFiltros");
const btnRefrescarCatalogo = document.getElementById("btnRefrescarCatalogo");

const filterCategoria = document.getElementById("filterCategoria");
const filterMarca = document.getElementById("filterMarca");
const filterUnidad = document.getElementById("filterUnidad");
const filterTamano = document.getElementById("filterTamano");

const resultadosBusqueda = document.getElementById("resultadosBusqueda");
const resultadosCount = document.getElementById("resultadosCount");

const productoSeleccionadoEl = document.getElementById("productoSeleccionado");
const prodNombre = document.getElementById("prodNombre");
const prodId = document.getElementById("prodId");
const prodMarca = document.getElementById("prodMarca");
const prodCategoria = document.getElementById("prodCategoria");
const prodEstadoPill = document.getElementById("prodEstadoPill");
const toggleEstado = document.getElementById("toggleEstado");
const toggleEstadoLabel = document.getElementById("toggleEstadoLabel");

const stockTotalEl = document.getElementById("stockTotal");
const stockCajasCountEl = document.getElementById("stockCajasCount");
const stockDetallesCountEl = document.getElementById("stockDetallesCount");

const btnAddStock = document.getElementById("btnAddStock");
const btnRemoveStock = document.getElementById("btnRemoveStock");
const btnSetStock = document.getElementById("btnSetStock");
const btnMoveStock = document.getElementById("btnMoveStock");
const btnRefrescarStock = document.getElementById("btnRefrescarStock");

const mainEl = document.querySelector("main");

/* =========================
   Modal helpers (genéricos)
   ========================= */
function openModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("show");
  m.setAttribute("aria-hidden", "false");
  mainEl?.setAttribute("inert", "");
  document.body.classList.add("modal-open");
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("show");
  m.setAttribute("aria-hidden", "true");
  mainEl?.removeAttribute("inert");
  document.body.classList.remove("modal-open");
}
document.querySelectorAll("[data-close-modal]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); });
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal.show").forEach(m => closeModal(m.id));
  }
});

/* =========================
   DataTables
   ========================= */
const dtLang = {
  "decimal": "",
  "emptyTable": "No hay productos para mostrar",
  "info": "Mostrando _START_ a _END_ de _TOTAL_ registros",
  "infoEmpty": "Mostrando 0 a 0 de 0 registros",
  "infoFiltered": "(filtrado de _MAX_ registros totales)",
  "lengthMenu": "Mostrar _MENU_ registros",
  "loadingRecords": "Cargando...",
  "processing": "Procesando...",
  "search": "Buscar:",
  "zeroRecords": "No se encontraron registros coincidentes",
  "paginate": { "first": "Primero", "last": "Último", "next": "Siguiente", "previous": "Anterior" }
};

function renderDataTable(selector, data, columns) {
  const table = $(selector);
  if ($.fn.DataTable.isDataTable(selector)) {
    const dt = table.DataTable();
    dt.clear();
    if (data && data.length > 0) dt.rows.add(data).draw();
    else dt.draw();
    return dt;
  }
  return table.DataTable({
    data: data || [],
    columns,
    pageLength: 10,
    autoWidth: false,
    language: dtLang
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function renderCajasBadges(producto_id) {
  const list = cajasPorProducto.get(Number(producto_id)) || [];
  if (!list.length) {
    return `<span class="text-textMuted text-xs italic">Sin asignar</span>`;
  }
  return list.map(c => {
    const eti = c.etiqueta ? escapeHtml(c.etiqueta) : `Caja ${c.caja_id}`;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 mr-1 mb-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20" title="Caja #${c.caja_id}">
              <i class="fa-solid fa-box"></i> ${eti}
              <span class="ml-1 px-1.5 rounded bg-primary text-white">${Number(c.stock || 0)}</span>
            </span>`;
  }).join("");
}

const columnsBusqueda = [
  { data: "id", title: "ID", width: "60px" },
  { data: "nombre", title: "Nombre" },
  { data: "brand_nombre", title: "Marca", defaultContent: "—" },
  { data: "categoria_principal_nombre", title: "Categoría", defaultContent: "—" },
  {
    data: "stock_total",
    title: "Stock total",
    render: (d) => {
      const n = Number(d || 0);
      const cls = n > 0 ? "text-success" : "text-textMuted";
      return `<span class="font-bold ${cls}">${n}</span>`;
    }
  },
  {
    data: null,
    title: "Cajas",
    orderable: false,
    render: (row) => renderCajasBadges(row.id)
  },
  {
    data: "estado",
    title: "Estado",
    render: (d) => {
      const on = Number(d) === 1;
      return `<span class="pill ${on ? "pill-on" : "pill-off"}">${on ? "Activo" : "Inactivo"}</span>`;
    }
  },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<button class="btn-row primary js-seleccionar" data-id="${row.id}" title="Gestionar stock">
         <i class="fa-solid fa-warehouse"></i> Gestionar
       </button>`
  }
];

const columnsStock = [
  { data: "detalle_id", title: "Detalle" },
  { data: "caja_id", title: "Caja", defaultContent: "—" },
  { data: "etiqueta", title: "Etiqueta", defaultContent: "—" },
  {
    data: "stock",
    title: "Stock",
    render: (data) => `<span class="font-semibold">${Number(data ?? 0)}</span>`
  }
];

/* =========================
   Normalización de productos
   ========================= */
function normalizeProducto(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.producto_id ?? row.id;
  if (id == null) return null;
  return {
    id: Number(id),
    nombre: row.nombre || row.Nombre || "",
    descripcion: row.descripcion || "",
    precio: Number(row.precio || 0),
    stock_total: Number(row.stock_total ?? 0),
    categoria_principal_id: row.categoria_principal_id != null ? Number(row.categoria_principal_id) : null,
    categoria_principal_nombre: row.categoria_principal_nombre || "—",
    brand_id: row.brand_id != null ? Number(row.brand_id) : null,
    brand_nombre: row.brand_nombre || "—",
    unit_id: row.unit_id != null ? Number(row.unit_id) : null,
    unit_nombre: row.unit_nombre || "",
    unit_value: row.unit_value ?? null,
    size_id: row.size_id != null ? Number(row.size_id) : null,
    size_nombre: row.size_nombre || "",
    size_value: row.size_value ?? null,
    estado: row.estado != null ? Number(row.estado) : 1,
    _raw: row
  };
}

/* =========================
   Carga de catálogo
   ========================= */
async function loadCatalogo() {
  try {
    // Productos (con stock_total + metadatos)
    const respProductos = assertOk(await productosAPI.getAll());
    productosAll = toArrayData(respProductos).map(normalizeProducto).filter(Boolean);

    // Distribución por cajas (productos_get_by_cajas)
    cajasPorProducto = new Map();
    try {
      const respCajas = await fetch("/productos/por_cajas", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      }).then(r => r.json());
      assertOk(respCajas);
      const filas = toArrayData(respCajas);
      filas.forEach(row => {
        const pid = Number(row.producto_id);
        if (!pid) return;
        const entry = {
          caja_id: row.caja_id != null ? Number(row.caja_id) : null,
          etiqueta: row.caja_etiqueta || row.etiqueta || null,
          stock: Number(row.stock || 0)
        };
        if (!cajasPorProducto.has(pid)) cajasPorProducto.set(pid, []);
        cajasPorProducto.get(pid).push(entry);
      });
    } catch (e) {
      console.warn("No se pudo cargar productos_por_cajas:", e);
    }
  } catch (err) {
    console.error("Error cargando catálogo", err);
    productosAll = [];
    cajasPorProducto = new Map();
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
}

/* =========================
   Carga de filtros (selects)
   ========================= */
async function loadFiltros() {
  try {
    const [cats, brands, units, sizes] = await Promise.all([
      nuevoProductoAPI.getCategorias(),
      nuevoProductoAPI.getBrands(),
      nuevoProductoAPI.getUnits(),
      nuevoProductoAPI.getSizes()
    ]);
    fillFilterSelect(filterCategoria, toArrayData(cats), "categoria_id", "nombre", "Todas");
    fillFilterSelect(filterMarca, toArrayData(brands), "brand_id", "nombre", "Todas");
    fillFilterSelect(filterUnidad, toArrayData(units), "unit_id", "nombre", "Todas");
    fillFilterSelect(filterTamano, toArrayData(sizes), "size_id", "nombre", "Todas");
  } catch (err) {
    console.error("Error cargando filtros", err);
    showToast("No se pudieron cargar los filtros", "error", "fa-circle-exclamation");
  }
}

function fillFilterSelect(select, items, valKey, textKey, placeholder = "Todas") {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(it => {
    const opt = document.createElement("option");
    opt.value = it[valKey];
    opt.textContent = it[textKey];
    select.appendChild(opt);
  });
}

/* =========================
   Filtro combinado
   ========================= */
function aplicarFiltros() {
  const term = (inputBuscar?.value || "").trim().toLowerCase();
  const tipo = tipoBusqueda?.value || "id";
  const catId = filterCategoria?.value ? Number(filterCategoria.value) : null;
  const brandId = filterMarca?.value ? Number(filterMarca.value) : null;
  const unitId = filterUnidad?.value ? Number(filterUnidad.value) : null;
  const sizeId = filterTamano?.value ? Number(filterTamano.value) : null;

  let result = productosAll.slice();

  // Filtro por texto (ID o Nombre)
  if (term) {
    if (tipo === "id") {
      const n = Number(term);
      if (Number.isFinite(n)) {
        result = result.filter(p => p.id === n);
      } else {
        result = [];
      }
    } else {
      result = result.filter(p => p.nombre.toLowerCase().includes(term));
    }
  }

  if (catId) result = result.filter(p => p.categoria_principal_id === catId);
  if (brandId) result = result.filter(p => p.brand_id === brandId);
  if (unitId) result = result.filter(p => p.unit_id === unitId);
  if (sizeId) result = result.filter(p => p.size_id === sizeId);

  resultadosCount.textContent = result.length;
  tablaBusqueda = renderDataTable("#tablaBusqueda", result, columnsBusqueda);
}

/* =========================
   Carga de cajas para selects de modales
   ========================= */
async function loadCajas() {
  try {
    const resp = await cajasAPI.getAll();
    cajasList = toArrayData(resp);
  } catch (err) {
    console.error("Error cargando cajas", err);
    cajasList = [];
    showToast("No se pudieron cargar las cajas", "error", "fa-circle-exclamation");
  }
}

function cajaLabel(c) {
  const id = c.caja_id ?? c.id;
  const etiqueta = c.etiqueta ?? c.nombre ?? c.label ?? `Caja ${id}`;
  return `#${id} — ${etiqueta}`;
}

function fillCajaSelect(select) {
  if (!select) return;
  select.innerHTML = '<option value="">Seleccione una caja…</option>';
  cajasList.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.caja_id ?? c.id;
    opt.textContent = cajaLabel(c);
    select.appendChild(opt);
  });
}

function fillDetalleSelect(select) {
  if (!select) return;
  select.innerHTML = '<option value="">Seleccione un detalle…</option>';
  currentDetalles.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.detalle_id;
    const eti = d.etiqueta || `Detalle ${d.detalle_id}`;
    opt.textContent = `#${d.detalle_id} — ${eti} (stock actual: ${Number(d.stock ?? 0)})`;
    select.appendChild(opt);
  });
}

/* =========================
   Selección de producto
   ========================= */
async function seleccionarProductoPorId(id) {
  try {
    // Primero buscamos en el catálogo cacheado
    let prod = productosAll.find(p => p.id === Number(id));
    if (!prod) {
      const resp = assertOk(await productosAPI.getById(id));
      const data = unwrapOne(resp);
      if (!data) {
        showToast("Producto no encontrado", "error", "fa-circle-exclamation");
        return;
      }
      prod = normalizeProducto(data);
    }
    currentProducto = prod;
    pintarProducto();
    productoSeleccionadoEl.classList.remove("hidden");
    await cargarStockProducto();
    productoSeleccionadoEl.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
}

function pintarProducto() {
  if (!currentProducto) return;
  const p = currentProducto;
  prodNombre.textContent = p.nombre || "—";
  prodId.textContent = p.id ?? "—";
  prodMarca.textContent = p.brand_nombre || "—";
  prodCategoria.textContent = p.categoria_principal_nombre || "—";

  const activo = Number(p.estado) === 1;

  // Pill
  if (prodEstadoPill) {
    prodEstadoPill.classList.remove("hidden", "pill-on", "pill-off");
    prodEstadoPill.classList.add(activo ? "pill-on" : "pill-off");
    prodEstadoPill.textContent = activo ? "Activo" : "Inactivo";
  }

  // Toggle
  if (toggleEstado) {
    toggleEstado.checked = activo;
  }
  if (toggleEstadoLabel) {
    toggleEstadoLabel.textContent = activo ? "Activo" : "Inactivo";
    toggleEstadoLabel.classList.toggle("text-success", activo);
    toggleEstadoLabel.classList.toggle("text-textMuted", !activo);
  }

  // Deshabilita botones de stock si el producto está inactivo
  [btnAddStock, btnRemoveStock, btnSetStock, btnMoveStock].forEach(b => {
    if (!b) return;
    b.disabled = !activo;
    b.classList.toggle("opacity-50", !activo);
    b.classList.toggle("cursor-not-allowed", !activo);
    b.title = activo ? "" : "Producto inactivo: activa el producto para gestionar su stock";
  });
}

async function cambiarEstadoProducto(nuevoEstado) {
  if (!currentProducto) return;
  const p = currentProducto;

  // Payload completo requerido por productos_update (todos los campos obligatorios)
  const payload = {
    producto_id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    precio: Number(p.precio || 0),
    categoria_principal_id: p.categoria_principal_id,
    categoria_secundaria_id: p._raw?.categoria_secundaria_id ?? null,
    subcategoria_id: p._raw?.subcategoria_id ?? null,
    unit_id: p.unit_id,
    unit_value: Number(p.unit_value ?? p._raw?.unit_value ?? 0),
    size_id: p.size_id,
    size_value: String(p.size_value ?? p._raw?.size_value ?? ""),
    brand_id: p.brand_id,
    estado: nuevoEstado ? 1 : 0
  };

  // Validación mínima antes de enviar
  const missing = ["nombre", "categoria_principal_id", "unit_id", "size_id", "brand_id"]
    .filter(k => payload[k] == null || payload[k] === "");
  if (missing.length) {
    throw new Error(`Faltan datos del producto: ${missing.join(", ")}. Edítalo desde Productos.`);
  }
  if (!payload.size_value) {
    throw new Error("El producto no tiene size_value. Edítalo desde Productos.");
  }

  assertOk(await productosAPI.update(payload));

  // Actualizamos estado local
  currentProducto.estado = payload.estado;
  pintarProducto();
}

toggleEstado?.addEventListener("change", async () => {
  if (!currentProducto) {
    toggleEstado.checked = false;
    return;
  }
  const nuevoEstado = toggleEstado.checked ? 1 : 0;
  const prevEstado = Number(currentProducto.estado);

  if (nuevoEstado === prevEstado) return;

  // Disable durante la operación
  toggleEstado.disabled = true;
  try {
    await cambiarEstadoProducto(nuevoEstado);
    await loadCatalogo();
    aplicarFiltros();
    showToast(
      nuevoEstado === 1 ? "Producto activado" : "Producto desactivado",
      "success",
      "fa-check-circle"
    );
  } catch (err) {
    // Revertir toggle en fallo
    toggleEstado.checked = prevEstado === 1;
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  } finally {
    toggleEstado.disabled = false;
  }
});

async function cargarStockProducto() {
  if (!currentProducto) return;
  const id = currentProducto.id;
  try {
    const resp = assertOk(await stockAPI.getByProducto(id));
    currentDetalles = toArrayData(resp);
    renderResumen();
    tablaStock = renderDataTable("#tablaStock", currentDetalles, columnsStock);
  } catch (err) {
    currentDetalles = [];
    renderResumen();
    tablaStock = renderDataTable("#tablaStock", [], columnsStock);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
}

function renderResumen() {
  const total = currentDetalles.reduce((acc, d) => acc + Number(d.stock || 0), 0);
  const cajasUnicas = new Set(currentDetalles.map(d => d.caja_id).filter(Boolean));
  stockTotalEl.textContent = total;
  stockCajasCountEl.textContent = cajasUnicas.size || currentDetalles.length;
  stockDetallesCountEl.textContent = currentDetalles.length;
}

/* =========================
   Refresco de catálogo + tabla tras mutaciones
   ========================= */
async function refrescarTodo() {
  await loadCatalogo();
  aplicarFiltros();
  if (currentProducto) {
    // Actualizamos referencia desde el catálogo recargado
    const updated = productosAll.find(p => p.id === currentProducto.id);
    if (updated) {
      currentProducto = updated;
      pintarProducto();
    }
    await cargarStockProducto();
  }
}

/* =========================
   Eventos: búsqueda y filtros
   ========================= */
btnBuscar?.addEventListener("click", aplicarFiltros);
inputBuscar?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    aplicarFiltros();
  }
});
[filterCategoria, filterMarca, filterUnidad, filterTamano].forEach(s => {
  s?.addEventListener("change", aplicarFiltros);
});

btnLimpiarFiltros?.addEventListener("click", () => {
  inputBuscar.value = "";
  tipoBusqueda.value = "id";
  filterCategoria.value = "";
  filterMarca.value = "";
  filterUnidad.value = "";
  filterTamano.value = "";
  aplicarFiltros();
});

btnRefrescarCatalogo?.addEventListener("click", async () => {
  await loadCatalogo();
  aplicarFiltros();
  showToast("Catálogo actualizado", "success", "fa-check-circle");
});

// Delegación: botón "Gestionar" en la tabla de búsqueda
$(document).on("click", "#tablaBusqueda tbody .js-seleccionar", function () {
  const id = Number(this.dataset.id);
  if (!id) return;
  seleccionarProductoPorId(id);
});

/* =========================
   Refrescar stock del producto seleccionado
   ========================= */
btnRefrescarStock?.addEventListener("click", async () => {
  if (!currentProducto) return;
  await cargarStockProducto();
  showToast("Stock actualizado", "success", "fa-check-circle");
});

/* =========================
   Acciones: AGREGAR
   ========================= */
btnAddStock?.addEventListener("click", () => {
  if (!currentProducto) {
    showToast("Selecciona primero un producto.", "info", "fa-info-circle");
    return;
  }
  if (Number(currentProducto.estado) !== 1) {
    showToast("El producto está inactivo. Actívalo antes de modificar su stock.", "error", "fa-circle-exclamation");
    return;
  }
  fillCajaSelect(document.getElementById("addCajaSelect"));
  document.getElementById("addDelta").value = "";
  openModal("modalAddStock");
});

document.getElementById("formAddStock")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const caja_id = Number(document.getElementById("addCajaSelect").value);
    const delta = Number(document.getElementById("addDelta").value);
    if (!caja_id) throw new Error("Selecciona una caja");
    if (!Number.isInteger(delta) || delta <= 0) throw new Error("Cantidad debe ser un entero > 0");

    assertOk(await stockAPI.add({ caja_id, producto_id: currentProducto.id, delta }));
    closeModal("modalAddStock");
    await refrescarTodo();
    showToast("Stock agregado correctamente", "success", "fa-check-circle");
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Acciones: RETIRAR
   ========================= */
btnRemoveStock?.addEventListener("click", () => {
  if (!currentProducto) {
    showToast("Selecciona primero un producto.", "info", "fa-info-circle");
    return;
  }
  if (Number(currentProducto.estado) !== 1) {
    showToast("El producto está inactivo. Actívalo antes de modificar su stock.", "error", "fa-circle-exclamation");
    return;
  }
  const select = document.getElementById("removeCajaSelect");
  select.innerHTML = '<option value="">Seleccione una caja…</option>';
  currentDetalles.filter(d => Number(d.stock) > 0 && d.caja_id).forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.caja_id;
    opt.textContent = `#${d.caja_id} — ${d.etiqueta || "Caja"} (disp: ${d.stock})`;
    select.appendChild(opt);
  });
  document.getElementById("removeDelta").value = "";
  openModal("modalRemoveStock");
});

document.getElementById("formRemoveStock")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const caja_id = Number(document.getElementById("removeCajaSelect").value);
    const delta = Number(document.getElementById("removeDelta").value);
    if (!caja_id) throw new Error("Selecciona una caja");
    if (!Number.isInteger(delta) || delta <= 0) throw new Error("Cantidad debe ser un entero > 0");

    assertOk(await stockAPI.remove({ caja_id, producto_id: currentProducto.id, delta }));
    closeModal("modalRemoveStock");
    await refrescarTodo();
    showToast("Stock retirado correctamente", "success", "fa-check-circle");
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Acciones: AJUSTAR (set_by_detalle)
   ========================= */
btnSetStock?.addEventListener("click", () => {
  if (!currentProducto) {
    showToast("Selecciona primero un producto.", "info", "fa-info-circle");
    return;
  }
  if (Number(currentProducto.estado) !== 1) {
    showToast("El producto está inactivo. Actívalo antes de modificar su stock.", "error", "fa-circle-exclamation");
    return;
  }
  if (!currentDetalles.length) {
    showToast("Este producto aún no tiene detalles en cajas.", "info", "fa-info-circle");
    return;
  }
  fillDetalleSelect(document.getElementById("setDetalleSelect"));
  document.getElementById("setStockValue").value = "";
  openModal("modalSetStock");
});

document.getElementById("formSetStock")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const detalle_id = Number(document.getElementById("setDetalleSelect").value);
    const stock = Number(document.getElementById("setStockValue").value);
    if (!detalle_id) throw new Error("Selecciona un detalle");
    if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock debe ser entero ≥ 0");

    assertOk(await stockAPI.setByDetalle({ detalle_id, producto_id: currentProducto.id, stock }));
    closeModal("modalSetStock");
    await refrescarTodo();
    showToast("Stock ajustado correctamente", "success", "fa-check-circle");
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Acciones: MOVER
   ========================= */
btnMoveStock?.addEventListener("click", () => {
  if (!currentProducto) {
    showToast("Selecciona primero un producto.", "info", "fa-info-circle");
    return;
  }
  if (Number(currentProducto.estado) !== 1) {
    showToast("El producto está inactivo. Actívalo antes de modificar su stock.", "error", "fa-circle-exclamation");
    return;
  }
  const origenSelect = document.getElementById("moveOrigenSelect");
  origenSelect.innerHTML = '<option value="">Seleccione una caja origen…</option>';
  currentDetalles.filter(d => Number(d.stock) > 0 && d.caja_id).forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.caja_id;
    opt.textContent = `#${d.caja_id} — ${d.etiqueta || "Caja"} (disp: ${d.stock})`;
    origenSelect.appendChild(opt);
  });
  fillCajaSelect(document.getElementById("moveDestinoSelect"));
  document.getElementById("moveDestinoSelect").firstChild.textContent = "Seleccione una caja destino…";
  document.getElementById("moveCantidad").value = "";
  openModal("modalMoveStock");
});

document.getElementById("formMoveStock")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const caja_origen = Number(document.getElementById("moveOrigenSelect").value);
    const caja_destino = Number(document.getElementById("moveDestinoSelect").value);
    const cantidad = Number(document.getElementById("moveCantidad").value);
    if (!caja_origen) throw new Error("Selecciona la caja origen");
    if (!caja_destino) throw new Error("Selecciona la caja destino");
    if (caja_origen === caja_destino) throw new Error("Origen y destino deben ser diferentes");
    if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Cantidad debe ser un entero > 0");

    assertOk(await stockAPI.move({ producto_id: currentProducto.id, caja_origen, caja_destino, cantidad }));
    closeModal("modalMoveStock");
    await refrescarTodo();
    showToast("Stock movido correctamente", "success", "fa-check-circle");
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Inicialización
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Tablas vacías
  tablaBusqueda = renderDataTable("#tablaBusqueda", [], columnsBusqueda);
  tablaStock = renderDataTable("#tablaStock", [], columnsStock);

  await Promise.all([loadCatalogo(), loadCajas(), loadFiltros()]);
  aplicarFiltros();

  // Si la URL trae ?id= , preseleccionamos el producto
  const params = new URLSearchParams(window.location.search);
  const preId = Number(params.get("id"));
  if (Number.isInteger(preId) && preId > 0) {
    await seleccionarProductoPorId(preId);
  }

  showToast(`Catálogo cargado: ${productosAll.length} productos`, "success", "fa-check-circle");
});

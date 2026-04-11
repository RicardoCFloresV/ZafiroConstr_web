// Control de panel: Stock
import { stockAPI } from "/admin-resources/scripts/api/stockManager.js";
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";
import { cajasAPI } from "/admin-resources/scripts/api/cajasManager.js";

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
let currentProducto = null;     // producto seleccionado
let currentDetalles = [];       // detalles (caja+stock) del producto
let cajasList = [];             // lista de todas las cajas

let tablaBusqueda = null;
let tablaStock = null;

/* =========================
   Referencias DOM
   ========================= */
const inputBuscar = document.getElementById("inputBuscar");
const tipoBusqueda = document.getElementById("tipoBusqueda");
const btnBuscar = document.getElementById("btnBuscar");

const resultadosBusqueda = document.getElementById("resultadosBusqueda");
const productoSeleccionadoEl = document.getElementById("productoSeleccionado");

const prodNombre = document.getElementById("prodNombre");
const prodId = document.getElementById("prodId");
const prodMarca = document.getElementById("prodMarca");
const prodCategoria = document.getElementById("prodCategoria");

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
  "emptyTable": "No hay datos disponibles en la tabla",
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

const columnsBusqueda = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { data: "brand_nombre", title: "Marca", defaultContent: "—" },
  { data: "categoria_principal_nombre", title: "Categoría", defaultContent: "—" },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<button class="btn-row primary js-seleccionar" data-id="${row.id}" title="Seleccionar">
         <i class="fa-solid fa-check"></i> Seleccionar
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
   Carga de cajas para selects
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
  // Intentamos varios nombres comunes
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
    const resp = assertOk(await productosAPI.getById(id));
    const data = unwrapOne(resp);
    if (!data) {
      showToast("Producto no encontrado", "error", "fa-circle-exclamation");
      return;
    }
    currentProducto = data;
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
  const id = p.producto_id ?? p.id ?? "—";
  prodNombre.textContent = p.nombre || "—";
  prodId.textContent = id;
  prodMarca.textContent = p.brand_nombre || p.marca || "—";
  prodCategoria.textContent = p.categoria_principal_nombre || p.categoria || "—";
}

async function cargarStockProducto() {
  if (!currentProducto) return;
  const id = currentProducto.producto_id ?? currentProducto.id;
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
   Búsqueda
   ========================= */
btnBuscar?.addEventListener("click", async () => {
  const valor = inputBuscar?.value.trim();
  const tipo = tipoBusqueda?.value;
  if (!valor) {
    showToast("Ingresa un valor para buscar.", "error", "fa-circle-exclamation");
    return;
  }

  try {
    if (tipo === "id") {
      const id = Number(valor);
      if (!Number.isInteger(id) || id <= 0) {
        showToast("Ingresa un ID válido (entero positivo).", "error", "fa-circle-exclamation");
        return;
      }
      resultadosBusqueda.classList.add("hidden");
      await seleccionarProductoPorId(id);
    } else {
      const resp = assertOk(await productosAPI.getByNombre(valor));
      const items = toArrayData(resp).map(r => ({
        id: r.producto_id ?? r.id,
        nombre: r.nombre,
        brand_nombre: r.brand_nombre || "—",
        categoria_principal_nombre: r.categoria_principal_nombre || "—"
      })).filter(x => x.id);

      resultadosBusqueda.classList.remove("hidden");
      tablaBusqueda = renderDataTable("#tablaBusqueda", items, columnsBusqueda);

      if (items.length === 0) {
        showToast("No se encontraron productos.", "info", "fa-info-circle");
      } else if (items.length === 1) {
        await seleccionarProductoPorId(items[0].id);
      } else {
        showToast(`Se encontraron ${items.length} productos`, "success", "fa-check-circle");
      }
    }
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

inputBuscar?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnBuscar.click();
  }
});

// Delegación: botón "Seleccionar" en la tabla de búsqueda
$(document).on("click", "#tablaBusqueda tbody .js-seleccionar", function () {
  const id = Number(this.dataset.id);
  if (!id) return;
  seleccionarProductoPorId(id);
});

/* =========================
   Refrescar stock
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

    const id = currentProducto.producto_id ?? currentProducto.id;
    assertOk(await stockAPI.add({ caja_id, producto_id: id, delta }));
    closeModal("modalAddStock");
    await cargarStockProducto();
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
  // En remove, solo cajas con stock para este producto
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

    const id = currentProducto.producto_id ?? currentProducto.id;
    assertOk(await stockAPI.remove({ caja_id, producto_id: id, delta }));
    closeModal("modalRemoveStock");
    await cargarStockProducto();
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

    const id = currentProducto.producto_id ?? currentProducto.id;
    assertOk(await stockAPI.setByDetalle({ detalle_id, producto_id: id, stock }));
    closeModal("modalSetStock");
    await cargarStockProducto();
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
  // Origen: cajas con stock
  const origenSelect = document.getElementById("moveOrigenSelect");
  origenSelect.innerHTML = '<option value="">Seleccione una caja origen…</option>';
  currentDetalles.filter(d => Number(d.stock) > 0 && d.caja_id).forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.caja_id;
    opt.textContent = `#${d.caja_id} — ${d.etiqueta || "Caja"} (disp: ${d.stock})`;
    origenSelect.appendChild(opt);
  });
  // Destino: todas las cajas
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

    const id = currentProducto.producto_id ?? currentProducto.id;
    assertOk(await stockAPI.move({ producto_id: id, caja_origen, caja_destino, cantidad }));
    closeModal("modalMoveStock");
    await cargarStockProducto();
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

  await loadCajas();

  // Si la URL trae ?id= , preseleccionamos el producto
  const params = new URLSearchParams(window.location.search);
  const preId = Number(params.get("id"));
  if (Number.isInteger(preId) && preId > 0) {
    await seleccionarProductoPorId(preId);
  } else {
    showToast("Busca un producto por ID o nombre para gestionar su stock.", "info", "fa-info-circle");
  }
});

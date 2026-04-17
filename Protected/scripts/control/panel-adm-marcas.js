// Control de panel: Marcas - CRUD con DataTables, jQuery, modales y toasts
import { marcasAPI } from "/admin-resources/scripts/api/marcasManager.js";

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
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(4px)"; setTimeout(() => el.remove(), 180); }, timeout);
}
function friendlyError(err) {
  const msg = (err && err.message) ? String(err.message) : "";
  const isNet =
    (err && err.name === "TypeError" && /fetch/i.test(msg)) ||
    /Failed to fetch|NetworkError|ERR_NETWORK|ERR_CONNECTION|The network connection was lost/i.test(msg) ||
    (typeof navigator !== "undefined" && navigator.onLine === false);
  return msg || (isNet ? "No hay conexión con el servidor" : "No hay conexión con el servidor");
}

/* =========================
   Utilidades de datos
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

function normalizeItem(row) {
  if (!row || typeof row !== "object") return null;
  
  const id = row.brand_id ?? row.id;
  const nombre = row.nombre ?? row.Nombre;
  
  if (id == null || nombre == null) return null;
  
  return {
    id: Number(id),
    nombre: String(nombre)
  };
}

function mapItems(listish) { 
  return toArrayData(listish).map(normalizeItem).filter(Boolean); 
}

let tablaGeneral = null;
let tablaPorId = null;

function renderDataTable(selector, data, columns) {
  const table = $(selector);
  
  if ($.fn.DataTable.isDataTable(selector)) {
    const dataTable = table.DataTable();
    dataTable.clear();
    if (data && data.length > 0) {
      dataTable.rows.add(data).draw();
    } else {
      dataTable.draw();
    }
    return dataTable;
  }
  
  return table.DataTable({ 
    data: data || [],
    columns, 
    pageLength: 10, 
    autoWidth: false,
    language: {
      "decimal":        "",
      "emptyTable":     "No hay datos disponibles en la tabla",
      "info":           "Mostrando _START_ a _END_ de _TOTAL_ registros",
      "infoEmpty":      "Mostrando 0 a 0 de 0 registros",
      "infoFiltered":   "(filtrado de _MAX_ registros totales)",
      "infoPostFix":    "",
      "thousands":      ",",
      "lengthMenu":     "Mostrar _MENU_ registros",
      "loadingRecords": "Cargando...",
      "processing":     "Procesando...",
      "search":         "Buscar:",
      "zeroRecords":    "No se encontraron registros coincidentes",
      "paginate": {
        "first":      "Primero",
        "last":       "Último",
        "next":       "Siguiente",
        "previous":   "Anterior"
      },
      "aria": {
        "sortAscending":  ": activar para ordenar la columna ascendente",
        "sortDescending": ": activar para ordenar la columna descendente"
      }
    }
  });
}

function logPaso(boton, api, respuesta) {
  console.log(`se preciono el boton "${boton}" y se llamo a la api "${api}"`);
  if (respuesta !== undefined) console.log("respuesta :", respuesta);
}
function logError(boton, api, error) {
  console.log(`se preciono el boton "${boton}" y se llamo a la api "${api}"`);
  console.error("respuesta :", error?.message || error);
}

/* =========================
   Referencias DOM
   ========================= */
const inputBuscarId = document.getElementById("inputBuscarId");
const btnBuscarId   = document.getElementById("btnBuscarId");
const btnRefrescar  = document.getElementById("btnRefrescar");
const btnAbrirAgregar = document.getElementById("btnAbrirAgregar");

// Modal
const modalEl   = document.getElementById("modalEdit");
const modalTit  = document.getElementById("modalTitle");
const formEl    = document.getElementById("editForm");
const hidId     = document.getElementById("hidId");
const nombreInput = document.getElementById("nombre");
const btnClose  = document.getElementById("closeModalBtn");
const btnCancel = document.getElementById("cancelModalBtn");
const saveBtn   = document.getElementById("saveBtn");

// Modal confirmación de eliminación
const modalDeleteEl = document.getElementById("modalConfirmDelete");
const btnCloseDel   = document.getElementById("closeDeleteModalBtn");
const btnCancelDel  = document.getElementById("cancelDeleteBtn");
const btnConfirmDel = document.getElementById("confirmDeleteBtn");
const deleteMsg     = document.getElementById("deleteMessage");

const mainEl = document.querySelector("main");

/* =========================
   Modales accesibles
   ========================= */
let currentMode = "create";
let deleteTarget = null;

function openModal(mode = "create", data = null) {
  currentMode = mode;
  
  modalTit.textContent = mode === "create" 
    ? "Nueva Marca" 
    : "Modificar Marca";

  if (mode === "create") {
    hidId.value = "";
    formEl.reset();
  } else if (data) {
    hidId.value = data.id ?? "";
    nombreInput.value = data.nombre || "";
  }

  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
  mainEl?.setAttribute("inert", "");
  setTimeout(() => nombreInput?.focus(), 0);
}

function closeModal() {
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
  mainEl?.removeAttribute("inert");
}

function openDeleteModal(item) {
  deleteTarget = item;
  deleteMsg.textContent = `¿Seguro que deseas eliminar la marca ${item.id} — "${item.nombre}"?`;
  modalDeleteEl.classList.add("show");
  modalDeleteEl.setAttribute("aria-hidden", "false");
  mainEl?.setAttribute("inert", "");
  setTimeout(() => btnConfirmDel?.focus(), 0);
}

function closeDeleteModal() {
  modalDeleteEl.classList.remove("show");
  modalDeleteEl.setAttribute("aria-hidden", "true");
  mainEl?.removeAttribute("inert");
  deleteTarget = null;
}

// Cerrar modales por click fuera / botones / Escape
modalEl?.addEventListener("click", (e) => { if (e.target === modalEl) closeModal(); });
btnClose?.addEventListener("click", closeModal);
btnCancel?.addEventListener("click", closeModal);
modalDeleteEl?.addEventListener("click", (e) => { if (e.target === modalDeleteEl) closeDeleteModal(); });
btnCloseDel?.addEventListener("click", closeDeleteModal);
btnCancelDel?.addEventListener("click", closeDeleteModal);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalEl.classList.contains("show")) closeModal();
  if (e.key === "Escape" && modalDeleteEl.classList.contains("show")) closeDeleteModal();
});

/* =========================
   Columnas DataTable
   ========================= */
const columnsGeneral = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<div class="btn-group">
         <button class="btn btn-warning js-modificar" data-id="${row.id}" data-nombre="${row.nombre}">
           <i class="fa-solid fa-pen-to-square"></i> Modificar
         </button>
         <button class="btn btn-danger js-eliminar" data-id="${row.id}" data-nombre="${row.nombre}">
           <i class="fa-solid fa-trash-can"></i> Eliminar
         </button>
       </div>`
  }
];

const columnsPorId = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" }
];

/* =========================
   Cargar datos
   ========================= */
async function cargarTabla() {
  try {
    const resp = assertOk(await marcasAPI.getAll());
    const data = mapItems(resp);
    tablaGeneral = renderDataTable("#tablaGeneral", data, columnsGeneral);
    logPaso("Refrescar", "/get_all", resp);
    showToast(`Se cargaron ${data.length} marcas`, "success", "fa-check-circle");
  } catch (err) {
    logError("Refrescar", "/get_all", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaGeneral = renderDataTable("#tablaGeneral", [], columnsGeneral);
  }
}

/* =========================
   Agregar (insert)
   ========================= */
btnAbrirAgregar?.addEventListener("click", () => openModal("create"));

/* =========================
   Modificar & Eliminar
   ========================= */
// Delegación en tabla: Modificar
$(document).on("click", "#tablaGeneral tbody .js-modificar", async function() {
  const id = Number(this.dataset.id);
  if (!id) return;
  try {
    const resp = assertOk(await marcasAPI.getById(id));
    const item = mapItems(resp)[0] || null;
    if (item) openModal("edit", item);
  } catch (err) {
    logError("Modificar (tabla)", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

// Delegación en tabla: Eliminar
$(document).on("click", "#tablaGeneral tbody .js-eliminar", function() {
  const id = Number(this.dataset.id);
  const nombre = String(this.dataset.nombre || "");
  if (!id) return;
  openDeleteModal({ id, nombre });
});

// Confirmar eliminación
btnConfirmDel?.addEventListener("click", async () => {
  if (!deleteTarget) return;
  const { id } = deleteTarget;
  try {
    const resp = assertOk(await marcasAPI.remove(id));
    logPaso("Confirmar eliminar", "/delete", resp);
    closeDeleteModal();
    await cargarTabla();
    limpiarTablaPorIdSiCoincide(id);
    showToast("Marca eliminada correctamente", "success", "fa-check-circle");
  } catch (err) {
    logError("Confirmar eliminar", "/delete", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Validación
   ========================= */
function validateItem({ id, nombre }, mode) {
  if (mode === "edit") {
    if (!Number.isInteger(Number(id))) throw new Error("ID inválido");
  }
  
  if (!nombre || nombre.trim().length === 0) throw new Error("El nombre es obligatorio");
  if (nombre.length > 50) throw new Error("El nombre no puede tener más de 50 caracteres");
  
  return { 
    id: id ? Number(id) : undefined, 
    nombre: nombre.trim()
  };
}

/* =========================
   Guardar (insert/update)
   ========================= */
formEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = {
      marca_id: hidId.value ? Number(hidId.value) : undefined,
      nombre: nombreInput.value
    };

    // EDITAR
    if (currentMode === "edit" && payload.marca_id) {
      const resp = assertOk(await marcasAPI.update(payload));
      logPaso("Guardar cambios (update)", "/update", resp);
      showToast("Marca actualizada correctamente", "success", "fa-check-circle");
    } else {
    // INSERTAR
      const { marca_id, ...createData } = payload;
      const resp = assertOk(await marcasAPI.insert(createData));
      logPaso("Agregar (insert)", "/insert", resp);
      showToast("Marca creada correctamente", "success", "fa-check-circle");
    }

    closeModal();
    formEl.reset();
    await cargarTabla();
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Búsqueda por ID (get_by_id)
   ========================= */
function limpiarTablaPorIdSiCoincide(id) {
  if (tablaPorId) {
    const rows = tablaPorId.rows().data().toArray();
    if (rows.length && Number(rows[0]?.id) === Number(id)) {
      tablaPorId.clear().draw();
    }
  }
}

btnBuscarId?.addEventListener("click", async () => {
  const raw = inputBuscarId?.value;
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    showToast("Ingresa un ID válido (entero positivo).", "error", "fa-circle-exclamation");
    return;
  }
  try {
    const resp = assertOk(await marcasAPI.getById(id));
    const item = mapItems(resp)[0] || null;
    if (item) {
      tablaPorId = renderDataTable("#tablaPorId", [item], columnsPorId);
      showToast(`Marca encontrada: ${item.nombre}`, "success", "fa-check-circle");
    } else {
      showToast("No se encontró ninguna marca con ese ID.", "info", "fa-info-circle");
      tablaPorId = renderDataTable("#tablaPorId", [], columnsPorId);
    }
    logPaso("Obtener por ID", `/por_id/${id}`, resp);
  } catch (err) {
    logError("Obtener por ID", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaPorId = renderDataTable("#tablaPorId", [], columnsPorId);
  }
});

/* =========================
   Refrescar tabla
   ========================= */
btnRefrescar?.addEventListener("click", async () => {
  await cargarTabla();
});

/* =========================
   Inicialización
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  // Inicializar tablas vacías
  tablaGeneral = renderDataTable("#tablaGeneral", [], columnsGeneral);
  tablaPorId = renderDataTable("#tablaPorId", [], columnsPorId);
  
  showToast("Panel de marcas listo. Presiona 'Refrescar' para cargar los datos.", "info", "fa-info-circle");
});
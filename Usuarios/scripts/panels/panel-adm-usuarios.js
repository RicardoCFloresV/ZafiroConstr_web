// Control de panel: Usuarios - CRUD con DataTables, jQuery, modales y toasts
import { usuariosAPI } from "/user-resources/scripts/apis/usuariosManager.js";

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
function normalizeUsuario(row) {
  if (!row || typeof row !== "object") return null;
  const id   = row.usuario_id ?? row.id ?? row.usuarioId;
  const nom  = row.nombre ?? row.name ?? row.Nombre;
  const mail = row.email ?? row.Email;
  const tipo = row.tipo ?? row.Tipo ?? "";
  if (id == null || nom == null || mail == null) return null;
  return {
    usuario_id: Number(id),
    nombre: String(nom),
    email: String(mail),
    tipo: String(tipo || "")
  };
}
function mapUsuarios(listish) { return toArrayData(listish).map(normalizeUsuario).filter(Boolean); }

function renderDataTable(selector, data, columns) {
  if ($.fn.DataTable.isDataTable(selector)) $(selector).DataTable().clear().destroy();
  return $(selector).DataTable({ data, columns, pageLength: 10, autoWidth: false });
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
// Búsqueda por ID
const inputBuscarId = document.getElementById("inputBuscarId");
const btnBuscarId   = document.getElementById("btnBuscarId");

// Tabla general
const btnRefrescar    = document.getElementById("btnRefrescar");
const btnAbrirAgregar = document.getElementById("btnAbrirAgregar");

// Modal de alta / edición
const modalEl   = document.getElementById("modalUsuario");
const modalTit  = document.getElementById("modalUsuarioTitle");
const formEl    = document.getElementById("usuarioForm");
const hidId     = document.getElementById("usuario_id");
const inpNombre = document.getElementById("nombre");
const inpEmail  = document.getElementById("email");
const grpPass   = document.getElementById("grupoContrasena");
const inpPass   = document.getElementById("contrasena");
const inpTipo   = document.getElementById("tipo");
const btnClose  = document.getElementById("closeModalBtn");
const btnCancel = document.getElementById("cancelModalBtn");

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
  modalTit.textContent = mode === "create" ? "Nuevo Usuario" : "Modificar Usuario";

  if (mode === "create") {
    hidId.value = "";
    formEl.reset();
    grpPass.style.display = "";
  } else if (data) {
    hidId.value     = data.usuario_id ?? "";
    inpNombre.value = data.nombre ?? "";
    inpEmail.value  = data.email ?? "";
    inpTipo.value   = data.tipo ?? "";
    if (inpPass) inpPass.value = "";
    grpPass.style.display = "none"; // contraseña solo al crear
  }

  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
  mainEl?.setAttribute("inert", "");
  setTimeout(() => inpNombre?.focus(), 0);
}
function closeModal() {
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
  mainEl?.removeAttribute("inert");
}

function openDeleteModal(item) {
  deleteTarget = item;
  deleteMsg.textContent = `¿Seguro que deseas eliminar el usuario ${item.usuario_id} — “${item.email}”?`;
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
  { data: "usuario_id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { data: "email", title: "Email" },
  { data: "tipo", title: "Tipo" },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<div class="btn-group">
         <button class="btn btn-warning js-modificar" data-id="${row.usuario_id}">
           <i class="fa-solid fa-pen-to-square"></i> Modificar
         </button>
         <button class="btn btn-danger js-eliminar" data-id="${row.usuario_id}" data-email="${row.email}" data-nombre="${row.nombre}">
           <i class="fa-solid fa-trash-can"></i> Eliminar
         </button>
       </div>`
  }
];

const columnsSoloDatos = [
  { data: "usuario_id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { data: "email", title: "Email" },
  { data: "tipo", title: "Tipo" }
];

/* =========================
   Listado general (get_all)
   ========================= */
async function cargarTabla() {
  try {
    const resp = assertOk(await usuariosAPI.getAll());
    const data = mapUsuarios(resp);
    renderDataTable("#tablaUsuarios", data, columnsGeneral);
    logPaso("Refrescar", "/get_all", resp);
  } catch (err) {
    logError("Refrescar", "/get_all", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    renderDataTable("#tablaUsuarios", [], columnsGeneral);
  }
}
btnRefrescar?.addEventListener("click", cargarTabla);

/* =========================
   Agregar (insert)
   ========================= */
btnAbrirAgregar?.addEventListener("click", () => openModal("create"));

/* =========================
   Modificar & Eliminar
   ========================= */
// Delegación en tabla: Modificar
$(document).on("click", "#tablaUsuarios tbody .js-modificar", async function() {
  const id = Number(this.dataset.id);
  if (!id) return;
  try {
    const resp = assertOk(await usuariosAPI.getById(id));
    const item = mapUsuarios(resp)[0] || null;
    if (item) openModal("edit", item);
  } catch (err) {
    logError("Modificar (tabla)", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

// Delegación en tabla: Eliminar
$(document).on("click", "#tablaUsuarios tbody .js-eliminar", function() {
  const id = Number(this.dataset.id);
  const email = String(this.dataset.email || "");
  const nombre = String(this.dataset.nombre || "");
  if (!id) return;
  openDeleteModal({ usuario_id: id, email, nombre });
});

// Confirmar eliminación
btnConfirmDel?.addEventListener("click", async () => {
  if (!deleteTarget) return;
  const { usuario_id } = deleteTarget;
  try {
    const resp = assertOk(await usuariosAPI.remove(usuario_id));
    logPaso("Confirmar eliminar", "/delete", resp);
    closeDeleteModal();
    await cargarTabla();
    limpiarTablaPorIdSiCoincide(usuario_id);
    showToast("Operación completada", "success", "fa-check-circle");
  } catch (err) {
    logError("Confirmar eliminar", "/delete", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Validación
   ========================= */
function validateUsuario({ usuario_id, nombre, email, contrasena, tipo }, mode) {
  if (mode === "edit") {
    if (!Number.isInteger(Number(usuario_id))) throw new Error("usuario_id inválido");
  }
  const n = String((nombre ?? "")).trim();
  if (n.length < 2 || n.length > 100) throw new Error("El nombre debe tener entre 2 y 100 caracteres");
  if (!/^[\p{L}0-9 .&\-]{2,100}$/u.test(n)) throw new Error("El nombre contiene caracteres inválidos");

  const e = String((email ?? "")).trim();
  if (!/^([^\s@]+)@([^\s@]+)\.[^\s@]+$/.test(e)) throw new Error("email inválido");

  const t = String((tipo ?? "")).trim();
  if (t && !["Usuario", "Admin"].includes(t)) {
    throw new Error("tipo inválido: solo se permite 'Usuario' o 'Admin'");
  }

  const c = String((contrasena ?? "")).trim();
  if (mode === "create" && !c) throw new Error("contrasena es requerida");
  if (c && c.length > 255) throw new Error("contrasena no puede exceder 255 caracteres");

  const payload = { nombre: n, email: e, tipo: t || undefined };
  if (mode === "create") payload.contrasena = c;
  if (mode === "edit") payload.usuario_id = Number(usuario_id);
  return payload;
}

/* =========================
   Guardar (insert/update)
   ========================= */
formEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = validateUsuario({
      usuario_id: hidId.value ? Number(hidId.value) : undefined,
      nombre: inpNombre.value,
      email: inpEmail.value,
      contrasena: inpPass.value,
      tipo: inpTipo.value
    }, currentMode);

    if (currentMode === "edit" && payload.usuario_id) {
      const resp = assertOk(await usuariosAPI.update(payload));
      logPaso("Guardar cambios (update)", "/update", resp);
      showToast("Operación completada", "success", "fa-check-circle");
    } else {
      const resp = assertOk(await usuariosAPI.insert(payload));
      logPaso("Agregar (insert)", "/insert", resp);
      showToast("Operación completada", "success", "fa-check-circle");
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
  const dt = $("#tablaUsuarioPorId").DataTable();
  const rows = dt ? dt.rows().data().toArray() : [];
  if (rows.length && Number(rows[0]?.usuario_id) === Number(id)) {
    renderDataTable("#tablaUsuarioPorId", [], columnsSoloDatos);
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
    const resp = assertOk(await usuariosAPI.getById(id));
    const item = mapUsuarios(resp)[0] || null;
    if (item) {
      renderDataTable("#tablaUsuarioPorId", [item], columnsSoloDatos);
    } else {
      renderDataTable("#tablaUsuarioPorId", [], columnsSoloDatos);
    }
    logPaso("Obtener por ID", `/por_id/${id}`, resp);
  } catch (err) {
    logError("Obtener por ID", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    renderDataTable("#tablaUsuarioPorId", [], columnsSoloDatos);
  }
});

/* =========================
   Inicialización
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  renderDataTable("#tablaUsuarios", [], columnsGeneral);
  renderDataTable("#tablaUsuarioPorId", [], columnsSoloDatos);
  cargarTabla();
});

// Control de panel: Cajas - CRUD con DataTables, jQuery, modales y toasts
import { cajasAPI } from "/admin-resources/scripts/api/cajasManager.js";

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
function normalizeCaja(row) {
  if (!row || typeof row !== "object") return null;
  const id  = row.caja_id ?? row.id ?? row.cajaId;
  const letra = row.letra ?? row.Letra;
  const cara = row.cara ?? row.Cara;
  const nivel = row.nivel ?? row.Nivel;
  const etiqueta = row.etiqueta ?? row.Etiqueta;
  
  if (id == null || letra == null || cara == null || nivel == null) return null;
  return {
    caja_id: Number(id),
    letra: String(letra),
    cara: Number(cara),
    nivel: Number(nivel),
    etiqueta: etiqueta ? String(etiqueta) : `Caja ${letra} ${cara === 1 ? 'FRENTE' : 'ATRAS'} ${nivel === 1 ? 'ARRIBA' : 'ABAJO'}`
  };
}
function mapCajas(listish) { return toArrayData(listish).map(normalizeCaja).filter(Boolean); }

let tablaCajas = null;
let tablaCajaPorId = null;

function renderDataTable(selector, data, columns) {
  const table = $(selector);
  
  // Verificar si la tabla ya está inicializada
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
  
  // Si no está inicializada, crear una nueva
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
// Búsqueda por ID
const inputBuscarId = document.getElementById("inputBuscarId");
const btnBuscarId   = document.getElementById("btnBuscarId");

// Búsqueda por componentes
const searchForm = document.getElementById("searchForm");
const letra1Select = document.getElementById("letra1");
const letra2Select = document.getElementById("letra2");
const caraSelect = document.getElementById("cara");
const nivelSelect = document.getElementById("nivel");
const btnLimpiarBusqueda = document.getElementById("btnLimpiarBusqueda");

// Tabla general
const btnRefrescar    = document.getElementById("btnRefrescar");
const btnAbrirAgregar = document.getElementById("btnAbrirAgregar");
const btnCargarTodos  = document.getElementById("btnCargarTodos");

// Modal de alta / edición
const modalEl   = document.getElementById("modalCaja");
const modalTit  = document.getElementById("modalCajaTitle");
const formEl    = document.getElementById("cajaForm");
const hidId     = document.getElementById("caja_id");
const modalLetra1 = document.getElementById("modalLetra1");
const modalLetra2 = document.getElementById("modalLetra2");
const modalCara = document.getElementById("modalCara");
const modalNivel = document.getElementById("modalNivel");
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
   Inicialización de selects
   ========================= */
function inicializarSelects() {
  // Llenar selects de letras (A-Z)
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  
  // Selects de búsqueda
  letras.forEach(letra => {
    letra1Select.appendChild(new Option(letra, letra));
    letra2Select.appendChild(new Option(letra, letra));
  });
  
  // Selects del modal
  letras.forEach(letra => {
    modalLetra1.appendChild(new Option(letra, letra));
    modalLetra2.appendChild(new Option(letra, letra));
  });
}

/* =========================
   Modales accesibles
   ========================= */
let currentMode = "create";
let deleteTarget = null;

function openModal(mode = "create", data = null) {
  currentMode = mode;
  modalTit.textContent = mode === "create" ? "Nueva Caja" : "Modificar Caja";

  if (mode === "create") {
    hidId.value = "";
    formEl.reset();
  } else if (data) {
    hidId.value = data.caja_id ?? "";
    
    // Separar letra en dos partes si es necesario
    const letra = data.letra || "";
    if (letra.length === 2) {
      modalLetra1.value = letra[0];
      modalLetra2.value = letra[1];
    } else if (letra.length === 1) {
      modalLetra1.value = letra;
      modalLetra2.value = "";
    }
    
    modalCara.value = data.cara || "";
    modalNivel.value = data.nivel || "";
  }

  modalEl.classList.add("show");
  modalEl.setAttribute("aria-hidden", "false");
  mainEl?.setAttribute("inert", "");
  setTimeout(() => modalLetra1?.focus(), 0);
}
function closeModal() {
  modalEl.classList.remove("show");
  modalEl.setAttribute("aria-hidden", "true");
  mainEl?.removeAttribute("inert");
}

function openDeleteModal(item) {
  deleteTarget = item;
  deleteMsg.textContent = `¿Seguro que deseas eliminar la caja ${item.caja_id} — "${item.etiqueta}"?`;
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
  { data: "caja_id", title: "ID" },
  { data: "letra", title: "Letra" },
  { 
    data: "cara", 
    title: "Cara",
    render: function(data) {
      return data === 1 ? "Frente" : "Atrás";
    }
  },
  { 
    data: "nivel", 
    title: "Nivel",
    render: function(data) {
      return data === 1 ? "Arriba" : "Abajo";
    }
  },
  { data: "etiqueta", title: "Etiqueta" },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<div class="btn-group">
         <button class="btn btn-warning js-modificar" data-id="${row.caja_id}">
           <i class="fa-solid fa-pen-to-square"></i> Modificar
         </button>
         <button class="btn btn-danger js-eliminar" data-id="${row.caja_id}" data-etiqueta="${row.etiqueta}">
           <i class="fa-solid fa-trash-can"></i> Eliminar
         </button>
       </div>`
  }
];

const columnsSoloDatos = [
  { data: "caja_id", title: "ID" },
  { data: "letra", title: "Letra" },
  { 
    data: "cara", 
    title: "Cara",
    render: function(data) {
      return data === 1 ? "Frente" : "Atrás";
    }
  },
  { 
    data: "nivel", 
    title: "Nivel",
    render: function(data) {
      return data === 1 ? "Arriba" : "Abajo";
    }
  },
  { data: "etiqueta", title: "Etiqueta" }
];

/* =========================
   Listado general (get_all)
   ========================= */
async function cargarTabla() {
  try {
    const resp = assertOk(await cajasAPI.getAll());
    const data = mapCajas(resp);
    tablaCajas = renderDataTable("#tablaCajas", data, columnsGeneral);
    logPaso("Refrescar", "/get_all", resp);
    showToast(`Se cargaron ${data.length} cajas`, "success", "fa-check-circle");
  } catch (err) {
    logError("Refrescar", "/get_all", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    // En caso de error, mostramos tabla vacía
    tablaCajas = renderDataTable("#tablaCajas", [], columnsGeneral);
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
$(document).on("click", "#tablaCajas tbody .js-modificar", async function() {
  const id = Number(this.dataset.id);
  if (!id) return;
  try {
    const resp = assertOk(await cajasAPI.getById(id));
    const item = mapCajas(resp)[0] || null;
    if (item) openModal("edit", item);
  } catch (err) {
    logError("Modificar (tabla)", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

// Delegación en tabla: Eliminar
$(document).on("click", "#tablaCajas tbody .js-eliminar", function() {
  const id = Number(this.dataset.id);
  const etiqueta = String(this.dataset.etiqueta || "");
  if (!id) return;
  openDeleteModal({ caja_id: id, etiqueta });
});

// Confirmar eliminación
btnConfirmDel?.addEventListener("click", async () => {
  if (!deleteTarget) return;
  const { caja_id } = deleteTarget;
  try {
    const resp = assertOk(await cajasAPI.remove(caja_id));
    logPaso("Confirmar eliminar", "/delete", resp);
    closeDeleteModal();
    await cargarTabla();
    limpiarTablaPorIdSiCoincide(caja_id);
    showToast("Caja eliminada correctamente", "success", "fa-check-circle");
  } catch (err) {
    logError("Confirmar eliminar", "/delete", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Validación
   ========================= */
function validateCaja({ caja_id, letra, cara, nivel }, mode) {
  if (mode === "edit") {
    if (!Number.isInteger(Number(caja_id))) throw new Error("caja_id inválido");
  }
  
  // Construir letra completa
  const letra1 = modalLetra1.value;
  const letra2 = modalLetra2.value;
  const letraCompleta = letra1 + (letra2 || "");
  
  if (!letra1) throw new Error("La primera letra es obligatoria");
  if (letraCompleta.length > 2) throw new Error("La letra no puede tener más de 2 caracteres");
  
  if (!cara || (cara !== 1 && cara !== 2)) throw new Error("Cara inválida");
  if (!nivel || (nivel !== 1 && nivel !== 2)) throw new Error("Nivel inválido");
  
  return { 
    caja_id: caja_id ? Number(caja_id) : undefined, 
    letra: letraCompleta,
    cara: Number(cara),
    nivel: Number(nivel)
  };
}

/* =========================
   Guardar (insert/update)
   ========================= */
formEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const caraValue = Number(modalCara.value);
    const nivelValue = Number(modalNivel.value);
    
    const payload = {
      caja_id: hidId.value ? Number(hidId.value) : undefined,
      letra: modalLetra1.value + (modalLetra2.value || ""),
      cara: caraValue,
      nivel: nivelValue
    };

    if (currentMode === "edit" && payload.caja_id) {
      console.log("Payload para update:", payload); // Debug log
      const resp = assertOk(await cajasAPI.update(payload));
      logPaso("Guardar cambios (update)", "/update", resp);
      showToast("Caja actualizada correctamente", "success", "fa-check-circle");
    } else {
      const { caja_id, ...createData } = payload;
      const resp = assertOk(await cajasAPI.insert(createData));
      logPaso("Agregar (insert)", "/insert", resp);
      showToast("Caja creada correctamente", "success", "fa-check-circle");
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
  if (tablaCajaPorId) {
    const rows = tablaCajaPorId.rows().data().toArray();
    if (rows.length && Number(rows[0]?.caja_id) === Number(id)) {
      tablaCajaPorId.clear().draw();
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
    const resp = assertOk(await cajasAPI.getById(id));
    const item = mapCajas(resp)[0] || null;
    if (item) {
      tablaCajaPorId = renderDataTable("#tablaCajaPorId", [item], columnsSoloDatos);
      showToast(`Caja encontrada: ${item.etiqueta}`, "success", "fa-check-circle");
    } else {
      showToast("No se encontró ninguna caja con ese ID.", "info", "fa-info-circle");
      tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
    }
    logPaso("Obtener por ID", `/por_id/${id}`, resp);
  } catch (err) {
    logError("Obtener por ID", `/por_id/${id}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
  }
});

/* =========================
   Búsqueda por componentes - MODIFICADA
   ========================= */
searchForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const letra1 = letra1Select.value;
  const letra2 = letra2Select.value;
  const cara = caraSelect.value;
  const nivel = nivelSelect.value;
  
  if (!letra1 || !cara || !nivel) {
    showToast("Por favor, completa todos los campos obligatorios.", "error", "fa-circle-exclamation");
    return;
  }
  
  const letraCompleta = letra1 + (letra2 || "");
  
  try {
    // Convertir a números antes de enviar
    const caraNum = Number(cara);
    const nivelNum = Number(nivel);
    
    const resp = assertOk(await cajasAPI.getByComponents(letraCompleta, caraNum, nivelNum));
    
    // MODIFICACIÓN: Extraer el ID de la respuesta y buscar por ID
    const cajaId = resp.data?.caja_id;
    
    if (cajaId) {
      // Usar el ID para obtener los detalles completos de la caja
      const respDetalle = assertOk(await cajasAPI.getById(cajaId));
      const item = mapCajas(respDetalle)[0] || null;
      
      if (item) {
        // Mostrar en la tabla de búsqueda por ID
        tablaCajaPorId = renderDataTable("#tablaCajaPorId", [item], columnsSoloDatos);
        showToast(`Se encontró la caja: ${item.etiqueta}`, "success", "fa-check-circle");
      } else {
        showToast("No se encontraron detalles para la caja.", "info", "fa-info-circle");
        tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
      }
    } else {
      showToast("No se encontró ninguna caja con esos componentes.", "info", "fa-info-circle");
      tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
    }
    
    logPaso("Buscar por componentes", "/por_componentes", resp);
  } catch (err) {
    logError("Buscar por componentes", "/por_componentes", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
  }
});

btnLimpiarBusqueda?.addEventListener("click", () => {
  searchForm.reset();
  showToast("Búsqueda limpiada", "info", "fa-info-circle");
});

/* =========================
   Cargar todos los registros
   ========================= */
btnCargarTodos?.addEventListener("click", async () => {
  if (confirm("¿Estás seguro de que deseas cargar todos los registros? Esto puede tomar unos momentos.")) {
    await cargarTabla();
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
  inicializarSelects();
  
  // Inicializar tablas vacías
  tablaCajas = renderDataTable("#tablaCajas", [], columnsGeneral);
  tablaCajaPorId = renderDataTable("#tablaCajaPorId", [], columnsSoloDatos);
  
  showToast("Panel de cajas listo. Presiona 'Refrescar' para cargar los datos.", "info", "fa-info-circle");
});
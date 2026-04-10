// Control de panel: Productos - Solo consulta con DataTables
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";

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

function normalizeProducto(row) {
    if (!row || typeof row !== "object") return null;
  
  const id = row.producto_id ?? row.id;
  const nombre = row.nombre ?? row.Nombre;
  const descripcion = row.descripcion ?? row.Descripcion;
  const precio = row.precio ?? row.Precio;
  const categoria_principal_id = row.categoria_principal_id ?? row.CategoriaPrincipalId;
  const categoria_principal_nombre = row.categoria_principal_nombre ?? row.CategoriaPrincipalNombre;
  const categoria_secundaria_id = row.categoria_secundaria_id ?? row.CategoriaSecundariaId;
  const categoria_secundaria_nombre = row.categoria_secundaria_nombre ?? row.CategoriaSecundariaNombre;
  const subcategoria_id = row.subcategoria_id ?? row.SubcategoriaId;
  const subcategoria_nombre = row.subcategoria_nombre ?? row.SubcategoriaNombre;
  const unit_id = row.unit_id ?? row.UnitId;
  const unit_nombre = row.unit_nombre ?? row.UnitNombre;
  const unit_value = row.unit_value ?? row.UnitValue;
  const size_id = row.size_id ?? row.SizeId;
  const size_nombre = row.size_nombre ?? row.SizeNombre;
  const size_value = row.size_value ?? row.SizeValue;
  const brand_id = row.brand_id ?? row.BrandId;
  const brand_nombre = row.brand_nombre ?? row.BrandNombre;
  const estado = row.estado ?? row.Estado;
  
  if (id == null || nombre == null || precio == null) return null;
  
  return {
    id: Number(id),
    nombre: String(nombre),
    descripcion: descripcion ? String(descripcion) : "",
    precio: Number(precio),
    categoria_principal_id: categoria_principal_id ? Number(categoria_principal_id) : null,
    categoria_principal_nombre: categoria_principal_nombre ? String(categoria_principal_nombre) : "",
    categoria_secundaria_id: categoria_secundaria_id ? Number(categoria_secundaria_id) : null,
    categoria_secundaria_nombre: categoria_secundaria_nombre ? String(categoria_secundaria_nombre) : "",
    subcategoria_id: subcategoria_id ? Number(subcategoria_id) : null,
    subcategoria_nombre: subcategoria_nombre ? String(subcategoria_nombre) : "",
    unit_id: unit_id ? Number(unit_id) : null,
    unit_nombre: unit_nombre ? String(unit_nombre) : "",
    unit_value: unit_value ? Number(unit_value) : null,
    size_id: size_id ? Number(size_id) : null,
    size_nombre: size_nombre ? String(size_nombre) : "",
    size_value: size_value ? String(size_value) : "",
    brand_id: brand_id ? Number(brand_id) : null,
    brand_nombre: brand_nombre ? String(brand_nombre) : "",
    estado: estado !== undefined ? Number(estado) : 1
  };
}

function mapProductos(listish) { 
  return toArrayData(listish).map(normalizeProducto).filter(Boolean); 
}

let tablaProductos = null;
let tablaBusqueda = null;

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
const inputBuscar = document.getElementById("inputBuscar");
const tipoBusqueda = document.getElementById("tipoBusqueda");
const btnBuscar = document.getElementById("btnBuscar");
const btnRefrescar = document.getElementById("btnRefrescar");
const btnVerActivos = document.getElementById("btnVerActivos");

// Modal confirmación de eliminación (se mantiene para eliminar si es necesario)
const modalDeleteEl = document.getElementById("modalConfirmDelete");
const btnCloseDel = document.getElementById("closeDeleteModalBtn");
const btnCancelDel = document.getElementById("cancelDeleteBtn");
const btnConfirmDel = document.getElementById("confirmDeleteBtn");
const deleteMsg = document.getElementById("deleteMessage");

const mainEl = document.querySelector("main");

/* =========================
   Columnas DataTable
   ========================= */
const columnsGeneral = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { data: "descripcion", title: "Descripción" },
  {
    data: "precio",
    title: "Precio",
    render: function(data) {
      return `$${Number(data).toFixed(2)}`;
    }
  },
  { data: "categoria_principal_nombre", title: "Categoría" },
  { data: "brand_nombre", title: "Marca" },
  {
    data: "estado",
    title: "Estado",
    render: function(data) {
      const on = data === 1;
      return `<span class="pill ${on ? 'pill-on' : 'pill-off'}">${on ? 'Activo' : 'Inactivo'}</span>`;
    }
  },
  {
    data: null,
    title: "Acciones",
    orderable: false,
    render: (row) =>
      `<div class="btn-group">
         <a class="btn-row warning" href="/admin-resources/pages/panels/editarProducto.html?id=${row.id}" title="Editar">
           <i class="fa-solid fa-pen-to-square"></i> Editar
         </a>
         <button class="btn-row danger js-eliminar" data-id="${row.id}" data-nombre="${row.nombre}" title="Eliminar">
           <i class="fa-solid fa-trash-can"></i> Eliminar
         </button>
       </div>`
  }
];

const columnsBusqueda = [
  { data: "id", title: "ID" },
  { data: "nombre", title: "Nombre" },
  { 
    data: "precio", 
    title: "Precio",
    render: function(data) {
      return `$${Number(data).toFixed(2)}`;
    }
  },
  { data: "categoria_principal_nombre", title: "Categoría" },
  { data: "brand_nombre", title: "Marca" },
  { 
    data: "estado", 
    title: "Estado",
    render: function(data) {
      return data === 1 ? "Activo" : "Inactivo";
    }
  }
];

/* =========================
   Modales accesibles (solo eliminación)
   ========================= */
let deleteTarget = null;

function openDeleteModal(item) {
  deleteTarget = item;
  deleteMsg.textContent = `¿Seguro que deseas eliminar el producto ${item.id} — "${item.nombre}"?`;
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
modalDeleteEl?.addEventListener("click", (e) => { if (e.target === modalDeleteEl) closeDeleteModal(); });
btnCloseDel?.addEventListener("click", closeDeleteModal);
btnCancelDel?.addEventListener("click", closeDeleteModal);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalDeleteEl.classList.contains("show")) closeDeleteModal();
});

/* =========================
   Listado general (get_all)
   ========================= */
async function cargarTabla(activos = false) {
  try {
    const resp = assertOk(activos ? await productosAPI.getAllActive() : await productosAPI.getAll());
    const data = mapProductos(resp);
    tablaProductos = renderDataTable("#tablaProductos", data, columnsGeneral);
    logPaso("Refrescar", activos ? "/get_all_active" : "/get_all", resp);
    showToast(`Se cargaron ${data.length} productos ${activos ? 'activos' : ''}`, "success", "fa-check-circle");
  } catch (err) {
    logError("Refrescar", activos ? "/get_all_active" : "/get_all", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaProductos = renderDataTable("#tablaProductos", [], columnsGeneral);
  }
}

/* =========================
   Delegación: botón Eliminar de la tabla
   ========================= */
$(document).on("click", "#tablaProductos tbody .js-eliminar", function () {
  const id = Number(this.dataset.id);
  const nombre = String(this.dataset.nombre || "");
  if (!id) return;
  openDeleteModal({ id, nombre });
});

/* =========================
   Confirmar eliminación
   ========================= */
btnConfirmDel?.addEventListener("click", async () => {
  if (!deleteTarget) return;
  const { id } = deleteTarget;
  try {
    const resp = assertOk(await productosAPI.softDelete(id));
    logPaso("Confirmar eliminar", "/soft_delete", resp);
    closeDeleteModal();
    await cargarTabla();
    limpiarTablaBusquedaSiCoincide(id);
    showToast("Producto eliminado correctamente", "success", "fa-check-circle");
  } catch (err) {
    logError("Confirmar eliminar", "/soft_delete", err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Búsqueda (por ID o Nombre)
   ========================= */
function limpiarTablaBusquedaSiCoincide(id) {
  if (tablaBusqueda) {
    const rows = tablaBusqueda.rows().data().toArray();
    if (rows.length && Number(rows[0]?.id) === Number(id)) {
      tablaBusqueda.clear().draw();
    }
  }
}

btnBuscar?.addEventListener("click", async () => {
  const valor = inputBuscar?.value.trim();
  const tipo = tipoBusqueda?.value;
  
  if (!valor) {
    showToast("Ingresa un valor para buscar.", "error", "fa-circle-exclamation");
    return;
  }
  
  try {
    let resp;
    if (tipo === "id") {
      const id = Number(valor);
      if (!Number.isInteger(id) || id <= 0) {
        showToast("Ingresa un ID válido (entero positivo).", "error", "fa-circle-exclamation");
        return;
      }
      resp = assertOk(await productosAPI.getById(id));
    } else {
      resp = assertOk(await productosAPI.getByNombre(valor));
    }
    
    const items = mapProductos(resp);
    if (items.length > 0) {
      tablaBusqueda = renderDataTable("#tablaBusqueda", items, columnsBusqueda);
      showToast(`Se encontraron ${items.length} productos`, "success", "fa-check-circle");
    } else {
      showToast("No se encontraron productos.", "info", "fa-info-circle");
      tablaBusqueda = renderDataTable("#tablaBusqueda", [], columnsBusqueda);
    }
    logPaso("Buscar", tipo === "id" ? `/por_id/${valor}` : `/buscar_por_nombre/${valor}`, resp);
  } catch (err) {
    logError("Buscar", tipo === "id" ? `/por_id/${valor}` : `/buscar_por_nombre/${valor}`, err);
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    tablaBusqueda = renderDataTable("#tablaBusqueda", [], columnsBusqueda);
  }
});

/* =========================
   Refrescar tabla
   ========================= */
btnRefrescar?.addEventListener("click", async () => {
  await cargarTabla();
});

btnVerActivos?.addEventListener("click", async () => {
  await cargarTabla(true);
});

/* =========================
   Inicialización
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Inicializar tablas vacías
  tablaProductos = renderDataTable("#tablaProductos", [], columnsGeneral);
  tablaBusqueda = renderDataTable("#tablaBusqueda", [], columnsBusqueda);
  
  showToast("Panel de productos listo. Presiona 'Refrescar' para cargar los datos.", "info", "fa-info-circle");
});
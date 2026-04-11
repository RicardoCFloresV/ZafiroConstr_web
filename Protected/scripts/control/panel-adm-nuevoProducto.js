// Control de panel: Nuevo Producto
import { nuevoProductoAPI } from "/admin-resources/scripts/api/nuevoProductoManager.js";
import { sizesAPI } from "/admin-resources/scripts/api/sizesManager.js";
import { unidadesAPI } from "/admin-resources/scripts/api/unidadesManager.js";

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

function llenarSelect(select, datos, valorKey, textoKey) {
  select.innerHTML = '<option value="">Seleccionar...</option>';
  datos.forEach(item => {
    const option = document.createElement("option");
    option.value = item[valorKey];
    option.textContent = item[textoKey];
    select.appendChild(option);
  });
}

/* =========================
   Referencias DOM
   ========================= */
const formEl = document.getElementById("productoForm");
const nombreInput = document.getElementById("nombre");
const descripcionTextarea = document.getElementById("descripcion");
const precioInput = document.getElementById("precio");
const categoriaPrincipalSelect = document.getElementById("categoria_principal_id");
const categoriaSecundariaSelect = document.getElementById("categoria_secundaria_id");
const subcategoriaSelect = document.getElementById("subcategoria_id");
const unitSelect = document.getElementById("unit_id");
const unitValueInput = document.getElementById("unit_value");
const sizeSelect = document.getElementById("size_id");
const sizeValueInput = document.getElementById("size_value");
const brandSelect = document.getElementById("brand_id");
const saveBtn = document.getElementById("saveProductoBtn");

// Caja components
const cajaLetra1 = document.getElementById("caja_letra1");
const cajaLetra2 = document.getElementById("caja_letra2");
const cajaCara = document.getElementById("caja_cara");
const cajaNivel = document.getElementById("caja_nivel");
const btnResolverCaja = document.getElementById("btnResolverCaja");
const cajaIdInput = document.getElementById("caja_id");
const cajaPreview = document.getElementById("caja_preview");
const stockInicialInput = document.getElementById("stock_inicial");

let datosRelacionados = {
  categorias: [],
  categoriasSecundarias: [],
  subcategorias: [],
  units: [],
  sizes: [],
  brands: []
};

/* =========================
   Cargar datos relacionados
   ========================= */
async function cargarDatosRelacionados() {
  // Cada llamada es independiente: si una falla, las demás siguen cargando.
  const tareas = [
    {
      nombre: "categorías",
      fn: () => nuevoProductoAPI.getCategorias(),
      ok: (data) => {
        datosRelacionados.categorias = data;
        llenarSelect(categoriaPrincipalSelect, data, "categoria_id", "nombre");
      }
    },
    {
      nombre: "categorías secundarias",
      fn: () => nuevoProductoAPI.getCategoriasSecundarias(),
      ok: (data) => {
        datosRelacionados.categoriasSecundarias = data;
        llenarSelect(categoriaSecundariaSelect, data, "categoria_secundaria_id", "nombre");
      }
    },
    {
      nombre: "subcategorías",
      fn: () => nuevoProductoAPI.getSubcategorias(),
      ok: (data) => {
        datosRelacionados.subcategorias = data;
        llenarSelect(subcategoriaSelect, data, "subcategoria_id", "nombre");
      }
    },
    {
      nombre: "unidades",
      fn: () => unidadesAPI.getAll(),
      ok: (data) => {
        datosRelacionados.units = data;
        llenarSelect(unitSelect, data, "unit_id", "nombre");
      }
    },
    {
      nombre: "tamaños",
      fn: () => sizesAPI.getAll(),
      ok: (data) => {
        datosRelacionados.sizes = data;
        llenarSelect(sizeSelect, data, "size_id", "nombre");
      }
    },
    {
      nombre: "marcas",
      fn: () => nuevoProductoAPI.getBrands(),
      ok: (data) => {
        datosRelacionados.brands = data;
        llenarSelect(brandSelect, data, "brand_id", "nombre");
      }
    }
  ];

  const fallos = [];
  await Promise.all(tareas.map(async t => {
    try {
      const resp = await t.fn();
      const arr = toArrayData(resp);
      t.ok(arr);
      console.log(`[nuevoProducto] ${t.nombre}: ${arr.length} ítems cargados`);
    } catch (err) {
      console.error(`[nuevoProducto] Error cargando ${t.nombre}:`, err);
      fallos.push(t.nombre);
    }
  }));

  // Inicializar selector de caja (no depende de APIs)
  initPickerCaja();

  if (fallos.length) {
    showToast(`No se pudieron cargar: ${fallos.join(", ")}`, "error", "fa-circle-exclamation");
    return false;
  }
  return true;
}

function initPickerCaja() {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  letras.forEach(L => {
    cajaLetra1.appendChild(new Option(L, L));
    cajaLetra2.appendChild(new Option(L, L));
  });
}

/* =========================
   Validación
   ========================= */
function validateProducto({ nombre, descripcion, precio, categoria_principal_id, categoria_secundaria_id, subcategoria_id, unit_id, unit_value, size_id, size_value, brand_id, caja_id, stock_inicial }) {
  if (!nombre || nombre.trim().length === 0) throw new Error("El nombre es obligatorio");
  if (nombre.length > 100) throw new Error("El nombre no puede tener más de 100 caracteres");
  
  if (descripcion && descripcion.length > 255) throw new Error("La descripción no puede tener más de 255 caracteres");
  
  if (!precio || isNaN(precio) || Number(precio) < 0) throw new Error("Precio inválido");
  
  if (!categoria_principal_id || !Number.isInteger(Number(categoria_principal_id))) throw new Error("Categoría principal inválida");
  
  if (categoria_secundaria_id && !Number.isInteger(Number(categoria_secundaria_id))) throw new Error("Categoría secundaria inválida");
  
  if (subcategoria_id && !Number.isInteger(Number(subcategoria_id))) throw new Error("Subcategoría inválida");
  
  if (!unit_id || !Number.isInteger(Number(unit_id))) throw new Error("Unidad inválida");
  
  if (!unit_value || isNaN(unit_value) || Number(unit_value) < 0) throw new Error("Valor de unidad inválido");
  
  if (!size_id || !Number.isInteger(Number(size_id))) throw new Error("Tamaño inválido");
  
  if (!size_value || size_value.trim().length === 0) throw new Error("Valor de tamaño inválido");
  if (size_value.length > 50) throw new Error("El valor de tamaño no puede tener más de 50 caracteres");
  
  if (!brand_id || !Number.isInteger(Number(brand_id))) throw new Error("Marca inválida");
  
  if (!caja_id || !Number.isInteger(Number(caja_id))) throw new Error("Debe seleccionar una caja válida");
  
  if (!stock_inicial || isNaN(stock_inicial) || Number(stock_inicial) < 0) throw new Error("Stock inicial inválido");
  
  return { 
    nombre: nombre.trim(),
    descripcion: descripcion ? descripcion.trim() : null,
    precio: Number(precio),
    categoria_principal_id: Number(categoria_principal_id),
    categoria_secundaria_id: categoria_secundaria_id ? Number(categoria_secundaria_id) : null,
    subcategoria_id: subcategoria_id ? Number(subcategoria_id) : null,
    unit_id: Number(unit_id),
    unit_value: Number(unit_value),
    size_id: Number(size_id),
    size_value: size_value.trim(),
    brand_id: Number(brand_id),
    caja_id: Number(caja_id),
    stock_inicial: Number(stock_inicial)
  };
}

/* =========================
   Resolver caja
   ========================= */
btnResolverCaja?.addEventListener("click", async () => {
  try {
    const l1 = cajaLetra1.value?.trim();
    const l2 = cajaLetra2.value?.trim() || ' '; // Use space if not provided
    const cara = Number(cajaCara.value);
    const nivel = Number(cajaNivel.value);

    if (!l1 || !cara || !nivel) {
      showToast("Completa letra (al menos la primera), cara y nivel.", "info", "fa-info-circle");
      return;
    }
    const letra = `${l1}${l2}`;
    const resp = await nuevoProductoAPI.getCajaByComponents(letra, cara, nivel);
    if (!resp?.success || !resp?.data?.caja_id) {
      showToast(resp?.message || "No se encontró una caja con esos componentes.", "error", "fa-triangle-exclamation");
      cajaIdInput.value = "";
      cajaPreview.textContent = "Sin caja seleccionada.";
      return;
    }
    // Guardamos el id
    cajaIdInput.value = resp.data.caja_id;
    cajaPreview.textContent = `Caja ID: ${resp.data.caja_id} (letra ${letra}, cara ${cara}, nivel ${nivel})`;
    showToast("Caja encontrada y seleccionada.", "success", "fa-check-circle");
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
  }
});

/* =========================
   Guardar (insert)
   ========================= */
formEl?.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Creando...';

  try {
    const payload = {
      nombre: nombreInput.value,
      descripcion: descripcionTextarea.value,
      precio: precioInput.value,
      categoria_principal_id: categoriaPrincipalSelect.value,
      categoria_secundaria_id: categoriaSecundariaSelect.value || null,
      subcategoria_id: subcategoriaSelect.value || null,
      unit_id: unitSelect.value,
      unit_value: unitValueInput.value,
      size_id: sizeSelect.value,
      size_value: sizeValueInput.value,
      brand_id: brandSelect.value,
      caja_id: cajaIdInput.value,
      stock_inicial: stockInicialInput.value
    };

    const validated = validateProducto(payload);
    const resp = assertOk(await nuevoProductoAPI.insertWithStock(validated));
    
    showToast("Producto creado correctamente", "success", "fa-check-circle");
    
    // Redirigir después de 1.5 segundos
    setTimeout(() => {
      window.location.href = "/admin-resources/pages/panels/productos.html";
    }, 1500);
    
  } catch (err) {
    showToast(friendlyError(err), "error", "fa-circle-exclamation");
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Crear Producto';
  }
});

/* =========================
   Inicialización
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Cargar datos relacionados
  await cargarDatosRelacionados();
  
  showToast("Formulario listo. Complete los campos para crear un nuevo producto.", "info", "fa-info-circle");
});
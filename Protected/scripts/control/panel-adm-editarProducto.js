// /admin-resources/scripts/panel-adm-editarProducto.js
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";
import { categoriasAPI } from "/admin-resources/scripts/api/categoriasManager.js";
import { unidadesAPI } from "/admin-resources/scripts/api/unidadesManager.js";
import { sizesAPI } from "/admin-resources/scripts/api/sizesManager.js";
import { nuevoProductoAPI } from "/admin-resources/scripts/api/nuevoProductoManager.js";
import { stockAPI } from "/admin-resources/scripts/api/stockManager.js";

// Stub local: la gestión de imágenes aún no está implementada en el backend.
// Se mantiene la API en el código para no romper el flujo, pero todas las
// llamadas son no-ops y devuelven valores vacíos.
const imagenesAPI = {
  async getAll() { return []; },
  async getByProductId(_id) { return null; },
  async insert(_payload) { return { success: true, stub: true }; }
};

// DOM Elements
const form = document.getElementById('editarProductoForm');
const els = {
    id: document.getElementById('producto_id'),
    nombre: document.getElementById('nombre'),
    descripcion: document.getElementById('descripcion'),
    precio: document.getElementById('precio'),
    brand: document.getElementById('brand_id'),
    
    catPri: document.getElementById('categoria_principal'),
    catSec: document.getElementById('categoria_secundaria'),
    subCat: document.getElementById('subcategoria'),
    
    unit: document.getElementById('unit_id'),
    unitVal: document.getElementById('unit_value'),
    size: document.getElementById('size_id'),
    sizeVal: document.getElementById('size_value'),
    
    stock: document.getElementById('stock_total'),
    cajaId: document.getElementById('caja_id'),

    // Inventario actual
    stockTotalDisplay: document.getElementById('stockTotalDisplay'),
    stockCajasDisplay: document.getElementById('stockCajasDisplay'),
    stockDetallesDisplay: document.getElementById('stockDetallesDisplay'),
    stockBoxesList: document.getElementById('stockBoxesList'),
    lnkGestionarStock: document.getElementById('lnkGestionarStock'),

    // Imagen
    imgInput: document.getElementById('imagenInput'),
    imgPreview: document.getElementById('imgPreview'),
    dropZone: document.getElementById('dropZone'),
    uploadPlaceholder: document.getElementById('uploadPlaceholder'),
    btnGuardar: document.getElementById('btnGuardar')
};

// Estado
let originalData = null;
let newImageFile = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
    // 1. Obtener ID de la URL
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        showToast("Error: No se especificó un ID de producto.", "error");
        setTimeout(() => window.location.href = '/admin-resources/pages/panels/productos.html', 2000);
        return;
    }

    try {
        // 2. Cargar Listas (Dropdowns)
        await loadDropdowns();

        // 3. Cargar Datos del Producto
        await loadProductData(id);

        // 4. Configurar Eventos
        setupEvents();

    } catch (err) {
        console.error(err);
        showToast("Error inicializando la página.", "error");
    }
}

async function loadDropdowns() {
    try {
        const [cats, brands, units, sizes] = await Promise.all([
            nuevoProductoAPI.getCategorias(), // Usa endpoints existentes
            nuevoProductoAPI.getBrands(),
            nuevoProductoAPI.getUnits(),
            nuevoProductoAPI.getSizes()
        ]);

        fillSelect(els.catPri, cats, 'categoria_id', 'nombre');
        fillSelect(els.brand, brands, 'brand_id', 'nombre');
        fillSelect(els.unit, units, 'unit_id', 'nombre');
        fillSelect(els.size, sizes, 'size_id', 'nombre');
        
    } catch (e) {
        console.error("Fallo cargando listas", e);
        showToast("Error cargando opciones.", "error");
    }
}

async function loadProductData(id) {
    // El endpoint /productos/por_id/:id responde:
    //   { success: true, message: "...", data: <objeto producto> }
    // Soportamos también respuestas planas u objetos en array por robustez.
    const resp = await productosAPI.getById(id);

    if (resp && resp.success === false) {
        throw new Error(resp.message || "Producto no encontrado");
    }

    let data = resp?.data ?? resp;
    if (Array.isArray(data)) data = data[0];

    if (!data) throw new Error("Producto no encontrado");

    originalData = data;

    // Llenar campos básicos
    els.id.value = data.id || data.producto_id;
    els.nombre.value = data.nombre || '';
    els.descripcion.value = data.descripcion || '';
    els.precio.value = data.precio || '';
    els.stock.value = data.stock_total || 0;
    els.unitVal.value = data.unit_value || '';
    els.sizeVal.value = data.size_value || '';
    els.cajaId.value = data.caja_id || '';

    // Seleccionar Dropdowns (Trigger change si es necesario para cargar dependientes)
    if(data.brand_id) els.brand.value = data.brand_id;
    if(data.unit_id) els.unit.value = data.unit_id;
    if(data.size_id) els.size.value = data.size_id;

    // Categorías en Cascada
    if(data.categoria_principal_id) {
        els.catPri.value = data.categoria_principal_id;
        
        // Cargar Secundarias
        await loadSecundarias(data.categoria_principal_id);
        if(data.categoria_secundaria_id) {
            els.catSec.value = data.categoria_secundaria_id;
            
            // Cargar Subcategorías
            await loadSubcategorias(data.categoria_secundaria_id);
            if(data.subcategoria_id) {
                els.subCat.value = data.subcategoria_id;
            }
        }
    }

    // Imagen
    if (data.imagen || data.img_url) {
        const url = data.imagen || data.img_url;
        showPreview(`/uploads/${url}`);
    } else {
        // Intentar buscar en API de imagenes si no viene en el objeto principal
        try {
            const imgs = await imagenesAPI.getAll(); // O getByProductId si existiera
            const prodImg = imgs.find(img => img.producto_id == (data.id || data.producto_id));
            if(prodImg) {
                showPreview(`/uploads/${prodImg.url || prodImg.path}`);
            }
        } catch(e) { console.log("No images found"); }
    }

    // Inventario actual (stock por caja) + link al panel de stock
    const productoId = data.id || data.producto_id;
    if (els.lnkGestionarStock && productoId) {
        els.lnkGestionarStock.href = `/admin-resources/pages/panels/stock.html?id=${productoId}`;
    }
    await loadInventarioActual(productoId);
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

async function loadInventarioActual(productoId) {
    if (!productoId || !els.stockBoxesList) return;
    els.stockBoxesList.innerHTML = '<span class="text-textMuted text-sm italic">Cargando…</span>';

    try {
        const resp = await stockAPI.getByProducto(productoId);
        const data = (resp && typeof resp === "object" && "data" in resp) ? resp.data : resp;
        const detalles = Array.isArray(data) ? data : (data ? [data] : []);

        const total = detalles.reduce((acc, d) => acc + Number(d.stock || 0), 0);
        const cajasUnicas = new Set(detalles.map(d => d.caja_id).filter(Boolean));

        if (els.stockTotalDisplay) els.stockTotalDisplay.textContent = total;
        if (els.stockCajasDisplay) els.stockCajasDisplay.textContent = cajasUnicas.size || detalles.length;
        if (els.stockDetallesDisplay) els.stockDetallesDisplay.textContent = detalles.length;

        // Mantener el input oculto sincronizado por compatibilidad
        if (els.stock) els.stock.value = total;

        if (!detalles.length) {
            els.stockBoxesList.innerHTML =
                '<span class="text-textMuted text-sm italic">Este producto aún no está asignado a ninguna caja.</span>';
            return;
        }

        els.stockBoxesList.innerHTML = detalles.map(d => {
            const cajaId = d.caja_id ?? "—";
            const eti = d.etiqueta ? escapeHtml(d.etiqueta) : `Caja ${cajaId}`;
            const stock = Number(d.stock || 0);
            const stockCls = stock > 0 ? "bg-success" : "bg-gray-400";
            return `
              <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20"
                    title="Caja #${cajaId} · Detalle #${d.detalle_id}">
                <i class="fa-solid fa-box"></i>
                <span>${eti}</span>
                <span class="ml-1 px-1.5 py-0.5 rounded ${stockCls} text-white">${stock}</span>
              </span>`;
        }).join("");
    } catch (err) {
        console.error("Error cargando inventario actual:", err);
        els.stockBoxesList.innerHTML =
            '<span class="text-danger text-sm">No se pudo cargar el inventario actual.</span>';
        if (els.stockTotalDisplay) els.stockTotalDisplay.textContent = "—";
        if (els.stockCajasDisplay) els.stockCajasDisplay.textContent = "—";
        if (els.stockDetallesDisplay) els.stockDetallesDisplay.textContent = "—";
    }
}

// --- Manejo de Imagen ---

function setupEvents() {
    // Click en zona de carga abre input file
    els.dropZone.addEventListener('click', () => els.imgInput.click());

    // Cambio en input file
    els.imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            newImageFile = file;
            const reader = new FileReader();
            reader.onload = (ev) => showPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    });

    // Cambios en categorías (Cascada)
    els.catPri.addEventListener('change', async () => {
        els.catSec.innerHTML = '<option value="">Cargando...</option>';
        els.subCat.innerHTML = '<option value="">...</option>';
        els.catSec.disabled = true;
        els.subCat.disabled = true;
        
        if(els.catPri.value) {
            await loadSecundarias(els.catPri.value);
        }
    });

    els.catSec.addEventListener('change', async () => {
        els.subCat.innerHTML = '<option value="">Cargando...</option>';
        els.subCat.disabled = true;
        
        if(els.catSec.value) {
            await loadSubcategorias(els.catSec.value);
        }
    });

    // Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduct();
    });
}

function showPreview(src) {
    els.imgPreview.src = src;
    els.imgPreview.classList.remove('hidden');
    els.uploadPlaceholder.classList.add('hidden');
}

// --- Lógica de Guardado ---

async function saveProduct() {
    const id = els.id.value;
    if(!id) return;

    // ---- DEBUG: dump de los valores brutos del formulario ----
    const rawValues = {
        producto_id: els.id.value,
        nombre: els.nombre.value,
        descripcion: els.descripcion.value,
        precio: els.precio.value,
        brand_id: els.brand.value,
        categoria_principal_id: els.catPri.value,
        categoria_secundaria_id: els.catSec.value,
        subcategoria_id: els.subCat.value,
        unit_id: els.unit.value,
        unit_value: els.unitVal.value,
        size_id: els.size.value,
        size_value: els.sizeVal.value
    };
    console.group("[saveProduct] Datos del formulario");
    console.table(rawValues);
    console.groupEnd();

    // ---- Coerción a los tipos que espera el backend (Rules.Update) ----
    // Required en backend: nombre(string), precio(number>=0), categoria_principal_id(int>0),
    //   unit_id(int>0), unit_value(number>=0), size_id(int>0), size_value(string 1..50), brand_id(int>0)
    const toIntOrNull = v => {
        const n = Number(v);
        return Number.isInteger(n) && n > 0 ? n : null;
    };
    const toFloatOrNull = v => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    const payload = {
        producto_id: Number(id),
        nombre: (els.nombre.value || "").trim(),
        descripcion: (els.descripcion.value || "").trim(),
        precio: toFloatOrNull(els.precio.value),
        categoria_principal_id: toIntOrNull(els.catPri.value),
        categoria_secundaria_id: toIntOrNull(els.catSec.value),
        subcategoria_id: toIntOrNull(els.subCat.value),
        unit_id: toIntOrNull(els.unit.value),
        unit_value: toFloatOrNull(els.unitVal.value),
        size_id: toIntOrNull(els.size.value),
        size_value: (els.sizeVal.value || "").trim(),
        brand_id: toIntOrNull(els.brand.value)
    };

    // Validación local previa: identificar exactamente qué falta antes de pegarle al server
    const missing = [];
    if (!payload.nombre) missing.push("nombre");
    if (payload.precio == null || payload.precio < 0) missing.push("precio");
    if (!payload.categoria_principal_id) missing.push("categoria_principal_id");
    if (!payload.unit_id) missing.push("unit_id");
    if (payload.unit_value == null || payload.unit_value < 0) missing.push("unit_value");
    if (!payload.size_id) missing.push("size_id");
    if (!payload.size_value || payload.size_value.length > 50) missing.push("size_value");
    if (!payload.brand_id) missing.push("brand_id");

    console.group("[saveProduct] Payload a enviar");
    console.log("payload:", payload);
    console.log("JSON:", JSON.stringify(payload));
    if (missing.length) console.warn("Campos faltantes/inválidos:", missing);
    console.groupEnd();

    if (missing.length) {
        showToast("Faltan/inválidos: " + missing.join(", "), "error");
        return;
    }

    els.btnGuardar.disabled = true;
    els.btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        const updateResp = await fetch('/productos/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include', // necesario: /productos/update está protegido por requireAuth
            body: JSON.stringify(payload)
        });

        // Leer SIEMPRE el cuerpo (incluso cuando !ok) para extraer message/errors del backend
        const ct = updateResp.headers.get('content-type') || '';
        const respBody = ct.includes('application/json')
            ? await updateResp.json().catch(() => null)
            : await updateResp.text().catch(() => null);

        console.group("[saveProduct] Respuesta del servidor");
        console.log("status:", updateResp.status, updateResp.statusText);
        console.log("ok:", updateResp.ok);
        console.log("body:", respBody);
        console.groupEnd();

        if (!updateResp.ok || (respBody && respBody.success === false)) {
            const serverMsg = (respBody && (respBody.message || respBody.error)) || `HTTP ${updateResp.status}`;
            const errors = respBody && respBody.errors;
            const detail = errors
                ? " — " + (Array.isArray(errors)
                    ? errors.join(", ")
                    : Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`).join("; "))
                : "";
            throw new Error(serverMsg + detail);
        }

        // B. Subir Imagen (si hay nueva)
        if (newImageFile) {
            await imagenesAPI.insert({
                producto_id: id,
                file: newImageFile
            });
        }

        showToast("Producto actualizado correctamente", "success", "fa-check");

        setTimeout(() => {
            window.location.href = "/admin-resources/pages/panels/productos.html";
        }, 1500);

    } catch (err) {
        console.error("[saveProduct] Error:", err);
        showToast("Error al guardar: " + err.message, "error");
        els.btnGuardar.disabled = false;
        els.btnGuardar.innerHTML = 'Guardar Cambios';
    }
}

// --- Helpers ---

async function loadSecundarias(_catId) {
    // El SP categorias_secundarias_get_all no devuelve categoria_principal_id,
    // así que cargamos todas las secundarias sin filtrar (cascada "abierta").
    const resp = await nuevoProductoAPI.getCategoriasSecundarias();
    const allSec = toArrayData(resp);
    fillSelect(els.catSec, allSec, 'categoria_secundaria_id', 'nombre');
    els.catSec.disabled = false;
}

async function loadSubcategorias(_secId) {
    // El SP subcategorias_get_all no devuelve categoria_secundaria_id,
    // así que cargamos todas las subcategorías sin filtrar.
    const resp = await nuevoProductoAPI.getSubcategorias();
    const allSub = toArrayData(resp);
    fillSelect(els.subCat, allSub, 'subcategoria_id', 'nombre');
    els.subCat.disabled = false;
}

function toArrayData(resp) {
    const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
    if (Array.isArray(r)) return r;
    if (!r) return [];
    return [r];
}

function fillSelect(select, data, valKey, textKey) {
    select.innerHTML = '<option value="">Seleccione...</option>';
    const arr = toArrayData(data);
    if(!arr.length) return;

    arr.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item[valKey];
        opt.textContent = item[textKey];
        select.appendChild(opt);
    });
}

// Helper Toast
const toastContainer = document.getElementById("toastContainer");
function showToast(message, type = "info", icon = null) {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${message}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
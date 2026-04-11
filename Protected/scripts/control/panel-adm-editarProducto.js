// /admin-resources/scripts/panel-adm-editarProducto.js
import { productosAPI } from "/admin-resources/scripts/api/productosManager.js";
import { categoriasAPI } from "/admin-resources/scripts/api/categoriasManager.js";
import { unidadesAPI } from "/admin-resources/scripts/api/unidadesManager.js";
import { sizesAPI } from "/admin-resources/scripts/api/sizesManager.js";
import { nuevoProductoAPI } from "/admin-resources/scripts/api/nuevoProductoManager.js";

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

    // 1. Datos de Texto
    const payload = {
        producto_id: id,
        nombre: els.nombre.value,
        descripcion: els.descripcion.value,
        precio: els.precio.value,
        brand_id: els.brand.value || null,
        categoria_principal_id: els.catPri.value,
        categoria_secundaria_id: els.catSec.value || null,
        subcategoria_id: els.subCat.value || null,
        unit_id: els.unit.value,
        unit_value: els.unitVal.value || null,
        size_id: els.size.value || null,
        size_value: els.sizeVal.value || null
        // caja_id y stock usualmente no se editan aqui directamente, o requieren endpoints especiales
    };

    els.btnGuardar.disabled = true;
    els.btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

    try {
        // A. Actualizar Datos
        // NOTA: Asumo que existe /productos/update. Si no, habría que crearlo en el servidor.
        // Si no tienes endpoint de update, esto fallará. 
        const updateResp = await fetch('/productos/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if(!updateResp.ok) throw new Error("Error actualizando datos del producto");

        // B. Subir Imagen (si hay nueva)
        if (newImageFile) {
            await imagenesAPI.insert({
                producto_id: id,
                file: newImageFile
            });
        }

        showToast("Producto actualizado correctamente", "success", "fa-check");
        
        // Esperar y volver
        setTimeout(() => {
            window.location.href = "/admin-resources/pages/panels/productos.html";
        }, 1500);

    } catch (err) {
        console.error(err);
        showToast("Error al guardar: " + err.message, "error");
        els.btnGuardar.disabled = false;
        els.btnGuardar.innerHTML = 'Guardar Cambios';
    }
}

// --- Helpers ---

async function loadSecundarias(catId) {
    const resp = await nuevoProductoAPI.getCategoriasSecundarias();
    const allSec = toArrayData(resp);
    const filtered = allSec.filter(s => s.categoria_principal_id == catId);

    fillSelect(els.catSec, filtered, 'categoria_secundaria_id', 'nombre');
    els.catSec.disabled = false;
}

async function loadSubcategorias(secId) {
    const resp = await nuevoProductoAPI.getSubcategorias();
    const allSub = toArrayData(resp);
    const filtered = allSub.filter(s => s.categoria_secundaria_id == secId);

    fillSelect(els.subCat, filtered, 'subcategoria_id', 'nombre');
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
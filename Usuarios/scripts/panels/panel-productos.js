// Panel principal de Productos (usuario)
// Filosofía: UN solo get_all de productos + filtrado en cliente.
// Alta de producto forzosa con caja + stock inicial.
// Catálogos se crean via + (quick insert) sin update/delete.

import { productosAPI }            from "/user-resources/scripts/apis/productosManager.js";
import { cajasAPI }                from "/user-resources/scripts/apis/cajasManager.js";
import { categoriasAPI }           from "/user-resources/scripts/apis/categoriasManager.js";
import { categoriasSecundariasAPI } from "/user-resources/scripts/apis/categoriasSecundariasManager.js";
import { subcategoriasAPI }        from "/user-resources/scripts/apis/subcategoriasManager.js";
import { unitsAPI }                from "/user-resources/scripts/apis/unitsManager.js";
import { sizesAPI }                from "/user-resources/scripts/apis/sizesManager.js";
import { brandsAPI }               from "/user-resources/scripts/apis/brandsManager.js";
import { stockAPI }                from "/user-resources/scripts/apis/stockManager.js";

/* =========================================================
   Utilidades
   ========================================================= */
const $ = (id) => document.getElementById(id);
const toastBox = $("toastContainer");

function toast(msg, type = "info", icon = null, timeout = 3000) {
  if (!toastBox) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${msg}</span>`;
  toastBox.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); }, timeout);
}
function errMsg(e) {
  const m = e && e.message ? String(e.message) : "";
  return m || "No hay conexión con el servidor";
}
function asArray(resp) {
  const r = resp && typeof resp === "object" && "data" in resp ? resp.data : resp;
  if (Array.isArray(r)) return r;
  if (r == null) return [];
  return [r];
}
function assertOk(resp) {
  if (resp && typeof resp === "object" && "success" in resp && !resp.success) {
    throw new Error(resp.message || "Operación no exitosa");
  }
  return resp;
}
function fmtMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? `$${x.toFixed(2)}` : "";
}
function openModal(id)  { const m = $(id); if (m) { m.classList.add("show"); m.setAttribute("aria-hidden","false"); } }
function closeModal(id) { const m = $(id); if (m) { m.classList.remove("show"); m.setAttribute("aria-hidden","true"); } }
function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* =========================================================
   Normalizador de productos (tolerante a nombres alternos)
   ========================================================= */
function mapProducto(row) {
  if (!row || typeof row !== "object") return null;
  const p = {
    producto_id: row.producto_id ?? row.id,
    nombre: row.nombre ?? "",
    descripcion: row.descripcion ?? null,
    precio: Number(row.precio ?? 0),
    categoria_principal_id: row.categoria_principal_id ?? row.categoria_id ?? null,
    categoria_secundaria_id: row.categoria_secundaria_id ?? null,
    subcategoria_id: row.subcategoria_id ?? null,
    unit_id: row.unit_id ?? null,
    unit_value: row.unit_value ?? null,
    size_id: row.size_id ?? null,
    size_value: row.size_value ?? null,
    brand_id: row.brand_id ?? null,
    categoria_principal_nombre: row.categoria_principal_nombre ?? row.categoria_nombre ?? "",
    categoria_secundaria_nombre: row.categoria_secundaria_nombre ?? "",
    subcategoria_nombre: row.subcategoria_nombre ?? "",
    unit_nombre: row.unit_nombre ?? "",
    size_nombre: row.size_nombre ?? "",
    brand_nombre: row.brand_nombre ?? "",
    stock_total: Number(row.stock_total ?? 0),
    estado: row.estado ?? 1,
  };
  if (p.producto_id == null) return null;
  return p;
}

/* =========================================================
   Estado
   ========================================================= */
const state = {
  productos: [],              // lista cruda (normalizada) de get_all
  cajasPorProducto: new Map(),// producto_id -> [{ caja_id, etiqueta, stock }]
  cat: {
    catp: [], cats: [], subc: [],
    brands: [], units: [], sizes: [],
    cajas: []
  }
};

/* =========================================================
   Carga de catálogos
   ========================================================= */
async function loadCatalogos() {
  const [catp, cats, subc, brands, units, sizes, cajas] = await Promise.all([
    categoriasAPI.getAll().catch(() => ({ data: [] })),
    categoriasSecundariasAPI.getAll().catch(() => ({ data: [] })),
    subcategoriasAPI.getAll().catch(() => ({ data: [] })),
    brandsAPI.getAll().catch(() => ({ data: [] })),
    unitsAPI.getAll().catch(() => ({ data: [] })),
    sizesAPI.getAll().catch(() => ({ data: [] })),
    cajasAPI.getAll().catch(() => ({ data: [] }))
  ]);
  state.cat.catp   = asArray(catp);
  state.cat.cats   = asArray(cats);
  state.cat.subc   = asArray(subc);
  state.cat.brands = asArray(brands);
  state.cat.units  = asArray(units);
  state.cat.sizes  = asArray(sizes);
  state.cat.cajas  = asArray(cajas);
}

/* Llenar <select> con items {id,label} */
function fillSelect(el, items, idKey, labelKey, { includeEmpty = true, emptyLabel = "— Todos —" } = {}) {
  if (!el) return;
  const prev = el.value;
  el.innerHTML = "";
  if (includeEmpty) {
    const op = document.createElement("option");
    op.value = ""; op.textContent = emptyLabel;
    el.appendChild(op);
  }
  for (const it of items) {
    const v = it[idKey] ?? it.id;
    const l = it[labelKey] ?? it.nombre ?? it.etiqueta;
    if (v == null || l == null) continue;
    const op = document.createElement("option");
    op.value = String(v); op.textContent = String(l);
    el.appendChild(op);
  }
  if (prev && [...el.options].some(o => o.value === prev)) el.value = prev;
}

function paintAllSelects() {
  // Filtros (con "Todos")
  fillSelect($("fCatP"),  state.cat.catp,   "categoria_id",             "nombre");
  fillSelect($("fCatS"),  state.cat.cats,   "categoria_secundaria_id",  "nombre");
  fillSelect($("fSubc"),  state.cat.subc,   "subcategoria_id",          "nombre");
  fillSelect($("fMarca"), state.cat.brands, "brand_id",                 "nombre");
  fillSelect($("fSize"),  state.cat.sizes,  "size_id",                  "nombre");
  fillSelect($("fUnit"),  state.cat.units,  "unit_id",                  "nombre");

  // Modal producto (sin "Todos"; requeridos sin emptyLabel "Selecciona")
  fillSelect($("pCatP"),  state.cat.catp,   "categoria_id",             "nombre", { emptyLabel: "— Selecciona —" });
  fillSelect($("pCatS"),  state.cat.cats,   "categoria_secundaria_id",  "nombre", { emptyLabel: "— (opcional) —" });
  fillSelect($("pSubc"),  state.cat.subc,   "subcategoria_id",          "nombre", { emptyLabel: "— (opcional) —" });
  fillSelect($("pMarca"), state.cat.brands, "brand_id",                 "nombre", { emptyLabel: "— Selecciona —" });
  fillSelect($("pUnit"),  state.cat.units,  "unit_id",                  "nombre", { emptyLabel: "— Selecciona —" });
  fillSelect($("pSize"),  state.cat.sizes,  "size_id",                  "nombre", { emptyLabel: "— Selecciona —" });
  fillSelect($("pCaja"),  state.cat.cajas,  "caja_id",                  "etiqueta",{ emptyLabel: "— Selecciona —" });

  // Modales de stock (Agregar / Retirar) — sólo cajas con id
  fillSelect($("addCajaSelect"),    state.cat.cajas, "caja_id", "etiqueta", { emptyLabel: "— Selecciona una caja —" });
  fillSelect($("removeCajaSelect"), state.cat.cajas, "caja_id", "etiqueta", { emptyLabel: "— Selecciona una caja —" });

  // Selector de producto del módulo de stock (sólo activos)
  paintStockProductoSelect();
}

/* Rellena el select del módulo Stock con productos activos (estado == 1) */
function paintStockProductoSelect() {
  const sel = $("stkProductoSel");
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = "";
  const opEmpty = document.createElement("option");
  opEmpty.value = ""; opEmpty.textContent = "— Selecciona un producto —";
  sel.appendChild(opEmpty);

  const activos = state.productos
    .filter(p => Number(p.estado) === 1)
    .slice()
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es"));

  for (const p of activos) {
    const op = document.createElement("option");
    op.value = String(p.producto_id);
    const brand = p.brand_nombre ? ` · ${p.brand_nombre}` : "";
    op.textContent = `#${p.producto_id} — ${p.nombre}${brand}`;
    sel.appendChild(op);
  }
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

/* =========================================================
   Carga de productos + resumen por cajas
   ========================================================= */
async function loadProductos() {
  try {
    const resp = assertOk(await productosAPI.getAllActive().catch(() => productosAPI.getAll()));
    state.productos = asArray(resp).map(mapProducto).filter(Boolean);
  } catch (e) {
    state.productos = [];
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
  // Resumen por cajas (una sola llamada). Mapa: producto_id -> [{ etiqueta, stock, caja_id? }]
  state.cajasPorProducto.clear();
  try {
    const resp = assertOk(await productosAPI.getByCajasResumen());
    for (const row of asArray(resp)) {
      const pid = row.producto_id ?? row.id;
      if (pid == null) continue;
      const key = Number(pid);
      if (!state.cajasPorProducto.has(key)) state.cajasPorProducto.set(key, []);
      state.cajasPorProducto.get(key).push({
        caja_id: row.caja_id != null ? Number(row.caja_id) : null,
        etiqueta: row.caja_etiqueta || row.etiqueta || null,
        stock: Number(row.stock ?? 0)
      });
    }
  } catch { /* silencioso — si el endpoint no rinde, seguimos con stock_total */ }
}

/* Renderiza badges de cajas al estilo del panel admin */
function renderCajasBadges(producto_id) {
  const list = state.cajasPorProducto.get(Number(producto_id)) || [];
  if (!list.length) {
    return `<span class="text-textMuted text-xs italic">Sin asignar</span>`;
  }
  return list.map(c => {
    const eti = c.etiqueta ? escapeHtml(c.etiqueta) : `Caja ${c.caja_id ?? "?"}`;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 mr-1 mb-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20" title="Caja #${c.caja_id ?? "?"}">
              <i class="fa-solid fa-box"></i> ${eti}
              <span class="ml-1 px-1.5 rounded bg-primary text-white">${Number(c.stock || 0)}</span>
            </span>`;
  }).join("");
}

/* =========================================================
   Filtrado en cliente
   ========================================================= */
function getFilters() {
  return {
    nombre:   ($("fNombre").value || "").trim().toLowerCase(),
    pmin:     $("fPrecioMin").value !== "" ? Number($("fPrecioMin").value) : null,
    pmax:     $("fPrecioMax").value !== "" ? Number($("fPrecioMax").value) : null,
    catp:     $("fCatP").value  || "",
    cats:     $("fCatS").value  || "",
    subc:     $("fSubc").value  || "",
    marca:    $("fMarca").value || "",
    size:     $("fSize").value  || "",
    unit:     $("fUnit").value  || "",
  };
}
function aplicarFiltros(list, f) {
  return list.filter(p => {
    if (f.nombre && !(String(p.nombre).toLowerCase().includes(f.nombre))) return false;
    if (f.pmin != null && Number.isFinite(f.pmin) && Number(p.precio) < f.pmin) return false;
    if (f.pmax != null && Number.isFinite(f.pmax) && Number(p.precio) > f.pmax) return false;
    if (f.catp  && String(p.categoria_principal_id)  !== f.catp)  return false;
    if (f.cats  && String(p.categoria_secundaria_id) !== f.cats)  return false;
    if (f.subc  && String(p.subcategoria_id)         !== f.subc)  return false;
    if (f.marca && String(p.brand_id)                !== f.marca) return false;
    if (f.size  && String(p.size_id)                 !== f.size)  return false;
    if (f.unit  && String(p.unit_id)                 !== f.unit)  return false;
    return true;
  });
}

/* =========================================================
   Render tabla
   ========================================================= */
function renderTabla() {
  const tbody = $("tbProductos");
  const f = getFilters();
  const rows = aplicarFiltros(state.productos, f);
  $("lblCount").textContent = String(rows.length);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-message">Sin resultados.</td></tr>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const p of rows) {
    const stockN   = Number(p.stock_total || 0);
    const stockCls = stockN > 0 ? "text-success" : "text-textMuted";

    // Columna categorías: badges apilados, omitir vacíos
    const catBadges = [
      { label: p.categoria_principal_nombre,   cls: "bg-primary/10 text-primary border-primary/20" },
      { label: p.categoria_secundaria_nombre,  cls: "bg-secondary/10 text-secondary border-secondary/20" },
      { label: p.subcategoria_nombre,          cls: "bg-accent/10 text-accent-dark border-accent/20" }
    ].filter(b => b.label && b.label.trim())
     .map(b => `<span class="inline-flex items-center px-2 py-0.5 mr-0.5 mb-0.5 rounded-full text-xs font-semibold border ${b.cls}">${escapeHtml(b.label)}</span>`)
     .join("") || `<span class="text-textMuted text-xs italic">—</span>`;

    const isActivo = Number(p.estado) === 1;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.producto_id}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${fmtMoney(p.precio)}</td>
      <td>${escapeHtml(p.brand_nombre)}</td>
      <td>${catBadges}</td>
      <td>${escapeHtml(p.size_value ?? "")} ${escapeHtml(p.size_nombre)}</td>
      <td>${p.unit_value ?? ""} ${escapeHtml(p.unit_nombre)}</td>
      <td><span class="font-bold ${stockCls}">${stockN}</span></td>
      <td>${renderCajasBadges(p.producto_id)}</td>
      <td>
        ${isActivo
          ? `<button class="js-goto-stock inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors shadow-sm" data-id="${p.producto_id}" title="Gestionar stock">
               <i class="fa-solid fa-warehouse"></i> Stock
             </button>`
          : `<span class="text-textMuted text-xs italic">Inactivo</span>`
        }
      </td>`;
    frag.appendChild(tr);
  }
  tbody.innerHTML = "";
  tbody.appendChild(frag);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]
  ));
}

/* =========================================================
   Modal: Agregar producto  (forzoso con caja + stock)
   ========================================================= */
function resetFormProducto() {
  $("formProducto").reset();
  // Re-pintar selects para tomar posibles nuevos catálogos
  paintAllSelects();
}
function openProductoModal() {
  resetFormProducto();
  openModal("modalProducto");
}
async function submitProducto(ev) {
  ev.preventDefault();
  try {
    const payload = {
      nombre: $("pNombre").value.trim(),
      descripcion: $("pDesc").value.trim() || null,
      precio: Number($("pPrecio").value),
      categoria_principal_id: Number($("pCatP").value || 0),
      categoria_secundaria_id: $("pCatS").value ? Number($("pCatS").value) : null,
      subcategoria_id:        $("pSubc").value ? Number($("pSubc").value) : null,
      unit_id:   Number($("pUnit").value || 0),
      unit_value: Number($("pUnitVal").value),
      size_id:   Number($("pSize").value || 0),
      size_value: $("pSizeVal").value.trim(),
      brand_id:  Number($("pMarca").value || 0),
      caja_id:   Number($("pCaja").value || 0),
      stock_inicial: Number($("pStock").value)
    };
    // Validaciones mínimas front
    if (!payload.nombre) throw new Error("Nombre requerido");
    if (!Number.isFinite(payload.precio) || payload.precio < 0) throw new Error("Precio inválido");
    if (!payload.categoria_principal_id) throw new Error("Categoría principal requerida");
    if (!payload.brand_id) throw new Error("Marca requerida");
    if (!payload.unit_id) throw new Error("Unidad volumen requerida");
    if (!payload.size_id) throw new Error("Unidad tamaño requerida");
    if (!payload.size_value) throw new Error("Valor tamaño requerido");
    if (!Number.isFinite(payload.unit_value) || payload.unit_value < 0) throw new Error("Valor volumen inválido");
    if (!payload.caja_id) throw new Error("Caja requerida");
    if (!Number.isInteger(payload.stock_inicial) || payload.stock_inicial < 0) throw new Error("Stock inicial inválido");

    // Endpoint compuesto producto + stock
    const res = await fetch("/productos/insert_with_stock", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Error ${res.status}`);
    }
    toast("Producto creado", "success", "fa-circle-check");
    closeModal("modalProducto");
    await loadProductos();
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

/* =========================================================
   Quick-insert (+) de catálogos
   ========================================================= */
const QUICK = {
  catp: {
    title: "Nueva categoría principal",
    fields: [
      { id: "qNombre", label: "Nombre", type: "text", required: true },
      { id: "qDesc",   label: "Descripción", type: "text" }
    ],
    submit: async ({ qNombre, qDesc }) => {
      const r = assertOk(await categoriasAPI.insert({ nombre: qNombre, descripcion: qDesc || null }));
      const row = asArray(r)[0] || {};
      return { id: row.categoria_id, label: row.nombre || qNombre, targetSelect: "pCatP", cache: "catp" };
    }
  },
  cats: {
    title: "Nueva categoría secundaria",
    fields: [{ id: "qNombre", label: "Nombre", type: "text", required: true }],
    submit: async ({ qNombre }) => {
      const r = assertOk(await categoriasSecundariasAPI.insert({ nombre: qNombre }));
      const row = asArray(r)[0] || {};
      return { id: row.categoria_secundaria_id, label: row.nombre || qNombre, targetSelect: "pCatS", cache: "cats" };
    }
  },
  subc: {
    title: "Nueva subcategoría",
    fields: [{ id: "qNombre", label: "Nombre", type: "text", required: true }],
    submit: async ({ qNombre }) => {
      const r = assertOk(await subcategoriasAPI.insert({ nombre: qNombre }));
      const row = asArray(r)[0] || {};
      return { id: row.subcategoria_id, label: row.nombre || qNombre, targetSelect: "pSubc", cache: "subc" };
    }
  },
  brand: {
    title: "Nueva marca",
    fields: [{ id: "qNombre", label: "Nombre", type: "text", required: true }],
    submit: async ({ qNombre }) => {
      const r = assertOk(await brandsAPI.insert({ nombre: qNombre }));
      const row = asArray(r)[0] || {};
      return { id: row.brand_id, label: row.nombre || qNombre, targetSelect: "pMarca", cache: "brands" };
    }
  },
  unit: {
    title: "Nueva unidad de volumen",
    fields: [{ id: "qNombre", label: "Nombre (ej. Litro)", type: "text", required: true }],
    submit: async ({ qNombre }) => {
      const r = assertOk(await unitsAPI.insert({ nombre: qNombre }));
      const row = asArray(r)[0] || {};
      return { id: row.unit_id, label: row.nombre || qNombre, targetSelect: "pUnit", cache: "units" };
    }
  },
  size: {
    title: "Nueva unidad de tamaño",
    fields: [{ id: "qNombre", label: "Nombre (ej. Metro)", type: "text", required: true }],
    submit: async ({ qNombre }) => {
      const r = assertOk(await sizesAPI.insert({ nombre: qNombre }));
      const row = asArray(r)[0] || {};
      return { id: row.size_id, label: row.nombre || qNombre, targetSelect: "pSize", cache: "sizes" };
    }
  },
  caja: {
    title: "Nueva caja",
    fields: [
      {
        id: "qLetra1", label: "Letra", type: "select", required: true,
        options: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => ({ value: l, label: l }))
      },
      {
        id: "qLetra2", label: "Segunda letra (opcional)", type: "select", required: false,
        options: [{ value: "", label: "— ninguna —" },
                  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => ({ value: l, label: l }))]
      },
      {
        id: "qCara", label: "Cara", type: "select", required: true,
        options: [{ value: "1", label: "1 — FRENTE" }, { value: "2", label: "2 — ATRÁS" }]
      },
      {
        id: "qNivel", label: "Nivel", type: "select", required: true,
        options: [{ value: "1", label: "1 — ARRIBA" }, { value: "2", label: "2 — ABAJO" }]
      }
    ],
    submit: async ({ qLetra1, qLetra2, qCara, qNivel }) => {
      const letra = qLetra2 ? qLetra1 + qLetra2 : qLetra1;
      const r = assertOk(await cajasAPI.insert({ letra, cara: Number(qCara), nivel: Number(qNivel) }));
      const row = asArray(r)[0] || {};
      return {
        id: row.caja_id,
        label: row.etiqueta || `${letra}-${qCara}-${qNivel}`,
        targetSelect: "pCaja",
        cache: "cajas"
      };
    }
  }
};

const INPUT_CLS = "w-full p-2.5 border border-gray-300 rounded-md focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/20 bg-white";
const LABEL_CLS = "block font-semibold text-textMain text-sm mb-1";

function openQuickModal(kind) {
  const cfg = QUICK[kind];
  if (!cfg) return;
  $("quickTitle").textContent = cfg.title;
  const holder = $("quickFields");
  holder.innerHTML = "";

  for (const f of cfg.fields) {
    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-1";
    const labelHtml = `<label for="${f.id}" class="${LABEL_CLS}">${escapeHtml(f.label)}${f.required ? '<span class="required-star">*</span>' : ""}</label>`;

    if (f.type === "select") {
      // Build <select> from options array: [{ value, label }]
      const opts = (f.options || []).map(o =>
        `<option value="${escapeHtml(String(o.value))}">${escapeHtml(String(o.label))}</option>`
      ).join("");
      wrap.innerHTML = `${labelHtml}<select id="${f.id}" class="${INPUT_CLS}"${f.required ? " required" : ""}>${opts}</select>`;
    } else {
      const attrs = [
        `id="${f.id}"`,
        `class="${INPUT_CLS}"`,
        `type="${f.type}"`,
        f.required ? "required" : "",
        f.maxlength ? `maxlength="${f.maxlength}"` : "",
        f.min != null ? `min="${f.min}"` : "",
        f.max != null ? `max="${f.max}"` : "",
        f.placeholder ? `placeholder="${escapeHtml(f.placeholder)}"` : ""
      ].filter(Boolean).join(" ");
      wrap.innerHTML = `${labelHtml}<input ${attrs} />`;
    }
    holder.appendChild(wrap);
  }

  $("formQuick").dataset.kind = kind;
  openModal("modalQuick");
  setTimeout(() => holder.querySelector("input, select")?.focus(), 50);
}

async function submitQuick(ev) {
  ev.preventDefault();
  const kind = $("formQuick").dataset.kind;
  const cfg = QUICK[kind];
  if (!cfg) return;
  const values = {};
  for (const f of cfg.fields) {
    const el = $(f.id);
    const v = (el?.value ?? "").trim();
    if (f.required && !v) { toast(`${f.label} requerido`, "error", "fa-circle-exclamation"); return; }
    values[f.id] = v;
  }
  try {
    const { id, label, targetSelect, cache } = await cfg.submit(values);
    if (id == null) throw new Error("Respuesta sin id");
    // Recargar catálogo afectado y re-pintar todos los selects
    await loadCatalogos();
    paintAllSelects();
    // Seleccionar automáticamente el recién creado
    const sel = $(targetSelect);
    if (sel) sel.value = String(id);
    toast(`${label} creado`, "success", "fa-circle-check");
    closeModal("modalQuick");
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

/* =========================================================
   Módulo Stock — selector, detalle y modales add/remove
   ========================================================= */
const stk = {
  producto_id: null,
  producto: null,
  detalles: []   // [{ detalle_id, caja_id, etiqueta, stock }]
};

function stkFindProducto(id) {
  const n = Number(id);
  return state.productos.find(p => Number(p.producto_id) === n) || null;
}

function stkReset() {
  stk.producto_id = null;
  stk.producto = null;
  stk.detalles = [];
  $("stkProductoBox")?.classList.add("hidden");
  $("stkPlaceholder")?.classList.remove("hidden");
}

async function stkOnProductoChange() {
  const id = Number($("stkProductoSel").value || 0);
  if (!id) { stkReset(); return; }
  const p = stkFindProducto(id);
  if (!p || Number(p.estado) !== 1) {
    toast("Producto no disponible (inactivo)", "error", "fa-circle-exclamation");
    $("stkProductoSel").value = "";
    stkReset();
    return;
  }
  stk.producto_id = id;
  stk.producto = p;
  // Pinta datos básicos
  $("stkProdNombre").textContent = p.nombre || `#${id}`;
  $("stkProdId").textContent     = String(id);
  $("stkProdMarca").textContent  = p.brand_nombre || "—";
  $("stkPlaceholder")?.classList.add("hidden");
  $("stkProductoBox")?.classList.remove("hidden");
  await stkRefreshDetalles();
}

async function stkRefreshDetalles() {
  const id = stk.producto_id;
  const tbody = $("tbStkDetalles");
  if (!id || !tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="table-message">Cargando…</td></tr>`;
  try {
    const resp = assertOk(await stockAPI.getByProducto(id));
    const rows = asArray(resp);
    stk.detalles = rows.map(r => ({
      detalle_id: r.detalle_id ?? null,
      caja_id:    r.caja_id ?? null,
      etiqueta:   r.etiqueta ?? r.caja_etiqueta ?? null,
      stock:      Number(r.stock || 0)
    }));
    let total = 0;
    let conStock = 0;
    if (!stk.detalles.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="table-message">Sin registros de stock.</td></tr>`;
    } else {
      tbody.innerHTML = "";
      for (const r of stk.detalles) {
        total += r.stock;
        if (r.stock > 0) conStock++;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.detalle_id ?? "—"}</td>
          <td>${r.caja_id ?? "—"}</td>
          <td>${escapeHtml(r.etiqueta || `Caja ${r.caja_id ?? "?"}`)}</td>
          <td><span class="font-bold ${r.stock > 0 ? "text-success" : "text-textMuted"}">${r.stock}</span></td>`;
        tbody.appendChild(tr);
      }
    }
    $("stkStockTotal").textContent = String(total);
    $("stkCajasCount").textContent = String(conStock);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="table-message">No se pudo cargar el stock.</td></tr>`;
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

function stkOpenAddModal() {
  if (!stk.producto_id) return toast("Selecciona un producto primero", "error", "fa-circle-exclamation");

  // Poblar select con todas las cajas; marcar las que ya tienen stock de este producto
  const stockMap = new Map(stk.detalles.map(d => [String(d.caja_id), d.stock]));
  const sel = $("addCajaSelect");
  sel.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = ""; empty.textContent = "— Seleccione una caja —";
  sel.appendChild(empty);

  // Cajas con stock existente primero
  const conStock   = state.cat.cajas.filter(c => stockMap.has(String(c.caja_id)));
  const sinStock   = state.cat.cajas.filter(c => !stockMap.has(String(c.caja_id)));

  if (conStock.length) {
    const grp = document.createElement("optgroup");
    grp.label = "Ya tiene stock";
    for (const c of conStock) {
      const op = document.createElement("option");
      op.value = String(c.caja_id);
      op.textContent = `${c.etiqueta}  (stock actual: ${stockMap.get(String(c.caja_id))})`;
      grp.appendChild(op);
    }
    sel.appendChild(grp);
  }
  if (sinStock.length) {
    const grp = document.createElement("optgroup");
    grp.label = "Sin stock de este producto";
    for (const c of sinStock) {
      const op = document.createElement("option");
      op.value = String(c.caja_id);
      op.textContent = c.etiqueta;
      grp.appendChild(op);
    }
    sel.appendChild(grp);
  }

  $("addProdName").textContent = stk.producto?.nombre || `#${stk.producto_id}`;
  $("addDelta").value = "";
  openModal("modalAddStock");
}
function stkOpenRemoveModal() {
  if (!stk.producto_id) return toast("Selecciona un producto primero", "error", "fa-circle-exclamation");

  // Solo cajas con stock > 0. Usamos detalle_id como value (caja_id no viene del SP de lectura).
  const cajasConStock = stk.detalles.filter(d => d.stock > 0);
  const sel = $("removeCajaSelect");
  sel.innerHTML = "";

  if (!cajasConStock.length) {
    const op = document.createElement("option");
    op.value = ""; op.textContent = "— Sin stock en ninguna caja —";
    sel.appendChild(op);
  } else {
    const empty = document.createElement("option");
    empty.value = ""; empty.textContent = "— Seleccione una caja —";
    sel.appendChild(empty);
    for (const d of cajasConStock) {
      const op = document.createElement("option");
      op.value = String(d.detalle_id);               // ← detalle_id, no caja_id
      op.textContent = `${escapeHtml(d.etiqueta || `Detalle #${d.detalle_id}`)}  (stock: ${d.stock})`;
      sel.appendChild(op);
    }
  }

  $("remProdName").textContent = stk.producto?.nombre || `#${stk.producto_id}`;
  $("removeDelta").value = "";
  openModal("modalRemoveStock");
}

async function stkSubmitAdd(ev) {
  ev.preventDefault();
  const producto_id = stk.producto_id;
  if (!producto_id) return;
  const caja_id = Number($("addCajaSelect").value || 0);
  const delta = Number($("addDelta").value);
  if (!caja_id) return toast("Selecciona una caja", "error", "fa-circle-exclamation");
  if (!Number.isInteger(delta) || delta <= 0) return toast("Cantidad inválida", "error", "fa-circle-exclamation");
  try {
    assertOk(await stockAPI.add({ caja_id, producto_id, delta }));
    toast("Stock agregado", "success", "fa-circle-check");
    closeModal("modalAddStock");
    await stkRefreshDetalles();
    await loadProductos();
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}
async function stkSubmitRemove(ev) {
  ev.preventDefault();
  const producto_id = stk.producto_id;
  if (!producto_id) return;
  const caja_id = Number($("removeCajaSelect").value || 0);
  const delta = Number($("removeDelta").value);
  if (!caja_id) return toast("Selecciona una caja", "error", "fa-circle-exclamation");
  if (!Number.isInteger(delta) || delta <= 0) return toast("Cantidad inválida", "error", "fa-circle-exclamation");
  try {
    assertOk(await stockAPI.remove({ caja_id, producto_id, delta }));
    toast("Stock retirado", "success", "fa-circle-check");
    closeModal("modalRemoveStock");
    await stkRefreshDetalles();
    await loadProductos();
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

/* =========================================================
   Wire-up inicial
   ========================================================= */
function resetFiltros() {
  ["fNombre","fPrecioMin","fPrecioMax"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  ["fCatP","fCatS","fSubc","fMarca","fSize","fUnit"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  renderTabla();
}

function wire() {
  // Filtros: render en cada cambio (client-side)
  const debounced = debounce(renderTabla, 120);
  ["fNombre","fPrecioMin","fPrecioMax"].forEach(id => $(id)?.addEventListener("input", debounced));
  ["fCatP","fCatS","fSubc","fMarca","fSize","fUnit"].forEach(id => $(id)?.addEventListener("change", renderTabla));
  $("btnReset")?.addEventListener("click", resetFiltros);
  $("btnRecargar")?.addEventListener("click", async () => {
    await loadCatalogos();
    await loadProductos();
    paintAllSelects();
    paintStockProductoSelect();
    renderTabla();
    toast("Datos actualizados", "info", "fa-arrows-rotate");
  });

  // Botón Stock en fila → selecciona en módulo stock y hace scroll
  $("tbProductos")?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".js-goto-stock");
    if (!btn) return;
    const id = btn.dataset.id;
    const sel = $("stkProductoSel");
    if (!sel) return;
    sel.value = id;
    await stkOnProductoChange();
    $("stockSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Agregar producto
  $("btnNuevoProducto")?.addEventListener("click", openProductoModal);
  $("closeModalProducto")?.addEventListener("click", () => closeModal("modalProducto"));
  $("cancelProducto")?.addEventListener("click", () => closeModal("modalProducto"));
  $("formProducto")?.addEventListener("submit", submitProducto);

  // Botones "+" quick-insert
  document.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener("click", () => openQuickModal(btn.dataset.add));
  });
  $("closeModalQuick")?.addEventListener("click", () => closeModal("modalQuick"));
  $("cancelQuick")?.addEventListener("click", () => closeModal("modalQuick"));
  $("formQuick")?.addEventListener("submit", submitQuick);

  // Módulo Stock
  $("stkProductoSel")?.addEventListener("change", stkOnProductoChange);
  $("btnStkRefrescar")?.addEventListener("click", async () => {
    if (!stk.producto_id) { toast("Selecciona un producto primero", "info", "fa-circle-info"); return; }
    await stkRefreshDetalles();
    toast("Stock refrescado", "info", "fa-arrows-rotate");
  });
  $("btnOpenAddStock")?.addEventListener("click", stkOpenAddModal);
  $("btnOpenRemoveStock")?.addEventListener("click", stkOpenRemoveModal);
  $("formAddStock")?.addEventListener("submit", stkSubmitAdd);
  $("formRemoveStock")?.addEventListener("submit", stkSubmitRemove);

  // Cierre genérico de modales: botones con data-close-modal
  document.querySelectorAll("[data-close-modal]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
  });

  // Cerrar modales al click fuera
  document.querySelectorAll(".modal").forEach(m => {
    m.addEventListener("click", (ev) => { if (ev.target === m) m.classList.remove("show"); });
  });
}

async function init() {
  wire();
  try {
    await loadCatalogos();
    paintAllSelects();
    await loadProductos();
    paintStockProductoSelect(); // refresca el select del módulo stock (depende de state.productos)
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

document.addEventListener("DOMContentLoaded", init);

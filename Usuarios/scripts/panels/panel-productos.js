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

  // Modal stock
  fillSelect($("sAddCaja"), state.cat.cajas, "caja_id", "etiqueta", { emptyLabel: "— Selecciona —" });
  fillSelect($("sRemCaja"), state.cat.cajas, "caja_id", "etiqueta", { emptyLabel: "— Selecciona —" });
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
      if (!state.cajasPorProducto.has(pid)) state.cajasPorProducto.set(pid, []);
      state.cajasPorProducto.get(pid).push({
        caja_id: row.caja_id ?? null,
        etiqueta: row.etiqueta ?? row.caja ?? "?",
        stock: Number(row.stock ?? 0)
      });
    }
  } catch { /* silencioso — si el endpoint no rinde, seguimos con stock_total */ }
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
    tbody.innerHTML = `<tr><td colspan="12" class="muted" style="text-align:center;padding:1.5rem">Sin resultados.</td></tr>`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const p of rows) {
    const cajas = state.cajasPorProducto.get(p.producto_id) || [];
    const chips = cajas.length
      ? cajas.map(c => `<span class="chip">${c.etiqueta}${c.stock != null ? ` · ${c.stock}` : ""}</span>`).join("")
      : `<span class="muted">—</span>`;
    const stockClass = Number(p.stock_total) > 0 ? "badge badge-stock" : "badge badge-empty";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.producto_id}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${fmtMoney(p.precio)}</td>
      <td>${escapeHtml(p.brand_nombre)}</td>
      <td>${escapeHtml(p.categoria_principal_nombre)}</td>
      <td>${escapeHtml(p.categoria_secundaria_nombre)}</td>
      <td>${escapeHtml(p.subcategoria_nombre)}</td>
      <td>${escapeHtml(p.size_nombre)} ${escapeHtml(p.size_value ?? "")}</td>
      <td>${escapeHtml(p.unit_nombre)} ${p.unit_value ?? ""}</td>
      <td><span class="${stockClass}">${p.stock_total ?? 0}</span></td>
      <td>${chips}</td>
      <td>
        <div class="actions-col">
          <button class="btn btn-outline btn-sm js-stock" data-id="${p.producto_id}" data-nombre="${escapeHtml(p.nombre)}">
            <i class="fa-solid fa-boxes-stacked"></i> Stock
          </button>
        </div>
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
      { id: "qLetra", label: "Letra (A–ZZ)", type: "text", required: true, maxlength: 2 },
      { id: "qCara",  label: "Cara (1 o 2)", type: "number", required: true, min: 1, max: 2 },
      { id: "qNivel", label: "Nivel",         type: "number", required: true, min: 1, max: 99 }
    ],
    submit: async ({ qLetra, qCara, qNivel }) => {
      const r = assertOk(await cajasAPI.insert({ letra: qLetra, cara: Number(qCara), nivel: Number(qNivel) }));
      const row = asArray(r)[0] || {};
      return {
        id: row.caja_id,
        label: row.etiqueta || `${qLetra}-${qCara}-${qNivel}`,
        targetSelect: "pCaja",
        cache: "cajas"
      };
    }
  }
};

function openQuickModal(kind) {
  const cfg = QUICK[kind];
  if (!cfg) return;
  $("quickTitle").textContent = cfg.title;
  const holder = $("quickFields");
  holder.innerHTML = "";
  for (const f of cfg.fields) {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = ".6rem";
    const attrs = [
      `id="${f.id}"`,
      `class="form-control"`,
      `type="${f.type}"`,
      f.required ? "required" : "",
      f.maxlength ? `maxlength="${f.maxlength}"` : "",
      f.min != null ? `min="${f.min}"` : "",
      f.max != null ? `max="${f.max}"` : ""
    ].filter(Boolean).join(" ");
    wrap.innerHTML = `<label class="form-label">${f.label}${f.required ? '<span class="required-star">*</span>' : ""}</label><input ${attrs} />`;
    holder.appendChild(wrap);
  }
  $("formQuick").dataset.kind = kind;
  openModal("modalQuick");
  setTimeout(() => holder.querySelector("input")?.focus(), 50);
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
   Modal Stock
   ========================================================= */
async function openStockModal(producto_id, nombre) {
  $("stockProdId").value = String(producto_id);
  $("stockProdName").textContent = nombre || `#${producto_id}`;
  $("sAddQty").value = "";
  $("sRemQty").value = "";
  await refreshStockDetalles(producto_id);
  openModal("modalStock");
}

async function refreshStockDetalles(producto_id) {
  const cont = $("stockDetalles");
  cont.innerHTML = `<p class="muted">Cargando…</p>`;
  try {
    const resp = assertOk(await stockAPI.getByProducto(producto_id));
    const rows = asArray(resp);
    let total = 0;
    if (!rows.length) {
      cont.innerHTML = `<p class="muted">Sin registros de stock.</p>`;
    } else {
      cont.innerHTML = "";
      for (const r of rows) {
        total += Number(r.stock || 0);
        const row = document.createElement("div");
        row.className = "stock-detalle-row";
        row.innerHTML = `
          <span class="badge">${escapeHtml(r.etiqueta || "?")}</span>
          <span class="stock-val">${r.stock ?? 0}</span>
          <span class="muted" style="flex:1">detalle #${r.detalle_id ?? ""}</span>`;
        cont.appendChild(row);
      }
    }
    $("stockTotal").textContent = String(total);
  } catch (e) {
    cont.innerHTML = `<p class="muted">No se pudo cargar el stock.</p>`;
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

async function doStockAdd() {
  const producto_id = Number($("stockProdId").value);
  const caja_id = Number($("sAddCaja").value);
  const delta = Number($("sAddQty").value);
  if (!caja_id) return toast("Selecciona una caja", "error", "fa-circle-exclamation");
  if (!Number.isInteger(delta) || delta <= 0) return toast("Cantidad inválida", "error", "fa-circle-exclamation");
  try {
    assertOk(await stockAPI.add({ caja_id, producto_id, delta }));
    toast("Stock agregado", "success", "fa-circle-check");
    $("sAddQty").value = "";
    await refreshStockDetalles(producto_id);
    // Refrescar tabla principal para stock_total / cajas
    await loadProductos();
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}
async function doStockRem() {
  const producto_id = Number($("stockProdId").value);
  const caja_id = Number($("sRemCaja").value);
  const delta = Number($("sRemQty").value);
  if (!caja_id) return toast("Selecciona una caja", "error", "fa-circle-exclamation");
  if (!Number.isInteger(delta) || delta <= 0) return toast("Cantidad inválida", "error", "fa-circle-exclamation");
  try {
    assertOk(await stockAPI.remove({ caja_id, producto_id, delta }));
    toast("Stock retirado", "success", "fa-circle-check");
    $("sRemQty").value = "";
    await refreshStockDetalles(producto_id);
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
    paintAllSelects();
    await loadProductos();
    renderTabla();
    toast("Datos actualizados", "info", "fa-arrows-rotate");
  });

  // Acciones en filas (delegación)
  $("tbProductos")?.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".js-stock");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const nombre = btn.dataset.nombre || "";
    openStockModal(id, nombre);
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

  // Stock modal
  $("closeModalStock")?.addEventListener("click", () => closeModal("modalStock"));
  $("btnAddStock")?.addEventListener("click", doStockAdd);
  $("btnRemStock")?.addEventListener("click", doStockRem);

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
    renderTabla();
  } catch (e) {
    toast(errMsg(e), "error", "fa-circle-exclamation");
  }
}

document.addEventListener("DOMContentLoaded", init);

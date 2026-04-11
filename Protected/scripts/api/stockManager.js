// API para gestión de STOCK
// Coincide con el montaje del server: app.use('/stock', stockRouter);
const BASE = '/stock';

function extractErrorMessage(data, res) {
    if (data && typeof data === 'object') return data.message || data.error || `Error ${res.status}`;
    return typeof data === 'string' && data.trim() ? data : `Error ${res.status}`;
}

async function apiFetch(path, { method = 'GET', body } = {}) {
    const opts = {
        method,
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
    };
    if (body != null) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`${BASE}${path}`, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(extractErrorMessage(data, res));
    return data;
}

const toIntOrThrow = (v, label = 'id') => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} inválido`);
    return n;
};
const toPosInt = (v, label = 'cantidad') => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} debe ser entero > 0`);
    return n;
};
const toNonNegInt = (v, label = 'stock') => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${label} debe ser entero >= 0`);
    return n;
};

const stockAPI = {
    /* ----- Lecturas ----- */
    getByProducto: (producto_id) =>
        apiFetch(`/producto/${toIntOrThrow(producto_id, 'producto_id')}`),

    getDetallesPorProducto: (producto_id) =>
        apiFetch(`/detalles_por_producto/${toIntOrThrow(producto_id, 'producto_id')}`),

    getDetallePorId: (detalle_id) =>
        apiFetch(`/detalle_por_id/${toIntOrThrow(detalle_id, 'detalle_id')}`),

    /* ----- Mutaciones ----- */
    add: (p) => apiFetch('/add', {
        method: 'POST',
        body: {
            caja_id: toIntOrThrow(p.caja_id, 'caja_id'),
            producto_id: toIntOrThrow(p.producto_id, 'producto_id'),
            delta: toPosInt(p.delta, 'delta')
        }
    }),

    remove: (p) => apiFetch('/remove', {
        method: 'POST',
        body: {
            caja_id: toIntOrThrow(p.caja_id, 'caja_id'),
            producto_id: toIntOrThrow(p.producto_id, 'producto_id'),
            delta: toPosInt(p.delta, 'delta')
        }
    }),

    setByDetalle: (p) => apiFetch('/set_by_detalle', {
        method: 'POST',
        body: {
            detalle_id: toIntOrThrow(p.detalle_id, 'detalle_id'),
            producto_id: toIntOrThrow(p.producto_id, 'producto_id'),
            stock: toNonNegInt(p.stock, 'stock')
        }
    }),

    move: (p) => apiFetch('/move', {
        method: 'POST',
        body: {
            producto_id: toIntOrThrow(p.producto_id, 'producto_id'),
            caja_origen: toIntOrThrow(p.caja_origen, 'caja_origen'),
            caja_destino: toIntOrThrow(p.caja_destino, 'caja_destino'),
            cantidad: toPosInt(p.cantidad, 'cantidad')
        }
    })
};

export { stockAPI };

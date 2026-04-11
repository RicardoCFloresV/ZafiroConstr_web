// API para creación de productos
const nuevoProductoAPI = {
    async insertWithStock(data) {
        const response = await fetch('/productos/insert_with_stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        return await response.json();
    },

    async getCajaByComponents(letra, cara, nivel) {
        const response = await fetch(
            `/cajas/por_componentes?letra=${encodeURIComponent(letra)}&cara=${Number(cara)}&nivel=${Number(nivel)}`,
            { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }
        );
        return await response.json();
    },

    // Métodos para obtener datos relacionados
    async getCategorias() {
        const response = await fetch('/categorias/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    },

    async getCategoriasSecundarias() {
        const response = await fetch('/categorias_secundarias/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    },

    async getSubcategorias() {
        const response = await fetch('/subcategorias/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    },

    async getUnits() {
        const response = await fetch('/units/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    },

    async getSizes() {
        const response = await fetch('/sizes/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    },

    async getBrands() {
        const response = await fetch('/brands/get_all', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        return await response.json();
    }
};

export { nuevoProductoAPI };
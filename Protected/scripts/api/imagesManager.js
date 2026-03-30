/**
 * imagesManager.js
 * Cliente para gestionar la API de imágenes.
 */

const IMAGES_API_BASE = '/imagenes';

const imagesManager = {
  
  /**
   * Obtiene la lista de imágenes de un producto.
   * @param {number|string} productoId 
   * @returns {Promise<Array>} Lista de objetos imagen (extraída de response.data)
   */
  async getByProduct(productoId) {
    try {
      const response = await fetch(`${IMAGES_API_BASE}/producto/${productoId}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Error al cargar imágenes');
      }
      // El backend devuelve { success: true, data: [...] }
      return result.data || [];
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  /**
   * Sube una nueva imagen para un producto.
   * @param {number|string} productoId 
   * @param {File} fileObject - El archivo obtenido de un input type="file"
   * @returns {Promise<Object>} La imagen creada (extraída de response.data)
   */
  async upload(productoId, fileObject) {
    const formData = new FormData();
    formData.append('image', fileObject); // 'image' debe coincidir con upload.single('image') del backend

    try {
      const response = await fetch(`${IMAGES_API_BASE}/producto/${productoId}`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Error al subir imagen');
      }
      
      // El backend devuelve { success: true, message: '...', data: { imagen_id... } }
      return result.data;
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  /**
   * Elimina una imagen por su ID.
   * @param {number|string} imagenId 
   * @returns {Promise<Object>} Resultado completo { success, message }
   */
  async delete(imagenId) {
    try {
      const response = await fetch(`${IMAGES_API_BASE}/${imagenId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Error al eliminar imagen');
      }

      return result;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }
};

// Exportar globalmente si no usas módulos ES6, o usar "export default" si es módulo
window.imagesManager = imagesManager;
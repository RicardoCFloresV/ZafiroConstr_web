// scripts/Formularios/Login.js
import { showError } from "./errorHandler.js";

const form = document.getElementById("form-login");
const inputUser = document.getElementById("Usuario");
const inputPass = document.getElementById("Contraseña");
const errorMessageElement = document.getElementById("error-message");
const loginModalEl = document.getElementById("loginmodal");

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessageElement.textContent = "";

  const login = inputUser.value.trim(); // Changed from email to login
  const password = inputPass.value;

  try {
    const result = await tryLogin(login, password);

    if (result?.success) {
      console.log("Login exitoso:", result);
      form.reset();

      // Close modal
      const modal = bootstrap.Modal.getInstance(loginModalEl);
      modal.hide();

      // Redirect based on role
      setTimeout(() => {
        if (result.isAdmin) {
          window.location.href = "admin-resources/pages/admin.html";
        } else {
          window.location.href = "user-resources/pages/panel-productos.html";
        }
      }, 500);

    } else if (result) {
      // Credential error
      showError(result.message || "Inicio de sesión fallido. Verifica tus datos.", errorMessageElement);
    } else {
      // No response
      showError("No hay conexión con la base de datos.", errorMessageElement);
    }

  } catch (error) {
    console.error("Login error:", error);
    
    // Handle HTML response errors
    if (error.message?.includes("Unexpected token") || error.message?.includes("JSON")) {
      showError("Error en la respuesta del servidor. Por favor, intente más tarde.", errorMessageElement);
    } else if (error.message?.includes("404")) {
      showError("No hay conexión con la base de datos.", errorMessageElement);
    } else {
      showError("Error al iniciar sesión: " + error.message, errorMessageElement);
    }
  }
});

async function tryLogin(login, password) {
  try {
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }) // Changed from email to login
    });
    
    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Server returned non-JSON response");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error in tryLogin:", error);
    throw error;
  }
}
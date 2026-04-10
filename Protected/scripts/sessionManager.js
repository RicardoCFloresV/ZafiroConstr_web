/* ============================================================
   Zafiro Home — Session Manager
   - Carga datos del usuario actual desde /auth/status
   - Llena el header (avatar / nombre / rol) y el bloque móvil
   - Maneja el botón de cerrar sesión (POST /auth/logout)
   - Maneja el toggle del sidebar móvil
   ============================================================ */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function buildAvatarUrl(name) {
    const safe = encodeURIComponent(name || "Usuario");
    return `https://ui-avatars.com/api/?name=${safe}&background=2d4778&color=fff&bold=true`;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setAvatar(id, name) {
    const el = $(id);
    if (el) el.src = buildAvatarUrl(name);
  }

  function fillUserInfo(data) {
    const username = data?.username || "Usuario";
    const role = data?.isAdmin
      ? "Administrador"
      : data?.isUser
      ? "Usuario"
      : (data?.userType || "Invitado");

    setText("header-username", username);
    setText("header-role", role);
    setAvatar("header-avatar", username);

    setText("sidebar-username", username);
    setText("sidebar-role", role);
    setAvatar("sidebar-avatar", username);
  }

  async function loadSession() {
    try {
      const r = await fetch("/auth/status", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("status " + r.status);
      const data = await r.json();
      if (!data.authenticated) {
        // Sin sesión: enviar al login
        window.location.replace("/index.html");
        return;
      }
      fillUserInfo(data);
    } catch (err) {
      console.warn("[sessionManager] no se pudo obtener /auth/status:", err);
      fillUserInfo({ username: "Usuario", userType: "—" });
    }
  }

  async function doLogout() {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Accept": "application/json" }
      });
    } catch (e) {
      console.warn("[sessionManager] error al cerrar sesión:", e);
    } finally {
      window.location.replace("/index.html");
    }
  }

  function wireLogout() {
    document.querySelectorAll("[data-logout], #logout-btn, #logout-btn-mobile").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        doLogout();
      });
    });
  }

  function wireSidebarToggle() {
    const sidebar = $("sidebar");
    const overlay = $("sidebar-overlay");
    const toggle  = $("menu-toggle");
    const close   = $("sidebar-close");

    if (!sidebar) return;

    function open() {
      sidebar.classList.remove("-translate-x-full");
      sidebar.classList.add("translate-x-0");
      if (overlay) overlay.classList.remove("hidden");
      document.body.classList.add("sidebar-open");
    }
    function shut() {
      sidebar.classList.add("-translate-x-full");
      sidebar.classList.remove("translate-x-0");
      if (overlay) overlay.classList.add("hidden");
      document.body.classList.remove("sidebar-open");
    }

    toggle?.addEventListener("click", () => {
      const isOpen = !sidebar.classList.contains("-translate-x-full");
      isOpen ? shut() : open();
    });
    overlay?.addEventListener("click", shut);
    close?.addEventListener("click", shut);

    // Cerrar al cambiar a desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) {
        if (overlay) overlay.classList.add("hidden");
        document.body.classList.remove("sidebar-open");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireSidebarToggle();
    wireLogout();
    loadSession();
  });
})();

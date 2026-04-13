/* ============================================================
   Zafiro Home — Sidebar Loader
   Genera e inyecta el sidebar de navegación admin en todas las
   páginas de /admin-resources/pages/panels/.

   USO:
     <script src="/admin-resources/scripts/sidebarLoader.js"></script>
     (cargar ANTES de sessionManager.js)

   El item activo se detecta automáticamente comparando el href
   de cada link con window.location.pathname.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Definición del menú ---------- */
  var MENU = [
    { type: "link", href: "/admin-resources/pages/admin.html", icon: "fa-house", label: "Inicio" },
    { type: "heading", label: "Inventario" },
    { type: "link", href: "/admin-resources/pages/panels/productos.html", icon: "fa-boxes-stacked", label: "Productos",
      /* Estas sub-rutas también resaltan "Productos" */
      alias: ["/admin-resources/pages/panels/nuevo_producto.html", "/admin-resources/pages/panels/editarProducto.html"] },
    { type: "link", href: "/admin-resources/pages/panels/stock.html", icon: "fa-warehouse", label: "Stock" },
    { type: "link", href: "/admin-resources/pages/panels/categorias.html", icon: "fa-layer-group", label: "Categorías" },
    { type: "link", href: "/admin-resources/pages/panels/marcas.html", icon: "fa-tags", label: "Marcas" },
    { type: "link", href: "/admin-resources/pages/panels/cajas.html", icon: "fa-box", label: "Cajas" },
    { type: "link", href: "/admin-resources/pages/panels/unidadesTamano.html", icon: "fa-ruler", label: "Unidades de Tamaño" },
    { type: "link", href: "/admin-resources/pages/panels/unidadesVolumen.html", icon: "fa-flask", label: "Unidades de Volumen" },
    { type: "heading", label: "Administración" },
    { type: "link", href: "/admin-resources/pages/panels/usuarios.html", icon: "fa-users", label: "Usuarios" }
  ];

  /* ---------- Clases CSS ---------- */
  var CLS_INACTIVE = "flex items-center px-6 py-3.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors gap-4 border-l-4 border-transparent hover:border-accent";
  var CLS_ACTIVE   = "flex items-center px-6 py-3.5 text-white bg-white/10 border-l-4 border-accent transition-colors gap-4";
  var CLS_HEADING  = "px-6 pt-6 pb-2 text-xs uppercase tracking-wider text-white/50 font-bold";

  /* ---------- Detección de página activa ---------- */
  var currentPath = window.location.pathname;

  function isActive(item) {
    if (currentPath === item.href) return true;
    if (item.alias) {
      for (var i = 0; i < item.alias.length; i++) {
        if (currentPath === item.alias[i]) return true;
      }
    }
    return false;
  }

  /* ---------- Construir HTML del menú ---------- */
  function buildMenuItems() {
    var html = "";
    for (var i = 0; i < MENU.length; i++) {
      var m = MENU[i];
      if (m.type === "heading") {
        html += '<li class="' + CLS_HEADING + '">' + m.label + "</li>\n";
      } else {
        var active = isActive(m);
        var cls = active ? CLS_ACTIVE : CLS_INACTIVE;
        html += '<li><a href="' + m.href + '" class="' + cls + '">'
              + '<i class="fa-solid ' + m.icon + ' w-5 text-center"></i> ' + m.label
              + "</a></li>\n";
      }
    }
    return html;
  }

  /* ---------- HTML completo del sidebar ---------- */
  function buildSidebar() {
    return ''
      /* Overlay para móvil */
      + '<div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-[990] hidden lg:hidden"></div>\n'
      /* Sidebar */
      + '<aside id="sidebar" class="fixed inset-y-0 left-0 z-[1000] w-[260px] bg-primary text-white flex flex-col transition-transform duration-300 ease-in-out -translate-x-full lg:translate-x-0">\n'
        /* Header */
        + '  <div class="h-[70px] flex items-center px-6 gap-4 bg-primary-dark shrink-0">\n'
        + '    <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=60&h=60&q=80" alt="Logo" class="w-10 h-10 rounded-full object-cover">\n'
        + '    <span class="font-heading font-bold text-lg">Zafiro Home</span>\n'
        + '    <button id="sidebar-close" class="ml-auto lg:hidden text-white/80 hover:text-white text-xl"><i class="fa-solid fa-xmark"></i></button>\n'
        + '  </div>\n'
        /* Perfil móvil */
        + '  <div class="block lg:hidden p-6 bg-black/15 border-b border-white/5">\n'
        + '    <div class="flex items-center gap-3">\n'
        + '      <img id="sidebar-avatar" src="https://ui-avatars.com/api/?name=Usuario&background=2d4778&color=fff" alt="Perfil" class="w-10 h-10 rounded-full object-cover">\n'
        + '      <div>\n'
        + '        <div id="sidebar-username" class="font-bold text-sm text-white">Cargando…</div>\n'
        + '        <div id="sidebar-role" class="text-xs text-white/60">Cargando…</div>\n'
        + '      </div>\n'
        + '    </div>\n'
        + '  </div>\n'
        /* Menú */
        + '  <ul class="list-none py-4 flex-1 overflow-y-auto">\n'
        + buildMenuItems()
        + '  </ul>\n'
      + '</aside>\n';
  }

  /* ---------- Inyectar ---------- */
  function inject() {
    // Buscar el contenedor flex principal (primer hijo directo de body con esa clase)
    var wrapper = document.querySelector("body > .flex.min-h-screen");
    if (!wrapper) {
      // Fallback: primer div hijo de body
      wrapper = document.querySelector("body > div");
    }
    if (!wrapper) return;

    // Si ya existe un sidebar (por si acaso), no duplicar
    if (document.getElementById("sidebar")) return;

    // Insertar al inicio del wrapper
    wrapper.insertAdjacentHTML("afterbegin", buildSidebar());
  }

  // Ejecutar lo antes posible (el script se carga en <body>, DOM parcial ya existe)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();

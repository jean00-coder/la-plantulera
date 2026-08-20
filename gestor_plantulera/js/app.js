(() => {
  'use strict';

  const cfg = window.LA_PLANTULERA_CONFIG;
  if (!cfg || !window.supabase) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">No se pudo iniciar el gestor. Revisa la conexión y la configuración de Supabase.</p>';
    return;
  }

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  const $ = (id) => document.getElementById(id);
  const login = $('pantallaLogin');
  const password = $('pantallaPassword');
  const dashboard = $('pantallaGestor');
  const msgLogin = $('mensajeLogin');
  const msgPassword = $('mensajePassword');

  let currentSession = null;
  let currentAdmin = null;
  let categoriasCache = [];
  let productosCache = [];
  let slugCategoriaManual = false;
  let slugProductoManual = false;

  function setStatus(el, texto, tipo = '') {
    if (!el) return;
    el.textContent = texto || '';
    el.className = `status ${tipo}`.trim();
  }

  function mensajeError(error) {
    const raw = String(error?.message || 'No fue posible completar la acción.');
    const lower = raw.toLowerCase();

    if (lower.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (lower.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.';
    if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('over_email_send_rate_limit')) {
      return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    }
    if (lower.includes('duplicate key') || lower.includes('already exists')) {
      return 'Ya existe un registro con ese nombre o slug. Prueba con otro.';
    }
    if (lower.includes('row-level security') || lower.includes('permission denied')) {
      return 'Tu sesión no tiene permiso para realizar esta acción.';
    }
    return raw;
  }

  function mostrarPantalla(pantalla) {
    [login, password, dashboard].forEach((el) => {
      const activo = el === pantalla;
      el.classList.toggle('hidden', !activo);
      el.setAttribute('aria-hidden', String(!activo));
    });
  }

  function mostrarVista(nombre) {
    const vistas = {
      inicio: $('vistaInicio'),
      categorias: $('vistaCategorias'),
      productos: $('vistaProductos')
    };

    Object.entries(vistas).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== nombre);
    });

    if (nombre === 'inicio') cargarResumen();
    if (nombre === 'categorias') cargarCategorias();
    if (nombre === 'productos') cargarProductos();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function esFlujoPassword() {
    const href = window.location.href;
    return /type=(invite|recovery)/i.test(href) || /access_token=/i.test(window.location.hash);
  }

  function slugify(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 140);
  }

  function textoDisponibilidad(valor) {
    const mapa = {
      disponible: 'Disponible',
      por_encargo: 'Por encargo',
      vendido: 'Vendido',
      agotado: 'Agotado',
      oculto: 'Oculto'
    };
    return mapa[valor] || valor || '—';
  }

  function textoPublicacion(valor) {
    const mapa = {
      draft: 'Borrador',
      review: 'En revisión',
      published: 'Publicado'
    };
    return mapa[valor] || valor || '—';
  }

  function escapeHtml(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function verificarAdmin(user) {
    const { data, error } = await client
      .from('admin_users')
      .select('user_id,email,role,active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !data || data.active !== true) {
      return null;
    }
    return data;
  }

  async function pintarSesion(session) {
    currentSession = session || null;

    if (!session?.user) {
      currentAdmin = null;
      mostrarPantalla(login);
      return;
    }

    if (esFlujoPassword()) {
      mostrarPantalla(password);
      return;
    }

    const admin = await verificarAdmin(session.user);
    if (!admin) {
      await client.auth.signOut();
      setStatus(msgLogin, 'Tu cuenta inició sesión, pero no está autorizada como administradora.', 'error');
      mostrarPantalla(login);
      return;
    }

    currentAdmin = admin;
    $('correoUsuario').textContent = session.user.email || '';
    $('saludoUsuario').textContent = 'Hola, administrador';
    $('rolUsuario').textContent = admin.role === 'owner' ? 'Propietario' : 'Administrador';
    mostrarPantalla(dashboard);
    mostrarVista('inicio');
  }

  async function cargarResumen() {
    if (!currentAdmin) return;

    const [cats, prods, borradores] = await Promise.all([
      client.from('categories').select('*', { count: 'exact', head: true }),
      client.from('products').select('*', { count: 'exact', head: true }),
      client.from('products').select('*', { count: 'exact', head: true }).eq('publication_status', 'draft')
    ]);

    $('totalCategorias').textContent = cats.count ?? '—';
    $('totalProductos').textContent = prods.count ?? '—';
    $('totalBorradores').textContent = borradores.count ?? '—';
  }

  async function cargarCategorias() {
    setStatus($('mensajeCategorias'), 'Cargando categorías...');
    const { data, error } = await client
      .from('categories')
      .select('id,name,slug,description,active,sort_order,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      setStatus($('mensajeCategorias'), mensajeError(error), 'error');
      return;
    }

    categoriasCache = data || [];
    pintarCategorias();
    setStatus($('mensajeCategorias'), categoriasCache.length ? '' : 'Todavía no hay categorías.');
  }

  function pintarCategorias() {
    const contenedor = $('listaCategorias');
    if (!categoriasCache.length) {
      contenedor.innerHTML = '<div class="empty-state">No hay categorías para mostrar.</div>';
      return;
    }

    contenedor.innerHTML = categoriasCache.map((cat) => `
      <article class="data-card">
        <div>
          <h3>${escapeHtml(cat.name)}</h3>
          <div class="muted">${escapeHtml(cat.description || 'Sin descripción')}</div>
          <div class="data-meta">
            <span class="pill">${escapeHtml(cat.slug)}</span>
            <span class="pill">Orden ${Number(cat.sort_order || 0)}</span>
            <span class="pill ${cat.active ? '' : 'off'}">${cat.active ? 'Activa' : 'Inactiva'}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" type="button" data-editar-categoria="${cat.id}">Editar</button>
        </div>
      </article>
    `).join('');
  }

  function abrirCategoria(id = '') {
    const cat = categoriasCache.find((item) => item.id === id);
    $('categoriaId').value = cat?.id || '';
    $('categoriaNombre').value = cat?.name || '';
    $('categoriaSlug').value = cat?.slug || '';
    $('categoriaDescripcion').value = cat?.description || '';
    $('categoriaOrden').value = Number(cat?.sort_order || 0);
    $('categoriaActiva').checked = cat ? cat.active : true;
    $('tituloCategoria').textContent = cat ? 'Editar categoría' : 'Nueva categoría';
    slugCategoriaManual = Boolean(cat);
    setStatus($('mensajeFormCategoria'), '');
    abrirEditor($('panelCategoria'));
  }

  async function guardarCategoria(event) {
    event.preventDefault();
    const id = $('categoriaId').value;
    const payload = {
      name: $('categoriaNombre').value.trim(),
      slug: slugify($('categoriaSlug').value),
      description: $('categoriaDescripcion').value.trim() || null,
      sort_order: Math.max(0, Number.parseInt($('categoriaOrden').value || '0', 10) || 0),
      active: $('categoriaActiva').checked,
      updated_at: new Date().toISOString()
    };

    if (!payload.name || !payload.slug) {
      setStatus($('mensajeFormCategoria'), 'Nombre y slug son obligatorios.', 'error');
      return;
    }

    $('btnGuardarCategoria').disabled = true;
    setStatus($('mensajeFormCategoria'), 'Guardando...');

    const query = id
      ? client.from('categories').update(payload).eq('id', id)
      : client.from('categories').insert(payload);

    const { error } = await query;
    $('btnGuardarCategoria').disabled = false;

    if (error) {
      setStatus($('mensajeFormCategoria'), mensajeError(error), 'error');
      return;
    }

    cerrarEditores();
    await cargarCategorias();
    await cargarResumen();
    setStatus($('mensajeCategorias'), id ? 'Categoría actualizada.' : 'Categoría creada.', 'success');
  }

  async function cargarProductos() {
    setStatus($('mensajeProductos'), 'Cargando productos...');

    const [catsResult, prodsResult] = await Promise.all([
      client
        .from('categories')
        .select('id,name,slug,active,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('products')
        .select('id,category_id,name,slug,short_description,description,price,availability_status,publication_status,featured,plantilocura,cover_image_url,created_at,updated_at')
        .order('created_at', { ascending: false })
    ]);

    if (catsResult.error) {
      setStatus($('mensajeProductos'), mensajeError(catsResult.error), 'error');
      return;
    }
    if (prodsResult.error) {
      setStatus($('mensajeProductos'), mensajeError(prodsResult.error), 'error');
      return;
    }

    categoriasCache = catsResult.data || [];
    productosCache = prodsResult.data || [];
    pintarProductos();
    setStatus($('mensajeProductos'), productosCache.length ? '' : 'Todavía no hay productos.');
  }

  function nombreCategoria(id) {
    return categoriasCache.find((cat) => cat.id === id)?.name || 'Sin categoría';
  }

  function pintarProductos() {
    const contenedor = $('listaProductos');
    if (!productosCache.length) {
      contenedor.innerHTML = '<div class="empty-state">No hay productos todavía. Pulsa “Nuevo producto” para crear el primero.</div>';
      return;
    }

    contenedor.innerHTML = productosCache.map((prod) => `
      <article class="data-card">
        <div>
          <h3>${escapeHtml(prod.name)}</h3>
          <div class="muted">${escapeHtml(prod.short_description || 'Sin descripción corta')}</div>
          <div class="data-meta">
            <span class="pill">${escapeHtml(nombreCategoria(prod.category_id))}</span>
            <span class="pill">${escapeHtml(textoDisponibilidad(prod.availability_status))}</span>
            <span class="pill status-${escapeHtml(prod.publication_status)}">${escapeHtml(textoPublicacion(prod.publication_status))}</span>
            ${prod.featured ? '<span class="pill">Destacado</span>' : ''}
            ${prod.plantilocura ? '<span class="pill">Plantilocura</span>' : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" type="button" data-editar-producto="${prod.id}" ${prod.publication_status === 'published' ? 'disabled title="La edición de publicados se habilitará con el flujo de revisión"' : ''}>Editar</button>
        </div>
      </article>
    `).join('');
  }

  function llenarSelectCategorias(seleccion = '') {
    const select = $('productoCategoria');
    const activas = categoriasCache.filter((cat) => cat.active || cat.id === seleccion);

    select.innerHTML = [
      '<option value="">Selecciona una categoría</option>',
      ...activas.map((cat) => `<option value="${cat.id}" ${cat.id === seleccion ? 'selected' : ''}>${escapeHtml(cat.name)}${cat.active ? '' : ' (inactiva)'}</option>`)
    ].join('');
  }

  async function abrirProducto(id = '') {
    if (!categoriasCache.length) {
      const { data, error } = await client
        .from('categories')
        .select('id,name,slug,active,sort_order')
        .order('sort_order', { ascending: true });
      if (error) {
        setStatus($('mensajeProductos'), mensajeError(error), 'error');
        return;
      }
      categoriasCache = data || [];
    }

    if (!categoriasCache.some((cat) => cat.active)) {
      setStatus($('mensajeProductos'), 'Necesitas al menos una categoría activa antes de crear productos.', 'error');
      return;
    }

    const prod = productosCache.find((item) => item.id === id);
    if (prod?.publication_status === 'published') {
      setStatus($('mensajeProductos'), 'La edición de productos publicados se habilitará con el flujo de revisión de v0.4.', 'error');
      return;
    }

    $('productoId').value = prod?.id || '';
    $('productoNombre').value = prod?.name || '';
    $('productoSlug').value = prod?.slug || '';
    $('productoDescripcionCorta').value = prod?.short_description || '';
    $('productoDescripcion').value = prod?.description || '';
    $('productoPrecio').value = prod?.price ?? '';
    $('productoDisponibilidad').value = prod?.availability_status || 'por_encargo';
    $('productoDestacado').checked = Boolean(prod?.featured);
    $('productoPlantilocura').checked = Boolean(prod?.plantilocura);
    llenarSelectCategorias(prod?.category_id || '');
    $('tituloProducto').textContent = prod ? 'Editar producto' : 'Nuevo producto';
    slugProductoManual = Boolean(prod);
    setStatus($('mensajeFormProducto'), '');
    abrirEditor($('panelProducto'));
  }

  async function guardarProducto(event) {
    event.preventDefault();
    if (!currentSession?.user) return;

    const id = $('productoId').value;
    const precioTexto = $('productoPrecio').value.trim();
    const prodExistente = productosCache.find((item) => item.id === id);

    if (prodExistente?.publication_status === 'published') {
      setStatus($('mensajeFormProducto'), 'Este producto ya está publicado y no puede editarse desde v0.2.', 'error');
      return;
    }

    const payload = {
      category_id: $('productoCategoria').value,
      name: $('productoNombre').value.trim(),
      slug: slugify($('productoSlug').value),
      short_description: $('productoDescripcionCorta').value.trim() || null,
      description: $('productoDescripcion').value.trim() || null,
      price: precioTexto === '' ? null : Number(precioTexto),
      availability_status: $('productoDisponibilidad').value,
      featured: $('productoDestacado').checked,
      plantilocura: $('productoPlantilocura').checked,
      updated_by: currentSession.user.id,
      updated_at: new Date().toISOString()
    };

    if (!payload.category_id || !payload.name || !payload.slug) {
      setStatus($('mensajeFormProducto'), 'Categoría, nombre y slug son obligatorios.', 'error');
      return;
    }

    if (payload.price !== null && (!Number.isFinite(payload.price) || payload.price < 0)) {
      setStatus($('mensajeFormProducto'), 'El precio debe ser un número válido o dejarse vacío.', 'error');
      return;
    }

    if (!id) {
      payload.publication_status = 'draft';
      payload.created_by = currentSession.user.id;
    }

    $('btnGuardarProducto').disabled = true;
    setStatus($('mensajeFormProducto'), 'Guardando borrador...');

    const query = id
      ? client.from('products').update(payload).eq('id', id)
      : client.from('products').insert(payload);

    const { error } = await query;
    $('btnGuardarProducto').disabled = false;

    if (error) {
      setStatus($('mensajeFormProducto'), mensajeError(error), 'error');
      return;
    }

    cerrarEditores();
    await cargarProductos();
    await cargarResumen();
    setStatus($('mensajeProductos'), id ? 'Producto actualizado.' : 'Producto guardado como borrador.', 'success');
  }

  function abrirEditor(panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function cerrarEditores() {
    [$('panelCategoria'), $('panelProducto')].forEach((panel) => {
      panel.classList.add('hidden');
      panel.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = '';
  }

  $('formLogin').addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(msgLogin, 'Ingresando...');
    $('btnLogin').disabled = true;

    const email = $('loginEmail').value.trim();
    const passwordValue = $('loginPassword').value;
    const { data, error } = await client.auth.signInWithPassword({ email, password: passwordValue });

    $('btnLogin').disabled = false;
    if (error) {
      setStatus(msgLogin, mensajeError(error), 'error');
      return;
    }

    setStatus(msgLogin, 'Acceso correcto.', 'success');
    await pintarSesion(data.session);
  });

  $('togglePassword').addEventListener('click', () => {
    const input = $('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('btnRecuperar').addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    if (!email) {
      setStatus(msgLogin, 'Escribe primero tu correo.', 'error');
      $('loginEmail').focus();
      return;
    }

    setStatus(msgLogin, 'Enviando enlace de recuperación...');
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
      setStatus(msgLogin, mensajeError(error), 'error');
      return;
    }
    setStatus(msgLogin, 'Revisa tu correo. Te enviamos un enlace para crear una nueva contraseña.', 'success');
  });

  $('formPassword').addEventListener('submit', async (event) => {
    event.preventDefault();
    const a = $('newPassword').value;
    const b = $('repeatPassword').value;

    if (a.length < 8) {
      setStatus(msgPassword, 'La contraseña debe tener al menos 8 caracteres.', 'error');
      return;
    }
    if (a !== b) {
      setStatus(msgPassword, 'Las contraseñas no coinciden.', 'error');
      return;
    }

    setStatus(msgPassword, 'Guardando contraseña...');
    const { error } = await client.auth.updateUser({ password: a });
    if (error) {
      setStatus(msgPassword, mensajeError(error), 'error');
      return;
    }

    history.replaceState({}, document.title, window.location.pathname);
    setStatus(msgPassword, 'Contraseña guardada. Entrando al gestor...', 'success');
    const { data } = await client.auth.getSession();
    await pintarSesion(data.session);
  });

  $('btnCerrarSesion').addEventListener('click', async () => {
    await client.auth.signOut();
    currentAdmin = null;
    currentSession = null;
    $('formLogin').reset();
    setStatus(msgLogin, 'Sesión cerrada.', 'success');
    mostrarPantalla(login);
  });

  $('btnInicio').addEventListener('click', () => mostrarVista('inicio'));
  $('btnNuevaCategoria').addEventListener('click', () => abrirCategoria());
  $('btnNuevoProducto').addEventListener('click', () => abrirProducto());
  $('formCategoria').addEventListener('submit', guardarCategoria);
  $('formProducto').addEventListener('submit', guardarProducto);

  $('categoriaNombre').addEventListener('input', () => {
    if (!slugCategoriaManual) $('categoriaSlug').value = slugify($('categoriaNombre').value);
  });
  $('categoriaSlug').addEventListener('input', () => { slugCategoriaManual = true; });
  $('productoNombre').addEventListener('input', () => {
    if (!slugProductoManual) $('productoSlug').value = slugify($('productoNombre').value);
  });
  $('productoSlug').addEventListener('input', () => { slugProductoManual = true; });

  document.addEventListener('click', (event) => {
    const ir = event.target.closest('[data-ir]')?.dataset.ir;
    if (ir) {
      mostrarVista(ir);
      return;
    }

    const catId = event.target.closest('[data-editar-categoria]')?.dataset.editarCategoria;
    if (catId) {
      abrirCategoria(catId);
      return;
    }

    const prodId = event.target.closest('[data-editar-producto]')?.dataset.editarProducto;
    if (prodId) {
      abrirProducto(prodId);
      return;
    }

    if (event.target.closest('[data-cerrar-editor]')) {
      cerrarEditores();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') cerrarEditores();
  });

  client.auth.onAuthStateChange((event, session) => {
    window.setTimeout(async () => {
      if (event === 'PASSWORD_RECOVERY') {
        mostrarPantalla(password);
        return;
      }
      if (event === 'SIGNED_OUT') {
        currentAdmin = null;
        currentSession = null;
        mostrarPantalla(login);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        await pintarSesion(session);
      }
    }, 0);
  });

  (async () => {
    const { data } = await client.auth.getSession();
    await pintarSesion(data.session);
  })();
})();

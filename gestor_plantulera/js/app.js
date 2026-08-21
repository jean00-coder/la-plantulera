(() => {
  'use strict';

  const cfg = window.LA_PLANTULERA_CONFIG;
  if (!cfg || !window.supabase) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">No se pudo iniciar el gestor. Revisa la conexión y la configuración de Supabase.</p>';
    return;
  }

  const CATALOG_URL = String(cfg.catalogUrl || 'https://la-plantulera.vercel.app').replace(/\/$/, '');

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
  let imagenProductoBlob = null;
  let imagenProductoPreviewUrl = '';
  let imagenProductoOriginalUrl = null;
  let quitarImagenProducto = false;
  let portadaCache = [];
  let imagenPortadaBlob = null;
  let imagenPortadaPreviewUrl = '';
  let imagenPortadaOriginalUrl = null;
  let quitarImagenPortada = false;

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
      productos: $('vistaProductos'),
      revision: $('vistaRevision'),
      portada: $('vistaPortada')
    };

    Object.entries(vistas).forEach(([key, el]) => {
      el.classList.toggle('hidden', key !== nombre);
    });

    if (nombre === 'inicio') cargarResumen();
    if (nombre === 'categorias') cargarCategorias();
    if (nombre === 'productos') cargarProductos();
    if (nombre === 'revision') cargarRevision();
    if (nombre === 'portada') cargarPortada();
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


  function crearUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function formatoBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function rutaStorageDesdeUrl(url) {
    if (!url) return null;
    const marker = '/storage/v1/object/public/catalog-media/';
    const index = String(url).indexOf(marker);
    if (index === -1) return null;
    const path = String(url).slice(index + marker.length).split('?')[0];
    try { return decodeURIComponent(path); } catch { return path; }
  }

  function revocarPreviewTemporal() {
    if (imagenProductoPreviewUrl) {
      URL.revokeObjectURL(imagenProductoPreviewUrl);
      imagenProductoPreviewUrl = '';
    }
  }

  function pintarPreviewImagenProducto(url = '') {
    const contenedor = $('productoImagenPreview');
    const img = $('productoImagenImg');
    const placeholder = $('productoImagenPlaceholder');
    const visibleUrl = url || (!quitarImagenProducto ? imagenProductoOriginalUrl : '');

    if (visibleUrl) {
      img.src = visibleUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
      contenedor.classList.remove('empty');
      $('btnQuitarFoto').classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
      contenedor.classList.add('empty');
      $('btnQuitarFoto').classList.add('hidden');
    }
  }

  async function cargarImagenEnElemento(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  async function optimizarImagen(file) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('Selecciona un archivo de imagen válido.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('La imagen supera el límite de 10 MB.');
    }

    let source;
    let width;
    let height;
    let cleanup = () => {};

    try {
      if ('createImageBitmap' in window) {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        width = source.width;
        height = source.height;
        cleanup = () => source.close?.();
      } else {
        const fallback = await cargarImagenEnElemento(file);
        source = fallback.source;
        width = fallback.width;
        height = fallback.height;
        cleanup = fallback.cleanup;
      }

      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Tu navegador no pudo preparar la imagen.');
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No se pudo convertir la imagen a WebP.')), 'image/webp', 0.82);
      });

      return { blob, width: targetWidth, height: targetHeight };
    } finally {
      cleanup();
    }
  }

  async function seleccionarImagenProducto(file) {
    if (!file) return;
    setStatus($('mensajeImagenProducto'), 'Optimizando imagen...');
    try {
      const originalSize = file.size;
      const optimizada = await optimizarImagen(file);
      revocarPreviewTemporal();
      imagenProductoBlob = optimizada.blob;
      imagenProductoPreviewUrl = URL.createObjectURL(optimizada.blob);
      quitarImagenProducto = false;
      pintarPreviewImagenProducto(imagenProductoPreviewUrl);
      setStatus(
        $('mensajeImagenProducto'),
        `Lista: ${optimizada.width}×${optimizada.height}px · ${formatoBytes(originalSize)} → ${formatoBytes(optimizada.blob.size)}`,
        'success'
      );
    } catch (error) {
      setStatus($('mensajeImagenProducto'), mensajeError(error), 'error');
    }
  }

  async function subirImagenProducto(productId, blob) {
    const fileName = `cover-${Date.now()}-${crearUuid().slice(0, 8)}.webp`;
    const path = `products/${productId}/${fileName}`;
    const { error } = await client.storage.from('catalog-media').upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from('catalog-media').getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  async function borrarImagenStorage(url) {
    const path = rutaStorageDesdeUrl(url);
    if (!path) return;
    const { error } = await client.storage.from('catalog-media').remove([path]);
    if (error) console.warn('No se pudo borrar la imagen anterior:', error.message);
  }

  function resolverImagenPortada(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/')) return `${CATALOG_URL}${value}`;
    return value;
  }

  function revocarPreviewPortada() {
    if (imagenPortadaPreviewUrl) {
      URL.revokeObjectURL(imagenPortadaPreviewUrl);
      imagenPortadaPreviewUrl = '';
    }
  }

  function pintarPreviewImagenPortada(url = '') {
    const contenedor = $('portadaImagenPreview');
    const img = $('portadaImagenImg');
    const placeholder = $('portadaImagenPlaceholder');
    const original = !quitarImagenPortada ? resolverImagenPortada(imagenPortadaOriginalUrl) : '';
    const visibleUrl = url || original;

    if (visibleUrl) {
      img.src = visibleUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
      contenedor.classList.remove('empty');
      $('btnQuitarFotoPortada').classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
      contenedor.classList.add('empty');
      $('btnQuitarFotoPortada').classList.add('hidden');
    }
  }

  async function seleccionarImagenPortada(file) {
    if (!file) return;
    setStatus($('mensajeImagenPortada'), 'Optimizando imagen...');
    try {
      const originalSize = file.size;
      const optimizada = await optimizarImagen(file);
      revocarPreviewPortada();
      imagenPortadaBlob = optimizada.blob;
      imagenPortadaPreviewUrl = URL.createObjectURL(optimizada.blob);
      quitarImagenPortada = false;
      pintarPreviewImagenPortada(imagenPortadaPreviewUrl);
      setStatus(
        $('mensajeImagenPortada'),
        `Lista: ${optimizada.width}×${optimizada.height}px · ${formatoBytes(originalSize)} → ${formatoBytes(optimizada.blob.size)}`,
        'success'
      );
    } catch (error) {
      setStatus($('mensajeImagenPortada'), mensajeError(error), 'error');
    }
  }

  async function subirImagenPortada(slot, blob) {
    const fileName = `slide-${Date.now()}-${crearUuid().slice(0, 8)}.webp`;
    const path = `carousel/slot-${slot}/${fileName}`;
    const { error } = await client.storage.from('catalog-media').upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: false
    });
    if (error) throw error;
    const { data } = client.storage.from('catalog-media').getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  async function cargarPortada() {
    setStatus($('mensajePortada'), 'Cargando carrusel...');
    const { data, error } = await client
      .from('carousel_slides')
      .select('id,slot,title,description,image_url,button_text,button_url,active,created_at,updated_at')
      .order('slot', { ascending: true });

    if (error) {
      setStatus($('mensajePortada'), mensajeError(error), 'error');
      return;
    }

    portadaCache = data || [];
    pintarPortada();
    setStatus($('mensajePortada'), portadaCache.length ? '' : 'No hay diapositivas configuradas.');
  }

  function pintarPortada() {
    const contenedor = $('listaPortada');
    if (!portadaCache.length) {
      contenedor.innerHTML = '<div class="empty-state">No hay diapositivas configuradas.</div>';
      return;
    }

    contenedor.innerHTML = portadaCache.map((slide) => {
      const imagen = resolverImagenPortada(slide.image_url);
      return `
        <article class="data-card carousel-admin-card">
          <div class="carousel-admin-media">
            ${imagen
              ? `<img src="${escapeHtml(imagen)}" alt="" loading="lazy">`
              : '<div class="carousel-admin-placeholder" aria-hidden="true">🖼️</div>'}
          </div>
          <div class="carousel-admin-body">
            <span class="carousel-slot">Diapositiva ${escapeHtml(slide.slot)}</span>
            <h3>${escapeHtml(slide.title || 'Sin título')}</h3>
            <div class="muted">${escapeHtml(slide.description || 'Sin texto corto')}</div>
            <div class="data-meta">
              <span class="pill ${slide.active ? '' : 'off'}">${slide.active ? 'Activa' : 'Inactiva'}</span>
              ${slide.button_text ? `<span class="pill">Botón: ${escapeHtml(slide.button_text)}</span>` : ''}
            </div>
            <div class="card-actions">
              <button class="btn btn-secondary" type="button" data-editar-portada="${escapeHtml(slide.id)}">Editar</button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function abrirPortada(id) {
    const slide = portadaCache.find((item) => item.id === id);
    if (!slide) {
      setStatus($('mensajePortada'), 'No se encontró la diapositiva.', 'error');
      return;
    }

    $('portadaId').value = slide.id;
    $('portadaSlot').value = slide.slot;
    $('portadaTitulo').value = slide.title || '';
    $('portadaDescripcion').value = slide.description || '';
    $('portadaBotonTexto').value = slide.button_text || '';
    $('portadaBotonUrl').value = slide.button_url === '#productos' ? '#catalogo' : (slide.button_url || '');
    $('portadaActiva').checked = Boolean(slide.active);
    $('tituloPortadaEditor').textContent = `Editar diapositiva ${slide.slot}`;
    $('portadaImagenCamara').value = '';
    $('portadaImagenGaleria').value = '';
    revocarPreviewPortada();
    imagenPortadaBlob = null;
    imagenPortadaOriginalUrl = slide.image_url || null;
    quitarImagenPortada = false;
    pintarPreviewImagenPortada();
    setStatus($('mensajeImagenPortada'), imagenPortadaOriginalUrl ? 'Imagen actual cargada.' : '');
    setStatus($('mensajeFormPortada'), '');
    abrirEditor($('panelPortada'));
  }

  async function guardarPortada(event) {
    event.preventDefault();
    if (!currentSession?.user) return;

    const id = $('portadaId').value;
    const slot = Number($('portadaSlot').value);
    const slideActual = portadaCache.find((item) => item.id === id);
    if (!id || !slideActual) {
      setStatus($('mensajeFormPortada'), 'No se encontró la diapositiva.', 'error');
      return;
    }

    const title = $('portadaTitulo').value.trim();
    if (!title) {
      setStatus($('mensajeFormPortada'), 'El título es obligatorio.', 'error');
      return;
    }

    const payload = {
      title,
      description: $('portadaDescripcion').value.trim() || null,
      button_text: $('portadaBotonTexto').value.trim() || null,
      button_url: $('portadaBotonUrl').value.trim() || null,
      active: $('portadaActiva').checked,
      updated_by: currentSession.user.id,
      updated_at: new Date().toISOString()
    };

    $('btnGuardarPortada').disabled = true;
    setStatus($('mensajeFormPortada'), imagenPortadaBlob ? 'Subiendo imagen optimizada...' : 'Guardando cambios...');

    let nuevaImagen = null;
    const imagenAnterior = slideActual.image_url || null;

    try {
      if (imagenPortadaBlob) {
        nuevaImagen = await subirImagenPortada(slot, imagenPortadaBlob);
        payload.image_url = nuevaImagen.publicUrl;
      } else if (quitarImagenPortada) {
        payload.image_url = null;
      }

      const { error } = await client.from('carousel_slides').update(payload).eq('id', id);
      if (error) throw error;

      if ((nuevaImagen || quitarImagenPortada) && imagenAnterior) {
        await borrarImagenStorage(imagenAnterior);
      }

      revocarPreviewPortada();
      imagenPortadaBlob = null;
      imagenPortadaOriginalUrl = null;
      quitarImagenPortada = false;
      cerrarEditores();
      await cargarPortada();
      setStatus($('mensajePortada'), 'Diapositiva actualizada. El catálogo ya puede mostrar el cambio.', 'success');
    } catch (error) {
      if (nuevaImagen?.path) {
        await client.storage.from('catalog-media').remove([nuevaImagen.path]);
      }
      setStatus($('mensajeFormPortada'), mensajeError(error), 'error');
    } finally {
      $('btnGuardarPortada').disabled = false;
    }
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

    const [cats, prods, borradores, revision, publicados] = await Promise.all([
      client.from('categories').select('*', { count: 'exact', head: true }),
      client.from('products').select('*', { count: 'exact', head: true }),
      client.from('products').select('*', { count: 'exact', head: true }).eq('publication_status', 'draft'),
      client.from('products').select('*', { count: 'exact', head: true }).eq('publication_status', 'review'),
      client.from('products').select('*', { count: 'exact', head: true }).eq('publication_status', 'published')
    ]);

    $('totalCategorias').textContent = cats.count ?? '—';
    $('totalProductos').textContent = prods.count ?? '—';
    $('totalBorradores').textContent = borradores.count ?? '—';
    $('totalRevision').textContent = revision.count ?? '—';
    $('totalPublicados').textContent = publicados.count ?? '—';
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
        .select('id,category_id,name,slug,short_description,description,price,availability_status,publication_status,featured,plantilocura,cover_image_url,created_at,updated_at,published_at,published_by')
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

  function accionesProducto(prod) {
    if (prod.publication_status === 'draft') {
      return `
        <button class="btn btn-secondary" type="button" data-editar-producto="${prod.id}">Editar</button>
        <button class="btn btn-primary" type="button" data-enviar-revision="${prod.id}">Enviar a revisión</button>
      `;
    }

    if (prod.publication_status === 'review') {
      return `
        <button class="btn btn-secondary" type="button" data-editar-producto="${prod.id}">Editar</button>
        <button class="btn btn-secondary" type="button" data-volver-borrador="${prod.id}">Volver a borrador</button>
      `;
    }

    return `
      <button class="btn btn-secondary" type="button" data-retirar-publicacion="${prod.id}">Retirar publicación</button>
    `;
  }

  function pintarProductos() {
    const contenedor = $('listaProductos');
    if (!productosCache.length) {
      contenedor.innerHTML = '<div class="empty-state">No hay productos todavía. Pulsa “Nuevo producto” para crear el primero.</div>';
      return;
    }

    contenedor.innerHTML = productosCache.map((prod) => `
      <article class="data-card">
        <div class="product-card-media">
          ${prod.cover_image_url
            ? `<img class="product-thumb" src="${escapeHtml(prod.cover_image_url)}" alt="" loading="lazy">`
            : '<div class="product-thumb-placeholder" aria-hidden="true">🎨</div>'}
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
        </div>
        <div class="card-actions">
          ${accionesProducto(prod)}
        </div>
      </article>
    `).join('');
  }

  function productoListoParaRevision(prod) {
    if (!prod) return 'No se encontró el producto.';
    if (!prod.cover_image_url) return 'Agrega una foto principal antes de enviarlo a revisión.';
    return '';
  }

  async function cargarRevision() {
    setStatus($('mensajeRevision'), 'Cargando productos en revisión...');

    const [catsResult, prodsResult] = await Promise.all([
      client
        .from('categories')
        .select('id,name,slug,active,sort_order')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      client
        .from('products')
        .select('id,category_id,name,slug,short_description,description,price,availability_status,publication_status,featured,plantilocura,cover_image_url,created_at,updated_at,published_at,published_by')
        .eq('publication_status', 'review')
        .order('updated_at', { ascending: false })
    ]);

    if (catsResult.error) {
      setStatus($('mensajeRevision'), mensajeError(catsResult.error), 'error');
      return;
    }
    if (prodsResult.error) {
      setStatus($('mensajeRevision'), mensajeError(prodsResult.error), 'error');
      return;
    }

    categoriasCache = catsResult.data || [];
    const enRevision = prodsResult.data || [];
    pintarRevision(enRevision);
    setStatus($('mensajeRevision'), enRevision.length ? '' : 'No hay productos pendientes de revisión.');
  }

  function pintarRevision(productos) {
    const contenedor = $('listaRevision');
    if (!productos.length) {
      contenedor.innerHTML = '<div class="empty-state">Todo al día. Cuando envíes un borrador a revisión aparecerá aquí.</div>';
      return;
    }

    contenedor.innerHTML = productos.map((prod) => `
      <article class="data-card review-card">
        <div class="product-card-media">
          ${prod.cover_image_url
            ? `<img class="product-thumb" src="${escapeHtml(prod.cover_image_url)}" alt="" loading="lazy">`
            : '<div class="product-thumb-placeholder" aria-hidden="true">🎨</div>'}
          <div>
            <h3>${escapeHtml(prod.name)}</h3>
            <div class="muted">${escapeHtml(prod.short_description || 'Sin descripción corta')}</div>
            <div class="data-meta">
              <span class="pill">${escapeHtml(nombreCategoria(prod.category_id))}</span>
              <span class="pill">${escapeHtml(textoDisponibilidad(prod.availability_status))}</span>
              <span class="pill status-review">En revisión</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-secondary" type="button" data-volver-borrador="${prod.id}">Volver a borrador</button>
          <button class="btn btn-primary" type="button" data-publicar-producto="${prod.id}">Publicar</button>
        </div>
      </article>
    `).join('');
  }

  async function cambiarEstadoProducto(id, nuevoEstado) {
    if (!currentSession?.user) return;

    let prod = productosCache.find((item) => item.id === id);
    if (!prod) {
      const { data, error } = await client
        .from('products')
        .select('id,category_id,name,slug,short_description,description,price,availability_status,publication_status,featured,plantilocura,cover_image_url,created_at,updated_at,published_at,published_by')
        .eq('id', id)
        .single();
      if (error) {
        setStatus($('mensajeProductos'), mensajeError(error), 'error');
        setStatus($('mensajeRevision'), mensajeError(error), 'error');
        return;
      }
      prod = data;
    }

    if (nuevoEstado === 'review') {
      const falta = productoListoParaRevision(prod);
      if (falta) {
        setStatus($('mensajeProductos'), falta, 'error');
        return;
      }
    }

    if (nuevoEstado === 'published') {
      const falta = productoListoParaRevision(prod);
      if (falta) {
        setStatus($('mensajeRevision'), falta, 'error');
        return;
      }
      if (prod.publication_status !== 'review') {
        setStatus($('mensajeRevision'), 'Solo se pueden publicar productos que estén en revisión.', 'error');
        return;
      }
      const confirmar = window.confirm(`¿Publicar “${prod.name}”? La acción quedará registrada en Supabase.`);
      if (!confirmar) return;
    }

    if (prod.publication_status === 'published' && nuevoEstado === 'draft') {
      const confirmar = window.confirm(`¿Retirar “${prod.name}” de publicación y devolverlo a borrador?`);
      if (!confirmar) return;
    }

    const ahora = new Date().toISOString();
    const payload = {
      publication_status: nuevoEstado,
      updated_by: currentSession.user.id,
      updated_at: ahora
    };

    if (nuevoEstado === 'published') {
      payload.published_by = currentSession.user.id;
      payload.published_at = ahora;
    } else {
      payload.published_by = null;
      payload.published_at = null;
    }

    setStatus($('mensajeProductos'), 'Actualizando estado...');
    setStatus($('mensajeRevision'), 'Actualizando estado...');

    const { error } = await client.from('products').update(payload).eq('id', id);
    if (error) {
      const msg = mensajeError(error);
      setStatus($('mensajeProductos'), msg, 'error');
      setStatus($('mensajeRevision'), msg, 'error');
      return;
    }

    await cargarResumen();
    if (!$('vistaProductos').classList.contains('hidden')) await cargarProductos();
    if (!$('vistaRevision').classList.contains('hidden')) await cargarRevision();

    const mensajes = {
      draft: 'Producto devuelto a borrador.',
      review: 'Producto enviado a revisión.',
      published: 'Producto publicado correctamente.'
    };
    const destino = !$('vistaRevision').classList.contains('hidden') ? $('mensajeRevision') : $('mensajeProductos');
    setStatus(destino, mensajes[nuevoEstado] || 'Estado actualizado.', 'success');
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
      setStatus($('mensajeProductos'), 'Este producto está publicado. Primero retíralo a borrador para poder editarlo.', 'error');
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
    $('productoImagenCamara').value = '';
    $('productoImagenGaleria').value = '';
    revocarPreviewTemporal();
    imagenProductoBlob = null;
    imagenProductoOriginalUrl = prod?.cover_image_url || null;
    quitarImagenProducto = false;
    pintarPreviewImagenProducto();
    setStatus($('mensajeImagenProducto'), imagenProductoOriginalUrl ? 'Foto actual cargada.' : '');
    llenarSelectCategorias(prod?.category_id || '');
    $('tituloProducto').textContent = prod ? 'Editar producto' : 'Nuevo producto';
    slugProductoManual = Boolean(prod);
    setStatus($('mensajeFormProducto'), '');
    abrirEditor($('panelProducto'));
  }

  async function guardarProducto(event) {
    event.preventDefault();
    if (!currentSession?.user) return;

    const idActual = $('productoId').value;
    const precioTexto = $('productoPrecio').value.trim();
    const prodExistente = productosCache.find((item) => item.id === idActual);

    if (prodExistente?.publication_status === 'published') {
      setStatus($('mensajeFormProducto'), 'Este producto está publicado. Retíralo a borrador antes de editarlo.', 'error');
      return;
    }

    const productId = idActual || crearUuid();
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

    if (!idActual) {
      payload.id = productId;
      payload.publication_status = 'draft';
      payload.created_by = currentSession.user.id;
    } else if (prodExistente?.publication_status === 'review') {
      payload.publication_status = 'draft';
      payload.published_by = null;
      payload.published_at = null;
    }

    $('btnGuardarProducto').disabled = true;
    setStatus($('mensajeFormProducto'), imagenProductoBlob ? 'Subiendo foto optimizada...' : 'Guardando cambios...');

    let nuevaImagen = null;
    const imagenAnterior = prodExistente?.cover_image_url || null;

    try {
      if (imagenProductoBlob) {
        nuevaImagen = await subirImagenProducto(productId, imagenProductoBlob);
        payload.cover_image_url = nuevaImagen.publicUrl;
      } else if (quitarImagenProducto) {
        payload.cover_image_url = null;
      }

      const query = idActual
        ? client.from('products').update(payload).eq('id', idActual)
        : client.from('products').insert(payload);

      const { error } = await query;
      if (error) throw error;

      if ((nuevaImagen || quitarImagenProducto) && imagenAnterior) {
        await borrarImagenStorage(imagenAnterior);
      }

      revocarPreviewTemporal();
      imagenProductoBlob = null;
      imagenProductoOriginalUrl = null;
      quitarImagenProducto = false;
      cerrarEditores();
      await cargarProductos();
      await cargarResumen();
      const mensajeGuardado = !idActual
        ? 'Producto guardado como borrador.'
        : prodExistente?.publication_status === 'review'
          ? 'Cambios guardados. El producto volvió a borrador para una nueva revisión.'
          : 'Producto actualizado.';
      setStatus($('mensajeProductos'), mensajeGuardado, 'success');
    } catch (error) {
      if (nuevaImagen?.path) {
        await client.storage.from('catalog-media').remove([nuevaImagen.path]);
      }
      setStatus($('mensajeFormProducto'), mensajeError(error), 'error');
    } finally {
      $('btnGuardarProducto').disabled = false;
    }
  }

  function abrirEditor(panel) {
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function cerrarEditores() {
    revocarPreviewTemporal();
    imagenProductoBlob = null;
    imagenProductoOriginalUrl = null;
    quitarImagenProducto = false;
    revocarPreviewPortada();
    imagenPortadaBlob = null;
    imagenPortadaOriginalUrl = null;
    quitarImagenPortada = false;
    [$('panelCategoria'), $('panelProducto'), $('panelPortada')].forEach((panel) => {
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
  $('formPortada').addEventListener('submit', guardarPortada);
  $('btnTomarFoto').addEventListener('click', () => $('productoImagenCamara').click());
  $('btnElegirFoto').addEventListener('click', () => $('productoImagenGaleria').click());
  $('productoImagenCamara').addEventListener('change', (event) => seleccionarImagenProducto(event.target.files?.[0]));
  $('productoImagenGaleria').addEventListener('change', (event) => seleccionarImagenProducto(event.target.files?.[0]));
  $('btnTomarFotoPortada').addEventListener('click', () => $('portadaImagenCamara').click());
  $('btnElegirFotoPortada').addEventListener('click', () => $('portadaImagenGaleria').click());
  $('portadaImagenCamara').addEventListener('change', (event) => seleccionarImagenPortada(event.target.files?.[0]));
  $('portadaImagenGaleria').addEventListener('change', (event) => seleccionarImagenPortada(event.target.files?.[0]));
  $('btnQuitarFoto').addEventListener('click', () => {
    revocarPreviewTemporal();
    imagenProductoBlob = null;
    quitarImagenProducto = Boolean(imagenProductoOriginalUrl);
    $('productoImagenCamara').value = '';
    $('productoImagenGaleria').value = '';
    pintarPreviewImagenProducto('');
    setStatus(
      $('mensajeImagenProducto'),
      quitarImagenProducto ? 'La foto se quitará cuando guardes el producto.' : 'Foto seleccionada eliminada.',
      ''
    );
  });

  $('btnQuitarFotoPortada').addEventListener('click', () => {
    revocarPreviewPortada();
    imagenPortadaBlob = null;
    quitarImagenPortada = Boolean(imagenPortadaOriginalUrl);
    $('portadaImagenCamara').value = '';
    $('portadaImagenGaleria').value = '';
    pintarPreviewImagenPortada('');
    setStatus(
      $('mensajeImagenPortada'),
      quitarImagenPortada ? 'La imagen se quitará cuando guardes los cambios.' : 'Imagen seleccionada eliminada.',
      ''
    );
  });

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

    const portadaId = event.target.closest('[data-editar-portada]')?.dataset.editarPortada;
    if (portadaId) {
      abrirPortada(portadaId);
      return;
    }

    const prodId = event.target.closest('[data-editar-producto]')?.dataset.editarProducto;
    if (prodId) {
      abrirProducto(prodId);
      return;
    }

    const aRevision = event.target.closest('[data-enviar-revision]')?.dataset.enviarRevision;
    if (aRevision) {
      cambiarEstadoProducto(aRevision, 'review');
      return;
    }

    const aBorrador = event.target.closest('[data-volver-borrador]')?.dataset.volverBorrador;
    if (aBorrador) {
      cambiarEstadoProducto(aBorrador, 'draft');
      return;
    }

    const aPublicar = event.target.closest('[data-publicar-producto]')?.dataset.publicarProducto;
    if (aPublicar) {
      cambiarEstadoProducto(aPublicar, 'published');
      return;
    }

    const aRetirar = event.target.closest('[data-retirar-publicacion]')?.dataset.retirarPublicacion;
    if (aRetirar) {
      cambiarEstadoProducto(aRetirar, 'draft');
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

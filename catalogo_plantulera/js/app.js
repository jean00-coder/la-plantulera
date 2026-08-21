(() => {
  const WHATSAPP = '573214230922';
  const CONFIG = window.LA_PLANTULERA_CONFIG || {};
  const SUPABASE_URL = String(CONFIG.supabaseUrl || '').replace(/\/$/, '');
  const SUPABASE_KEY = String(CONFIG.supabasePublishableKey || '');

  let productos = [];
  let categoriaActiva = 'Todos';

  const grid = document.querySelector('#gridProductos');
  const vacio = document.querySelector('#estadoVacio');
  const catalogoEstado = document.querySelector('#catalogoEstado');
  const categoriasCatalogo = document.querySelector('#categoriasCatalogo');
  const modal = document.querySelector('#modalProducto');
  const modalImagen = document.querySelector('#modalImagen');
  const modalCategoria = document.querySelector('#modalCategoria');
  const modalTitulo = document.querySelector('#modalTitulo');
  const modalDescripcion = document.querySelector('#modalDescripcion');
  const modalEstado = document.querySelector('#modalEstado');
  const modalCodigo = document.querySelector('#modalCodigo');
  const modalWhatsapp = document.querySelector('#modalWhatsapp');
  const menu = document.querySelector('#navegacion');
  const menuBtn = document.querySelector('#menuMovil');
  const modalLogo = document.querySelector('#modalLogo');
  let portada = [];
  const carrusel = document.querySelector('#carruselPortada');
  const carruselPista = document.querySelector('#carruselPista');
  const carruselIndicadores = document.querySelector('#carruselIndicadores');

  const escapar = (texto = '') => String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const enlaceWhatsapp = (mensaje) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`;

  const estadoVisible = (estado) => ({
    disponible: 'Disponible',
    por_encargo: 'Por encargo',
    vendido: 'Vendido',
    agotado: 'Agotado'
  }[estado] || 'Por encargo');

  const codigoVisible = (producto) => {
    if (producto.slug) return producto.slug.toUpperCase();
    return `LP-${String(producto.id || '').slice(0, 8).toUpperCase()}`;
  };

  const precioVisible = (precio) => {
    if (precio === null || precio === undefined || precio === '') return '';
    const numero = Number(precio);
    if (!Number.isFinite(numero)) return '';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(numero);
  };

  const descripcionVisible = (producto) =>
    producto.short_description || producto.description || 'Pieza de La Plantulera pintada y preparada con cuidado.';

  const mensajeProducto = (producto) => [
    'Hola, vi este producto en el catálogo de La Plantulera 🌸',
    '',
    `Producto: ${producto.name}`,
    `Código: ${codigoVisible(producto)}`,
    `Categoría: ${producto.category?.name || 'Sin categoría'}`,
    '',
    producto.availability_status === 'por_encargo'
      ? 'Quiero cotizar una versión personalizada y contarles mi idea.'
      : 'Quiero conocer la disponibilidad y los detalles de esta pieza.'
  ].join('\n');

  function tarjeta(producto) {
    const descripcion = descripcionVisible(producto);
    const precio = precioVisible(producto.price);
    const categoria = producto.category?.name || 'Sin categoría';
    const imagen = producto.cover_image_url || 'img/branding/logo.webp';

    return `
      <article class="producto" data-id="${escapar(producto.id)}">
        <button class="producto__imagen-btn" type="button" data-ver="${escapar(producto.id)}" aria-label="Ver detalles de ${escapar(producto.name)}">
          <img class="producto__imagen" src="${escapar(imagen)}" alt="${escapar(producto.name)}" loading="lazy">
        </button>
        <div class="producto__cuerpo">
          <div class="producto__meta">
            <span class="producto__categoria">${escapar(categoria)}</span>
            <span class="estado">${escapar(estadoVisible(producto.availability_status))}</span>
          </div>
          <h3>${escapar(producto.name)}</h3>
          <p>${escapar(descripcion)}</p>
          ${precio ? `<div class="producto__precio">${escapar(precio)}</div>` : ''}
          <div class="producto__acciones">
            <button class="boton boton--secundario" type="button" data-ver="${escapar(producto.id)}">Ver detalles</button>
            <a class="boton boton--principal" href="${enlaceWhatsapp(mensajeProducto(producto))}" target="_blank" rel="noopener">${producto.availability_status === 'por_encargo' ? 'Cotizar' : 'Consultar'}</a>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const visibles = categoriaActiva === 'Todos'
      ? productos
      : productos.filter(p => p.category?.slug === categoriaActiva);

    grid.innerHTML = visibles.map(tarjeta).join('');
    vacio.classList.toggle('visible', visibles.length === 0);
    vacio.textContent = categoriaActiva === 'Todos'
      ? 'Todavía no hay productos publicados. Cuando se publique uno desde el gestor aparecerá aquí automáticamente.'
      : 'Aún no hay productos publicados en esta categoría.';
  }

  function renderCategorias(categorias) {
    const botones = [
      '<button class="categoria-btn activo" type="button" data-categoria="Todos">Todos</button>',
      ...categorias.map(categoria => `
        <button class="categoria-btn" type="button" data-categoria="${escapar(categoria.slug)}">${escapar(categoria.name)}</button>`)
    ];
    categoriasCatalogo.innerHTML = botones.join('');
  }

  async function consultaSupabase(ruta) {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Configuración de Supabase incompleta.');

    const respuesta = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Accept: 'application/json'
      }
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Supabase respondió ${respuesta.status}. ${detalle}`.trim());
    }

    return respuesta.json();
  }

  async function cargarCatalogo() {
    catalogoEstado.classList.remove('oculto', 'error');
    catalogoEstado.textContent = 'Cargando productos publicados…';

    try {
      const [categorias, filasProductos] = await Promise.all([
        consultaSupabase('categories?select=id,name,slug,sort_order&active=eq.true&order=sort_order.asc,name.asc'),
        consultaSupabase('products?select=id,name,slug,short_description,description,price,availability_status,featured,plantilocura,cover_image_url,published_at,created_at,category:categories(id,name,slug)&publication_status=eq.published&availability_status=neq.oculto&order=published_at.desc.nullslast,created_at.desc')
      ]);

      productos = Array.isArray(filasProductos) ? filasProductos : [];
      renderCategorias(Array.isArray(categorias) ? categorias : []);
      render();
      catalogoEstado.classList.add('oculto');
    } catch (error) {
      console.error('No se pudo cargar el catálogo desde Supabase:', error);
      productos = [];
      renderCategorias([]);
      render();
      catalogoEstado.textContent = 'No pudimos actualizar el catálogo en este momento. Intenta recargar la página en unos minutos.';
      catalogoEstado.classList.add('error');
    }
  }

  async function cargarPortada() {
    try {
      const filas = await consultaSupabase('carousel_slides?select=id,slot,title,description,image_url,button_text,button_url,active&active=eq.true&order=slot.asc');
      portada = Array.isArray(filas) ? filas : [];
      iniciarCarrusel(portada);
    } catch (error) {
      console.error('No se pudo cargar el carrusel desde Supabase:', error);
      portada = [];
      iniciarCarrusel(portada);
    }
  }

  function abrirModal(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    const imagen = producto.cover_image_url || 'img/branding/logo.webp';
    modalImagen.src = imagen;
    modalImagen.alt = producto.name;
    modalCategoria.textContent = producto.category?.name || 'Sin categoría';
    modalTitulo.textContent = producto.name;
    modalDescripcion.textContent = descripcionVisible(producto);
    modalEstado.textContent = estadoVisible(producto.availability_status);
    modalCodigo.textContent = codigoVisible(producto);
    modalWhatsapp.textContent = producto.availability_status === 'por_encargo' ? 'Quiero cotizar uno' : 'Consultar por WhatsApp';
    modalWhatsapp.href = enlaceWhatsapp(mensajeProducto(producto));
    modal.classList.add('abierto');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-abierto');
  }

  function cerrarModal() {
    modal.classList.remove('abierto');
    modal.setAttribute('aria-hidden', 'true');
    if (!modalLogo?.classList.contains('abierto')) document.body.classList.remove('modal-abierto');
  }

  function abrirLogo() {
    if (!modalLogo) return;
    modalLogo.classList.add('abierto');
    modalLogo.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-abierto');
    modalLogo.querySelector('[data-cerrar-logo]')?.focus();
  }

  function cerrarLogo() {
    if (!modalLogo) return;
    modalLogo.classList.remove('abierto');
    modalLogo.setAttribute('aria-hidden', 'true');
    if (!modal.classList.contains('abierto')) document.body.classList.remove('modal-abierto');
  }

  categoriasCatalogo.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-categoria]');
    if (!btn) return;
    categoriasCatalogo.querySelectorAll('[data-categoria]').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');
    categoriaActiva = btn.dataset.categoria;
    render();
  });

  document.addEventListener('click', (event) => {
    const verLogo = event.target.closest('[data-ver-logo]');
    if (verLogo) {
      abrirLogo();
      return;
    }

    const ver = event.target.closest('[data-ver]');
    if (ver) abrirModal(ver.dataset.ver);
    if (event.target.matches('[data-cerrar-modal]') || event.target === modal) cerrarModal();
    if (event.target.matches('[data-cerrar-logo]') || event.target === modalLogo) cerrarLogo();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (modalLogo?.classList.contains('abierto')) cerrarLogo();
    else if (modal.classList.contains('abierto')) cerrarModal();
  });

  menuBtn.addEventListener('click', () => {
    const abierta = menu.classList.toggle('abierta');
    menuBtn.setAttribute('aria-expanded', String(abierta));
  });

  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('abierta')));

  document.querySelectorAll('[data-whatsapp-general]').forEach(a => {
    a.href = enlaceWhatsapp('Hola, vi el catálogo de La Plantulera 🌸 y quiero cotizar un regalo pintado y personalizado.');
  });

  document.querySelectorAll('[data-whatsapp-plantilocura]').forEach(a => {
    a.href = enlaceWhatsapp('Hola 🌸 Quiero saber qué piezas están disponibles para Jueves de Plantilocura.');
  });

  function hrefSeguro(valor) {
    const href = String(valor || '').trim();
    if (!href) return '#catalogo';
    if (href === '#productos') return '#catalogo';
    if (href.startsWith('#') || href.startsWith('/') || /^https?:\/\//i.test(href)) return href;
    return '#catalogo';
  }

  function iniciarCarrusel(slides = []) {
    if (!carrusel || !carruselPista) return;

    if (!Array.isArray(slides) || slides.length === 0) {
      carrusel.style.display = 'none';
      return;
    }
    carrusel.style.display = '';

    let indice = 0;
    let temporizador = null;
    let inicioX = null;
    const total = slides.length;

    carruselPista.innerHTML = slides.map((item, i) => {
      const titulo = item.title || 'La Plantulera';
      const imagen = item.image_url || 'img/branding/logo.webp';
      const texto = item.description || '';
      const boton = item.button_text || '';
      const href = hrefSeguro(item.button_url);
      const externo = /^https?:\/\//i.test(href);

      return `
        <article class="carrusel__slide" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${total}: ${escapar(titulo)}">
          <img class="carrusel__imagen" src="${escapar(imagen)}" alt="${escapar(titulo)}" ${i === 0 ? '' : 'loading="lazy"'}>
          <div class="carrusel__capa">
            <strong class="carrusel__titulo">${escapar(titulo)}</strong>
            ${texto ? `<span class="carrusel__texto">${escapar(texto)}</span>` : ''}
            ${boton ? `<a class="boton boton--dorado carrusel__boton" href="${escapar(href)}" ${externo ? 'target="_blank" rel="noopener"' : ''}>${escapar(boton)}</a>` : ''}
          </div>
        </article>`;
    }).join('');

    carruselIndicadores.innerHTML = slides.map((item, i) => `
      <button class="carrusel__punto${i === 0 ? ' activo' : ''}" type="button" data-carrusel-ir="${i}" aria-label="Ver ${escapar(item.title || `diapositiva ${i + 1}`)}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('');

    const puntos = [...carruselIndicadores.querySelectorAll('[data-carrusel-ir]')];

    const programar = () => {
      if (temporizador) window.clearInterval(temporizador);
      if (total > 1) temporizador = window.setInterval(() => mostrar(indice + 1, false), 5000);
    };

    const mostrar = (nuevoIndice, reiniciar = true) => {
      indice = (nuevoIndice + total) % total;
      carruselPista.style.transform = `translateX(-${indice * 100}%)`;
      puntos.forEach((punto, i) => {
        const activo = i === indice;
        punto.classList.toggle('activo', activo);
        punto.setAttribute('aria-current', activo ? 'true' : 'false');
      });
      if (reiniciar) programar();
    };

    carrusel.querySelector('[data-carrusel-anterior]')?.addEventListener('click', () => mostrar(indice - 1));
    carrusel.querySelector('[data-carrusel-siguiente]')?.addEventListener('click', () => mostrar(indice + 1));
    puntos.forEach(punto => punto.addEventListener('click', () => mostrar(Number(punto.dataset.carruselIr))));

    carruselPista.addEventListener('touchstart', (event) => {
      inicioX = event.touches[0]?.clientX ?? null;
    }, { passive: true });

    carruselPista.addEventListener('touchend', (event) => {
      if (inicioX === null) return;
      const finX = event.changedTouches[0]?.clientX ?? inicioX;
      const diferencia = finX - inicioX;
      inicioX = null;
      if (Math.abs(diferencia) < 45) return;
      mostrar(indice + (diferencia < 0 ? 1 : -1));
    }, { passive: true });

    carrusel.addEventListener('mouseenter', () => temporizador && window.clearInterval(temporizador));
    carrusel.addEventListener('mouseleave', programar);
    carrusel.addEventListener('focusin', () => temporizador && window.clearInterval(temporizador));
    carrusel.addEventListener('focusout', programar);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && temporizador) window.clearInterval(temporizador);
      else programar();
    });

    mostrar(0);
  }

  cargarPortada();
  cargarCatalogo();
})();

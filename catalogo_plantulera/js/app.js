(() => {
  const WHATSAPP = '573214230922';
  const productos = Array.isArray(window.PRODUCTOS) ? window.PRODUCTOS : [];
  const grid = document.querySelector('#gridProductos');
  const vacio = document.querySelector('#estadoVacio');
  const botonesCategoria = [...document.querySelectorAll('[data-categoria]')];
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
  const portada = Array.isArray(window.PORTADA) ? window.PORTADA : [];
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

  const mensajeProducto = (producto) => [
    'Hola, vi este trabajo en el catálogo de La Plantulera 🌸',
    '',
    `Producto: ${producto.nombre}`,
    `Código: ${producto.id}`,
    `Categoría: ${producto.categoria}`,
    '',
    producto.personalizable
      ? 'Quiero cotizar una versión personalizada y contarles mi idea.'
      : 'Quiero conocer disponibilidad, precio y opciones para una pieza como esta.'
  ].join('\n');

  function tarjeta(producto) {
    return `
      <article class="producto" data-id="${escapar(producto.id)}">
        <button class="producto__imagen-btn" type="button" data-ver="${escapar(producto.id)}" aria-label="Ver detalles de ${escapar(producto.nombre)}">
          <img class="producto__imagen" src="${escapar(producto.imagen)}" alt="${escapar(producto.nombre)}" loading="lazy">
        </button>
        <div class="producto__cuerpo">
          <div class="producto__meta">
            <span class="producto__categoria">${escapar(producto.categoria)}</span>
            <span class="estado">${escapar(producto.estado)}</span>
          </div>
          <h3>${escapar(producto.nombre)}</h3>
          <p>${escapar(producto.descripcion)}</p>
          <div class="producto__acciones">
            <button class="boton boton--secundario" type="button" data-ver="${escapar(producto.id)}">Ver detalles</button>
            <a class="boton boton--principal" href="${enlaceWhatsapp(mensajeProducto(producto))}" target="_blank" rel="noopener">Cotizar</a>
          </div>
        </div>
      </article>`;
  }

  function render(categoria = 'Todos') {
    const visibles = categoria === 'Todos' ? productos : productos.filter(p => p.categoria === categoria);
    grid.innerHTML = visibles.map(tarjeta).join('');
    vacio.classList.toggle('visible', visibles.length === 0);
    vacio.textContent = categoria === 'Termos'
      ? 'La categoría Termos ya está preparada. Añadiremos un producto real cuando tengamos su fotografía y datos.'
      : 'Aún no hay trabajos cargados en esta categoría.';
  }

  function abrirModal(id) {
    const producto = productos.find(p => p.id === id);
    if (!producto) return;
    modalImagen.src = producto.imagen;
    modalImagen.alt = producto.nombre;
    modalCategoria.textContent = producto.categoria;
    modalTitulo.textContent = producto.nombre;
    modalDescripcion.textContent = producto.descripcion;
    modalEstado.textContent = producto.estado;
    modalCodigo.textContent = producto.id;
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

  botonesCategoria.forEach(btn => {
    btn.addEventListener('click', () => {
      botonesCategoria.forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      render(btn.dataset.categoria);
    });
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

  function iniciarCarrusel() {
    if (!carrusel || !carruselPista || portada.length === 0) return;

    let indice = 0;
    let temporizador = null;
    let inicioX = null;

    carruselPista.innerHTML = portada.map((item, i) => `
      <article class="carrusel__slide" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${portada.length}: ${escapar(item.titulo)}">
        <img class="carrusel__imagen" src="${escapar(item.imagen)}" alt="${escapar(item.titulo)}" ${i === 0 ? '' : 'loading="lazy"'}>
        <div class="carrusel__capa">
          <span class="carrusel__categoria">${escapar(item.categoria)}</span>
          <strong class="carrusel__titulo">${escapar(item.titulo)}</strong>
          <span class="carrusel__texto">${escapar(item.texto)}</span>
        </div>
      </article>`).join('');

    carruselIndicadores.innerHTML = portada.map((item, i) => `
      <button class="carrusel__punto${i === 0 ? ' activo' : ''}" type="button" data-carrusel-ir="${i}" aria-label="Ver ${escapar(item.titulo)}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('');

    const puntos = [...carruselIndicadores.querySelectorAll('[data-carrusel-ir]')];

    const mostrar = (nuevoIndice, reiniciar = true) => {
      indice = (nuevoIndice + portada.length) % portada.length;
      carruselPista.style.transform = `translateX(-${indice * 100}%)`;
      puntos.forEach((punto, i) => {
        const activo = i === indice;
        punto.classList.toggle('activo', activo);
        punto.setAttribute('aria-current', activo ? 'true' : 'false');
      });
      if (reiniciar) programar();
    };

    const programar = () => {
      if (temporizador) window.clearInterval(temporizador);
      temporizador = window.setInterval(() => mostrar(indice + 1, false), 5000);
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

  iniciarCarrusel();
  render();
})();

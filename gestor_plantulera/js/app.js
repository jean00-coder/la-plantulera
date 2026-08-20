(() => {
  'use strict';

  const cfg = window.LA_PLANTULERA_CONFIG;
  if (!cfg || !window.supabase) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">No se pudo iniciar el gestor. Revisa la conexion y la configuracion de Supabase.</p>';
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

  function mostrar(pantalla) {
    [login, password, dashboard].forEach((el) => {
      const activo = el === pantalla;
      el.classList.toggle('hidden', !activo);
      el.setAttribute('aria-hidden', String(!activo));
    });
  }

  function setStatus(el, texto, tipo = '') {
    el.textContent = texto || '';
    el.className = `status ${tipo}`.trim();
  }

  function mensajeError(error) {
    const raw = String(error?.message || 'No fue posible completar la accion.');
    const lower = raw.toLowerCase();
    if (lower.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (lower.includes('email not confirmed')) return 'Debes confirmar tu correo antes de entrar.';
    if (lower.includes('rate limit')) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
    return raw;
  }

  function esFlujoPassword() {
    const href = window.location.href;
    return /type=(invite|recovery)/i.test(href) || /access_token=/i.test(window.location.hash);
  }

  async function pintarSesion(session) {
    if (!session?.user) {
      mostrar(login);
      return;
    }

    if (esFlujoPassword()) {
      mostrar(password);
      return;
    }

    $('correoUsuario').textContent = session.user.email || '';
    $('saludoUsuario').textContent = 'Hola, administrador';
    mostrar(dashboard);
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

    setStatus(msgLogin, 'Enviando enlace de recuperacion...');
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
    $('formLogin').reset();
    setStatus(msgLogin, 'Sesion cerrada.', 'success');
    mostrar(login);
  });

  client.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      mostrar(password);
      return;
    }
    if (event === 'SIGNED_OUT') {
      mostrar(login);
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      await pintarSesion(session);
    }
  });

  (async () => {
    const { data } = await client.auth.getSession();
    await pintarSesion(data.session);
  })();
})();

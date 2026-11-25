/* "Sofia · Reactivation 90 Private Consultation" (OTO1 of Bariatric Yoghurt IT). Cloned from Lucas AI (Fasting 2.0 AR).
   Cloned from Profe Martín 24/7: framework-free, photos, daily limit and conversation saved on the phone.
   The server is the Edge Function "sofia-ai-en" from Supabase (meta-surfing).
   Extra: saves the last "📋 My file" on the phone to continue in a new chat. */

const API = 'https://mrspggszwtvndlatsmxv.supabase.co/functions/v1/sofia-ai-en';
const LIMIT = 10;

const hilo        = document.getElementById('hilo');
const bienvenida  = document.getElementById('bienvenida');
const compositor  = document.getElementById('compositor');
const entrada     = document.getElementById('entrada');
const botonEnviar = document.getElementById('enviar');
const contador    = document.getElementById('contador');
const botonNuevo  = document.getElementById('nuevo');
const botonFoto   = document.getElementById('foto');
const archivo     = document.getElementById('archivo');
const adjunto     = document.getElementById('adjunto');
const adjuntoImg  = document.getElementById('adjunto-img');
const quitarFoto  = document.getElementById('quitar-foto');

let conversacion = [];      // [{ rol: 'usuario'|'asistente', texto, conFoto? }]
let respondiendo = false;
let fotoPendiente = null;   // { datos (base64), vista (dataURL) }

/* ── Storage in browser (all with try/catch: may be missing in private browsing mode) ── */
const CLAVE_GUARDADO = 'sofia-ai-en-chat-v1';
const CLAVE_CLIENTE  = 'sofia-ai-en-client-id';
const CLAVE_FICHA    = 'sofia-ai-en-scheda-v1';

function guardar() {
  try { localStorage.setItem(CLAVE_GUARDADO, JSON.stringify(conversacion)); } catch {}
}
function recuperar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_GUARDADO) || '[]');
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}
function idCliente() {
  let id = null;
  try { id = localStorage.getItem(CLAVE_CLIENTE); } catch {}
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    id = 'c' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem(CLAVE_CLIENTE, id); } catch {}
  }
  return id;
}
const CLIENTE = idCliente();

/* ── Safe text: escape everything before inserting into HTML ── */
const escapar = (t) => t.replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ocultarMarcadorSuelto(t) {
  for (const marca of ['**', '`']) {
    if ((t.split(marca).length - 1) % 2 === 1) {
      const i = t.lastIndexOf(marca);
      t = t.slice(0, i) + t.slice(i + marca.length);
    }
  }
  return t.replace(/\*$/, '');
}

function enLinea(t) {
  return t
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

function aHtml(texto, enCurso) {
  let t = escapar(texto);
  if (enCurso) t = ocultarMarcadorSuelto(t);

  let html = '', lista = null, parrafo = [];
  const cerrarParrafo = () => {
    if (parrafo.length) { html += '<p>' + parrafo.join('<br>') + '</p>'; parrafo = []; }
  };
  const cerrarLista = () => { if (lista) { html += `</${lista}>`; lista = null; } };

  for (const linea of t.split('\n')) {
    const titulo = linea.match(/^\s*#{1,6}\s+(.*)$/);
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(linea)) { cerrarParrafo(); cerrarLista(); continue; }
    if (titulo) {
      cerrarParrafo(); cerrarLista();
      html += `<p><strong>${enLinea(titulo[1].replace(/\*\*/g, ''))}</strong></p>`;
      continue;
    }
    const numerada = linea.match(/^\s*\d+[.)]\s+(.*)$/);
    const vineta   = linea.match(/^\s*[-*•]\s+(.*)$/);
    if (numerada) {
      cerrarParrafo();
      if (lista !== 'ol') { cerrarLista(); html += '<ol>'; lista = 'ol'; }
      html += `<li>${enLinea(numerada[1])}</li>`;
    } else if (vineta) {
      cerrarParrafo();
      if (lista !== 'ul') { cerrarLista(); html += '<ul>'; lista = 'ul'; }
      html += `<li>${enLinea(vineta[1])}</li>`;
    } else if (!linea.trim()) {
      cerrarParrafo(); cerrarLista();
    } else {
      cerrarLista(); parrafo.push(enLinea(linea));
    }
  }
  cerrarParrafo(); cerrarLista();
  return html;
}

/* ── Render messages ── */
function agregarMensaje(quien, texto, clase) {
  const fila = document.createElement('div');
  fila.className = `mensaje de-${quien}` + (clase ? ` ${clase}` : '');
  const caja = document.createElement('div');
  caja.className = 'texto';
  caja.innerHTML = texto ? aHtml(texto, false) : '';
  fila.appendChild(caja);
  hilo.appendChild(fila);
  bajar();
  return caja;
}

function agregarMensajeConFoto(texto, vista) {
  const caja = agregarMensaje('usuario', '');
  if (vista) {
    const img = document.createElement('img');
    img.className = 'foto-enviada';
    img.alt = 'Your photo';
    img.src = vista;
    img.addEventListener('load', bajar);
    caja.appendChild(img);
  } else {
    const nota = document.createElement('div');
    nota.className = 'foto-nota';
    nota.textContent = '📷 Photo sent';
    caja.appendChild(nota);
  }
  if (texto) caja.insertAdjacentHTML('beforeend', aHtml(texto, false));
  bajar();
}

function puntitos(caja) {
  caja.innerHTML = '<span class="puntitos"><i></i><i></i><i></i></span>';
}

let pegadoAbajo = true;
hilo.addEventListener('scroll', () => {
  pegadoAbajo = hilo.scrollHeight - hilo.scrollTop - hilo.clientHeight < 80;
});
const bajar = () => { if (pegadoAbajo) hilo.scrollTop = hilo.scrollHeight; };

/* ── Daily counter ── */
function pintarContador(restantes, limite) {
  if (restantes === null || restantes === undefined) { contador.textContent = ''; return; }
  contador.textContent = restantes === 0
    ? 'You have used all your messages for today'
    : `You have ${restantes} of ${limite} messages left today`;
  contador.classList.toggle('pocas', restantes <= 2);
  entrada.disabled = restantes === 0;
  entrada.placeholder = restantes === 0 ? 'We will continue tomorrow at midnight…' : 'Write to Sofia…';
}

async function cargarEstado() {
  try {
    const r = await fetch(`${API}?clientId=${encodeURIComponent(CLIENTE)}`);
    const d = await r.json();
    pintarContador(d.restantes, d.limite || LIMIT);
  } catch { pintarContador(null); }
}

/* ── Daily limit resets at 00:00 ──
   If the chat remains open on the phone from yesterday, returning will re-query
   the server so the input box does not stay stuck in "Tomorrow at midnight we continue...". */
const diaAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
let diaVisto = diaAR();
function revisarDia() {
  if (respondiendo) return;
  diaVisto = diaAR();
  cargarEstado();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarDia(); });
window.addEventListener('focus', revisarDia);
window.addEventListener('pageshow', (e) => { if (e.persisted) revisarDia(); });
compositor.addEventListener('click', () => { if (entrada.disabled) revisarDia(); });
setInterval(() => { if (!document.hidden && (entrada.disabled || diaAR() !== diaVisto)) revisarDia(); }, 60_000);

/* ── The file: Sofia writes it in a line "📋 My file: …"; we save it on the phone
   and offer it in a new chat ("Continue where we left off") + button to copy it. ── */
const botonSeguir = document.getElementById('seguir-ficha');
const fichaVista  = document.getElementById('ficha-vista');

function extraerFicha(texto) {
  const m = texto.match(/📋\s*\**\s*My file\s*:?\**\s*:?\s*([^\n]+)/i);
  return m ? ('📋 My file: ' + m[1].replace(/\*\*/g, '').trim()) : null;
}
function fichaGuardada() {
  try { return localStorage.getItem(CLAVE_FICHA) || ''; } catch { return ''; }
}
function guardarFicha(f) {
  try { localStorage.setItem(CLAVE_FICHA, f); } catch {}
}
function mostrarSeguir() {
  const f = fichaGuardada();
  botonSeguir.hidden = !f;
  fichaVista.textContent = f.replace(/^📋 My file:\s*/, '');
}
botonSeguir.addEventListener('click', () => {
  const f = fichaGuardada();
  if (f) enviar(f + '\nLet us continue from here.');
});

async function copiarTexto(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {}
  try {
    const a = document.createElement('textarea');
    a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
    document.body.appendChild(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok;
  } catch { return false; }
}
function botonCopiarFicha(caja, ficha) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'copiar-ficha'; b.textContent = '📋 Copy my file';
  b.addEventListener('click', async () => {
    b.textContent = (await copiarTexto(ficha)) ? '✓ Copied. Save it in your notes' : 'Press and hold the text to copy';
  });
  caja.appendChild(b);
}

/* ── Photos: resize on mobile (max 1024 px, JPEG) ── */
const LADO_MAXIMO = 1024;

function cargarImagen(file) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('unreadable')); };
    img.src = url;
  });
}

async function prepararFoto(file) {
  const img = await cargarImagen(file);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.naturalWidth * escala);
  lienzo.height = Math.round(img.naturalHeight * escala);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#fff';                       // transparent PNGs: white background
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const vista = lienzo.toDataURL('image/jpeg', 0.85);
  return { datos: vista.split(',')[1], vista };
}

function mostrarAdjunto() {
  adjunto.hidden = !fotoPendiente;
  adjuntoImg.src = fotoPendiente ? fotoPendiente.vista : '';
}

botonFoto.addEventListener('click', () => archivo.click());

archivo.addEventListener('change', async () => {
  const file = archivo.files && archivo.files[0];
  archivo.value = '';
  if (!file) return;
  try {
    fotoPendiente = await prepararFoto(file);
    mostrarAdjunto();
    entrada.focus();
  } catch {
    fotoPendiente = null;
    mostrarAdjunto();
    agregarMensaje('asistente',
      'I cannot open this photo. Please try another one, ' +
      'or take a screenshot and send me that.', 'es-error');
  }
});

quitarFoto.addEventListener('click', () => { fotoPendiente = null; mostrarAdjunto(); });

/* ── Send and receive ── */
async function enviar(pregunta) {
  const foto = fotoPendiente;
  if (respondiendo || entrada.disabled || (!pregunta.trim() && !foto)) return;
  respondiendo = true;
  botonEnviar.disabled = true;
  botonFoto.disabled = true;
  bienvenida.hidden = true;
  botonNuevo.hidden = false;
  fotoPendiente = null;
  mostrarAdjunto();

  const texto = pregunta.trim() || 'Take a look at this photo, Sofia.';
  if (foto) agregarMensajeConFoto(pregunta, foto.vista);
  else agregarMensaje('usuario', pregunta);

  const mensaje = { rol: 'usuario', texto };
  if (foto) mensaje.conFoto = true;
  conversacion.push(mensaje);

  const paraMandar = conversacion.map((m) => ({
    role: m.rol === 'usuario' ? 'user' : 'assistant',
    content: m.conFoto && m !== mensaje ? `[Photo sent] ${m.texto}` : m.texto,
  }));

  const caja = agregarMensaje('asistente', '');
  puntitos(caja);

  let acumulado = '';
  let fallo = false;
  const mostrarError = (msg) => {
    fallo = true;
    caja.parentElement.classList.add('es-error');
    caja.innerHTML = aHtml(msg, false);
    acumulado = '';
    bajar();
  };

  try {
    const respuesta = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: paraMandar, image: foto ? foto.datos : undefined, clientId: CLIENTE }),
    });

    const tipo = respuesta.headers.get('content-type') || '';
    if (!respuesta.ok || !tipo.includes('text/event-stream')) {
      let d = {};
      try { d = await respuesta.json(); } catch {}
      mostrarError(d.error || 'Something went wrong. Please try again in a moment.');
      if (d.sin_cupo) pintarContador(0, LIMIT);
    } else {
      const lector = respuesta.body.getReader();
      const decodificador = new TextDecoder();
      let resto = '';
      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });
        const trozos = resto.split('\n\n');
        resto = trozos.pop();
        for (const trozo of trozos) {
          if (!trozo.startsWith('data: ')) continue;
          let dato;
          try { dato = JSON.parse(trozo.slice(6)); } catch { continue; }
          if (dato.tipo === 'delta') {
            acumulado += dato.texto;
            caja.innerHTML = aHtml(acumulado, true);
            bajar();
          } else if (dato.tipo === 'error') {
            mostrarError(dato.mensaje);
          } else if (dato.tipo === 'fin') {
            pintarContador(dato.restantes, dato.limite || LIMIT);
          }
        }
      }
    }
  } catch {
    mostrarError('The connection was interrupted before finishing. ' +
      'Please check your internet connection and try again.');
  }

  if (acumulado) {
    caja.innerHTML = aHtml(acumulado, false);
    conversacion.push({ rol: 'asistente', texto: acumulado });
    const ficha = extraerFicha(acumulado);
    if (ficha) { guardarFicha(ficha); botonCopiarFicha(caja, ficha); }
  } else if (fallo) {
    // Without a response, remove the question so two questions are not repeated on the next attempt.
    conversacion.pop();
    if (foto) { fotoPendiente = foto; mostrarAdjunto(); }
  }
  guardar();

  respondiendo = false;
  botonEnviar.disabled = false;
  botonFoto.disabled = false;
  if (!entrada.disabled) entrada.focus();
}

/* ── New chat ── */
botonNuevo.addEventListener('click', () => {
  if (respondiendo) return;
  if (conversacion.length &&
      !confirm('Start a new conversation? This conversation will be erased from this phone (your file remains saved).')) return;
  conversacion = [];
  guardar();
  hilo.querySelectorAll('.mensaje').forEach((m) => m.remove());
  bienvenida.hidden = false;
  botonNuevo.hidden = true;
  mostrarSeguir();
  fotoPendiente = null;
  mostrarAdjunto();
  if (!entrada.disabled) entrada.focus();
});

/* ── Input field ── */
function acomodarAlto() {
  entrada.style.height = 'auto';
  entrada.style.height = Math.min(entrada.scrollHeight, 160) + 'px';
}
entrada.addEventListener('input', acomodarAlto);

/* Enter sends, Shift+Enter creates a line break. */
entrada.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); compositor.requestSubmit(); }
});

compositor.addEventListener('submit', (e) => {
  e.preventDefault();
  const pregunta = entrada.value.trim();
  if (!pregunta && !fotoPendiente) return;
  entrada.value = '';
  acomodarAlto();
  enviar(pregunta);
});

document.querySelectorAll('.sugerencia').forEach((b) => {
  b.addEventListener('click', () => enviar(b.textContent.trim()));
});

/* ── On load: redraw saved conversation ── */
conversacion = recuperar().filter((m) => m && typeof m.texto === 'string');
if (conversacion.length) {
  bienvenida.hidden = true;
  botonNuevo.hidden = false;
  for (const m of conversacion) {
    if (m.rol === 'usuario' && m.conFoto) agregarMensajeConFoto(m.texto, null);
    else {
      const caja = agregarMensaje(m.rol === 'usuario' ? 'usuario' : 'asistente', m.texto);
      const ficha = m.rol !== 'usuario' && extraerFicha(m.texto);
      if (ficha) botonCopiarFicha(caja, ficha);
    }
  }
  hilo.scrollTop = hilo.scrollHeight;
}

mostrarSeguir();
cargarEstado();
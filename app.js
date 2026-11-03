/* Calendario — registro diario de comidas y calorías.
   Todo se guarda en este dispositivo (localStorage). */
(() => {
'use strict';

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const K = { pass:'cal_pass', profile:'cal_profile', days:'cal_days', key:'cal_gkey', tips:'cal_tips', ex:'cal_ex', weights:'cal_weights', favs:'cal_favs' };
const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('No se pudo guardar: ' + e.message); } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.round(n).toLocaleString('es-AR');
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseD = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate()+n); return dstr(d); };
const today = () => dstr(new Date());
const uid = () => Math.random().toString(36).slice(2, 10);

const MEALS = ['desayuno','almuerzo','merienda','cena','colación'];

// ---------- clave de ingreso ----------
async function hash(pw, salt) {
  const data = new TextEncoder().encode(salt + '::' + pw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
}

let lockMode = 'enter'; // enter | create | change
function showLock(mode) {
  lockMode = mode || (load(K.pass) ? 'enter' : 'create');
  show('lock');
  $('#pass1').value = ''; $('#pass2').value = ''; $('#lockErr').textContent = '';
  const creating = lockMode !== 'enter';
  $('#pass2').classList.toggle('hidden', !creating);
  $('#forgotBtn').classList.toggle('hidden', creating);
  $('#lockMsg').textContent = lockMode === 'create' ? 'Elegí una clave para entrar' :
                              lockMode === 'change' ? 'Elegí tu nueva clave' : 'Ingresá tu clave';
  $('#lockBtn').textContent = creating ? 'Guardar clave' : 'Entrar';
  setTimeout(() => $('#pass1').focus(), 50);
}

$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('#pass1').value, p2 = $('#pass2').value;
  if (lockMode === 'enter') {
    const st = load(K.pass);
    if (st && await hash(p1, st.salt) === st.hash) { sessionStorage.setItem('cal_ok','1'); start(); }
    else { $('#lockErr').textContent = 'Clave incorrecta'; $('#pass1').select(); }
    return;
  }
  if (p1.length < 4) { $('#lockErr').textContent = 'Usá al menos 4 caracteres'; return; }
  if (p1 !== p2) { $('#lockErr').textContent = 'Las claves no coinciden'; return; }
  const salt = uid() + uid();
  save(K.pass, { salt, hash: await hash(p1, salt) });
  sessionStorage.setItem('cal_ok','1');
  start();
});

$('#forgotBtn').addEventListener('click', () => {
  if (confirm('Si olvidaste la clave, la única forma de entrar es borrar todos los datos guardados en este dispositivo. ¿Querés borrarlos?')) {
    if (confirm('¿Seguro? Esto no se puede deshacer.')) { wipe(); }
  }
});

// ---------- perfil y cálculo ----------
let draft = {};
function calc(p) {
  if (!p || !p.sex || !p.age || !p.height || !p.weight) return null;
  const bmr = 10*p.weight + 6.25*p.height - 5*p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * (p.activity || 1.2);
  const bmi = p.weight / Math.pow(p.height/100, 2);
  const floor = p.sex === 'm' ? 1500 : 1200;
  let goal = p.goal || 'maintain', note = '';
  if (p.age < 18) { goal = 'maintain'; note = 'Para menores de 18 años la página no calcula un plan para bajar de peso: en esa etapa conviene que lo vea un médico o nutricionista.'; }
  else if (bmi < 18.5 && goal === 'lose') { goal = 'maintain'; note = `Con tu peso y altura (IMC ${bmi.toFixed(1)}) no es recomendable bajar de peso, así que el objetivo queda en mantener. Si querés, consultalo con un profesional.`; }
  let target = tdee;
  if (goal === 'lose') {
    const deficit = Math.min(500, tdee * 0.2);
    target = Math.max(tdee - deficit, floor);
  }
  target = Math.round(target / 10) * 10;
  const minHealthy = Math.ceil(18.5 * Math.pow(p.height/100, 2) * 10) / 10;
  return { bmr, tdee, bmi, floor, goal, target, note, minHealthy };
}

function openSetup(editing) {
  draft = Object.assign({ activity: 1.2, goal: 'maintain' }, load(K.profile, {}));
  $('#setupTitle').textContent = editing ? 'Mis datos' : 'Configuración inicial';
  $('#cancelSetup').classList.toggle('hidden', !editing);
  $('#age').value = draft.age || ''; $('#height').value = draft.height || ''; $('#weight').value = draft.weight || '';
  $('#activity').value = String(draft.activity || 1.2);
  $('#goalWeight').value = draft.goalWeight || '';
  show('setup');
  refreshSetup();
}
function readSetup() {
  draft.age = +$('#age').value || null;
  draft.height = +$('#height').value || null;
  draft.weight = +$('#weight').value || null;
  draft.activity = +$('#activity').value;
  draft.goalWeight = +$('#goalWeight').value || null;
}
function refreshSetup() {
  $$('#sexSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === draft.sex));
  $$('#goalSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === draft.goal));
  const r = calc(draft);
  $('#goalNote').classList.toggle('hidden', !(r && r.note));
  if (r && r.note) $('#goalNote').textContent = r.note;
  $('#goalWeightBox').classList.toggle('hidden', !(r && r.goal === 'lose'));
  if (r && r.goal === 'lose') {
    const gw = draft.goalWeight;
    $('#goalWeightHint').textContent = gw && gw < r.minHealthy
      ? `Ese peso queda por debajo del rango saludable para tu altura. El mínimo recomendable es de unos ${String(r.minHealthy).replace('.', ',')} kg.`
      : `Para tu altura, el rango de peso saludable empieza en unos ${String(r.minHealthy).replace('.', ',')} kg.`;
  }
  if (!r) { $('#resultText').innerHTML = 'Completá los datos para ver el cálculo.'; return; }
  let html = `<div style="font-size:30px;font-weight:700;color:var(--ink)">${fmt(r.target)} kcal <span class="small muted" style="font-weight:400">por día</span></div>
    <p class="small">Para mantener tu peso necesitás alrededor de <b>${fmt(r.tdee)} kcal</b>.`;
  if (r.goal === 'lose') {
    html += ` Para bajar de forma gradual te proponemos un déficit moderado de <b>${fmt(r.tdee - r.target)} kcal</b> diarias`;
    html += (r.target <= r.floor) ? `, sin bajar del mínimo recomendado de ${fmt(r.floor)} kcal.` : '.';
    const kgWeek = (r.tdee - r.target) * 7 / 7700;
    html += ` Eso equivale a unos ${kgWeek.toFixed(1).replace('.', ',')} kg por semana, aproximadamente.`;
  }
  html += '</p>';
  $('#resultText').innerHTML = html;
}
$('#sexSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; draft.sex = b.dataset.v; readSetup(); refreshSetup(); });
$('#goalSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; draft.goal = b.dataset.v; readSetup(); refreshSetup(); });
['#age','#height','#weight','#activity','#goalWeight'].forEach(s => $(s).addEventListener('input', () => { readSetup(); refreshSetup(); }));
$('#saveSetup').addEventListener('click', () => {
  readSetup();
  if (!draft.sex) return alert('Elegí mujer u hombre.');
  if (!draft.age || draft.age < 12 || draft.age > 100) return alert('Revisá la edad.');
  if (!draft.height || draft.height < 120 || draft.height > 230) return alert('Revisá la altura (en centímetros).');
  if (!draft.weight || draft.weight < 30 || draft.weight > 300) return alert('Revisá el peso (en kilos).');
  const r = calc(draft);
  if (r.goal === 'lose' && draft.goalWeight) {
    if (draft.goalWeight >= draft.weight) return alert('El peso objetivo tiene que ser menor que tu peso actual.');
    if (draft.goalWeight < r.minHealthy) return alert(`El peso objetivo queda por debajo del rango saludable para tu altura. Elegí uno de al menos ${String(r.minHealthy).replace('.', ',')} kg.`);
  }
  if (r.goal !== 'lose') draft.goalWeight = null;
  const prev = load(K.profile, {}) || {};
  if (draft.goalWeight && (!draft.startWeight || draft.goalWeight !== prev.goalWeight)) { draft.startWeight = draft.weight; draft.startDate = today(); }
  if (prev.weight !== draft.weight || !Object.keys(load(K.weights, {})).length) { const w = load(K.weights, {}); w[today()] = draft.weight; save(K.weights, w); }
  save(K.profile, draft);
  start();
});
$('#cancelSetup').addEventListener('click', () => { start(); openTab('settings'); });

// ---------- reconocimiento con Gemini ----------
// Modelos rápidos primero; se recuerda el último que funcionó para no perder tiempo probando.
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const TIMEOUT_MS = 15000;
async function gemini(prompt, json = true) {
  const key = load(K.key, '');
  if (!key) throw new Error('NO_KEY');
  const good = load('cal_model', '');
  const order = good && MODELS.includes(good) ? [good, ...MODELS.filter(m => m !== good)] : MODELS;
  let lastErr;
  for (const model of order) {
    // en los modelos 2.5 se apaga el "razonamiento", que es lo que más demora
    const configs = /2\.5/.test(model) ? [{ thinkingConfig: { thinkingBudget: 0 } }, {}] : [{}];
    for (const extra of configs) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: Object.assign({ temperature: 0.2 }, extra, json ? { responseMimeType: 'application/json' } : {})
          })
        });
        clearTimeout(timer);
        if (!res.ok) {
          const t = await res.text();
          lastErr = new Error(`${res.status}: ${t.slice(0, 200)}`);
          if (res.status === 400 && /API key/i.test(t)) throw Object.assign(new Error('BAD_KEY'), { fatal: true });
          if (res.status === 401 || res.status === 403) throw Object.assign(new Error('BAD_KEY'), { fatal: true });
          if (res.status === 400) continue; // opción no soportada: reintentar sin ella
          break; // 404 modelo inexistente, 429 cuota, 5xx: pasar al siguiente modelo
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
        let out;
        if (!json) out = text;
        else { const m = text.match(/\{[\s\S]*\}/); out = JSON.parse(m ? m[0] : text); }
        if (good !== model) save('cal_model', model);
        return out;
      } catch (e) {
        clearTimeout(timer);
        if (e.fatal) throw e;
        lastErr = e.name === 'AbortError' ? new Error('Tardó demasiado') : e;
        break;
      }
    }
  }
  throw lastErr || new Error('Sin respuesta');
}

function guessMeal(text) {
  const t = text.toLowerCase();
  if (/desayun/.test(t)) return 'desayuno';
  if (/almor|almuerz/.test(t)) return 'almuerzo';
  if (/meriend|merend/.test(t)) return 'merienda';
  if (/\bcen[eéa]|\bcena/.test(t)) return 'cena';
  if (/colaci|snack|picote/.test(t)) return 'colación';
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 15 ? 'almuerzo' : h < 19 ? 'merienda' : 'cena';
}

async function parseWithAI(text) {
  const prompt = `Sos un asistente de nutrición argentino. Una persona describe lo que comió, en español rioplatense.
Identificá cada alimento o bebida y estimá cantidades y calorías de forma realista para porciones típicas de Argentina.
Si dice marcas o productos comerciales (por ejemplo "barrita Integra", "alfajor Guaymallén", "yogur Ser"), usá los valores habituales de ese producto.
Si no aclara la cantidad, asumí una porción estándar. Sé preciso pero sin exagerar.
También indicá a qué comida corresponde: desayuno, almuerzo, merienda, cena o colación (si no lo dice, usá "${guessMeal(text)}").

Texto: """${text}"""

Respondé SOLO con JSON con este formato:
{"comida":"almuerzo","items":[{"nombre":"Galletas de arroz","cantidad":"2 unidades","kcal":70,"proteinas":1.5,"carbohidratos":15,"grasas":0.5}]}
Usá números (no texto) en kcal y macros (en gramos). Si el texto no describe comida, devolvé {"comida":"","items":[]}.`;
  const r = await gemini(prompt);
  const items = (r.items || []).filter(i => i && i.nombre).map(i => ({
    id: uid(), name: String(i.nombre), qty: String(i.cantidad || ''),
    kcal: Math.max(0, Math.round(+i.kcal || 0)),
    p: +i.proteinas || 0, c: +i.carbohidratos || 0, f: +i.grasas || 0
  }));
  const meal = MEALS.includes((r.comida || '').toLowerCase()) ? r.comida.toLowerCase() : guessMeal(text);
  return { meal, items };
}

// ---------- base local (sin clave o sin conexión) ----------
const LOCAL = [
  [/galletit?as? de arroz|galletas? de arroz/, 'Galleta de arroz', 35, 'unidad'],
  [/huevos? duros?|huevos? revuelt|huevos? fritos?|huevos?/, 'Huevo', 75, 'unidad'],
  [/claras?/, 'Clara de huevo', 17, 'unidad'],
  [/manzanas?/, 'Manzana', 80, 'unidad'],
  [/bananas?|plátanos?/, 'Banana', 105, 'unidad'],
  [/naranjas?/, 'Naranja', 65, 'unidad'],
  [/mandarinas?/, 'Mandarina', 45, 'unidad'],
  [/peras?/, 'Pera', 95, 'unidad'],
  [/frutillas?/, 'Frutillas', 35, 'taza'],
  [/kiwis?/, 'Kiwi', 45, 'unidad'],
  [/barrit?as? (de cereal|integra|íntegra)|barrit?as?/, 'Barrita de cereal', 100, 'unidad'],
  [/alfajor(es)? de arroz/, 'Alfajor de arroz', 95, 'unidad'],
  [/alfajor(es)?/, 'Alfajor', 240, 'unidad'],
  [/medialunas?/, 'Medialuna', 180, 'unidad'],
  [/facturas?/, 'Factura', 250, 'unidad'],
  [/tostadas?/, 'Tostada', 70, 'unidad'],
  [/pan (lactal|de molde)|rebanadas? de pan/, 'Pan lactal', 70, 'rebanada'],
  [/pan(es)?\b|mignon/, 'Pan', 140, 'unidad'],
  [/queso crema|casancrem/, 'Queso crema', 40, 'cucharada'],
  [/queso (cremoso|fresco|port salut)/, 'Queso cremoso', 110, 'porción'],
  [/feta de queso|fetas? de queso/, 'Queso en feta', 60, 'feta'],
  [/jam[oó]n/, 'Jamón cocido', 35, 'feta'],
  [/mermelada/, 'Mermelada', 35, 'cucharada'],
  [/dulce de leche/, 'Dulce de leche', 60, 'cucharada'],
  [/manteca/, 'Manteca', 70, 'cucharadita'],
  [/palta/, 'Palta', 160, 'mitad'],
  [/yogur(es)?|yogurt/, 'Yogur', 110, 'pote'],
  [/cafeconleche|cortado/, 'Café con leche', 70, 'taza'],
  [/leche/, 'Leche', 120, 'taza'],
  [/caf[eé]|\bmates?\b|\bt[eé](\s|$)/, 'Infusión sin azúcar', 2, 'taza'],
  [/avena/, 'Avena', 150, '40 g'],
  [/granola/, 'Granola', 200, '45 g'],
  [/milanesas? de pollo/, 'Milanesa de pollo', 300, 'unidad'],
  [/milanesas?/, 'Milanesa de carne', 330, 'unidad'],
  [/pechugas?|pollo/, 'Pollo', 250, 'porción'],
  [/bife|carne|asado/, 'Carne', 350, 'porción'],
  [/pescado|merluza/, 'Pescado', 200, 'porción'],
  [/at[uú]n/, 'Atún', 120, 'lata'],
  [/fideos|pastas?|ravioles|ñoquis|tallarines/, 'Pasta', 380, 'plato'],
  [/arroz/, 'Arroz', 240, 'plato'],
  [/pur[eé]/, 'Puré de papas', 200, 'porción'],
  [/papas? fritas/, 'Papas fritas', 380, 'porción'],
  [/papas?/, 'Papa', 130, 'unidad'],
  [/ensalada/, 'Ensalada', 120, 'plato'],
  [/empanadas?/, 'Empanada', 280, 'unidad'],
  [/porci[oó]n(es)? de pizza|pizzas?/, 'Pizza', 280, 'porción'],
  [/tarta/, 'Tarta', 350, 'porción'],
  [/hamburguesas?/, 'Hamburguesa', 450, 'unidad'],
  [/s[aá]nguches?|s[aá]ndwich/, 'Sándwich', 350, 'unidad'],
  [/torta vasca/, 'Torta vasca', 400, 'porción'],
  [/torta|budín|bud[ií]n|bizcochuelo/, 'Torta', 350, 'porción'],
  [/helado/, 'Helado', 250, 'cucurucho'],
  [/chocolate/, 'Chocolate', 150, '25 g'],
  [/galletit?as?/, 'Galletita', 45, 'unidad'],
  [/frutos secos|almendras|nueces|man[ií]/, 'Frutos secos', 180, 'puñado'],
  [/gaseosa|coca/, 'Gaseosa', 140, 'vaso'],
  [/cerveza/, 'Cerveza', 150, 'vaso'],
  [/vino/, 'Vino', 125, 'copa'],
  [/jugo/, 'Jugo', 110, 'vaso'],
  [/agua/, 'Agua', 0, 'vaso'],
];
const NUMS = { un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9, diez:10, medio:0.5, media:0.5 };
function plural(u, q) {
  if (q <= 1 || /\d/.test(u)) return u;
  if (/ón$/.test(u)) return u.replace(/ón$/, 'ones');
  if (/d$/.test(u)) return u + 'es';
  return u + 's';
}
function parseLocal(text) {
  const clean = text.toLowerCase().replace(/^(hoy )?(desayun[eé]|almorc[eé]|merend[eé]|cen[eé]|com[ií])\s*:?\s*/,'')
    .replace(/^(desayuno|almuerzo|merienda|cena|colación|colacion)\s*:?\s*/,'')
    .replace(/caf[eé] con leche/g, 'cafeconleche').replace(/pan con manteca/g, 'pan, manteca');
  const parts = clean.split(/,|\by\b|\bcon\b|\+|\n/).map(s => s.trim()).filter(Boolean);
  const items = [];
  for (const part of parts) {
    const hit = LOCAL.find(([re]) => re.test(part));
    if (!hit) continue;
    let q = 1;
    const m = part.match(/(\d+(?:[.,]\d+)?)/);
    if (m) q = parseFloat(m[1].replace(',', '.'));
    else { const w = part.split(/\s+/).find(w => NUMS[w] !== undefined); if (w) q = NUMS[w]; }
    if (q > 20) q = 1; // probablemente gramos: dejar porción estándar
    items.push({ id: uid(), name: hit[1], qty: `${String(q).replace('.', ',')} ${plural(hit[3], q)}`, kcal: Math.round(hit[2]*q), p:0, c:0, f:0, est: true });
  }
  return { meal: guessMeal(text), items };
}

// ---------- datos del día ----------
let curDay = today();
function getDay(d) { return (load(K.days, {})[d]) || []; }
function setDay(d, list) { const all = load(K.days, {}); if (list.length) all[d] = list; else delete all[d]; save(K.days, all); }
function dayTotal(d) { return getDay(d).reduce((a, e) => a + e.items.reduce((s, i) => s + (i.kcal || 0), 0), 0); }

$('#addBtn').addEventListener('click', async () => {
  const text = $('#foodText').value.trim();
  if (!text) return;
  const btn = $('#addBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Calculando…';
  $('#addErr').textContent = '';
  let result, warn = '';
  try {
    result = await parseWithAI(text);
  } catch (e) {
    result = parseLocal(text);
    warn = e.message === 'NO_KEY' ? 'Sin clave de Gemini: usé la lista básica de alimentos. Podés cargarla en Ajustes.' :
           e.message === 'BAD_KEY' ? 'La clave de Gemini no funciona. Revisala en Ajustes. Mientras tanto usé la lista básica.' :
           'No pude conectarme con Gemini; usé la lista básica de alimentos.';
  }
  btn.disabled = false; btn.textContent = 'Anotar';
  if (!result.items.length) {
    $('#addErr').textContent = (warn ? warn + ' ' : '') + 'No reconocí ningún alimento. Probá describirlo de otra forma.';
    return;
  }
  if (warn) $('#addErr').textContent = warn;
  const list = getDay(curDay);
  list.push({ id: uid(), meal: result.meal, text, items: result.items, at: Date.now() });
  setDay(curDay, list);
  $('#foodText').value = '';
  renderDay();
});

$('#meals').addEventListener('click', e => {
  const row = e.target.closest('[data-item]');
  if (!row) return;
  const [eid, iid] = row.dataset.item.split('|');
  const list = getDay(curDay);
  const entry = list.find(x => x.id === eid); if (!entry) return;
  const item = entry.items.find(x => x.id === iid); if (!item) return;
  if (e.target.closest('.st')) { toggleFav(item); renderDay(); return; }
  if (e.target.closest('.x')) {
    if (!confirm(`¿Borrar "${item.name}"?`)) return;
    entry.items = entry.items.filter(x => x.id !== iid);
    setDay(curDay, list.filter(x => x.items.length));
  } else if (e.target.closest('.k')) {
    const v = prompt(`Calorías de "${item.name}"`, item.kcal);
    if (v === null) return;
    const n = Math.round(parseFloat(String(v).replace(',', '.')));
    if (isNaN(n) || n < 0) return alert('Ingresá un número.');
    item.kcal = n; item.est = false;
    setDay(curDay, list);
  } else return;
  renderDay();
});

function renderDay() {
  const p = load(K.profile); const r = calc(p);
  const d = parseD(curDay), isToday = curDay === today();
  $('#dayLabel').textContent = isToday ? 'Hoy' : curDay === addDays(today(), -1) ? 'Ayer' :
    d.toLocaleDateString('es-AR', { weekday: 'long' });
  $('#daySub').textContent = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  $('#nextDay').disabled = curDay >= today();

  const list = getDay(curDay);
  const total = dayTotal(curDay);
  let P=0,C=0,F=0; list.forEach(e => e.items.forEach(i => { P+=i.p||0; C+=i.c||0; F+=i.f||0; }));
  $('#ringNum').textContent = fmt(total);
  $('#stTarget').textContent = r ? fmt(r.target) + ' kcal' : '–';
  const left = r ? r.target - total : 0;
  $('#stLeftRow').innerHTML = !r ? '' : left >= 0 ? `Te quedan: <b>${fmt(left)} kcal</b>` : `Te pasaste: <b style="color:var(--warn)">${fmt(-left)} kcal</b>`;
  const ex = getEx(curDay);
  $('#stEx').innerHTML = ex.items.length ? `Ejercicio: <b>${fmt(exTotal(curDay))} kcal</b> quemadas` : ex.none ? '<span class="muted">Sin ejercicio</span>' : '';
  $('#stMacros').textContent = (P+C+F) > 0 ? `Proteínas ${Math.round(P)} g · Carbos ${Math.round(C)} g · Grasas ${Math.round(F)} g` : '';
  const frac = r ? Math.min(total / r.target, 1) : 0;
  const arc = $('#ringArc');
  arc.style.strokeDashoffset = 339.3 * (1 - frac);
  arc.style.stroke = r && total > r.target * 1.05 ? 'var(--warn)' : 'var(--accent)';

  const byMeal = {};
  list.forEach(e => (byMeal[e.meal] = byMeal[e.meal] || []).push(e));
  const order = [...MEALS, ...Object.keys(byMeal).filter(m => !MEALS.includes(m))];
  $('#meals').innerHTML = order.filter(m => byMeal[m]).map(m => {
    const entries = byMeal[m];
    const sum = entries.reduce((a, e) => a + e.items.reduce((s, i) => s + i.kcal, 0), 0);
    return `<div class="meal"><div class="meal-h"><span>${esc(m)}</span><span>${fmt(sum)} kcal</span></div>` +
      entries.map(e => e.items.map(i => `<div class="item" data-item="${e.id}|${i.id}">
        <div class="n">${esc(i.name)}${i.est ? '<span class="tag">aprox.</span>' : ''}<span class="q">${esc(i.qty)}</span></div>
        <button class="st${isFav(i) ? ' on' : ''}" aria-label="Favorito">${isFav(i) ? '★' : '☆'}</button>
        <div class="k">${fmt(i.kcal)}</div><button class="x" aria-label="Borrar">×</button></div>`).join('')).join('') +
      '</div>';
  }).join('');
  $('#noMeals').classList.toggle('hidden', list.length > 0);
  renderFavs();
}

// ---------- favoritos ----------
const favKey = i => (i.name + '|' + (i.qty || '')).toLowerCase().trim();
function isFav(i) { return load(K.favs, []).some(f => favKey(f) === favKey(i)); }
function toggleFav(i) {
  let favs = load(K.favs, []);
  if (isFav(i)) favs = favs.filter(f => favKey(f) !== favKey(i));
  else favs.push({ id: uid(), name: i.name, qty: i.qty || '', kcal: i.kcal, p: i.p || 0, c: i.c || 0, f: i.f || 0 });
  save(K.favs, favs);
}
let favEditing = false, favMealTouched = false;
$('#favMeal').addEventListener('change', () => { favMealTouched = true; });
function renderFavs() {
  const favs = load(K.favs, []);
  if (!favMealTouched) $('#favMeal').value = guessMeal('');
  $('#favChips').innerHTML = favs.map(f => `<button class="chip" type="button" data-fav="${f.id}">
    ${favEditing ? '<span class="del">×</span>' : '+'} ${esc(f.name)}${f.qty ? ` <small>${esc(f.qty)}</small>` : ''} <small>${fmt(f.kcal)}</small></button>`).join('');
  $('#favHint').classList.toggle('hidden', favs.length > 0);
  $('#favEdit').classList.toggle('hidden', !favs.length);
  $('#favMeal').classList.toggle('hidden', !favs.length || favEditing);
  $('#favEdit').textContent = favEditing ? 'Listo' : 'Editar';
}
$('#favEdit').addEventListener('click', () => { favEditing = !favEditing; renderFavs(); });
$('#favChips').addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  const favs = load(K.favs, []); const f = favs.find(x => x.id === b.dataset.fav); if (!f) return;
  if (favEditing) {
    if (!confirm(`¿Quitar "${f.name}" de favoritos?`)) return;
    save(K.favs, favs.filter(x => x.id !== f.id)); renderFavs(); return;
  }
  const meal = $('#favMeal').value;
  const list = getDay(curDay);
  const item = { id: uid(), name: f.name, qty: f.qty, kcal: f.kcal, p: f.p, c: f.c, f: f.f };
  const last = list[list.length - 1];
  if (last && last.meal === meal && last.fav) last.items.push(item);
  else list.push({ id: uid(), meal, text: f.name, items: [item], at: Date.now(), fav: true });
  setDay(curDay, list);
  renderDay();
});
$('#prevDay').addEventListener('click', () => { curDay = addDays(curDay, -1); renderDay(); });
$('#nextDay').addEventListener('click', () => { if (curDay < today()) { curDay = addDays(curDay, 1); renderDay(); } });

// ---------- semana ----------
function weekStart(s) { const d = parseD(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dstr(d); }
let curWeek = weekStart(today());

function weekData(ws) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const list = getDay(d);
    days.push({ d, total: dayTotal(d), logged: list.length > 0, future: d > today(), entries: list });
  }
  return days;
}

function renderWeek() {
  const r = calc(load(K.profile));
  const days = weekData(curWeek);
  const s = parseD(curWeek), e = parseD(addDays(curWeek, 6));
  $('#weekLabel').textContent = `${s.getDate()} al ${e.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
  $('#nextWeek').disabled = curWeek >= weekStart(today());

  const target = r ? r.target : 2000;
  const max = Math.max(target * 1.3, ...days.map(d => d.total));
  $('#bars').innerHTML = `<div class="tl" style="bottom:${(target / max) * 100}%"></div>` + days.map(d => {
    const h = d.logged ? Math.max(4, (d.total / max) * 100) : 3;
    const cls = !d.logged ? 'empty' : d.total > target * 1.1 ? 'over' : d.total < Math.min(target * 0.75, r ? r.floor : 1200) ? 'under' : '';
    return `<div class="b" title="${fmt(d.total)} kcal"><i class="${cls}" style="height:${h}%"></i></div>`;
  }).join('');
  $('#barDays').innerHTML = days.map(d => `<span>${parseD(d.d).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</span>`).join('');

  const logged = days.filter(d => d.logged);
  const closed = logged.filter(d => d.d < today()); // el día de hoy todavía no terminó
  const notes = [];
  if (!logged.length) {
    $('#weekStats').innerHTML = '<p class="muted">No hay comidas anotadas esta semana.</p>';
    $('#weekNotes').innerHTML = '';
  } else if (!closed.length) {
    $('#weekStats').innerHTML = `<div class="stats"><div>Días anotados: <b>${logged.length} de 7</b></div>
      <div>Hoy llevás: <b>${fmt(logged[0].total)} kcal</b></div></div>`;
    $('#weekNotes').innerHTML = '<div class="note ok">La semana recién empieza. A partir de mañana vas a ver acá cómo te fue cada día.</div>';
  } else {
    const avg = closed.reduce((a, d) => a + d.total, 0) / closed.length;
    const inRange = closed.filter(d => d.total >= target * 0.9 && d.total <= target * 1.1).length;
    const over = closed.filter(d => d.total > target * 1.1).length;
    const tooLow = closed.filter(d => r && d.total < r.floor && d.total < target * 0.75).length;
    const pastDays = days.filter(d => d.d < today()).length;
    $('#weekStats').innerHTML = `<div class="stats">
      <div>Días anotados: <b>${logged.length} de 7</b></div>
      <div>Promedio diario: <b>${fmt(avg)} kcal</b> <span class="muted small">(objetivo ${fmt(target)})</span></div>
      <div>Días cerca del objetivo: <b>${inRange} de ${closed.length}</b></div>
      <div>Ejercicio: <b>${exDays(days)} ${exDays(days) === 1 ? 'día' : 'días'}</b> · <b>${fmt(days.reduce((a, d) => a + exTotal(d.d), 0))} kcal</b></div></div>`;

    if (closed.length < Math.min(4, pastDays)) notes.push(['warn', 'Anotaste pocos días esta semana. Mientras más días registres, más preciso va a ser el resumen.']);
    if (inRange >= Math.ceil(closed.length * 0.6)) notes.push(['ok', '¡Vas muy bien! La mayoría de los días estuviste cerca de tu objetivo. Esa constancia es lo que más resultado da.']);
    else if (avg > target * 1.1) notes.push(['warn', `En promedio comiste unas ${fmt(avg - target)} kcal más que tu objetivo. Fijate en qué comidas se te va más: suele ayudar sumar verduras y proteínas para quedar satisfecha con menos calorías.`]);
    if (over >= 2 && avg <= target * 1.1) notes.push(['warn', `Tuviste ${over} días bastante por encima del objetivo. No pasa nada: lo importante es el promedio de la semana, no un día puntual.`]);
    if (tooLow) notes.push(['low', `Hubo ${tooLow === 1 ? 'un día' : tooLow + ' días'} con muy pocas calorías (o quizás te olvidaste de anotar algo). Comer tan poco no acelera los resultados: da más hambre después, te deja sin energía y hace que cueste sostenerlo. Si te pasó por falta de tiempo o de hambre, probá tener a mano algo práctico, como fruta, yogur o un sándwich.`]);
    if (r && avg < r.floor && closed.length >= 3) notes.push(['low', `Tu promedio quedó por debajo de ${fmt(r.floor)} kcal, que es el mínimo recomendable. Si te está costando comer o tenés algo que te preocupa con la comida, vale la pena hablarlo con un médico o nutricionista.`]);
    $('#weekNotes').innerHTML = notes.map(([c, t]) => `<div class="note ${c}">${esc(t)}</div>`).join('');
  }
  const tips = load(K.tips, {})[curWeek];
  $('#aiTips').innerHTML = tips ? tips : 'Pedí sugerencias personalizadas según lo que comiste esta semana.';
  $('#aiTips').classList.toggle('muted', !tips);
  $('#tipsBtn').textContent = tips ? 'Actualizar sugerencias' : 'Pedir sugerencias';
}
$('#prevWeek').addEventListener('click', () => { curWeek = addDays(curWeek, -7); renderWeek(); });
$('#nextWeek').addEventListener('click', () => { if (curWeek < weekStart(today())) { curWeek = addDays(curWeek, 7); renderWeek(); } });

$('#tipsBtn').addEventListener('click', async () => {
  const p = load(K.profile), r = calc(p);
  const days = weekData(curWeek).filter(d => d.logged);
  if (!days.length) return alert('Primero anotá algunas comidas de esta semana.');
  const btn = $('#tipsBtn'); btn.disabled = true; btn.innerHTML = 'Pensando…';
  const detail = weekData(curWeek).filter(d => d.logged || getEx(d.d).items.length || getEx(d.d).none).map(d => {
    const ex = getEx(d.d);
    return `${d.d}: comida ${fmt(d.total)} kcal — ` + d.entries.map(e => `${e.meal}: ${e.items.map(i => i.name).join(', ')}`).join(' | ') +
      ` — ejercicio: ${ex.items.length ? ex.items.map(i => `${i.name} (${i.detail}, ~${i.kcal} kcal)`).join(', ') : ex.none ? 'no hizo' : 'sin anotar'}`;
  }).join('\n');
  const prompt = `Sos un nutricionista argentino, cálido, práctico y nada exigente. Analizá la semana de esta persona y dale un resumen breve.
Datos: ${p.sex === 'm' ? 'hombre' : 'mujer'}, ${p.age} años, ${p.height} cm, ${p.weight} kg. Objetivo: ${r.goal === 'lose' ? 'bajar de peso de forma gradual' : 'mantener el peso'}. Objetivo diario: ${r.target} kcal (mínimo recomendado ${r.floor} kcal).
Registro de la semana:
${detail}

Respondé en español rioplatense (voseo), en tono amable y motivador. Estructura:
1) Una frase de cómo viene la semana (qué está haciendo bien).
2) Entre 3 y 5 sugerencias concretas y realistas basadas en lo que comió y en el ejercicio que hizo (por ejemplo, reemplazos o agregados con alimentos comunes en Argentina, o cómo sumar movimiento de forma sostenible).
Reglas: nunca sugieras comer menos del mínimo recomendado, saltear comidas, ayunos, dietas extremas, compensar excesos comiendo menos ni hacer ejercicio para "quemar" lo comido. No uses lenguaje de culpa. Si algún día comió muy poco, sugerí con cuidado comer suficiente.
Formato: HTML simple, solo <p>, <ul>, <li> y <b>. Sin títulos. Máximo 150 palabras.`;
  try {
    let html = await gemini(prompt, false);
    html = html.replace(/```html|```/g, '').replace(/<(?!\/?(p|ul|li|b)\b)[^>]*>/gi, '').trim();
    const all = load(K.tips, {}); all[curWeek] = html; save(K.tips, all);
    renderWeek();
  } catch (e) {
    alert(e.message === 'NO_KEY' ? 'Para pedir sugerencias necesitás cargar la clave de Gemini en Ajustes.' :
          e.message === 'BAD_KEY' ? 'La clave de Gemini no funciona. Revisala en Ajustes.' :
          'No pude conectarme con Gemini. Probá de nuevo en un rato.');
  }
  btn.disabled = false;
  if (!load(K.tips, {})[curWeek]) btn.textContent = 'Pedir sugerencias';
});

// ---------- ejercicio ----------
function getEx(d) { return (load(K.ex, {})[d]) || { none: false, items: [] }; }
function setEx(d, v) { const all = load(K.ex, {}); if (v.none || v.items.length) all[d] = v; else delete all[d]; save(K.ex, all); }
function exTotal(d) { return getEx(d).items.reduce((a, i) => a + (i.kcal || 0), 0); }
function exDays(days) { return days.filter(d => getEx(d.d).items.length).length; }

async function parseExAI(text) {
  const p = load(K.profile);
  const prompt = `Sos un profesor de educación física. Una persona describe en español rioplatense el ejercicio que hizo.
Datos: ${p.sex === 'm' ? 'hombre' : 'mujer'}, ${p.age} años, ${p.weight} kg, ${p.height} cm.
Separá cada actividad y estimá las calorías quemadas con valores MET del Compendium of Physical Activities y la fórmula kcal = MET × 3,5 × peso / 200 × minutos.
- Cinta o caminata: usá la velocidad (km/h) y la inclinación si las dice. Si dice intervalos, promediá los tramos rápidos y lentos según el tiempo de cada uno.
- Ejercicios por repeticiones (sentadillas, estocadas, flexiones, abdominales, pesas, etc.): estimá el tiempo real a partir de series × repeticiones (unos 3 a 4 segundos por repetición más 60 a 90 segundos de descanso entre series) y usá un MET de fuerza (3,5 a 6 según la intensidad).
- Si no dice el tiempo de una actividad continua, asumí 30 minutos.
- Sé conservador: estas estimaciones suelen exagerarse, así que ante la duda elegí el valor más bajo y razonable. Calculá solo el gasto del ejercicio.

Texto: «${text}»

Respondé SOLO con JSON con este formato:
{"items":[{"nombre":"Cinta","detalle":"30 min a 6 km/h","minutos":30,"kcal":150}]}
Usá números en minutos y kcal. Si el texto no describe ejercicio, devolvé {"items":[]}.`;
  const r = await gemini(prompt);
  return (r.items || []).filter(i => i && i.nombre).map(i => ({
    id: uid(), name: String(i.nombre), detail: String(i.detalle || ''),
    min: Math.max(0, Math.round(+i.minutos || 0)), kcal: Math.max(0, Math.round(+i.kcal || 0))
  }));
}

const EX_LOCAL = [
  [/soga/, 'Saltar la soga', 11, 'time'],
  [/burpees?/, 'Burpees', 8, 'reps'],
  [/hiit|funcional|crossfit/, 'Entrenamiento funcional', 7, 'time'],
  [/intervalos?/, 'Intervalos corriendo', 8, 'time'],
  [/cinta|caminadora|camin(é|e|ata|ar)/, 'Cinta / caminata', 0, 'walk'],
  [/corr(í|i|er)|trot(e|é|ar)|running/, 'Correr', 9, 'time'],
  [/spinning/, 'Spinning', 8.5, 'time'],
  [/bici(cleta)?/, 'Bicicleta', 7, 'time'],
  [/el[ií]ptico/, 'Elíptico', 5, 'time'],
  [/escalador|escaleras?/, 'Escaleras', 8, 'time'],
  [/nat(é|e|ación|acion|ar)|pileta/, 'Natación', 6, 'time'],
  [/zumba|baile|bail(é|e)/, 'Baile', 6, 'time'],
  [/yoga|pilates|elongaci|estiramiento/, 'Yoga / pilates', 3, 'time'],
  [/sentadillas?/, 'Sentadillas', 5, 'reps'],
  [/estocadas?|zancadas?/, 'Estocadas', 5, 'reps'],
  [/flexiones?|lagartijas?/, 'Flexiones', 5, 'reps'],
  [/abdominales?|abdomen|crunch/, 'Abdominales', 4, 'reps'],
  [/plancha/, 'Plancha', 4, 'time'],
  [/peso muerto|press|remo|dominadas?|b[ií]ceps|tr[ií]ceps|hombros?|pesas|mancuernas?|m[aá]quinas?/, 'Pesas', 5, 'reps'],
  [/musculaci[oó]n|fuerza|gimnasio|gym/, 'Musculación', 5, 'time'],
];
function parseExLocal(text) {
  const kg = (load(K.profile) || {}).weight || 65;
  const parts = text.toLowerCase().split(/,|;|\n|\by\b|\+|\bdespués\b|\bdespues\b/).map(x => x.trim()).filter(Boolean);
  const items = [];
  for (const part of parts) {
    const hit = EX_LOCAL.find(([re]) => re.test(part));
    if (!hit) continue;
    let [, name, met, kind] = hit, min = 0, detail = '';
    const mMin = part.match(/(\d+(?:[.,]\d+)?)\s*(min|minutos|')/);
    const mHr = part.match(/(\d+(?:[.,]\d+)?)\s*(h|hs|hora|horas)\b/);
    const mSeries = part.match(/(\d+)\s*(?:series?\s*de|x)\s*(\d+)/);
    if (mMin) min = parseFloat(mMin[1].replace(',', '.'));
    else if (mHr) min = parseFloat(mHr[1].replace(',', '.')) * 60;
    if (kind === 'walk') {
      const mSp = part.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kmh|km\/h)|velocidad\s*(\d+(?:[.,]\d+)?)|\ba\s+(\d+(?:[.,]\d+)?)(?!\s*(?:min|minutos|h\b|hs|hora|\d))/);
      const sp = mSp ? parseFloat((mSp[1] || mSp[2] || mSp[3]).replace(',', '.')) : 5;
      met = sp <= 4 ? 3 : sp <= 5.5 ? 3.8 : sp < 7 ? 4.8 : sp < 8 ? 7 : sp;
      if (sp >= 7.5) name = 'Cinta corriendo';
      if (!min) min = 30;
      detail = `${Math.round(min)} min a ${String(sp).replace('.', ',')} km/h`;
    } else if (kind === 'reps' && !min) {
      let sets = 1, reps = 12;
      if (mSeries) { sets = +mSeries[1]; reps = +mSeries[2]; }
      else { const n = part.match(/(\d+)/); if (n) reps = +n[1]; }
      if (reps > 200) reps = 12;
      min = (sets * reps * 3.5 + (sets - 1) * 75) / 60;
      detail = sets > 1 ? `${sets} series de ${reps}` : `${reps} repeticiones`;
    } else {
      if (!min) min = 30;
      detail = `${Math.round(min)} min`;
    }
    const kcal = Math.round(met * 3.5 * kg / 200 * min);
    items.push({ id: uid(), name, detail, min: Math.round(min), kcal, est: true });
  }
  return items;
}

let exBusy = false;
$('#exAddBtn').addEventListener('click', async () => {
  const text = $('#exText').value.trim();
  if (!text || exBusy) return;
  exBusy = true;
  const btn = $('#exAddBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Calculando…';
  $('#exErr').textContent = '';
  let items, warn = '';
  try { items = await parseExAI(text); }
  catch (e) {
    items = parseExLocal(text);
    warn = e.message === 'NO_KEY' ? 'Sin clave de Gemini: usé un cálculo básico. Podés cargarla en Ajustes.' :
           e.message === 'BAD_KEY' ? 'La clave de Gemini no funciona; usé un cálculo básico.' :
           'No pude conectarme con Gemini; usé un cálculo básico.';
  }
  exBusy = false; btn.disabled = false; btn.textContent = 'Anotar';
  if (!items.length) { $('#exErr').textContent = (warn ? warn + ' ' : '') + 'No reconocí ningún ejercicio. Probá describirlo de otra forma.'; return; }
  if (warn) $('#exErr').textContent = warn;
  const ex = getEx(curDay); ex.none = false; ex.items.push(...items); setEx(curDay, ex);
  $('#exText').value = '';
  renderEx();
});
$('#exNoneBtn').addEventListener('click', () => {
  const ex = getEx(curDay);
  setEx(curDay, ex.none ? { none: false, items: [] } : { none: true, items: [] });
  renderEx();
});
$('#exList').addEventListener('click', e => {
  const row = e.target.closest('[data-ex]'); if (!row) return;
  const ex = getEx(curDay); const it = ex.items.find(x => x.id === row.dataset.ex); if (!it) return;
  if (e.target.closest('.x')) {
    if (!confirm(`¿Borrar "${it.name}"?`)) return;
    ex.items = ex.items.filter(x => x.id !== it.id);
  } else if (e.target.closest('.k')) {
    const v = prompt(`Calorías quemadas en "${it.name}"`, it.kcal); if (v === null) return;
    const n = Math.round(parseFloat(String(v).replace(',', '.'))); if (isNaN(n) || n < 0) return alert('Ingresá un número.');
    it.kcal = n; it.est = false;
  } else return;
  setEx(curDay, ex); renderEx();
});
function renderEx() {
  const d = parseD(curDay), isToday = curDay === today();
  $('#exLabel').textContent = isToday ? 'Hoy' : curDay === addDays(today(), -1) ? 'Ayer' : d.toLocaleDateString('es-AR', { weekday: 'long' });
  $('#exSub').textContent = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  $('#nextEx').disabled = curDay >= today();
  const ex = getEx(curDay);
  $('#exTotal').textContent = ex.items.length ? `${fmt(exTotal(curDay))} kcal` : '';
  $('#exList').innerHTML = ex.items.map(i => `<div class="item" data-ex="${i.id}">
    <div class="n">${esc(i.name)}${i.est ? '<span class="tag">aprox.</span>' : ''}<span class="q">${esc(i.detail)}</span></div>
    <div class="k">${fmt(i.kcal)}</div><button class="x" aria-label="Borrar">×</button></div>`).join('');
  $('#exEmpty').textContent = ex.none ? 'Marcaste que este día no hiciste ejercicio.' : 'Todavía no anotaste nada este día.';
  $('#exEmpty').classList.toggle('hidden', ex.items.length > 0);
  $('#exNoneBtn').textContent = ex.none ? 'Desmarcar "no hice ejercicio"' : 'No hice ejercicio este día';
  $('#exNoneBtn').classList.toggle('hidden', ex.items.length > 0);

  const ws = weekStart(curDay); let total = 0, n = 0;
  $('#exWeek').innerHTML = [0,1,2,3,4,5,6].map(i => {
    const dd = addDays(ws, i), e = getEx(dd), k = exTotal(dd);
    if (e.items.length) { total += k; n++; }
    const label = parseD(dd).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });
    const val = dd > today() ? '' : e.items.length ? `<b>${fmt(k)} kcal</b>` : e.none ? '<span class="muted">No hice</span>' : '<span class="muted">–</span>';
    return `<div class="wk${dd === curDay ? ' today' : ''}"><span>${label}</span><span>${val}</span></div>`;
  }).join('');
  $('#exWeekSum').textContent = n ? `Entrenaste ${n} ${n === 1 ? 'día' : 'días'} y quemaste unas ${fmt(total)} kcal con ejercicio.` : '';
}
$('#prevEx').addEventListener('click', () => { curDay = addDays(curDay, -1); renderEx(); });
$('#nextEx').addEventListener('click', () => { if (curDay < today()) { curDay = addDays(curDay, 1); renderEx(); } });

// ---------- progreso ----------
const kgf = n => (Math.round(n * 10) / 10).toLocaleString('es-AR');
$('#wSave').addEventListener('click', () => {
  const v = parseFloat(String($('#wInput').value).replace(',', '.'));
  if (!v || v < 30 || v > 300) return alert('Ingresá tu peso en kilos.');
  const w = load(K.weights, {}); w[today()] = v; save(K.weights, w);
  const p = load(K.profile); p.weight = v; save(K.profile, p);
  $('#wInput').value = '';
  renderProg();
});
$('#wHist').addEventListener('click', e => {
  const b = e.target.closest('[data-wd]'); if (!b) return;
  if (!confirm('¿Borrar este registro de peso?')) return;
  const w = load(K.weights, {}); delete w[b.dataset.wd]; save(K.weights, w);
  const last = Object.keys(w).sort().pop();
  if (last) { const p = load(K.profile); p.weight = w[last]; save(K.profile, p); }
  renderProg();
});
function projectionData() {
  // últimos 14 días terminados con comida anotada
  const p = load(K.profile), r = calc(p);
  const days = [];
  for (let i = 1; i <= 14; i++) { const d = addDays(today(), -i); if (getDay(d).length) days.push(d); }
  if (days.length < 3) return { r, n: days.length };
  const intake = days.reduce((a, d) => a + dayTotal(d), 0) / days.length;
  const exAvg = days.reduce((a, d) => a + exTotal(d), 0) / days.length;
  const deficit = r.tdee + exAvg - intake;
  return { r, n: days.length, intake, exAvg, deficit, kgWeek: deficit * 7 / 7700 };
}
function weeksText(w) {
  if (w < 1.5) return 'alrededor de 1 semana';
  if (w < 9) return `unas ${Math.round(w)} semanas`;
  const m = w / 4.35;
  return m < 1.5 ? 'alrededor de 1 mes' : `unos ${Math.round(m)} meses`;
}
function dateIn(weeks) { const d = new Date(); d.setDate(d.getDate() + Math.round(weeks * 7)); return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); }
function renderProg() {
  const p = load(K.profile), r = calc(p);
  const w = load(K.weights, {}); const dates = Object.keys(w).sort();
  const cur = p.weight, gw = p.goalWeight, start = p.startWeight || (dates.length ? w[dates[0]] : cur);

  if (r.goal !== 'lose' || !gw) {
    $('#progGoalCard').innerHTML = `<h2>Tu objetivo de peso</h2>
      <p class="muted small">${r.goal === 'lose' ? 'Todavía no pusiste a qué peso querés llegar.' : 'Tu objetivo actual es mantener el peso.'} Si lo cargás, acá vas a ver cuánto te falta y en cuánto tiempo llegarías a este ritmo.</p>
      <button class="ghost full" id="setGoalBtn">${r.goal === 'lose' ? 'Poner peso objetivo' : 'Cambiar objetivo'}</button>`;
    $('#setGoalBtn').onclick = () => openSetup(true);
  } else {
    const left = cur - gw, total = start - gw;
    const pct = total > 0 ? Math.max(0, Math.min(1, (start - cur) / total)) : 0;
    $('#progGoalCard').innerHTML = left <= 0
      ? `<h2>¡Llegaste a tu objetivo!</h2><p>Estás en <b>${kgf(cur)} kg</b> y tu objetivo era ${kgf(gw)} kg. Ahora conviene pasar a <b>mantener peso</b> para sostener lo que lograste.</p>
         <button class="full" id="setGoalBtn">Cambiar a mantener peso</button>`
      : `<h2>Tu objetivo de peso</h2><div class="big">Te faltan ${kgf(left)} kg</div>
         <div class="prog"><i style="width:${Math.round(pct * 100)}%"></i></div>
         <div class="small muted">Empezaste en ${kgf(start)} kg · Hoy ${kgf(cur)} kg · Objetivo ${kgf(gw)} kg</div>
         ${start - cur > 0 ? `<p class="small" style="margin-bottom:0">Ya bajaste <b>${kgf(start - cur)} kg</b>. ¡Bien!</p>` : ''}`;
    const btn = $('#setGoalBtn');
    if (btn) btn.onclick = () => { p.goal = 'maintain'; p.goalWeight = null; save(K.profile, p); renderProg(); };
  }

  const last = dates.slice(-6).reverse();
  $('#wHist').innerHTML = last.map(d => `<div class="wk"><span>${parseD(d).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')}</span>
    <span><b>${kgf(w[d])} kg</b><button class="link" data-wd="${d}" aria-label="Borrar" style="padding:0 0 0 10px;text-decoration:none;font-size:16px">×</button></span></div>`).join('');

  const pr = projectionData();
  let html = '';
  if (pr.n < 3) {
    html = `<p class="muted">Para estimar cómo vas necesito al menos 3 días completos con comidas anotadas (llevás ${pr.n}). Seguí registrando y en unos días aparece acá.</p>`;
  } else {
    html = `<div class="stats">
      <div>Comés en promedio: <b>${fmt(pr.intake)} kcal</b> por día</div>
      <div>Ejercicio: <b>${fmt(pr.exAvg)} kcal</b> por día en promedio</div>
      <div>Tu cuerpo gasta sin ejercicio: <b>${fmt(r.tdee)} kcal</b></div>
      <div>Balance: <b>${pr.deficit > 0 ? '−' + fmt(pr.deficit) : '+' + fmt(-pr.deficit)} kcal</b> por día</div></div>
      <p class="muted small">Calculado con tus últimos ${pr.n} días anotados.</p>`;
    const goalOn = r.goal === 'lose' && gw && cur > gw;
    if (pr.deficit <= 50) {
      html += `<div class="note warn">Con lo que venís haciendo, tu peso tendería a ${pr.deficit < -150 ? 'subir un poco' : 'mantenerse'}.${goalOn ? ` Para acercarte a tu objetivo, intentá quedar cerca de las ${fmt(r.target)} kcal diarias.` : ''}</div>`;
    } else {
      const kgW = pr.kgWeek;
      html += `<p>A este ritmo bajarías unos <b>${kgf(kgW)} kg por semana</b>.</p>`;
      if (goalOn) {
        const weeks = (cur - gw) / kgW;
        html += `<div class="note ok">Si seguís así, llegarías a ${kgf(gw)} kg en <b>${weeksText(weeks)}</b> (más o menos en ${dateIn(weeks)}).</div>`;
      }
      if (kgW > cur * 0.01) {
        html += `<div class="note low">Es un ritmo más rápido de lo recomendable (más del 1% de tu peso por semana). Puede que te esté faltando anotar algo, o que estés comiendo muy poco. Bajar despacio cuesta menos de sostener y ayuda a no perder músculo.</div>`;
      }
    }
    if (goalOn) {
      const planKg = (r.tdee - r.target) * 7 / 7700;
      if (planKg > 0.05) html += `<p class="small muted">Como referencia: comiendo tu objetivo de ${fmt(r.target)} kcal, llegarías en ${weeksText((cur - gw) / planKg)}, sin contar el ejercicio.</p>`;
    }
    html += `<p class="small muted" style="margin-bottom:0">Es una estimación: el cuerpo no baja en línea recta, y el peso real puede variar de una semana a otra.</p>`;
  }
  $('#projection').innerHTML = html;
}

// ---------- ajustes ----------
function renderSettings() {
  const p = load(K.profile), r = calc(p);
  $('#profileSummary').innerHTML = r ? `${p.sex === 'm' ? 'Hombre' : 'Mujer'}, ${p.age} años · ${p.height} cm · ${String(p.weight).replace('.', ',')} kg<br>
    Objetivo: <b>${r.goal === 'lose' ? 'bajar de peso' : 'mantener peso'}</b>${r.goal === 'lose' && p.goalWeight ? ` hasta ${String(p.goalWeight).replace('.', ',')} kg` : ''} · <b>${fmt(r.target)} kcal</b> por día` : '';
  $('#apiKey').value = load(K.key, '');
  $('#keyMsg').textContent = '';
}
$('#editProfile').addEventListener('click', () => openSetup(true));
$('#saveKey').addEventListener('click', () => { save(K.key, $('#apiKey').value.trim()); $('#keyMsg').textContent = 'Clave guardada.'; });
$('#testKey').addEventListener('click', async () => {
  save(K.key, $('#apiKey').value.trim());
  $('#keyMsg').textContent = 'Probando…';
  try { const r = await parseWithAI('una manzana'); $('#keyMsg').textContent = r.items.length ? `¡Funciona! Una manzana ≈ ${r.items[0].kcal} kcal.` : 'Respondió, pero sin datos.'; }
  catch (e) { $('#keyMsg').textContent = e.message === 'NO_KEY' ? 'Pegá una clave primero.' : e.message === 'BAD_KEY' ? 'La clave no es válida.' : 'No funcionó: ' + e.message; }
});
$('#changePass').addEventListener('click', () => showLock('change'));
$('#lockNow').addEventListener('click', () => { sessionStorage.removeItem('cal_ok'); showLock('enter'); });
$('#exportBtn').addEventListener('click', () => {
  const data = { v: 2, profile: load(K.profile), days: load(K.days, {}), tips: load(K.tips, {}), ex: load(K.ex, {}), weights: load(K.weights, {}), favs: load(K.favs, []) };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `calendario-${today()}.json`; a.click();
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.days) throw new Error();
    if (!confirm('Esto reemplaza los datos actuales por los de la copia. ¿Seguir?')) return;
    if (data.profile) save(K.profile, data.profile);
    save(K.days, data.days); save(K.tips, data.tips || {}); save(K.ex, data.ex || {}); save(K.weights, data.weights || {}); if (data.favs) save(K.favs, data.favs);
    alert('Copia cargada.'); start();
  } catch { alert('El archivo no es una copia válida.'); }
  e.target.value = '';
});
function wipe() {
  Object.values(K).forEach(k => localStorage.removeItem(k)); localStorage.removeItem('cal_model');
  sessionStorage.clear(); location.reload();
}
$('#wipeBtn').addEventListener('click', () => {
  if (confirm('¿Borrar todos los datos de este dispositivo? Se pierden tus registros, tu perfil y la clave.') && confirm('¿Seguro? No se puede deshacer.')) wipe();
});

// ---------- navegación ----------
function show(id) { ['lock','setup','app'].forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); window.scrollTo(0, 0); }
function openTab(t) {
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['day','ex','week','prog','settings'].forEach(x => $('#tab-' + x).classList.toggle('hidden', x !== t));
  if (t === 'day') renderDay(); if (t === 'ex') renderEx(); if (t === 'week') renderWeek(); if (t === 'prog') renderProg(); if (t === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
$$('nav.tabs button').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

function start() {
  if (!load(K.pass) || !sessionStorage.getItem('cal_ok')) return showLock();
  if (!calc(load(K.profile))) return openSetup(false);
  show('app'); curDay = today(); curWeek = weekStart(today()); openTab('day');
}

// bloquear al volver después de un rato en segundo plano
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) { sessionStorage.removeItem('cal_ok'); showLock('enter'); }
});

start();
})();

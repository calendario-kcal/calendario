/* Calendario — registro diario de comidas y calorías.
   Todo se guarda en este dispositivo (localStorage). */
(() => {
'use strict';

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const K = { pass:'cal_pass', profile:'cal_profile', days:'cal_days', key:'cal_gkey', tips:'cal_tips' };
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
  return { bmr, tdee, bmi, floor, goal, target, note };
}

function openSetup(editing) {
  draft = Object.assign({ activity: 1.2, goal: 'maintain' }, load(K.profile, {}));
  $('#setupTitle').textContent = editing ? 'Mis datos' : 'Configuración inicial';
  $('#cancelSetup').classList.toggle('hidden', !editing);
  $('#age').value = draft.age || ''; $('#height').value = draft.height || ''; $('#weight').value = draft.weight || '';
  $('#activity').value = String(draft.activity || 1.2);
  show('setup');
  refreshSetup();
}
function readSetup() {
  draft.age = +$('#age').value || null;
  draft.height = +$('#height').value || null;
  draft.weight = +$('#weight').value || null;
  draft.activity = +$('#activity').value;
}
function refreshSetup() {
  $$('#sexSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === draft.sex));
  $$('#goalSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === draft.goal));
  const r = calc(draft);
  $('#goalNote').classList.toggle('hidden', !(r && r.note));
  if (r && r.note) $('#goalNote').textContent = r.note;
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
['#age','#height','#weight','#activity'].forEach(s => $(s).addEventListener('input', () => { readSetup(); refreshSetup(); }));
$('#saveSetup').addEventListener('click', () => {
  readSetup();
  if (!draft.sex) return alert('Elegí mujer u hombre.');
  if (!draft.age || draft.age < 12 || draft.age > 100) return alert('Revisá la edad.');
  if (!draft.height || draft.height < 120 || draft.height > 230) return alert('Revisá la altura (en centímetros).');
  if (!draft.weight || draft.weight < 30 || draft.weight > 300) return alert('Revisá el peso (en kilos).');
  save(K.profile, draft);
  start();
});
$('#cancelSetup').addEventListener('click', () => { start(); openTab('settings'); });

// ---------- reconocimiento con Gemini ----------
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];
async function gemini(prompt, json = true) {
  const key = load(K.key, '');
  if (!key) throw new Error('NO_KEY');
  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: Object.assign({ temperature: 0.2 }, json ? { responseMimeType: 'application/json' } : {})
        })
      });
      if (!res.ok) {
        const t = await res.text();
        lastErr = new Error(`${res.status}: ${t.slice(0, 200)}`);
        if (res.status === 400 && /API key/i.test(t)) throw Object.assign(new Error('BAD_KEY'), { fatal: true });
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('BAD_KEY'), { fatal: true });
        continue; // 404 modelo inexistente, 429 cuota, 5xx: probar el siguiente
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      if (!json) return text;
      const m = text.match(/\{[\s\S]*\}/);
      return JSON.parse(m ? m[0] : text);
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
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
        <div class="k">${fmt(i.kcal)}</div><button class="x" aria-label="Borrar">×</button></div>`).join('')).join('') +
      '</div>';
  }).join('');
  $('#noMeals').classList.toggle('hidden', list.length > 0);
}
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
      <div>Días cerca del objetivo: <b>${inRange} de ${closed.length}</b></div></div>`;

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
  const detail = days.map(d => `${d.d}: ${fmt(d.total)} kcal — ` + d.entries.map(e => `${e.meal}: ${e.items.map(i => i.name).join(', ')}`).join(' | ')).join('\n');
  const prompt = `Sos un nutricionista argentino, cálido, práctico y nada exigente. Analizá la semana de esta persona y dale un resumen breve.
Datos: ${p.sex === 'm' ? 'hombre' : 'mujer'}, ${p.age} años, ${p.height} cm, ${p.weight} kg. Objetivo: ${r.goal === 'lose' ? 'bajar de peso de forma gradual' : 'mantener el peso'}. Objetivo diario: ${r.target} kcal (mínimo recomendado ${r.floor} kcal).
Registro de la semana:
${detail}

Respondé en español rioplatense (voseo), en tono amable y motivador. Estructura:
1) Una frase de cómo viene la semana (qué está haciendo bien).
2) Entre 3 y 5 sugerencias concretas y realistas basadas en lo que comió (por ejemplo, reemplazos o agregados con alimentos comunes en Argentina).
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

// ---------- ajustes ----------
function renderSettings() {
  const p = load(K.profile), r = calc(p);
  $('#profileSummary').innerHTML = r ? `${p.sex === 'm' ? 'Hombre' : 'Mujer'}, ${p.age} años · ${p.height} cm · ${String(p.weight).replace('.', ',')} kg<br>
    Objetivo: <b>${r.goal === 'lose' ? 'bajar de peso' : 'mantener peso'}</b> · <b>${fmt(r.target)} kcal</b> por día` : '';
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
  const data = { v: 1, profile: load(K.profile), days: load(K.days, {}), tips: load(K.tips, {}) };
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
    save(K.days, data.days); save(K.tips, data.tips || {});
    alert('Copia cargada.'); start();
  } catch { alert('El archivo no es una copia válida.'); }
  e.target.value = '';
});
function wipe() {
  Object.values(K).forEach(k => localStorage.removeItem(k));
  sessionStorage.clear(); location.reload();
}
$('#wipeBtn').addEventListener('click', () => {
  if (confirm('¿Borrar todos los datos de este dispositivo? Se pierden tus registros, tu perfil y la clave.') && confirm('¿Seguro? No se puede deshacer.')) wipe();
});

// ---------- navegación ----------
function show(id) { ['lock','setup','app'].forEach(s => $('#' + s).classList.toggle('hidden', s !== id)); window.scrollTo(0, 0); }
function openTab(t) {
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['day','week','settings'].forEach(x => $('#tab-' + x).classList.toggle('hidden', x !== t));
  if (t === 'day') renderDay(); if (t === 'week') renderWeek(); if (t === 'settings') renderSettings();
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

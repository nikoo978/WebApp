const HOURS = ["7-9","9-11","11-13","13-15","15-17","17-19","19-21","21-23","23-01","01-03","03-05","05-07"];
const BLOCKS = [[7,9],[9,11],[11,13],[13,15],[15,17],[17,19],[19,21],[21,23],[23,25],[25,27],[27,29],[29,31]];
const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TURNOS = ["", "A", "B", "C", "D"];
const SERVICES = ["24hs","4hs","6hs","12hs","Rondin","Canes","Diario","Recargo"];
const FATIGUE_SERVICES = new Set(["12hs","24hs","canes"]);
const STORAGE_KEY = "shiftManagerWebN7_LOCAL_CACHE";
const TURNO_REF = parseDMY("18/04/1979");
const TURNO_SEQ = ["A","B","C","D"];
const FULL = new Set(["X","H"]);
const HALF_LEFT = new Set(["X/"]);
const HALF_RIGHT = new Set(["/X","./X"]);
const HALF = new Set([...HALF_LEFT, ...HALF_RIGHT]);
const INACTIVE_OVERRIDES = new Set(["arnaldo andrade", "cristina ayala"]);
const APP_VERSION = "WebN9.1";
const PERSONAL_CATALOG_VERSION = 8;
const PERSONAL_UPDATE_NAMES = new Set([
  "clarisa reyna", "cepeda miguel", "perez vanessa laura", "casaus coria cesar oscar",
  "paulo correas", "sala claudio dario", "fernandez raul sebastian", "quattrini lucas",
  "zalazar fabian alejandro", "gregorio monica beatriz", "avilez claudio", "delgado luciana",
  "segovia federico", "gallardo gaston", "mire franco", "poblete carolina maria janete",
  "lovelli georgina", "jadech amira", "martin rebollo", "freda gaston",
  "daiana gonzalez", "natalia magallanes", "carranza gustavo", "gaston moreira", "rafael leiva"
]);
const MAX_CLOUD_BACKUPS = 20;
const MAX_UNDO_SNAPSHOTS = 10;

let state = null;
let selectedTurnoAdmin = "A";
let selectedFixedIndex = null;
let selectedRot48Index = null;
let selectedAbsence = null;
let longPressTimer = null;
let longPressFired = false;
let lastContentSnapshot = "";
let saveTimer = null;
let isRestoringUndo = false;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function norm(v){ return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function serviceKey(v){ return norm(v).replace(/\s+/g,""); }
function token(v){ return String(v||"").trim().toUpperCase().replace(/\s+/g,""); }
function cleanName(v){ return String(v||"").replace(/\s*\([^)]*\)/g,"").trim(); }
function toTitleName(name){
  return String(name||"").trim().replace(/\s+/g," ").split(" ").map(part=>{
    if(!part) return "";
    if(part.startsWith("(") && part.endsWith(")")){
      return "(" + part.slice(1,-1).toLowerCase().replace(/\b\w/g, m=>m.toUpperCase()) + ")";
    }
    return part.split("-").map(p=>p ? p[0].toUpperCase()+p.slice(1).toLowerCase() : p).join("-");
  }).join(" ");
}
function normalizeAbsenceRecord(a){
  a = {...(a || {})};
  const rawType = norm(a.tipo || a.type || "");
  const is214 = rawType.includes("214") || rawType.includes("descanso anual") || rawType.includes("vacacion");
  const tipo = is214 ? "Art 214" : "Carpeta Medica";
  return {
    id: a.id || `absence-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    tipo,
    articulo: tipo === "Carpeta Medica" ? String(a.articulo || a.artículo || a.motivo || "").trim() : "",
    desde: isoToDMY(a.desde || a.inicio || ""),
    hasta: isoToDMY(a.hasta || a.fin || ""),
    observaciones: String(a.observaciones || "").trim()
  };
}
function normalizePersonRecord(p){
  p = {...p};
  p.nombre = toTitleName(cleanName(p.nombre || ""));
  p.estado = p.estado || "Activo";
  if(INACTIVE_OVERRIDES.has(norm(p.nombre))) p.estado = "Inactivo";
  if(Array.isArray(p.asignaciones)){
    p.asignaciones = p.asignaciones.map(a=>({...a}));
  }
  p.ausencias = Array.isArray(p.ausencias) ? p.ausencias.map(normalizeAbsenceRecord) : [];
  return p;
}
function migratePersonalCatalog(){
  const currentVersion = Number(state.personal_catalog_version || 0);
  if(currentVersion >= PERSONAL_CATALOG_VERSION) return false;

  const seedUpdates = new Map(
    (window.SEED_PERSONAL || [])
      .filter(p=>PERSONAL_UPDATE_NAMES.has(norm(p.nombre)))
      .map(p=>[norm(p.nombre), normalizePersonRecord(clone(p))])
  );

  const positions = new Map((state.personal || []).map((p,i)=>[norm(p.nombre), i]));
  seedUpdates.forEach((fresh,key)=>{
    const idx = positions.get(key);
    if(idx == null){
      state.personal.push(fresh);
      return;
    }
    const existing = state.personal[idx];
    state.personal[idx] = normalizePersonRecord({
      ...existing,
      ...fresh,
      // Estado y ausencias son datos operativos mantenidos dentro de la app.
      estado: existing.estado || fresh.estado || "Activo",
      ausencias: Array.isArray(existing.ausencias) ? existing.ausencias : (fresh.ausencias || []),
      turno_24: existing.turno_24 || fresh.turno_24 || ""
    });
  });

  state.personal.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  state.personal_catalog_version = PERSONAL_CATALOG_VERSION;
  return true;
}
function todayDMY(){ return formatDMY(new Date()); }
function pad(n){ return String(n).padStart(2,"0"); }
function formatDMY(d){ return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`; }
function dmyToISO(s){
  const d = parseDMY(s);
  if(!d) return "";
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function isoToDMY(s){
  if(!s) return "";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function parseAnyDate(s){
  if(!s) return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return parseDMY(isoToDMY(s));
  return parseDMY(s);
}
function parseDMY(s){
  if(!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(!m) return null;
  let y = Number(m[3]); if(y < 100) y += 2000;
  const d = new Date(y, Number(m[2])-1, Number(m[1]));
  if(d.getFullYear() !== y || d.getMonth() !== Number(m[2])-1 || d.getDate() !== Number(m[1])) return null;
  return d;
}
function addDays(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function diffDays(a,b){ return Math.floor((a-b)/86400000); }
function turnoFromDate(d){ if(!d) return ""; return TURNO_SEQ[((diffDays(d,TURNO_REF)%4)+4)%4]; }
function dayName(d){ return DAYS[d.getDay() === 0 ? 7 : d.getDay()]; }

function loadState(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){
    try { 
      const parsed = JSON.parse(saved);
      parsed.personal = (parsed.personal || []).map(normalizePersonRecord);
      return parsed;
    } catch {}
  }
  const d = new Date();
  return {
    personal: clone(window.SEED_PERSONAL || []).map(normalizePersonRecord),
    turnos: normalizeTurnos(clone(window.SEED_TURNOS || {})),
    planilla: {
      fecha: formatDMY(d),
      dia: dayName(d),
      turno: turnoFromDate(d),
      deben: Array(12).fill(""),
      rows: []
    }
  };
}
function normalizeTurnos(t){
  t.turnos_24 ||= {A:[],B:[],C:[],D:[]};
  t.canes_por_turno ||= {A:"",B:"",C:"",D:""};
  t.rotativos_48 ||= [];
  for(const k of ["A","B","C","D"]){
    t.turnos_24[k] = (t.turnos_24[k] || []).map(n=>toTitleName(cleanName(n)));
    t.canes_por_turno[k] = toTitleName(cleanName(t.canes_por_turno[k] || ""));
  }
  t.rotativos_48 = t.rotativos_48.map(r=>({
    nombre: toTitleName(cleanName(r.nombre||"")),
    turnos: Array.isArray(r.turnos) ? r.turnos.slice(0,2) : String(r.turnos||"C-D").split("-").slice(0,2),
    fecha_presente: r.fecha_presente || "",
    activo: r.activo !== false
  }));
  return t;
}
async function init(){
  fillSelects();
  bindTabs();
  bindPlanilla();
  bindPersonal();
  bindLicenses();
  bindTurnos();
  bindDatos();
  bindDashboard();
  bindDailyView();
  bindPin();
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
  await startCloudSession();
}
document.addEventListener("DOMContentLoaded", init);

function bindPin(){
  q("#pinForm").addEventListener("submit", async (event)=>{
    event.preventDefault();
    const pin = q("#pinInput").value.trim();
    q("#pinError").textContent = "";
    try{
      const res = await fetch("/api/auth", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({pin})
      });
      if(!res.ok) throw new Error("PIN incorrecto");
      await startCloudSession();
    }catch(err){
      q("#pinError").textContent = err.message || "No se pudo ingresar";
    }
  });
}

async function startCloudSession(){
  try{
    setStatus("Conectando...", "saving");
    state = await fetchCloudState();
    normalizeLoadedState();
    q("#lockScreen").classList.add("hidden");
    setStatus("Nube sincronizada", "ok");
    lastContentSnapshot = contentSnapshot();
    renderAll();
    save({silent:true});
  }catch(err){
    if(err.status === 401){
      q("#lockScreen").classList.remove("hidden");
      setStatus("Bloqueado", "");
      return;
    }
    const cached = localStorage.getItem(STORAGE_KEY);
    if(cached){
      state = JSON.parse(cached);
      normalizeLoadedState();
      lastContentSnapshot = contentSnapshot();
      q("#lockScreen").classList.add("hidden");
      setStatus("Sin nube · usando caché local", "error");
      renderAll();
    }else{
      q("#lockScreen").classList.remove("hidden");
      q("#pinError").textContent = "No se pudo conectar con la nube.";
      setStatus("Error de conexión", "error");
    }
  }
}

async function fetchCloudState(){
  const res = await fetch("/api/state", {cache:"no-store"});
  if(!res.ok){
    const err = new Error("No se pudo leer la nube");
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

function normalizeLoadedState(){
  state.turnos = normalizeTurnos(state.turnos || {});
  state.personal = (state.personal || []).map(normalizePersonRecord);
  migratePersonalCatalog();
  state.planilla ||= {fecha:todayDMY(), dia:"", turno:"", deben:Array(12).fill(""), rows:[]};
  state.planilla.deben ||= Array(12).fill("");
  state.planilla.rows ||= [];
  state.history ||= [];
  state.undoStack = (state.undoStack || []).slice(0, MAX_UNDO_SNAPSHOTS);
  state.backups = (state.backups || []).slice(0, MAX_CLOUD_BACKUPS);
  state.backup_settings ||= {frequency:"daily", last_auto_backup_at:""};
  state.app_version = APP_VERSION;
}
function contentState(){
  return {
    personal: state.personal || [],
    turnos: state.turnos || {},
    planilla: state.planilla || {},
    backup_settings: state.backup_settings || {frequency:"daily", last_auto_backup_at:""}
  };
}
function contentSnapshot(){ return JSON.stringify(contentState()); }
function pushHistory(action){
  state.history ||= [];
  state.history.unshift({at:new Date().toISOString(), action});
  state.history = state.history.slice(0,80);
}
function registerContentChange(options={}){
  const current = contentSnapshot();
  if(lastContentSnapshot && current !== lastContentSnapshot && !options.silent && !isRestoringUndo){
    state.undoStack ||= [];
    state.undoStack.unshift({at:new Date().toISOString(), data:JSON.parse(lastContentSnapshot)});
    state.undoStack = state.undoStack.slice(0, MAX_UNDO_SNAPSHOTS);
    pushHistory(options.action || "Cambio guardado");
  }
  lastContentSnapshot = current;
}
function save(options={}){
  if(!state) return;
  normalizeLoadedState();
  registerContentChange(options);
  maybeAutoBackup();
  lastContentSnapshot = contentSnapshot();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setStatus("Guardando...", "saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      const res = await fetch("/api/state", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(state)
      });
      if(!res.ok) throw new Error("Error al guardar");
      setStatus("Nube sincronizada", "ok");
    }catch(err){
      setStatus("Error al guardar en nube", "error");
    }
  }, 350);
}
function restoreContentSnapshot(data){
  state.personal = (data.personal || []).map(normalizePersonRecord);
  state.turnos = normalizeTurnos(data.turnos || {});
  state.planilla = data.planilla || {fecha:todayDMY(), dia:"", turno:"", deben:Array(12).fill(""), rows:[]};
  state.backup_settings = data.backup_settings || state.backup_settings || {frequency:"daily", last_auto_backup_at:""};
}
function undoLastChange(){
  if(!state.undoStack || !state.undoStack.length) return alert("No hay cambios para deshacer.");
  const snap = state.undoStack.shift();
  isRestoringUndo = true;
  restoreContentSnapshot(snap.data);
  pushHistory("Deshacer último cambio");
  lastContentSnapshot = contentSnapshot();
  isRestoringUndo = false;
  save({silent:true});
  renderAll();
}
function createBackupNow(reason="manual"){
  state.backups ||= [];
  const data = JSON.parse(contentSnapshot());
  const backup = {id:`backup-${Date.now()}`, at:new Date().toISOString(), reason, data};
  state.backups.unshift(backup);
  state.backups = state.backups.slice(0, MAX_CLOUD_BACKUPS);
  state.backup_settings ||= {frequency:"daily", last_auto_backup_at:""};
  if(reason !== "manual") state.backup_settings.last_auto_backup_at = backup.at;
  pushHistory(reason === "manual" ? "Backup manual" : "Backup automático");
  return backup;
}
function maybeAutoBackup(){
  state.backup_settings ||= {frequency:"daily", last_auto_backup_at:""};
  const freq = state.backup_settings.frequency || "daily";
  if(freq === "manual") return;
  const last = state.backup_settings.last_auto_backup_at ? new Date(state.backup_settings.last_auto_backup_at) : null;
  const now = new Date();
  const days = freq === "weekly" ? 7 : freq === "monthly" ? 30 : 1;
  if(!last || (now - last) >= days*86400000){
    createBackupNow("auto-" + freq);
  }
}

function setStatus(text, mode){
  const badge = q("#statusBadge");
  if(!badge) return;
  badge.textContent = text;
  badge.classList.remove("saving","error","ok");
  if(mode) badge.classList.add(mode);
}
async function toggleFullscreen(){
  try{
    if(!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  }catch(err){ alert("El navegador no permitió pantalla completa."); }
}

function fillSelects(){
  const planDay = q("#planDay");
  DAYS.forEach(d=> planDay.append(new Option(d,d)));
  const planTurno = q("#planTurno");
  TURNOS.forEach(t=> planTurno.append(new Option(t,t)));
  const service = q("#personService");
  SERVICES.forEach(s=> service.append(new Option(s,s)));
  const personTurno = q("#personTurno");
  TURNOS.forEach(t=> personTurno.append(new Option(t,t)));
  ["personStart","personEnd","rotAStart","rotAEnd","rotBStart","rotBEnd"].forEach(id=>{
    const el = q("#"+id);
    el.append(new Option("", ""));
    for(let i=0;i<24;i++) el.append(new Option(pad(i), pad(i)));
  });
}
function q(sel){ return document.querySelector(sel); }
function qa(sel){ return [...document.querySelectorAll(sel)]; }

function bindTabs(){
  qa(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      qa(".tab").forEach(b=>b.classList.remove("active"));
      qa(".panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      q(`#tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}
function renderAll(){
  if(!state) return;
  renderStaffDatalist();
  renderPlanilla();
  renderDashboard();
  renderDailyView();
  renderPersonal();
  renderTurnos();
  renderVacaciones();
  renderAdminExtras();
}
function renderStaffDatalist(){
  const dl = q("#staffList");
  dl.innerHTML = "";
  getStaffNames().forEach(n=> dl.append(Object.assign(document.createElement("option"), {value:n})));
}
function operationalStaffProfiles(){
  const profiles = new Map();
  const add = (rawName, servicio, turno, origen)=>{
    const nombre = toTitleName(cleanName(rawName));
    if(!nombre) return;
    const key = norm(nombre);
    const current = profiles.get(key) || {nombre, servicio:servicio || "", turnos:new Set(), origenes:new Set()};
    if(servicio === "Canes") current.servicio = "Canes";
    else if(!current.servicio) current.servicio = servicio || "24hs";
    if(turno) current.turnos.add(turno);
    if(origen) current.origenes.add(origen);
    profiles.set(key,current);
  };
  for(const turno of TURNO_SEQ){
    (state.turnos?.turnos_24?.[turno] || []).forEach(name=>add(name,"24hs",turno,"Turno fijo"));
    add(state.turnos?.canes_por_turno?.[turno],"Canes",turno,"Canes");
  }
  (state.turnos?.rotativos_48 || []).forEach(item=>{
    (item.turnos || []).forEach(turno=>add(item.nombre,"24hs",turno,"Rotativo 48"));
  });
  return [...profiles.values()].map(p=>({...p,turnos:[...p.turnos],origenes:[...p.origenes]}));
}
function getStaffNames(){
  const names = new Map();
  (state.personal || []).forEach(p=>{
    if(norm(p.estado||"Activo") !== "inactivo" && p.nombre) names.set(norm(p.nombre),p.nombre);
  });
  operationalStaffProfiles().forEach(p=>{
    const existing = personByName(p.nombre);
    if(existing && norm(existing.estado||"Activo") === "inactivo") return;
    if(!names.has(norm(p.nombre))) names.set(norm(p.nombre),p.nombre);
  });
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
}
function operationalStaffByName(name){
  return operationalStaffProfiles().find(p=>norm(p.nombre)===norm(cleanName(name))) || null;
}
function ensurePersonForAbsence(name){
  let index = state.personal.findIndex(p=>norm(p.nombre)===norm(cleanName(name)));
  if(index >= 0) return index;
  const op = operationalStaffByName(name);
  if(!op) return -1;
  const turnos = op.turnos.join("-");
  const origen = op.origenes.includes("Canes") ? "Canes" : op.origenes.includes("Rotativo 48") ? `Rotativo 48 ${turnos}` : `Turno ${turnos}`;
  state.personal.push(normalizePersonRecord({
    nombre:op.nombre,
    jerarquia:"",
    legajo:"",
    situacion:origen,
    observaciones:"Registro vinculado automáticamente para licencias",
    servicio:op.servicio || "24hs",
    estado:"Activo",
    dias:"",
    hora_inicio:"",
    hora_fin:"",
    turno_24:op.turnos.length===1 ? op.turnos[0] : "",
    modalidad:"Fijo",
    asignaciones:[],
    ausencias:[],
    operational_only:true
  }));
  state.personal.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  return state.personal.findIndex(p=>norm(p.nombre)===norm(op.nombre));
}

function bindPlanilla(){
  q("#btnHideControls").onclick = ()=> document.body.classList.add("focus-table");
  q("#btnShowControls").onclick = ()=> document.body.classList.remove("focus-table");
  q("#btnFullscreen").onclick = toggleFullscreen;
  q("#btnUndoTop").onclick = undoLastChange;
  window.addEventListener("beforeprint", ()=>{ if(!hasDebens()) document.body.classList.add("hide-empty-deben-print"); });
  window.addEventListener("afterprint", ()=> document.body.classList.remove("hide-empty-deben-print"));
  q("#btnAddRow").onclick = ()=> { state.planilla.rows.push(blankRow()); save({action:"Agregar fila"}); renderPlanilla(); };
  q("#btnSaveAll").onclick = ()=> { save({action:"Guardado manual"}); alert("Guardado en la nube/localmente."); };
  q("#btnLoadDay").onclick = loadDay;
  q("#btnSort").onclick = ()=> { sortRows(); save({action:"Ordenar por servicio"}); renderPlanilla(); renderDashboard(); renderDailyView(); };
  q("#btnClear").onclick = ()=> { if(confirm("¿Limpiar filas?")){ state.planilla.rows=[]; save({action:"Limpiar filas"}); renderAll(); } };
  q("#btnPrint").onclick = ()=> window.print();
  q("#btnExportJpg").onclick = exportPlanillaJpg;
  q("#planDate").addEventListener("change", ()=>{
    const d = parseAnyDate(q("#planDate").value);
    if(d){ state.planilla.fecha=formatDMY(d); state.planilla.dia=dayName(d); state.planilla.turno=turnoFromDate(d); save({action:"Cambiar fecha"}); renderAll(); }
  });
  q("#planDay").onchange = e=> { state.planilla.dia=e.target.value; save({action:"Cambiar día"}); renderDashboard(); renderDailyView(); };
  q("#planTurno").onchange = e=> { state.planilla.turno=e.target.value; save({action:"Cambiar turno"}); renderTurnos(); renderDashboard(); };
}
function blankRow(){ return {nombre:"", servicio:"", cells:Array(12).fill(""), recargo:false}; }

function renderPlanilla(){
  q("#planDate").value = dmyToISO(state.planilla.fecha || todayDMY());
  q("#planDay").value = state.planilla.dia || "";
  q("#planTurno").value = state.planilla.turno || "";

  const head = q("#shiftHead");
  head.innerHTML = "";
  const tr1 = document.createElement("tr");
  tr1.className = "deben-row";
  tr1.innerHTML = `<th class="puestos name-cell" rowspan="2">PUESTOS:</th>`;
  for(let i=0;i<12;i++){
    tr1.innerHTML += `<th class="hour-cell"><input class="deben" data-i="${i}" value="${esc(state.planilla.deben[i]||"")}"></th>`;
  }
  tr1.innerHTML += `<th class="toplabel" colspan="3">&lt;- Deben haber</th>`;
  const tr2 = document.createElement("tr");
  tr2.className = "hay-row";
  tr2.innerHTML = `<th class="print-puestos name-cell">PUESTOS:</th>`;
  const detail = coverageDetail(state.planilla.rows);
  const hay = detail.map(d=>d.display);
  for(let i=0;i<12;i++) tr2.innerHTML += `<th class="hour-cell hay-cell" style="${coverageCellStyle(detail[i].value, parseTarget(state.planilla.deben[i]))}">${hay[i]}</th>`;
  tr2.innerHTML += `<th class="toplabel" colspan="3">&lt;- Hay</th>`;
  const tr3 = document.createElement("tr");
  tr3.innerHTML = `<th class="name-cell">Hora:</th>` + HOURS.map(h=>`<th class="hour-cell">${h}</th>`).join("") + `<th class="tiros-cell">Tiros</th><th class="service-cell">Servicio</th><th class="order-cell">Orden</th>`;
  head.append(tr1,tr2,tr3);
  qa(".deben").forEach(inp => inp.onchange = e=>{ state.planilla.deben[Number(inp.dataset.i)] = e.target.value; save({action:"Modificar Deben haber"}); renderDashboard(); renderPlanilla(); });

  const body = q("#shiftBody");
  body.innerHTML = "";
  state.planilla.rows.forEach((row, rIndex)=>{
    row.nombre = toTitleName(cleanName(row.nombre||""));
    const tr = document.createElement("tr");
    const inactiveClass = getPerson(row.nombre)?.estado === "Inactivo" ? " inactive-row" : "";
    tr.innerHTML = `<td class="name-cell${inactiveClass}"><input class="${row.recargo?'recargo-name':''}" value="${esc(row.nombre)}" data-r="${rIndex}" data-field="nombre" list="staffList"></td>`;
    const fatiga = fatigueCols(row);
    for(let i=0;i<12;i++){
      tr.innerHTML += `<td class="hour-cell cell-btn ${fatiga.has(i)?'fatiga':''}" data-r="${rIndex}" data-c="${i}">${esc(row.cells[i]||"")}</td>`;
    }
    tr.innerHTML += `<td class="tiros-cell">${formatNum(tiros(row))}</td>`;
    tr.innerHTML += `<td class="service-cell"><select data-r="${rIndex}" data-field="servicio">${SERVICES.map(s=>`<option ${row.servicio===s?'selected':''}>${s}</option>`).join("")}</select></td>`;
    tr.innerHTML += `<td class="order-cell"><button data-act="up" data-r="${rIndex}">↑</button><button data-act="down" data-r="${rIndex}">↓</button><button data-act="del" data-r="${rIndex}">✕</button></td>`;
    body.append(tr);
  });

  body.querySelectorAll("input[data-field='nombre']").forEach(inp=>{
    inp.onchange = e=> { const row = state.planilla.rows[Number(inp.dataset.r)]; row.nombre=toTitleName(cleanName(e.target.value)); const p = getPerson(row.nombre); if(p && !row.servicio){ row.servicio=p.servicio||""; row.cells=personMarks(p); } save({action:"Modificar nombre en planilla"}); renderAll(); };
    inp.onclick = e=> { if(e.getModifierState && e.getModifierState("Alt")) toggleRecargo(Number(inp.dataset.r)); };
  });
  body.querySelectorAll("select[data-field='servicio']").forEach(sel=> sel.onchange = e=>{ state.planilla.rows[Number(sel.dataset.r)].servicio=e.target.value; save({action:"Modificar servicio en planilla"}); renderAll(); });

  body.querySelectorAll(".cell-btn").forEach(td=>{
    td.addEventListener("pointerdown", e=>{
      longPressFired = false;
      if(e.pointerType === "touch" || e.pointerType === "pen"){
        const r=Number(td.dataset.r), c=Number(td.dataset.c);
        longPressTimer = setTimeout(()=>{
          state.planilla.rows[r].cells[c] = "H";
          longPressFired = true;
          save({action:"Marcar H"}); renderAll();
        }, 550);
      }
    });
    td.addEventListener("pointerup", ()=> clearTimeout(longPressTimer));
    td.addEventListener("pointerleave", ()=> clearTimeout(longPressTimer));
    td.onclick = e=>{
      clearTimeout(longPressTimer);
      if(longPressFired){ longPressFired = false; return; }
      const r=Number(td.dataset.r), c=Number(td.dataset.c);
      const row = state.planilla.rows[r];
      if(e.ctrlKey) row.cells[c] = "H";
      else {
        const seq = ["","X","X/","/X"];
        const current = token(row.cells[c]);
        const idx = seq.indexOf(current);
        row.cells[c] = idx >= 0 ? seq[(idx + 1) % seq.length] : "X";
      }
      save({action:"Modificar celda de horario"}); renderAll();
    };
  });
  body.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.onclick = ()=>{
      const r = Number(btn.dataset.r);
      const act = btn.dataset.act;
      if(act==="del") state.planilla.rows.splice(r,1);
      if(act==="up" && r>0) [state.planilla.rows[r-1],state.planilla.rows[r]]=[state.planilla.rows[r],state.planilla.rows[r-1]];
      if(act==="down" && r<state.planilla.rows.length-1) [state.planilla.rows[r+1],state.planilla.rows[r]]=[state.planilla.rows[r],state.planilla.rows[r+1]];
      save({action:"Orden manual de filas"}); renderAll();
    };
  });
}
function esc(s){ return String(s||"").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function formatNum(n){ return Number.isInteger(n) ? String(n) : String(n).replace(".",","); }
function tiros(row){ return (row.cells||[]).reduce((acc,v)=> acc + (FULL.has(token(v))?1:HALF.has(token(v))?0.5:0),0); }
function fatigueCols(row){
  const set = new Set(), key = serviceKey(row.servicio);
  if(!FATIGUE_SERVICES.has(key)) return set;
  let chain = [];
  (row.cells||[]).forEach((v,i)=>{
    if(FULL.has(token(v))){ chain.push(i); if(chain.length>3) chain.forEach(x=>set.add(x)); }
    else chain = [];
  });
  return set;
}
function coverageDetail(rows){
  return HOURS.map((_,c)=>{
    let left=0,right=0;
    (rows||[]).forEach(row=>{
      const t = token((row.cells||[])[c]);
      if(t === "X"){ left++; right++; }
      else if(HALF_LEFT.has(t)) left++;
      else if(HALF_RIGHT.has(t)) right++;
    });
    return {left,right,value:Math.min(left,right), display:left===right ? String(left) : `${left}/${right}`};
  });
}
function calculateHay(){ return coverageDetail(state.planilla.rows).map(d=>d.display); }
function parseTarget(v){
  const nums = String(v||"").replace(",", ".").match(/\d+(?:\.\d+)?/g);
  if(!nums || !nums.length) return null;
  return Math.max(...nums.map(Number));
}
function hasDebens(){ return (state.planilla.deben||[]).some(v=>String(v||"").trim()); }
function coverageRatio(value,target){
  if(target && target > 0) return Math.max(0, Math.min(value/target, 1));
  return Math.max(0, Math.min(value/7, 1));
}
function coverageCellStyle(value,target){
  if(target === null || target === undefined || target === 0) return "";
  const ratio = coverageRatio(value,target);
  const hue = Math.round(ratio * 120);
  const light = 86 - Math.round(ratio * 12);
  return `background:hsl(${hue} 80% ${light}%); color:#111;`;
}
function coverageClass(value,target){
  const ratio = coverageRatio(value,target || 7);
  if(ratio >= .9) return "ok";
  if(ratio >= .65) return "warn";
  return "bad";
}
function periodDefs(){
  return [
    {key:"manana", label:"Mañana", range:"07-13", idx:[0,1,2]},
    {key:"tarde", label:"Tarde", range:"13-21", idx:[3,4,5,6]},
    {key:"noche", label:"Noche", range:"22-07", idx:[7,8,9,10,11]}
  ];
}
function periodScore(detail, indices){
  const targets = indices.map(i=>parseTarget(state.planilla.deben?.[i])).filter(v=>v && v>0);
  if(targets.length){
    let ratios = indices.map(i=>coverageRatio(detail[i].value, parseTarget(state.planilla.deben?.[i]) || Math.max(...targets)));
    return ratios.reduce((a,b)=>a+b,0)/ratios.length;
  }
  let vals = indices.map(i=>detail[i].value);
  return Math.min((vals.reduce((a,b)=>a+b,0)/vals.length)/7, 1);
}
function toggleRecargo(r){
  const row = state.planilla.rows[r];
  row.recargo = !row.recargo;
  if(row.recargo){ row.previous_service = row.servicio; row.servicio = "Recargo"; }
  else { row.servicio = row.previous_service || row.servicio; row.previous_service=""; }
  save(); renderPlanilla();
}
function sortRows(){
  const rank = s => {
    const k = serviceKey(s);
    if(k==="24hs") return 0; if(k==="canes") return 1;
    if(["4hs","6hs","12hs","diario"].includes(k)) return 2;
    if(k==="rondin") return 3; if(k==="recargo") return 4;
    return 5;
  };
  state.planilla.rows.sort((a,b)=>(a.recargo?4:rank(a.servicio))-(b.recargo?4:rank(b.servicio)) || a.nombre.localeCompare(b.nombre));
}

function loadDay(){
  const d = parseDMY(state.planilla.fecha);
  if(!d) return alert("Fecha inválida. Usá DD/MM/AAAA.");
  state.planilla.rows = [];
  state.planilla.dia = dayName(d);
  state.planilla.turno = turnoFromDate(d);

  state.personal.forEach(p=>{
    if(p.operational_only) return;
    if(norm(p.estado||"Activo")==="inactivo") return;
    if(isAbsent(p,d)) return;
    matchingAssignments(p).forEach(a=>{
      const service = a.servicio || p.servicio || "";
      if(serviceKey(service)==="24hs") return;
      state.planilla.rows.push({nombre:p.nombre, servicio:serviceForAssignment(a,p), cells:marksForAssignment(a,p), recargo:false});
    });
  });
  addStandardRows(d);
  sortRows();
  save({action:"Cargar personal del día"}); renderAll();
}
function addStandardRows(d){
  const turno = state.planilla.turno;
  const existing = new Set(state.planilla.rows.map(r=>norm(r.nombre)));
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));

  (state.turnos.turnos_24?.[turno] || []).forEach(n=>{
    const name = toTitleName(cleanName(n));
    if(rotNames.has(norm(name)) || isPersonUnavailableByName(name,d)) return;
    if(!existing.has(norm(name))){ state.planilla.rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
  });

  (state.turnos.rotativos_48||[]).forEach(item=>{
    if(rotativo48Present(item,d,turno)){
      const name = toTitleName(cleanName(item.nombre));
      if(isPersonUnavailableByName(name,d)) return;
      if(!existing.has(norm(name))){ state.planilla.rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
    }
  });

  const canes = toTitleName(cleanName(state.turnos.canes_por_turno?.[turno] || ""));
  if(canes && !isPersonUnavailableByName(canes,d) && !existing.has(norm(canes))){ state.planilla.rows.push({nombre:canes, servicio:"Canes", cells:Array(12).fill(""), recargo:false}); existing.add(norm(canes)); }

  ["Rondin1","Rondin2","Rondin3"].forEach(n=>{
    state.planilla.rows.push({nombre:n, servicio:"Rondin", cells:marksFromRange("22","07"), recargo:false});
  });
}

function rowsForDate(d){
  const saved = {fecha:state.planilla.fecha, dia:state.planilla.dia, turno:state.planilla.turno, rows:state.planilla.rows};
  const rows = [];
  try{
    state.planilla.fecha = formatDMY(d);
    state.planilla.dia = dayName(d);
    state.planilla.turno = turnoFromDate(d);
    state.personal.forEach(p=>{
      if(p.operational_only) return;
      if(norm(p.estado||"Activo")==="inactivo") return;
      if(isAbsent(p,d)) return;
      matchingAssignments(p).forEach(a=>{
        const service = a.servicio || p.servicio || "";
        if(serviceKey(service)==="24hs") return;
        rows.push({nombre:p.nombre, servicio:serviceForAssignment(a,p), cells:marksForAssignment(a,p), recargo:false});
      });
    });
    addStandardRowsTo(rows,d,state.planilla.turno);
    rows.sort((a,b)=>{
      const rank = s=>{ const k=serviceKey(s); if(k==="24hs")return 0; if(k==="canes")return 1; if(["4hs","6hs","12hs","diario"].includes(k))return 2; if(k==="rondin")return 3; if(k==="recargo")return 4; return 5; };
      return (a.recargo?4:rank(a.servicio))-(b.recargo?4:rank(b.servicio)) || a.nombre.localeCompare(b.nombre);
    });
    return rows;
  }finally{
    state.planilla.fecha = saved.fecha;
    state.planilla.dia = saved.dia;
    state.planilla.turno = saved.turno;
    state.planilla.rows = saved.rows;
  }
}
function addStandardRowsTo(rows,d,turno){
  const existing = new Set(rows.map(r=>norm(r.nombre)));
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));
  (state.turnos.turnos_24?.[turno] || []).forEach(n=>{
    const name = toTitleName(cleanName(n));
    if(rotNames.has(norm(name)) || isPersonUnavailableByName(name,d)) return;
    if(!existing.has(norm(name))){ rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
  });
  (state.turnos.rotativos_48||[]).forEach(item=>{
    if(rotativo48Present(item,d,turno)){
      const name = toTitleName(cleanName(item.nombre));
      if(isPersonUnavailableByName(name,d)) return;
      if(!existing.has(norm(name))){ rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
    }
  });
  const canes = toTitleName(cleanName(state.turnos.canes_por_turno?.[turno] || ""));
  if(canes && !isPersonUnavailableByName(canes,d) && !existing.has(norm(canes))){ rows.push({nombre:canes, servicio:"Canes", cells:Array(12).fill(""), recargo:false}); existing.add(norm(canes)); }
  ["Rondin1","Rondin2","Rondin3"].forEach(n=>rows.push({nombre:n, servicio:"Rondin", cells:marksFromRange("22","07"), recargo:false}));
}

function isAbsent(p,d){
  return (p.ausencias||[]).some(raw=>{
    const a = normalizeAbsenceRecord(raw);
    const from = parseDMY(a.desde), to = parseDMY(a.hasta);
    if(!from || d < from) return false;
    return !to || d <= to;
  });
}
function absenceStatus(a, reference=new Date()){
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const from = parseDMY(a.desde), to = parseDMY(a.hasta);
  if(!from) return {key:"invalid", label:"Fecha inválida"};
  if(today < from) return {key:"future", label:"Próxima"};
  if(!to || today <= to) return {key:"active", label:"Vigente"};
  return {key:"ended", label:"Finalizada"};
}
function absenceLabel(a){
  const n = normalizeAbsenceRecord(a);
  return n.tipo === "Art 214" ? "Art. 214" : `Carpeta Médica${n.articulo ? " · "+n.articulo : ""}`;
}
function activeAbsences(p, reference=new Date()){
  return (p.ausencias||[]).map(normalizeAbsenceRecord).filter(a=>absenceStatus(a,reference).key === "active");
}
function personByName(name){
  return state.personal.find(p=>norm(cleanName(p.nombre))===norm(cleanName(name)));
}
function isPersonUnavailableByName(name,d){
  const p=personByName(name);
  return !!p && (norm(p.estado||"Activo")==="inactivo" || isAbsent(p,d));
}
function dayTokens(text){
  const t = norm(text).replace(/\n/g," ");
  if(!t) return new Set();
  const days = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];
  if(t.includes("lunes a viernes")) return new Set(days.slice(0,5));
  for(let i=0;i<days.length;i++){
    const phrase = `${days[i]} a `;
    if(t.includes(phrase)){
      const j = days.findIndex(d=> t.includes(phrase+d));
      if(j>=0){ const out=new Set(); let k=i; while(true){ out.add(days[k]); if(k===j)break; k=(k+1)%7; } return out; }
    }
  }
  const out = new Set();
  days.forEach(d=>{ if(t.includes(d)) out.add(d); });
  if(t.includes("diario")||t.includes("todos")) out.add("todos");
  return out;
}
function selectedDayKey(){ return norm(state.planilla.dia); }
function assignmentWorks(a){
  const days=dayTokens(a.dias||"");
  const day=selectedDayKey();
  return !day || days.size===0 || days.has("todos") || days.has(day);
}
function matchingAssignments(p){
  let asg = Array.isArray(p.asignaciones) && p.asignaciones.length ? p.asignaciones : [{
    dias:p.dias, hora_inicio:p.hora_inicio, hora_fin:p.hora_fin, servicio:p.servicio, modalidad:p.modalidad,
    rotativo_a_inicio:p.rotativo_a_inicio, rotativo_a_fin:p.rotativo_a_fin, rotativo_b_inicio:p.rotativo_b_inicio, rotativo_b_fin:p.rotativo_b_fin, fecha_base_rotacion:p.fecha_base_rotacion
  }];
  return asg.filter(assignmentWorks);
}
function serviceForAssignment(a,p){ return a.servicio || p.servicio || ""; }
function personMarks(p){ const m = matchingAssignments(p)[0]; return m ? marksForAssignment(m,p) : Array(12).fill(""); }
function marksForAssignment(a,p){
  const service = serviceKey(serviceForAssignment(a,p));
  if(service==="24hs" || service==="canes") return Array(12).fill("");
  if(service==="rondin") return marksFromRange("22","07");
  if(norm(a.modalidad||p.modalidad)==="rotativo semanal"){
    const [ini,fin] = rotativeRange(a);
    return marksFromRange(ini,fin);
  }
  return marksFromRange(a.hora_inicio||p.hora_inicio, a.hora_fin||p.hora_fin);
}
function parseHour(v){ const m=String(v||"").match(/\d{1,2}/); if(!m)return null; const h=Number(m[0]); if(h===24)return 0; return h>=0&&h<=23?h:null; }
function axisHour(h){ return h>=7?h:h+24; }
function marksFromRange(ini,fin){
  const sh=parseHour(ini), eh=parseHour(fin);
  if(sh==null || eh==null) return Array(12).fill("");
  let start=axisHour(sh), end=axisHour(eh); if(end<=start) end+=24;
  return BLOCKS.map(([bs,be])=>{
    const first = start<=bs && end>=bs+1;
    const second = start<=bs+1 && end>=be;
    return first && second ? "X" : first ? "X/" : second ? "/X" : "";
  });
}
function rotativeRange(a){
  const sel = parseDMY(state.planilla.fecha), base=parseDMY(a.fecha_base_rotacion);
  if(!sel||!base) return [a.rotativo_a_inicio,a.rotativo_a_fin];
  const monday = d => addDays(d, -((d.getDay()+6)%7));
  const weeks = Math.floor(diffDays(monday(sel),monday(base))/7);
  return weeks%2===0 ? [a.rotativo_a_inicio,a.rotativo_a_fin] : [a.rotativo_b_inicio,a.rotativo_b_fin];
}
function rotativo48Present(item,d,turno){
  if(!item.activo || !d) return false;
  const pair = item.turnos || [];
  if(!pair.includes(turno)) return false;
  const ref = parseDMY(item.fecha_presente); if(!ref) return true;
  const startFor = (date)=>{
    const current = turnoFromDate(date);
    if(current === pair[0]) return date;
    const prev = addDays(date,-1);
    if(current === pair[1] && turnoFromDate(prev) === pair[0]) return prev;
    return null;
  };
  const a = startFor(d), b=startFor(ref);
  if(!a||!b) return false;
  return Math.floor(diffDays(a,b)/4)%2===0;
}
function getPerson(name){ return state.personal.find(p=>norm(p.nombre)===norm(name)); }

function bindDashboard(){
  // No requiere bindings por ahora; se recalcula con renderAll().
}
function weekStart(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
function dashboardWeek(){
  const base = parseDMY(state.planilla.fecha) || new Date();
  const start = weekStart(base);
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
function dailyOperationalData(d){
  const rows = rowsForDate(d);
  const detail = coverageDetail(rows);
  const periods = periodDefs().map(p=>{
    const score = periodScore(detail,p.idx);
    const avg = p.idx.map(i=>detail[i].value).reduce((a,b)=>a+b,0)/p.idx.length;
    return {...p, score, avg};
  });
  const totalScore = periods.reduce((a,b)=>a+b.score,0)/periods.length;
  return {date:d, rows, detail, periods, totalScore};
}
function renderDashboard(){
  const root = q("#dashboardContent");
  if(!root) return;
  const week = dashboardWeek().map(dailyOperationalData);
  const strongest = [...week].sort((a,b)=>b.totalScore-a.totalScore)[0];
  const weakest = [...week].sort((a,b)=>a.totalScore-b.totalScore)[0];
  const alerts = [];
  week.forEach(day=>{
    day.detail.forEach((cell,i)=>{
      const target = parseTarget(state.planilla.deben?.[i]);
      if(target && cell.value < target){
        const ratio = coverageRatio(cell.value,target);
        if(ratio < .65) alerts.push(`${dayName(day.date)} ${HOURS[i]}: ${cell.display} de ${target}`);
      }
    });
  });
  root.innerHTML = `
    <div class="dash-grid">
      <div class="metric-card"><div class="metric-title">Día más fuerte</div><div class="metric-value">${dayName(strongest.date)}</div><div>${formatDMY(strongest.date)}</div></div>
      <div class="metric-card"><div class="metric-title">Día más débil</div><div class="metric-value">${dayName(weakest.date)}</div><div>${formatDMY(weakest.date)}</div></div>
      <div class="metric-card"><div class="metric-title">Alertas críticas</div><div class="metric-value">${alerts.length}</div><div>según Deben haber cargado</div></div>
    </div>
    <div class="card"><h2>Cobertura por día y franja</h2><div class="period-heatmap" id="periodHeatmap"></div></div>
    <div class="card"><h2>Detalle por horario</h2><div class="table-scroll"><table class="data-table striped" id="weekHeatTable"></table></div></div>
    <div class="card"><h2>Ranking semanal</h2><div id="rankingBars"></div></div>
    <div class="card"><h2>Alertas</h2><div id="dashboardAlerts"></div></div>
    <div class="card"><h2>Fatiga detectada hoy</h2><div id="dashboardFatigue"></div></div>
  `;
  const ph = q("#periodHeatmap");
  week.forEach(day=>{
    const row = document.createElement("div"); row.className="period-row";
    row.innerHTML = `<div class="period-day">${dayName(day.date)}<small>${formatDMY(day.date)}</small></div>` + day.periods.map(p=>`<div class="period-cell ${coverageClass(p.score*7,7)}" style="background:hsl(${Math.round(p.score*120)} 78% ${86-Math.round(p.score*12)}%)"><strong>${p.label}</strong><span>${p.range}</span><em>${formatNum(Math.round(p.avg*10)/10)} prom.</em></div>`).join("");
    ph.append(row);
  });
  const table = q("#weekHeatTable");
  table.innerHTML = `<tr><th>Día</th>${HOURS.map(h=>`<th>${h}</th>`).join("")}</tr>`;
  week.forEach(day=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `<td><strong>${dayName(day.date)}</strong></td>` + day.detail.map((c,i)=>`<td class="mini-heat" style="${coverageCellStyle(c.value, parseTarget(state.planilla.deben?.[i]) || 7)}">${c.display}</td>`).join("");
    table.append(tr);
  });
  const ranking = q("#rankingBars");
  [...week].sort((a,b)=>b.totalScore-a.totalScore).forEach(day=>{
    const pct = Math.round(day.totalScore*100);
    const div=document.createElement("div"); div.className="rank-row";
    div.innerHTML = `<span>${dayName(day.date)}</span><div class="rank-track"><div class="rank-fill" style="width:${pct}%; background:hsl(${Math.round(day.totalScore*120)} 75% 45%)"></div></div><b>${pct}%</b>`;
    ranking.append(div);
  });
  q("#dashboardAlerts").innerHTML = alerts.length ? `<ul class="alert-list">${alerts.slice(0,30).map(a=>`<li>${esc(a)}</li>`).join("")}</ul>` : `<p class="ok-text">No hay alertas críticas con los Deben haber actuales.</p>`;
  renderFatigueInto(q("#dashboardFatigue"), state.planilla.rows);
}
function renderFatigueInto(container, rows){
  if(!container) return;
  const items = (rows||[]).map(r=>({row:r, cols:[...fatigueCols(r)]})).filter(x=>x.cols.length);
  container.innerHTML = items.length ? `<ul class="alert-list">${items.map(x=>`<li><strong>${esc(x.row.nombre)}</strong>: ${x.cols.map(i=>HOURS[i]).join(", ")}</li>`).join("")}</ul>` : `<p class="ok-text">Sin fatiga detectada.</p>`;
}
function bindDailyView(){
  const search = q("#quickSearch");
  if(search) search.addEventListener("input", renderDailyView);
}
function renderDailyView(){
  const rows = state.planilla.rows || [];
  const groups = {};
  rows.forEach(r=>{ const k=r.servicio||"Sin servicio"; (groups[k] ||= []).push(r); });
  const order = ["24hs","Canes","12hs","6hs","4hs","Diario","Rondin","Recargo","Sin servicio"];
  const serviceCards = order.filter(k=>groups[k]).map(k=>`<div class="service-card"><h3>${k}</h3>${groups[k].map(r=>`<div class="service-person ${r.recargo?'recargo-name':''}">${esc(r.nombre)} <small>${formatNum(tiros(r))} tiros</small></div>`).join("")}</div>`).join("");
  const term = norm(q("#quickSearch")?.value || "");
  const matches = term ? state.personal.filter(p=>norm([p.nombre,p.jerarquia,p.legajo,p.servicio,p.dias,p.observaciones,p.situacion,...(p.ausencias||[]).map(absenceLabel)].join(" ")).includes(term)).slice(0,20) : [];
  q("#dailyServices").innerHTML = serviceCards || `<p>No hay filas cargadas. Usá “Cargar personal del día”.</p>`;
  q("#searchResults").innerHTML = !term ? "" : (matches.length ? matches.map(p=>{
    const active = activeAbsences(p).map(absenceLabel).join(" · ");
    return `<div class="search-hit"><strong>${esc(p.nombre)}</strong><span>${esc(p.jerarquia||"")}${p.legajo?" · Legajo "+esc(p.legajo):""} · ${esc(p.servicio||"")} · ${esc(p.dias||"")} · ${esc((p.hora_inicio||"")+" a "+(p.hora_fin||""))}${p.situacion?" · "+esc(p.situacion):""} · ${esc(p.estado||"Activo")}${active?" · LICENCIA: "+esc(active):""}</span></div>`;
  }).join("") : `<p>Sin resultados.</p>`);
  renderFatigueInto(q("#dailyFatigue"), rows);
}

function bindPersonal(){
  q("#btnSavePerson").onclick = savePerson;
  q("#btnNewPerson").onclick = clearPersonForm;
}
function renderPersonal(){
  const table = q("#personalTable");
  table.innerHTML = `<tr><th>Nombre</th><th>Jerarquía</th><th>Legajo</th><th>Servicio</th><th>Estado</th><th>Licencia vigente</th><th>Días</th><th>Horario</th><th>Observaciones</th></tr>`;
  state.personal.forEach((p,i)=>{
    const tr=document.createElement("tr");
    if(norm(p.estado)==="inactivo") tr.classList.add("inactive-row");
    const obs = [p.situacion,p.observaciones].filter(Boolean).join(" · ");
    const license = activeAbsences(p).map(absenceLabel).join(" · ");
    tr.innerHTML = `<td>${esc(p.nombre)}</td><td>${esc(p.jerarquia||"")}</td><td>${esc(p.legajo||"")}</td><td>${esc(p.servicio)}</td><td>${esc(p.estado||"Activo")}</td><td>${license?`<span class="license-badge">${esc(license)}</span>`:""}</td><td>${esc(p.dias||"")}</td><td>${esc((p.hora_inicio||"")+" a "+(p.hora_fin||""))}</td><td>${esc(obs)}</td>`;
    tr.onclick=()=>loadPersonForm(i);
    table.append(tr);
  });
}
function loadPersonForm(i){
  const p=state.personal[i]; q("#personName").value=p.nombre||""; q("#personHierarchy").value=p.jerarquia||""; q("#personLegajo").value=p.legajo||""; q("#personSituation").value=p.situacion||""; q("#personObservations").value=p.observaciones||""; q("#personService").value=p.servicio||"24hs"; q("#personState").value=p.estado||"Activo";
  q("#personDays").value=p.dias||""; q("#personStart").value=p.hora_inicio||""; q("#personEnd").value=p.hora_fin||""; q("#personTurno").value=p.turno_24||"";
  q("#personMode").value=p.modalidad||"Fijo"; q("#rotAStart").value=p.rotativo_a_inicio||""; q("#rotAEnd").value=p.rotativo_a_fin||"";
  q("#rotBStart").value=p.rotativo_b_inicio||""; q("#rotBEnd").value=p.rotativo_b_fin||""; q("#rotBase").value=dmyToISO(p.fecha_base_rotacion||"");
}
function clearPersonForm(){ ["personName","personHierarchy","personLegajo","personSituation","personObservations","personDays","personStart","personEnd","personTurno","rotAStart","rotAEnd","rotBStart","rotBEnd","rotBase"].forEach(id=>q("#"+id).value=""); q("#personService").value="24hs"; q("#personState").value="Activo"; q("#personMode").value="Fijo"; }
function savePerson(){
  const name=toTitleName(cleanName(q("#personName").value.trim())); if(!name) return alert("Ingresá un nombre.");
  const idx=state.personal.findIndex(x=>norm(x.nombre)===norm(name));
  const existing=idx>=0 ? state.personal[idx] : null;
  const p = {
    nombre:name,
    jerarquia:q("#personHierarchy").value.trim(),
    legajo:q("#personLegajo").value.trim(),
    situacion:q("#personSituation").value.trim(),
    observaciones:q("#personObservations").value.trim(),
    servicio:q("#personService").value, estado:q("#personState").value, dias:q("#personDays").value,
    hora_inicio:q("#personStart").value, hora_fin:q("#personEnd").value, turno_24:q("#personTurno").value,
    modalidad:q("#personMode").value, rotativo_a_inicio:q("#rotAStart").value, rotativo_a_fin:q("#rotAEnd").value,
    rotativo_b_inicio:q("#rotBStart").value, rotativo_b_fin:q("#rotBEnd").value, fecha_base_rotacion:isoToDMY(q("#rotBase").value),
    ausencias: existing?.ausencias || []
  };
  const scheduleKeys=["servicio","dias","hora_inicio","hora_fin","modalidad","rotativo_a_inicio","rotativo_a_fin","rotativo_b_inicio","rotativo_b_fin","fecha_base_rotacion"];
  const scheduleUnchanged = existing && scheduleKeys.every(k=>String(existing[k]||"")===String(p[k]||""));
  p.asignaciones = scheduleUnchanged && Array.isArray(existing.asignaciones)
    ? clone(existing.asignaciones)
    : [{dias:p.dias,hora_inicio:p.hora_inicio,hora_fin:p.hora_fin,servicio:p.servicio,modalidad:p.modalidad,rotativo_a_inicio:p.rotativo_a_inicio,rotativo_a_fin:p.rotativo_a_fin,rotativo_b_inicio:p.rotativo_b_inicio,rotativo_b_fin:p.rotativo_b_fin,fecha_base_rotacion:p.fecha_base_rotacion,observaciones:p.observaciones}];
  if(idx>=0) state.personal[idx]=normalizePersonRecord(p); else state.personal.push(normalizePersonRecord(p));
  state.personal.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  save({action:"Actualizar personal"}); renderAll(); clearPersonForm();
}

function bindTurnos(){
  q("#btnUseTurno").onclick=()=>{ state.planilla.turno=selectedTurnoAdmin; save(); renderPlanilla(); document.querySelector('[data-tab="planilla"]').click(); };
  q("#btnAddTurnoPerson").onclick=()=>{ const n=toTitleName(cleanName(q("#turnoPersonInput").value.trim())); if(!n)return; const arr=state.turnos.turnos_24[selectedTurnoAdmin] ||= []; if(!arr.some(x=>norm(cleanName(x))===norm(n))) arr.push(n); save(); renderTurnos(); };
  q("#btnUpdateTurnoPerson").onclick=()=>{ if(selectedFixedIndex==null)return; const n=toTitleName(cleanName(q("#turnoPersonInput").value.trim())); if(!n)return; state.turnos.turnos_24[selectedTurnoAdmin][selectedFixedIndex]=n; save(); renderTurnos(); };
  q("#btnRemoveTurnoPerson").onclick=()=>{ if(selectedFixedIndex==null)return; state.turnos.turnos_24[selectedTurnoAdmin].splice(selectedFixedIndex,1); selectedFixedIndex=null; save(); renderTurnos(); };
  q("#btnSaveCanes").onclick=()=>{ state.turnos.canes_por_turno[selectedTurnoAdmin]=toTitleName(cleanName(q("#canesInput").value.trim())); save(); renderTurnos(); };
  q("#btnSaveRot48").onclick=saveRot48;
  q("#btnRemoveRot48").onclick=()=>{ if(selectedRot48Index==null)return; state.turnos.rotativos_48.splice(selectedRot48Index,1); selectedRot48Index=null; save(); renderTurnos(); };
}
function renderTurnos(){
  const pills=q("#turnoPills"); pills.innerHTML="";
  TURNO_SEQ.forEach(t=>{ const b=document.createElement("button"); b.textContent="Turno "+t; b.className=t===selectedTurnoAdmin?"active":""; b.onclick=()=>{selectedTurnoAdmin=t;selectedFixedIndex=null;renderTurnos();}; pills.append(b); });
  const list=q("#turnoPersonList"); list.innerHTML="";
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));
  (state.turnos.turnos_24?.[selectedTurnoAdmin]||[]).forEach((n,i)=>{
    if(rotNames.has(norm(cleanName(n)))) return;
    const li=document.createElement("li"); li.textContent=toTitleName(cleanName(n)); if(i===selectedFixedIndex)li.classList.add("selected");
    li.onclick=()=>{ selectedFixedIndex=i; q("#turnoPersonInput").value=toTitleName(cleanName(n)); renderTurnos(); };
    list.append(li);
  });
  q("#canesInput").value=state.turnos.canes_por_turno?.[selectedTurnoAdmin]||"";
  renderRot48();
  renderTurnoPreview();
}
function renderRot48(){
  const t=q("#rot48Table"); t.innerHTML="<tr><th>Nombre</th><th>Turnos</th><th>Fecha presente</th><th>Estado</th></tr>";
  (state.turnos.rotativos_48||[]).forEach((r,i)=>{
    const tr=document.createElement("tr"); if(i===selectedRot48Index)tr.classList.add("selected");
    tr.innerHTML=`<td>${esc(r.nombre)}</td><td>${esc((r.turnos||[]).join("-"))}</td><td>${esc(r.fecha_presente)}</td><td>${r.activo?"Activo":"Inactivo"}</td>`;
    tr.onclick=()=>{ selectedRot48Index=i; q("#rot48Name").value=r.nombre; q("#rot48Pair").value=(r.turnos||[]).join("-"); q("#rot48Date").value=dmyToISO(r.fecha_presente); q("#rot48Active").value=String(!!r.activo); renderTurnos(); };
    t.append(tr);
  });
}
function saveRot48(){
  const name=toTitleName(cleanName(q("#rot48Name").value.trim())); if(!name)return alert("Nombre requerido.");
  if(!parseAnyDate(q("#rot48Date").value)) return alert("Fecha presente inválida.");
  const item={nombre:name, turnos:q("#rot48Pair").value.split("-"), fecha_presente:isoToDMY(q("#rot48Date").value), activo:q("#rot48Active").value==="true"};
  if(selectedRot48Index!=null) state.turnos.rotativos_48[selectedRot48Index]=item; else state.turnos.rotativos_48.push(item);
  selectedRot48Index=null; save(); renderTurnos();
}
function renderTurnoPreview(){
  const d=parseDMY(state.planilla.fecha), turno=selectedTurnoAdmin;
  const rows=[];
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));
  (state.turnos.turnos_24?.[turno]||[]).forEach(n=>{ if(!rotNames.has(norm(cleanName(n)))) rows.push([toTitleName(cleanName(n)),"24hs","Fijo"]); });
  (state.turnos.rotativos_48||[]).forEach(r=>{ if(rotativo48Present(r,d,turno)) rows.push([toTitleName(cleanName(r.nombre)),"24hs","Rotativo 48"]); });
  const canes=state.turnos.canes_por_turno?.[turno]; if(canes) rows.push([canes,"Canes","Canes"]);
  ["Rondin1","Rondin2","Rondin3"].forEach(n=>rows.push([n,"Rondin","Automático"]));
  const t=q("#turnoPreview"); t.innerHTML="<tr><th>#</th><th>Nombre</th><th>Servicio</th><th>Tipo</th></tr>";
  rows.forEach((r,i)=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${i+1}</td><td>${esc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td>`; t.append(tr); });
}

function bindLicenses(){
  q("#absenceType").onchange = updateAbsenceFormRules;
  q("#absenceTo").onchange = updateAbsenceReturn;
  q("#absenceFrom").onchange = updateAbsenceReturn;
  q("#btnSaveAbsence").onclick = saveAbsence;
  q("#btnNewAbsence").onclick = clearAbsenceForm;
  q("#btnDeleteAbsence").onclick = deleteSelectedAbsence;
  updateAbsenceFormRules();
}
function updateAbsenceFormRules(){
  const is214 = q("#absenceType").value === "Art 214";
  q("#absenceArticleLabel").classList.toggle("field-disabled", is214);
  q("#absenceArticle").disabled = is214;
  if(is214) q("#absenceArticle").value = "";
  q("#absenceToHelp").textContent = is214 ? "Obligatorio para Art. 214." : "Opcional: vacío significa que continúa vigente.";
  q("#absenceReturn").closest("label").classList.toggle("field-disabled", !is214);
  updateAbsenceReturn();
}
function updateAbsenceReturn(){
  const is214 = q("#absenceType").value === "Art 214";
  const until = parseAnyDate(q("#absenceTo").value);
  q("#absenceReturn").value = is214 && until ? formatDMY(addDays(until,1)) : "";
}
function clearAbsenceForm(){
  selectedAbsence = null;
  q("#absencePerson").value = "";
  q("#absenceType").value = "Art 214";
  q("#absenceArticle").value = "";
  q("#absenceFrom").value = "";
  q("#absenceTo").value = "";
  q("#absenceNotes").value = "";
  updateAbsenceFormRules();
  renderVacaciones();
}
function loadAbsenceForm(personIndex, absenceIndex){
  const p = state.personal[personIndex];
  const a = normalizeAbsenceRecord(p.ausencias[absenceIndex]);
  selectedAbsence = {personIndex, absenceIndex, id:a.id};
  q("#absencePerson").value = p.nombre;
  q("#absenceType").value = a.tipo;
  q("#absenceArticle").value = a.articulo || "";
  q("#absenceFrom").value = dmyToISO(a.desde);
  q("#absenceTo").value = dmyToISO(a.hasta);
  q("#absenceNotes").value = a.observaciones || "";
  updateAbsenceFormRules();
  renderVacaciones();
}
function saveAbsence(){
  const personName = toTitleName(cleanName(q("#absencePerson").value));
  const targetPersonIndex = ensurePersonForAbsence(personName);
  if(targetPersonIndex < 0) return alert("Seleccioná personal de la nómina, de los turnos o de Canes.");
  const tipo = q("#absenceType").value;
  const articulo = q("#absenceArticle").value.trim();
  const fromDate = parseAnyDate(q("#absenceFrom").value);
  const toDate = parseAnyDate(q("#absenceTo").value);
  if(!fromDate) return alert("Indicá la fecha de inicio.");
  if(tipo === "Art 214" && !toDate) return alert("El Art. 214 requiere fecha de finalización.");
  if(tipo === "Carpeta Medica" && !articulo) return alert("Indicá el artículo o motivo de la Carpeta Médica.");
  if(toDate && toDate < fromDate) return alert("La fecha de fin no puede ser anterior a la fecha de inicio.");

  const record = normalizeAbsenceRecord({
    id: selectedAbsence?.id,
    tipo,
    articulo,
    desde: formatDMY(fromDate),
    hasta: toDate ? formatDMY(toDate) : "",
    observaciones:q("#absenceNotes").value.trim()
  });

  if(selectedAbsence){
    const oldPerson = state.personal[selectedAbsence.personIndex];
    if(oldPerson?.ausencias?.[selectedAbsence.absenceIndex]) oldPerson.ausencias.splice(selectedAbsence.absenceIndex,1);
  }
  state.personal[targetPersonIndex].ausencias ||= [];
  state.personal[targetPersonIndex].ausencias.push(record);
  state.personal[targetPersonIndex].ausencias.sort((a,b)=>(parseDMY(a.desde)||0)-(parseDMY(b.desde)||0));
  save({action: tipo === "Art 214" ? "Registrar Art. 214" : "Registrar Carpeta Médica"});
  clearAbsenceForm();
  renderAll();
}
function deleteSelectedAbsence(){
  if(!selectedAbsence) return alert("Seleccioná una licencia de la tabla.");
  const p = state.personal[selectedAbsence.personIndex];
  const a = p?.ausencias?.[selectedAbsence.absenceIndex];
  if(!a) return clearAbsenceForm();
  if(!confirm(`¿Eliminar ${absenceLabel(a)} de ${p.nombre}?`)) return;
  p.ausencias.splice(selectedAbsence.absenceIndex,1);
  save({action:"Eliminar licencia"});
  clearAbsenceForm();
  renderAll();
}
function renderVacaciones(){
  const records=[];
  state.personal.forEach((p,personIndex)=>(p.ausencias||[]).forEach((raw,absenceIndex)=>{
    const a=normalizeAbsenceRecord(raw);
    p.ausencias[absenceIndex]=a;
    const status=absenceStatus(a);
    const until=parseDMY(a.hasta);
    records.push({p,a,personIndex,absenceIndex,status,presentation:a.tipo==="Art 214" && until?formatDMY(addDays(until,1)):""});
  }));
  const priority={active:0,future:1,ended:2,invalid:3};
  records.sort((x,y)=>(priority[x.status.key]-priority[y.status.key]) || ((parseDMY(y.a.desde)||0)-(parseDMY(x.a.desde)||0)) || x.p.nombre.localeCompare(y.p.nombre));
  const t=q("#vacTable");
  t.innerHTML="<tr><th>Estado</th><th>Jerarquía</th><th>Nombre</th><th>Tipo / artículo</th><th>Desde</th><th>Hasta</th><th>Presentación</th><th>Observaciones</th></tr>";
  if(!records.length){
    t.innerHTML += '<tr><td colspan="8" class="empty-cell">No hay licencias registradas.</td></tr>';
    return;
  }
  records.forEach(r=>{
    const tr=document.createElement("tr");
    tr.className=`absence-row absence-${r.status.key}`;
    if(selectedAbsence && selectedAbsence.id===r.a.id) tr.classList.add("selected");
    const untilText = r.a.hasta || (r.a.tipo === "Carpeta Medica" ? "Sin fecha de fin" : "");
    tr.innerHTML=`<td><span class="absence-status ${r.status.key}">${esc(r.status.label)}</span></td><td>${esc(r.p.jerarquia||"")}</td><td><strong>${esc(r.p.nombre)}</strong></td><td>${esc(absenceLabel(r.a))}</td><td>${esc(r.a.desde)}</td><td>${esc(untilText)}</td><td>${esc(r.presentation)}</td><td>${esc(r.a.observaciones||"")}</td>`;
    tr.onclick=()=>loadAbsenceForm(r.personIndex,r.absenceIndex);
    t.append(tr);
  });
}
function bindDatos(){
  q("#btnExportBackup").onclick=()=> downloadJson("shift_manager_respaldo.json", state);
  q("#btnExportPersonal").onclick=()=> downloadJson("personal.json", state.personal);
  q("#btnExportTurnos").onclick=()=> downloadJson("turnos.json", state.turnos);
  q("#btnUndoAdmin").onclick=undoLastChange;
  q("#btnBackupNow").onclick=()=>{ createBackupNow("manual"); save({silent:true}); renderAdminExtras(); alert("Backup creado."); };
  q("#backupFrequency").onchange=e=>{ state.backup_settings ||= {}; state.backup_settings.frequency=e.target.value; save({action:"Cambiar frecuencia de backup"}); renderAdminExtras(); };
  q("#importFile").onchange=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{ 
      try{ 
        const data=JSON.parse(reader.result);
        if(Array.isArray(data)){
          state.personal = data.map(normalizePersonRecord);
        }else if(data.personal && data.turnos){
          const preserved = {history:state.history||[], backups:state.backups||[], undoStack:state.undoStack||[], backup_settings:state.backup_settings};
          state = {...data, ...preserved};
          state.personal = (state.personal||[]).map(normalizePersonRecord);
          state.turnos = normalizeTurnos(state.turnos || {});
        }else if(data.turnos_24 || data.canes_por_turno || data.rotativos_48){
          state.turnos = normalizeTurnos(data);
        }else{
          throw new Error("Formato no reconocido");
        }
        save({action:"Importar JSON"}); renderAll(); alert("Datos importados.");
      }catch(err){ alert("Archivo inválido: " + err.message); } 
    };
    reader.readAsText(file);
  };
  q("#btnResetData").onclick=()=>{ if(confirm("¿Restaurar datos iniciales?")){ localStorage.removeItem(STORAGE_KEY); state=loadState(); normalizeLoadedState(); save({action:"Restaurar datos iniciales"}); renderAll(); } };
}
function renderAdminExtras(){
  if(!state) return;
  const freq = q("#backupFrequency");
  if(freq) freq.value = state.backup_settings?.frequency || "daily";
  const hist = q("#historyTable");
  if(hist){
    hist.innerHTML = `<tr><th>Fecha</th><th>Acción</th></tr>` + (state.history||[]).slice(0,30).map(h=>`<tr><td>${new Date(h.at).toLocaleString()}</td><td>${esc(h.action)}</td></tr>`).join("");
  }
  const backups = q("#backupTable");
  if(backups){
    backups.innerHTML = `<tr><th>Fecha</th><th>Tipo</th><th>Descarga</th></tr>` + (state.backups||[]).slice(0,20).map(b=>`<tr><td>${new Date(b.at).toLocaleString()}</td><td>${esc(b.reason)}</td><td><button data-backup="${b.id}">JSON</button></td></tr>`).join("");
    backups.querySelectorAll("button[data-backup]").forEach(btn=>btn.onclick=()=>{
      const b=(state.backups||[]).find(x=>x.id===btn.dataset.backup); if(b) downloadJson(`${b.id}.json`, b.data);
    });
  }
}
function downloadJson(name, data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function exportPlanillaJpg(){
  const detail = coverageDetail(state.planilla.rows);
  const hay = detail.map(d=>d.display);
  const includeDeb = hasDebens();
  const scale = 3;
  const colW = [170, ...Array(12).fill(46), 48, 105];
  const rowH = 28, margin = 24, titleH = 42;
  const rows = state.planilla.rows;
  const headerRows = includeDeb ? 3 : 2;
  const w = (colW.reduce((a,b)=>a+b,0) + margin*2) * scale;
  const h = (titleH + rowH*headerRows + rowH*rows.length + margin*2) * scale;
  const canvas = document.createElement("canvas");
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h);
  ctx.font="700 13px Segoe UI, Arial"; ctx.fillStyle="#111";
  const title = `Planilla de Guardia - ${state.planilla.fecha} - ${state.planilla.dia} - Turno ${state.planilla.turno}`;
  ctx.fillText(title, margin, margin+14);
  let x0=margin, y0=margin+titleH;
  const blue="#315a9f", blue2="#4778c7", red="#ff8a80", light="#efefef";
  function colorFor(value,target){
    if(!target) return blue;
    const ratio=coverageRatio(value,target), hue=Math.round(ratio*120), lit=86-Math.round(ratio*12);
    return `hsl(${hue} 80% ${lit}%)`;
  }
  function cell(x,y,w,h,text,fill="#fff",color="#111",bold=false,fs=11){
    ctx.fillStyle=fill; ctx.fillRect(x,y,w,h); ctx.strokeStyle="#111"; ctx.strokeRect(x,y,w,h);
    if(text){
      ctx.fillStyle=color; ctx.font=`${bold?700:400} ${fs}px Segoe UI, Arial`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(String(text), x+w/2, y+h/2);
    }
  }
  let x=x0;
  if(includeDeb){
    cell(x0,y0,colW[0],rowH*2,"PUESTOS:","#fff","#111",true,12);
    x=x0+colW[0];
    for(let i=0;i<12;i++){ cell(x,y0,colW[i+1],rowH,state.planilla.deben[i]||"",blue2,"#fff",true); x+=colW[i+1]; }
    cell(x,y0,colW[13]+colW[14],rowH,"<- Deben haber",light,"#111",true);
    x=x0+colW[0];
    for(let i=0;i<12;i++){ const target=parseTarget(state.planilla.deben[i]); cell(x,y0+rowH,colW[i+1],rowH,hay[i],colorFor(detail[i].value,target),"#111",true); x+=colW[i+1]; }
    cell(x,y0+rowH,colW[13]+colW[14],rowH,"<- Hay",light,"#111",true);
    y0 += rowH*2;
  }else{
    cell(x0,y0,colW[0],rowH,"PUESTOS:","#fff","#111",true,12);
    x=x0+colW[0];
    for(let i=0;i<12;i++){ cell(x,y0,colW[i+1],rowH,hay[i],blue,"#fff",true); x+=colW[i+1]; }
    cell(x,y0,colW[13]+colW[14],rowH,"<- Hay",light,"#111",true);
    y0 += rowH;
  }
  let y=y0; x=x0;
  cell(x,y,colW[0],rowH,"Hora:",blue,"#fff",true); x+=colW[0];
  HOURS.forEach((hr,i)=>{ cell(x,y,colW[i+1],rowH,hr,blue,"#fff",true); x+=colW[i+1]; });
  cell(x,y,colW[13],rowH,"Tiros",blue,"#fff",true); x+=colW[13];
  cell(x,y,colW[14],rowH,"Servicio",blue,"#fff",true);
  y+=rowH;
  rows.forEach((r,idx)=>{
    x=x0;
    const alt = idx%2 ? "#f6f8fc" : "#fff";
    cell(x,y,colW[0],rowH,r.nombre,r.recargo?red:alt,"#111",false,9); x+=colW[0];
    const fat = fatigueCols(r);
    r.cells.forEach((v,i)=>{ cell(x,y,colW[i+1],rowH,v,fat.has(i)?red:alt,"#111",true,11); x+=colW[i+1]; });
    cell(x,y,colW[13],rowH,formatNum(tiros(r)),blue2,"#fff",true); x+=colW[13];
    cell(x,y,colW[14],rowH,r.servicio,alt,"#111",false,9);
    y+=rowH;
  });
  const a=document.createElement("a");
  a.download=`planilla_${(state.planilla.fecha||"").replaceAll("/","-")}.jpg`;
  a.href=canvas.toDataURL("image/jpeg",0.98);
  a.click();
}

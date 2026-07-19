const HOURS = ["7-9","9-11","11-13","13-15","15-17","17-19","19-21","21-23","23-01","01-03","03-05","05-07"];
const BLOCKS = [[7,9],[9,11],[11,13],[13,15],[15,17],[17,19],[19,21],[21,23],[23,25],[25,27],[27,29],[29,31]];
const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TURNOS = ["", "A", "B", "C", "D"];
const SERVICES = ["24hs","4hs","6hs","12hs","Rondin","Canes","Diario","Recargo"];
const FATIGUE_SERVICES = new Set(["12hs","24hs","canes"]);
const STORAGE_KEY = "shiftManagerWebN6_LOCAL_CACHE";
const TURNO_REF = parseDMY("18/04/1979");
const TURNO_SEQ = ["A","B","C","D"];
const FULL = new Set(["X","H"]);
const HALF_LEFT = new Set(["X/"]);
const HALF_RIGHT = new Set(["/X","./X"]);
const HALF = new Set([...HALF_LEFT, ...HALF_RIGHT]);
const INACTIVE_OVERRIDES = new Set(["arnaldo andrade", "cristina ayala"]);
const APP_VERSION = "WebN6";

let state = null;
let selectedTurnoAdmin = "A";
let selectedFixedIndex = null;
let selectedRot48Index = null;
let longPressTimer = null;
let longPressFired = false;

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
function normalizePersonRecord(p){
  p = {...p};
  p.nombre = toTitleName(cleanName(p.nombre || ""));
  p.estado = p.estado || "Activo";
  if(INACTIVE_OVERRIDES.has(norm(p.nombre))) p.estado = "Inactivo";
  if(Array.isArray(p.asignaciones)){
    p.asignaciones = p.asignaciones.map(a=>({...a}));
  }
  return p;
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
  bindTurnos();
  bindDatos();
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
    state.turnos = normalizeTurnos(state.turnos || {});
    state.personal = (state.personal || []).map(normalizePersonRecord);
    state.planilla ||= {fecha:todayDMY(), dia:"", turno:"", deben:Array(12).fill(""), rows:[]};
    state.app_version = APP_VERSION;
    q("#lockScreen").classList.add("hidden");
    setStatus("Nube sincronizada", "ok");
    renderAll();
    save();
  }catch(err){
    if(err.status === 401){
      q("#lockScreen").classList.remove("hidden");
      setStatus("Bloqueado", "");
      return;
    }
    const cached = localStorage.getItem(STORAGE_KEY);
    if(cached){
      state = JSON.parse(cached);
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

let saveTimer = null;
function save(){
  if(!state) return;
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

function setStatus(text, mode){
  const badge = q("#statusBadge");
  if(!badge) return;
  badge.textContent = text;
  badge.classList.remove("saving","error","ok");
  if(mode) badge.classList.add(mode);
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
  renderPersonal();
  renderTurnos();
  renderVacaciones();
}
function renderStaffDatalist(){
  const dl = q("#staffList");
  dl.innerHTML = "";
  getStaffNames().forEach(n=> dl.append(Object.assign(document.createElement("option"), {value:n})));
}
function getStaffNames(){
  return state.personal.filter(p=> norm(p.estado||"Activo") !== "inactivo").map(p=>p.nombre).filter(Boolean).sort((a,b)=>a.localeCompare(b));
}

function bindPlanilla(){
  q("#btnHideControls").onclick = ()=> document.body.classList.add("focus-table");
  q("#btnShowControls").onclick = ()=> document.body.classList.remove("focus-table");
  q("#btnAddRow").onclick = ()=> { state.planilla.rows.push(blankRow()); save(); renderPlanilla(); };
  q("#btnSaveAll").onclick = ()=> { save(); alert("Guardado localmente."); };
  q("#btnLoadDay").onclick = loadDay;
  q("#btnSort").onclick = ()=> { sortRows(); save(); renderPlanilla(); };
  q("#btnClear").onclick = ()=> { if(confirm("¿Limpiar filas?")){ state.planilla.rows=[]; save(); renderPlanilla(); } };
  q("#btnPrint").onclick = ()=> window.print();
  q("#btnExportJpg").onclick = exportPlanillaJpg;
  q("#planDate").addEventListener("change", ()=>{
    const d = parseAnyDate(q("#planDate").value);
    if(d){ state.planilla.fecha=formatDMY(d); state.planilla.dia=dayName(d); state.planilla.turno=turnoFromDate(d); save(); renderPlanilla(); renderTurnos(); }
  });
  q("#planDay").onchange = e=> { state.planilla.dia=e.target.value; save(); };
  q("#planTurno").onchange = e=> { state.planilla.turno=e.target.value; save(); renderTurnos(); };
}
function blankRow(){ return {nombre:"", servicio:"", cells:Array(12).fill(""), recargo:false}; }

function renderPlanilla(){
  q("#planDate").value = dmyToISO(state.planilla.fecha || todayDMY());
  q("#planDay").value = state.planilla.dia || "";
  q("#planTurno").value = state.planilla.turno || "";

  const head = q("#shiftHead");
  head.innerHTML = "";
  const tr1 = document.createElement("tr");
  tr1.innerHTML = `<th class="puestos name-cell" rowspan="2">PUESTOS:</th>`;
  for(let i=0;i<12;i++){
    tr1.innerHTML += `<th class="hour-cell"><input class="deben" data-i="${i}" value="${esc(state.planilla.deben[i]||"")}"></th>`;
  }
  tr1.innerHTML += `<th class="toplabel" colspan="3">&lt;- Deben haber</th>`;
  const tr2 = document.createElement("tr");
  const hay = calculateHay();
  for(let i=0;i<12;i++) tr2.innerHTML += `<th class="hour-cell">${hay[i]}</th>`;
  tr2.innerHTML += `<th class="toplabel" colspan="3">&lt;- Hay</th>`;
  const tr3 = document.createElement("tr");
  tr3.innerHTML = `<th class="name-cell">Hora:</th>` + HOURS.map(h=>`<th class="hour-cell">${h}</th>`).join("") + `<th class="tiros-cell">Tiros</th><th class="service-cell">Servicio</th><th class="order-cell">Orden</th>`;
  head.append(tr1,tr2,tr3);
  qa(".deben").forEach(inp => inp.onchange = e=>{ state.planilla.deben[Number(inp.dataset.i)] = e.target.value; save(); });

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
    inp.onchange = e=> { const row = state.planilla.rows[Number(inp.dataset.r)]; row.nombre=toTitleName(cleanName(e.target.value)); const p = getPerson(row.nombre); if(p && !row.servicio){ row.servicio=p.servicio||""; row.cells=personMarks(p); } save(); renderPlanilla(); };
    inp.onclick = e=> { if(e.getModifierState && e.getModifierState("Alt")) toggleRecargo(Number(inp.dataset.r)); };
  });
  body.querySelectorAll("select[data-field='servicio']").forEach(sel=> sel.onchange = e=>{ state.planilla.rows[Number(sel.dataset.r)].servicio=e.target.value; save(); renderPlanilla(); });

  body.querySelectorAll(".cell-btn").forEach(td=>{
    td.addEventListener("pointerdown", e=>{
      longPressFired = false;
      if(e.pointerType === "touch" || e.pointerType === "pen"){
        const r=Number(td.dataset.r), c=Number(td.dataset.c);
        longPressTimer = setTimeout(()=>{
          state.planilla.rows[r].cells[c] = "H";
          longPressFired = true;
          save(); renderPlanilla();
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
      save(); renderPlanilla();
    };
  });
  body.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.onclick = ()=>{
      const r = Number(btn.dataset.r);
      const act = btn.dataset.act;
      if(act==="del") state.planilla.rows.splice(r,1);
      if(act==="up" && r>0) [state.planilla.rows[r-1],state.planilla.rows[r]]=[state.planilla.rows[r],state.planilla.rows[r-1]];
      if(act==="down" && r<state.planilla.rows.length-1) [state.planilla.rows[r+1],state.planilla.rows[r]]=[state.planilla.rows[r],state.planilla.rows[r+1]];
      save(); renderPlanilla();
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
function calculateHay(){
  return HOURS.map((_,c)=>{
    let left=0,right=0;
    state.planilla.rows.forEach(row=>{
      const t = token(row.cells[c]);
      if(t === "X"){ left++; right++; }
      else if(HALF_LEFT.has(t)) left++;
      else if(HALF_RIGHT.has(t)) right++;
    });
    return left===right ? String(left) : `${left}/${right}`;
  });
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
  save(); renderAll();
}
function addStandardRows(d){
  const turno = state.planilla.turno;
  const existing = new Set(state.planilla.rows.map(r=>norm(r.nombre)));
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));

  (state.turnos.turnos_24?.[turno] || []).forEach(n=>{
    const name = toTitleName(cleanName(n));
    if(rotNames.has(norm(name))) return;
    if(!existing.has(norm(name))){ state.planilla.rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
  });

  (state.turnos.rotativos_48||[]).forEach(item=>{
    if(rotativo48Present(item,d,turno)){
      const name = toTitleName(cleanName(item.nombre));
      if(!existing.has(norm(name))){ state.planilla.rows.push({nombre:name, servicio:"24hs", cells:Array(12).fill(""), recargo:false}); existing.add(norm(name)); }
    }
  });

  const canes = toTitleName(cleanName(state.turnos.canes_por_turno?.[turno] || ""));
  if(canes && !existing.has(norm(canes))){ state.planilla.rows.push({nombre:canes, servicio:"Canes", cells:Array(12).fill(""), recargo:false}); existing.add(norm(canes)); }

  ["Rondin1","Rondin2","Rondin3"].forEach(n=>{
    state.planilla.rows.push({nombre:n, servicio:"Rondin", cells:marksFromRange("22","07"), recargo:false});
  });
}

function isAbsent(p,d){
  return (p.ausencias||[]).some(a=>{
    const from = parseDMY(a.desde), to=parseDMY(a.hasta);
    return from && to && d>=from && d<=to;
  });
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

function bindPersonal(){
  q("#btnSavePerson").onclick = savePerson;
  q("#btnNewPerson").onclick = clearPersonForm;
}
function renderPersonal(){
  const table = q("#personalTable");
  table.innerHTML = `<tr><th>Nombre</th><th>Servicio</th><th>Estado</th><th>Días</th><th>Horario</th></tr>`;
  state.personal.forEach((p,i)=>{
    const tr=document.createElement("tr");
    if(norm(p.estado)==="inactivo") tr.classList.add("inactive-row");
    tr.innerHTML = `<td>${esc(p.nombre)}</td><td>${esc(p.servicio)}</td><td>${esc(p.estado||"Activo")}</td><td>${esc(p.dias||"")}</td><td>${esc((p.hora_inicio||"")+" a "+(p.hora_fin||""))}</td>`;
    tr.onclick=()=>loadPersonForm(i);
    table.append(tr);
  });
}
function loadPersonForm(i){
  const p=state.personal[i]; q("#personName").value=p.nombre||""; q("#personService").value=p.servicio||"24hs"; q("#personState").value=p.estado||"Activo";
  q("#personDays").value=p.dias||""; q("#personStart").value=p.hora_inicio||""; q("#personEnd").value=p.hora_fin||""; q("#personTurno").value=p.turno_24||"";
  q("#personMode").value=p.modalidad||"Fijo"; q("#rotAStart").value=p.rotativo_a_inicio||""; q("#rotAEnd").value=p.rotativo_a_fin||"";
  q("#rotBStart").value=p.rotativo_b_inicio||""; q("#rotBEnd").value=p.rotativo_b_fin||""; q("#rotBase").value=dmyToISO(p.fecha_base_rotacion||"");
}
function clearPersonForm(){ ["personName","personDays","personStart","personEnd","personTurno","rotAStart","rotAEnd","rotBStart","rotBEnd","rotBase"].forEach(id=>q("#"+id).value=""); q("#personService").value="24hs"; q("#personState").value="Activo"; q("#personMode").value="Fijo"; }
function savePerson(){
  const name=toTitleName(cleanName(q("#personName").value.trim())); if(!name) return alert("Ingresá un nombre.");
  const p = {
    nombre:name, servicio:q("#personService").value, estado:q("#personState").value, dias:q("#personDays").value,
    hora_inicio:q("#personStart").value, hora_fin:q("#personEnd").value, turno_24:q("#personTurno").value,
    modalidad:q("#personMode").value, rotativo_a_inicio:q("#rotAStart").value, rotativo_a_fin:q("#rotAEnd").value,
    rotativo_b_inicio:q("#rotBStart").value, rotativo_b_fin:q("#rotBEnd").value, fecha_base_rotacion:isoToDMY(q("#rotBase").value),
    ausencias: getPerson(name)?.ausencias || []
  };
  p.asignaciones = [{dias:p.dias,hora_inicio:p.hora_inicio,hora_fin:p.hora_fin,servicio:p.servicio,modalidad:p.modalidad,rotativo_a_inicio:p.rotativo_a_inicio,rotativo_a_fin:p.rotativo_a_fin,rotativo_b_inicio:p.rotativo_b_inicio,rotativo_b_fin:p.rotativo_b_fin,fecha_base_rotacion:p.fecha_base_rotacion}];
  const idx=state.personal.findIndex(x=>norm(x.nombre)===norm(name)); if(idx>=0) state.personal[idx]=p; else state.personal.push(p);
  state.personal.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  save(); renderAll(); clearPersonForm();
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

function renderVacaciones(){
  const rows=[];
  state.personal.forEach(p=>(p.ausencias||[]).forEach(a=>{
    if(a.tipo==="Art 214"){
      const hasta=parseDMY(a.hasta);
      rows.push([p.jerarquia||"", p.nombre, a.desde, a.hasta, hasta?formatDMY(addDays(hasta,1)):""]);
    }
  }));
  const t=q("#vacTable"); t.innerHTML="<tr><th>Jerarquía</th><th>Nombre</th><th>Desde</th><th>Hasta</th><th>Presentación</th></tr>";
  rows.forEach(r=>{ const tr=document.createElement("tr"); tr.innerHTML=r.map(x=>`<td>${esc(x)}</td>`).join(""); t.append(tr); });
}
function bindDatos(){
  q("#btnExportBackup").onclick=()=> downloadJson("shift_manager_respaldo.json", state);
  q("#btnExportPersonal").onclick=()=> downloadJson("personal.json", state.personal);
  q("#btnExportTurnos").onclick=()=> downloadJson("turnos.json", state.turnos);
  q("#importFile").onchange=e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{ 
      try{ 
        const data=JSON.parse(reader.result);
        if(Array.isArray(data)){
          state.personal = data.map(normalizePersonRecord);
        }else if(data.personal && data.turnos){
          state = data;
          state.personal = (state.personal||[]).map(normalizePersonRecord);
          state.turnos = normalizeTurnos(state.turnos || {});
        }else if(data.turnos_24 || data.canes_por_turno || data.rotativos_48){
          state.turnos = normalizeTurnos(data);
        }else{
          throw new Error("Formato no reconocido");
        }
        save(); renderAll(); alert("Datos importados.");
      }catch(err){ alert("Archivo inválido: " + err.message); } 
    };
    reader.readAsText(file);
  };
  q("#btnResetData").onclick=()=>{ if(confirm("¿Restaurar datos iniciales?")){ localStorage.removeItem(STORAGE_KEY); state=loadState(); renderAll(); } };
}
function downloadJson(name, data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function exportPlanillaJpg(){
  const hay = calculateHay();
  const scale = 3;
  const colW = [170, ...Array(12).fill(46), 48, 105];
  const rowH = 28, margin = 24, titleH = 42;
  const rows = state.planilla.rows;
  const w = (colW.reduce((a,b)=>a+b,0) + margin*2) * scale;
  const h = (titleH + rowH*3 + rowH*rows.length + margin*2) * scale;
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
  function cell(x,y,w,h,text,fill="#fff",color="#111",bold=false,fs=11){
    ctx.fillStyle=fill; ctx.fillRect(x,y,w,h); ctx.strokeStyle="#111"; ctx.strokeRect(x,y,w,h);
    if(text){
      ctx.fillStyle=color; ctx.font=`${bold?700:400} ${fs}px Segoe UI, Arial`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(String(text), x+w/2, y+h/2);
    }
  }
  cell(x0,y0,colW[0],rowH*2,"PUESTOS:","#fff","#111",true,12);
  let x=x0+colW[0];
  for(let i=0;i<12;i++){ cell(x,y0,colW[i+1],rowH,state.planilla.deben[i]||"",blue2,"#fff",true); x+=colW[i+1]; }
  cell(x,y0,colW[13]+colW[14],rowH,"<- Deben haber",light,"#111",true);
  x=x0+colW[0];
  for(let i=0;i<12;i++){ cell(x,y0+rowH,colW[i+1],rowH,hay[i],blue,"#fff",true); x+=colW[i+1]; }
  cell(x,y0+rowH,colW[13]+colW[14],rowH,"<- Hay",light,"#111",true);
  let y=y0+rowH*2; x=x0;
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

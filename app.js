const HOURS = ["7-9","9-11","11-13","13-15","15-17","17-19","19-21","21-23","23-01","01-03","03-05","05-07"];
const BLOCKS = [[7,9],[9,11],[11,13],[13,15],[15,17],[17,19],[19,21],[21,23],[23,25],[25,27],[27,29],[29,31]];
const DAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEK_DAYS = [
  {key:"lunes",label:"Lunes",short:"Lun"},
  {key:"martes",label:"Martes",short:"Mar"},
  {key:"miercoles",label:"Miércoles",short:"Mié"},
  {key:"jueves",label:"Jueves",short:"Jue"},
  {key:"viernes",label:"Viernes",short:"Vie"},
  {key:"sabado",label:"Sábado",short:"Sáb"},
  {key:"domingo",label:"Domingo",short:"Dom"}
];
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
const APP_VERSION = "WebN15";
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
const MAX_PERSONAL_BACKUPS = 5;
const MAX_SAVED_TABLES = 10;

let state = null;
let selectedTurnoAdmin = "A";
let selectedFixedIndex = null;
let selectedRot48Index = null;
let selectedAbsence = null;
let selectedPersonIndex = null;
let longPressTimer = null;
let longPressFired = false;
let lastContentSnapshot = "";
let saveTimer = null;
let statusTimer = null;
let isRestoringUndo = false;
let lastPlanillaSnapshot = "";
let dashboardInclude24 = false;

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
function emptyDaySchedule(defaultService=""){
  return {
    activo:false,
    servicio:defaultService || "Diario",
    modalidad:"Fijo",
    inicio:"",
    fin:"",
    semana_a_inicio:"",
    semana_a_fin:"",
    semana_b_inicio:"",
    semana_b_fin:""
  };
}
function normalizeDaySchedule(raw, defaultService=""){
  raw = {...(raw || {})};
  const modalidad = norm(raw.modalidad).includes("rotativo") ? "Rotativo semanal" : "Fijo";
  return {
    activo: raw.activo === true || raw.activo === "true",
    servicio: raw.servicio || defaultService || "Diario",
    modalidad,
    inicio: String(raw.inicio || raw.hora_inicio || "").padStart(raw.inicio || raw.hora_inicio ? 2 : 0,"0"),
    fin: String(raw.fin || raw.hora_fin || "").padStart(raw.fin || raw.hora_fin ? 2 : 0,"0"),
    semana_a_inicio: String(raw.semana_a_inicio || raw.rotativo_a_inicio || "").padStart(raw.semana_a_inicio || raw.rotativo_a_inicio ? 2 : 0,"0"),
    semana_a_fin: String(raw.semana_a_fin || raw.rotativo_a_fin || "").padStart(raw.semana_a_fin || raw.rotativo_a_fin ? 2 : 0,"0"),
    semana_b_inicio: String(raw.semana_b_inicio || raw.rotativo_b_inicio || "").padStart(raw.semana_b_inicio || raw.rotativo_b_inicio ? 2 : 0,"0"),
    semana_b_fin: String(raw.semana_b_fin || raw.rotativo_b_fin || "").padStart(raw.semana_b_fin || raw.rotativo_b_fin ? 2 : 0,"0")
  };
}
function weeklyScheduleFromLegacy(p){
  const weekly = Object.fromEntries(WEEK_DAYS.map(d=>[d.key,emptyDaySchedule(p.servicio)]));
  const assignments = Array.isArray(p.asignaciones) && p.asignaciones.length ? p.asignaciones : [{
    dias:p.dias,
    hora_inicio:p.hora_inicio,
    hora_fin:p.hora_fin,
    servicio:p.servicio,
    modalidad:p.modalidad,
    rotativo_a_inicio:p.rotativo_a_inicio,
    rotativo_a_fin:p.rotativo_a_fin,
    rotativo_b_inicio:p.rotativo_b_inicio,
    rotativo_b_fin:p.rotativo_b_fin
  }];
  assignments.forEach(a=>{
    let keys = [...dayTokens(a.dias || "")];
    if(keys.includes("todos")) keys = WEEK_DAYS.map(d=>d.key);
    keys.filter(k=>weekly[k]).forEach(key=>{
      const modalidad = norm(a.modalidad).includes("rotativo") ? "Rotativo semanal" : "Fijo";
      weekly[key] = normalizeDaySchedule({
        activo:true,
        servicio:a.servicio || p.servicio,
        modalidad,
        inicio:a.hora_inicio || p.hora_inicio,
        fin:a.hora_fin || p.hora_fin,
        semana_a_inicio:a.rotativo_a_inicio || p.rotativo_a_inicio,
        semana_a_fin:a.rotativo_a_fin || p.rotativo_a_fin,
        semana_b_inicio:a.rotativo_b_inicio || p.rotativo_b_inicio,
        semana_b_fin:a.rotativo_b_fin || p.rotativo_b_fin
      }, p.servicio);
    });
  });
  return weekly;
}
function normalizeWeeklySchedule(p){
  const source = p.horario_semanal;
  if(source && typeof source === "object" && WEEK_DAYS.some(d=>source[d.key])){
    return Object.fromEntries(WEEK_DAYS.map(d=>[d.key,normalizeDaySchedule(source[d.key],p.servicio)]));
  }
  return weeklyScheduleFromLegacy(p);
}
function weeklyScheduleToAssignments(p){
  return WEEK_DAYS.flatMap(day=>{
    const s = p.horario_semanal?.[day.key];
    if(!s?.activo) return [];
    return [{
      dias:day.label.toUpperCase(),
      hora_inicio:s.modalidad === "Fijo" ? s.inicio : s.semana_a_inicio,
      hora_fin:s.modalidad === "Fijo" ? s.fin : s.semana_a_fin,
      servicio:s.servicio || p.servicio || "",
      modalidad:s.modalidad || "Fijo",
      rotativo_a_inicio:s.semana_a_inicio || "",
      rotativo_a_fin:s.semana_a_fin || "",
      rotativo_b_inicio:s.semana_b_inicio || "",
      rotativo_b_fin:s.semana_b_fin || "",
      fecha_base_rotacion:p.fecha_base_rotacion || "",
      observaciones:p.observaciones || ""
    }];
  });
}
function syncLegacyScheduleFields(p){
  const active = WEEK_DAYS.map(d=>({day:d,s:p.horario_semanal?.[d.key]})).filter(x=>x.s?.activo);
  p.dias = active.map(x=>x.day.label).join(", ").toUpperCase();
  const first = active[0]?.s || emptyDaySchedule(p.servicio);
  p.hora_inicio = first.modalidad === "Fijo" ? first.inicio : first.semana_a_inicio;
  p.hora_fin = first.modalidad === "Fijo" ? first.fin : first.semana_a_fin;
  p.modalidad = active.some(x=>x.s.modalidad === "Rotativo semanal") ? "Rotativo semanal" : "Fijo";
  p.rotativo_a_inicio = first.semana_a_inicio || "";
  p.rotativo_a_fin = first.semana_a_fin || "";
  p.rotativo_b_inicio = first.semana_b_inicio || "";
  p.rotativo_b_fin = first.semana_b_fin || "";
  p.asignaciones = weeklyScheduleToAssignments(p);
  return p;
}
function normalizePersonRecord(p){
  p = {...p};
  p.nombre = toTitleName(cleanName(p.nombre || ""));
  p.estado = p.estado || "Activo";
  if(INACTIVE_OVERRIDES.has(norm(p.nombre))) p.estado = "Inactivo";
  p.horario_semanal = normalizeWeeklySchedule(p);
  p.ausencias = Array.isArray(p.ausencias) ? p.ausencias.map(normalizeAbsenceRecord) : [];
  return syncLegacyScheduleFields(p);
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

function cleanPlanillaForDate(date=new Date()){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    fecha:formatDMY(d),
    dia:dayName(d),
    turno:turnoFromDate(d),
    deben:Array(12).fill(""),
    rows:[]
  };
}
function hasMeaningfulPlanilla(planilla){
  if(!planilla) return false;
  const meaningfulRow=(planilla.rows||[]).some(row=>
    String(row.nombre||"").trim() || String(row.servicio||"").trim() ||
    (row.cells||[]).some(v=>String(v||"").trim())
  );
  return meaningfulRow || (planilla.deben||[]).some(v=>String(v||"").trim());
}
function prepareSessionPlanilla(){
  const previous = clone(state.planilla || cleanPlanillaForDate(new Date()));
  if(!state.last_planilla_draft && hasMeaningfulPlanilla(previous)){
    state.last_planilla_draft = {saved_at:new Date().toISOString(), planilla:previous};
  }
  state.planilla = cleanPlanillaForDate(new Date());
  lastPlanillaSnapshot = JSON.stringify(state.planilla);
}
function persistentState(){
  const payload = clone(state);
  payload.planilla = cleanPlanillaForDate(new Date());
  return payload;
}
function mergeLocalRecoveryData(){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw) return;
  try{
    const cached=JSON.parse(raw);
    const localDraft=cached.last_planilla_draft?.planilla
      ? cached.last_planilla_draft
      : hasMeaningfulPlanilla(cached.planilla)
        ? {saved_at:cached.updated_at || new Date().toISOString(),planilla:cached.planilla}
        : null;
    const cloudTime=state.last_planilla_draft?.saved_at ? new Date(state.last_planilla_draft.saved_at).getTime() : 0;
    const localTime=localDraft?.saved_at ? new Date(localDraft.saved_at).getTime() : 0;
    if(localDraft?.planilla && (!state.last_planilla_draft || (localTime>0 && localTime>=cloudTime))) state.last_planilla_draft=clone(localDraft);
    const cloudBackupTime=state.personal_backups_updated_at ? new Date(state.personal_backups_updated_at).getTime() : 0;
    const localBackupTime=cached.personal_backups_updated_at ? new Date(cached.personal_backups_updated_at).getTime() : 0;
    if(localBackupTime>cloudBackupTime){
      state.personal_backups=(cached.personal_backups||[]).slice(0,MAX_PERSONAL_BACKUPS);
      state.personal_backups_updated_at=cached.personal_backups_updated_at;
    }
    const cloudTablesTime=state.saved_tables_updated_at ? new Date(state.saved_tables_updated_at).getTime() : 0;
    const localTablesTime=cached.saved_tables_updated_at ? new Date(cached.saved_tables_updated_at).getTime() : 0;
    if(localTablesTime>cloudTablesTime){
      state.saved_tables=(cached.saved_tables||[]).slice(0,MAX_SAVED_TABLES);
      state.saved_tables_updated_at=cached.saved_tables_updated_at;
    }
  }catch{}
}
function capturePlanillaDraftIfChanged(options={}){
  const current = JSON.stringify(state.planilla || {});
  if(lastPlanillaSnapshot && current !== lastPlanillaSnapshot && !options.skipPlanillaDraft && hasMeaningfulPlanilla(state.planilla)){
    state.last_planilla_draft = {
      saved_at:new Date().toISOString(),
      planilla:clone(state.planilla)
    };
  }
  lastPlanillaSnapshot = current;
}
function recoverLastPlanilla(){
  const draft = state.last_planilla_draft;
  if(!draft?.planilla) return alert("Todavía no hay una tabla para recuperar.");
  const errors = validatePlanillaData(draft.planilla);
  if(errors.length) return showValidationErrors(errors,"La última tabla necesita correcciones");
  const when = draft.saved_at ? new Date(draft.saved_at).toLocaleString() : "fecha desconocida";
  if(!confirm(`¿Recuperar la última tabla guardada (${when})? La tabla limpia actual será reemplazada.`)) return;
  state.planilla = clone(draft.planilla);
  lastPlanillaSnapshot = JSON.stringify(state.planilla);
  pushHistory("Recuperar última tabla de trabajo");
  save({silent:true, skipPlanillaDraft:true});
  renderAll();
}
function renderLastDraftInfo(){
  const el=q("#lastDraftInfo");
  const btn=q("#btnRecoverLastTable");
  if(!el || !btn) return;
  const draft=state.last_planilla_draft;
  if(!draft?.planilla){
    el.textContent="No hay una tabla anterior guardada.";
    btn.disabled=true;
    return;
  }
  const date=draft.planilla.fecha || "sin fecha";
  const when=draft.saved_at ? new Date(draft.saved_at).toLocaleString() : "sin hora";
  el.textContent=`Última tabla recuperable: ${date} · guardada ${when}`;
  btn.disabled=false;
}
function isReadableText(value){
  return !/[\u0000-\u001f\u007f\ufffd]/.test(String(value||""));
}
function isStrictHour(value){
  const v=String(value||"").trim();
  return /^(?:[01]?\d|2[0-3])(?::[0-5]\d)?$/.test(v);
}
function duplicateNames(items){
  const seen=new Map(), duplicates=new Set();
  items.forEach(value=>{
    const name=toTitleName(cleanName(value));
    if(!name) return;
    const key=norm(name);
    if(seen.has(key)) duplicates.add(name); else seen.set(key,name);
  });
  return [...duplicates].sort((a,b)=>a.localeCompare(b));
}
function validateWeeklyScheduleDetailed(weekly, personName="Personal", baseDate=""){
  const errors=[];
  let hasRotative=false;
  for(const day of WEEK_DAYS){
    const s=weekly?.[day.key];
    if(!s?.activo) continue;
    if(!SERVICES.some(service=>serviceKey(service)===serviceKey(s.servicio))) errors.push(`${personName}: servicio inválido en ${day.label}.`);
    if(["24hs","canes"].includes(serviceKey(s.servicio))) continue;
    if(s.modalidad === "Rotativo semanal"){
      hasRotative=true;
      const fields=[
        [s.semana_a_inicio,"inicio Semana A"],[s.semana_a_fin,"fin Semana A"],
        [s.semana_b_inicio,"inicio Semana B"],[s.semana_b_fin,"fin Semana B"]
      ];
      fields.forEach(([value,label])=>{ if(!isStrictHour(value)) errors.push(`${personName}: ${label} inválido en ${day.label}.`); });
      if(isStrictHour(s.semana_a_inicio)&&isStrictHour(s.semana_a_fin)&&parseHour(s.semana_a_inicio)===parseHour(s.semana_a_fin)) errors.push(`${personName}: Semana A inicia y termina a la misma hora en ${day.label}.`);
      if(isStrictHour(s.semana_b_inicio)&&isStrictHour(s.semana_b_fin)&&parseHour(s.semana_b_inicio)===parseHour(s.semana_b_fin)) errors.push(`${personName}: Semana B inicia y termina a la misma hora en ${day.label}.`);
    }else{
      if(!isStrictHour(s.inicio)) errors.push(`${personName}: hora de inicio inválida en ${day.label}.`);
      if(!isStrictHour(s.fin)) errors.push(`${personName}: hora de fin inválida en ${day.label}.`);
      if(isStrictHour(s.inicio)&&isStrictHour(s.fin)&&parseHour(s.inicio)===parseHour(s.fin)) errors.push(`${personName}: el horario inicia y termina a la misma hora en ${day.label}.`);
    }
  }
  if(hasRotative && !parseDMY(baseDate)) errors.push(`${personName}: falta una fecha base válida para la rotación semanal.`);
  return errors;
}
function validatePersonRecordDetailed(person,index=-1){
  const errors=[];
  const label=person.nombre || `Registro ${index+1}`;
  if(!String(person.nombre||"").trim()) errors.push(`Personal ${index+1}: falta el nombre.`);
  if(!isReadableText([person.nombre,person.jerarquia,person.legajo,person.situacion,person.observaciones].join(" "))) errors.push(`${label}: contiene caracteres ilegibles o inválidos.`);
  if(person.legajo && !/^[0-9.\-/]+$/.test(String(person.legajo).trim())) errors.push(`${label}: el legajo contiene caracteres inválidos.`);
  if(person.estado && !["activo","inactivo"].includes(norm(person.estado))) errors.push(`${label}: estado inválido.`);
  errors.push(...validateWeeklyScheduleDetailed(person.horario_semanal||{},label,person.fecha_base_rotacion||""));
  (person.ausencias||[]).forEach((raw,aIndex)=>{
    const a=normalizeAbsenceRecord(raw);
    const from=parseDMY(a.desde), to=parseDMY(a.hasta);
    if(!from) errors.push(`${label}: licencia ${aIndex+1} con fecha de inicio inválida.`);
    if(a.tipo==="Art 214" && !to) errors.push(`${label}: Art. 214 sin fecha de finalización válida.`);
    if(a.tipo==="Carpeta Medica" && !String(a.articulo||"").trim()) errors.push(`${label}: Carpeta Médica sin artículo o motivo.`);
    if(to && from && to<from) errors.push(`${label}: una licencia termina antes de comenzar.`);
  });
  return errors;
}
function validatePersonalCatalog(personal=state.personal){
  const errors=[];
  duplicateNames((personal||[]).map(p=>p.nombre)).forEach(name=>errors.push(`Personal repetido en la nómina: ${name}.`));
  (personal||[]).forEach((p,i)=>errors.push(...validatePersonRecordDetailed(p,i)));
  return errors;
}
function validateTurnosData(turnos=state.turnos){
  const errors=[];
  const fixedOccurrences=new Map();
  for(const turno of TURNO_SEQ){
    const names=(turnos?.turnos_24?.[turno]||[]).map(n=>toTitleName(cleanName(n))).filter(Boolean);
    duplicateNames(names).forEach(name=>errors.push(`Turno ${turno}: ${name} está repetido.`));
    names.forEach(name=>{
      const key=norm(name); const previous=fixedOccurrences.get(key);
      if(previous && previous!==turno) errors.push(`${name} figura en los turnos fijos ${previous} y ${turno}.`);
      else fixedOccurrences.set(key,turno);
    });
  }
  const rotatives=turnos?.rotativos_48||[];
  duplicateNames(rotatives.map(r=>r.nombre)).forEach(name=>errors.push(`Rotativo 48 repetido: ${name}.`));
  rotatives.forEach((r,i)=>{
    const label=r.nombre||`Rotativo ${i+1}`;
    if(!r.nombre) errors.push(`Rotativo 48 ${i+1}: falta el nombre.`);
    if(!Array.isArray(r.turnos)||r.turnos.length!==2||r.turnos.some(t=>!TURNO_SEQ.includes(t))) errors.push(`${label}: combinación de turnos inválida.`);
    if(!parseDMY(r.fecha_presente)) errors.push(`${label}: fecha presente inválida.`);
  });
  const canes=TURNO_SEQ.map(t=>turnos?.canes_por_turno?.[t]).filter(Boolean);
  duplicateNames(canes).forEach(name=>errors.push(`Canes repetido en más de un turno: ${name}.`));
  const roles=new Map();
  const addRole=(name,role)=>{
    const clean=toTitleName(cleanName(name)); if(!clean) return;
    const key=norm(clean); const item=roles.get(key)||{name:clean,roles:[]}; item.roles.push(role); roles.set(key,item);
  };
  for(const turno of TURNO_SEQ){
    (turnos?.turnos_24?.[turno]||[]).forEach(name=>addRole(name,`turno fijo ${turno}`));
    addRole(turnos?.canes_por_turno?.[turno],`Canes ${turno}`);
  }
  rotatives.forEach(r=>addRole(r.nombre,"rotativo 48 h"));
  roles.forEach(item=>{ if(item.roles.length>1) errors.push(`${item.name} aparece en más de una asignación operativa: ${item.roles.join(", ")}.`); });
  return [...new Set(errors)];
}
function validatePlanillaData(planilla=state.planilla){
  const errors=[];
  const date=parseDMY(planilla?.fecha);
  if(!date) errors.push("Planilla: la fecha es inválida. Usá DD/MM/AAAA.");
  if(date && planilla.dia && norm(planilla.dia)!==norm(dayName(date))) errors.push(`Planilla: el día ${planilla.dia} no coincide con la fecha ${planilla.fecha}.`);
  if(planilla.turno && !TURNO_SEQ.includes(planilla.turno)) errors.push("Planilla: turno 24 inválido.");
  (planilla.deben||[]).forEach((value,i)=>{
    const v=String(value||"").trim();
    if(v && !/^\d+(?:[.,]\d+)?$/.test(v)) errors.push(`Deben haber ${HOURS[i]}: ingresá solamente un número.`);
  });
  const names=(planilla.rows||[]).map(r=>r.nombre).filter(Boolean);
  duplicateNames(names).forEach(name=>errors.push(`Planilla: ${name} aparece más de una vez.`));
  (planilla.rows||[]).forEach((row,i)=>{
    const rowNo=i+1, name=String(row.nombre||"").trim();
    const hasData=!!name || !!row.servicio || (row.cells||[]).some(v=>String(v||"").trim());
    if(hasData && !name) errors.push(`Planilla: la fila ${rowNo} no tiene nombre.`);
    if(name && !isReadableText(name)) errors.push(`Planilla: la fila ${rowNo} contiene un nombre ilegible.`);
    if(name && !SERVICES.includes(row.servicio)) errors.push(`Planilla: ${name} tiene un servicio inválido.`);
    (row.cells||[]).forEach((value,c)=>{
      if(!["","X","X/","/X","H","./X"].includes(token(value))) errors.push(`Planilla: ${name||"fila "+rowNo}, ${HOURS[c]} contiene una marca inválida.`);
    });
  });
  return [...new Set(errors)];
}
function validateMasterData(){ return [...validatePersonalCatalog(),...validateTurnosData()]; }
function validateAllData(){ return [...validateMasterData(),...validatePlanillaData()]; }
function showValidationErrors(errors,title="Correcciones necesarias"){
  const unique=[...new Set((errors||[]).filter(Boolean))];
  if(!unique.length) return false;
  q("#validationModalTitle").textContent=title;
  q("#validationModalSubtitle").textContent=`Se encontraron ${unique.length} problema${unique.length===1?"":"s"}. Corregilos antes de continuar.`;
  q("#validationList").innerHTML=unique.map((error,i)=>`<li><strong>${i+1}.</strong> ${esc(error)}</li>`).join("");
  q("#validationModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  return true;
}
function closeValidationModal(){
  q("#validationModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function loadState(){
  const saved = localStorage.getItem(STORAGE_KEY);
  if(saved){
    try { 
      const parsed = JSON.parse(saved);
      parsed.personal = (parsed.personal || []).map(normalizePersonRecord);
      return parsed;
    } catch {}
  }
  return {
    personal: clone(window.SEED_PERSONAL || []).map(normalizePersonRecord),
    turnos: normalizeTurnos(clone(window.SEED_TURNOS || {})),
    planilla: cleanPlanillaForDate(new Date()),
    last_planilla_draft:null,
    personal_backups:[],
    saved_tables:[],
    saved_tables_updated_at:""
  };
}
function normalizeTurnos(t){
  t.turnos_24 ||= {A:[],B:[],C:[],D:[]};
  t.canes_por_turno ||= {A:"",B:"",C:"",D:""};
  t.rotativos_48 ||= [];
  for(const k of ["A","B","C","D"]){
    const seen = new Set();
    t.turnos_24[k] = (t.turnos_24[k] || [])
      .map(n=>toTitleName(cleanName(n)))
      .filter(n=>n && !seen.has(norm(n)) && seen.add(norm(n)));
    t.canes_por_turno[k] = toTitleName(cleanName(t.canes_por_turno[k] || ""));
  }
  const seenRot = new Set();
  t.rotativos_48 = t.rotativos_48.map(r=>({
    nombre: toTitleName(cleanName(r.nombre||"")),
    turnos: Array.isArray(r.turnos) ? r.turnos.slice(0,2) : String(r.turnos||"C-D").split("-").slice(0,2),
    fecha_presente: r.fecha_presente || "",
    activo: r.activo !== false
  })).filter(r=>r.nombre && !seenRot.has(norm(r.nombre)) && seenRot.add(norm(r.nombre)));
  // Los rotativos se administran únicamente en la lista de 48 h para evitar filas repetidas.
  const rotNames = new Set(t.rotativos_48.map(r=>norm(r.nombre)));
  for(const k of ["A","B","C","D"]) t.turnos_24[k] = t.turnos_24[k].filter(n=>!rotNames.has(norm(n)));
  return t;
}
async function init(){
  bindTheme();
  fillSelects();
  bindTabs();
  bindPlanilla();
  bindPersonal();
  bindLicenses();
  bindTurnos();
  bindDatos();
  bindSavedTables();
  bindDashboard();
  bindDailyView();
  bindPin();
  q("#btnCloseValidationModal")?.addEventListener("click",closeValidationModal);
  q("#validationModal")?.addEventListener("click",event=>{ if(event.target.id==="validationModal") closeValidationModal(); });
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
    mergeLocalRecoveryData();
    prepareSessionPlanilla();
    q("#lockScreen").classList.add("hidden");
    setStatus("Nube sincronizada", "ok");
    lastContentSnapshot = contentSnapshot();
    renderAll();
    save({silent:true, skipPlanillaDraft:true});
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
      prepareSessionPlanilla();
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
  state.personal_backups = (state.personal_backups || []).slice(0, MAX_PERSONAL_BACKUPS);
  state.personal_backups_updated_at ||= "";
  state.saved_tables = (state.saved_tables || []).filter(item=>item?.id && item?.planilla).slice(0, MAX_SAVED_TABLES);
  state.saved_tables_updated_at ||= "";
  state.last_planilla_draft ||= null;
  state.backup_settings ||= {frequency:"daily", last_auto_backup_at:""};
  state.app_version = APP_VERSION;
}
function contentState(){
  return {
    personal: state.personal || [],
    turnos: state.turnos || {},
    planilla: state.planilla || {},
    last_planilla_draft: state.last_planilla_draft || null,
    personal_backups: state.personal_backups || [],
    personal_backups_updated_at: state.personal_backups_updated_at || "",
    saved_tables: state.saved_tables || [],
    saved_tables_updated_at: state.saved_tables_updated_at || "",
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
  capturePlanillaDraftIfChanged(options);
  registerContentChange(options);
  maybeAutoBackup();
  lastContentSnapshot = contentSnapshot();
  const payload = persistentState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  setStatus("Guardando...", "saving");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async ()=>{
    try{
      const res = await fetch("/api/state", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
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
  state.planilla = data.planilla || cleanPlanillaForDate(new Date());
  state.last_planilla_draft = data.last_planilla_draft || state.last_planilla_draft || null;
  state.personal_backups = (data.personal_backups || state.personal_backups || []).slice(0,MAX_PERSONAL_BACKUPS);
  state.personal_backups_updated_at = data.personal_backups_updated_at || state.personal_backups_updated_at || "";
  state.saved_tables = (data.saved_tables || state.saved_tables || []).slice(0,MAX_SAVED_TABLES);
  state.saved_tables_updated_at = data.saved_tables_updated_at || state.saved_tables_updated_at || "";
  state.backup_settings = data.backup_settings || state.backup_settings || {frequency:"daily", last_auto_backup_at:""};
  lastPlanillaSnapshot = JSON.stringify(state.planilla);
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
  const toast = q("#statusToast");
  if(!toast) return;
  clearTimeout(statusTimer);
  toast.textContent = text;
  toast.classList.remove("hidden","saving","error","ok","show");
  if(mode) toast.classList.add(mode);
  requestAnimationFrame(()=>toast.classList.add("show"));
  const delay = mode === "error" ? 4800 : mode === "saving" ? 1200 : 1800;
  statusTimer = setTimeout(()=>{
    toast.classList.remove("show");
    setTimeout(()=>toast.classList.add("hidden"),180);
  },delay);
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
  
}
function q(sel){ return document.querySelector(sel); }
function qa(sel){ return [...document.querySelectorAll(sel)]; }

const THEME_STORAGE_KEY = "shift-manager-theme";
function preferredTheme(){
  try{
    const saved=localStorage.getItem(THEME_STORAGE_KEY);
    if(saved === "light" || saved === "dark") return saved;
  }catch(_){ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme){
  const next=theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme=next;
  const button=q("#themeToggle");
  const icon=q("#themeIcon");
  if(icon) icon.textContent=next === "dark" ? "☀" : "☾";
  if(button){
    const label=next === "dark" ? "Activar modo claro" : "Activar modo oscuro";
    button.setAttribute("aria-label",label);
    button.title=label;
  }
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content=next === "dark" ? "#0b1220" : "#f4f7fb";
}
function bindTheme(){
  applyTheme(preferredTheme());
  q("#themeToggle")?.addEventListener("click",()=>{
    const next=document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try{ localStorage.setItem(THEME_STORAGE_KEY,next); }catch(_){ }
    applyTheme(next);
  });
}

function activateTab(tabName){
  qa(".tab").forEach(button=>button.classList.toggle("active",button.dataset.tab===tabName));
  qa(".panel").forEach(panel=>panel.classList.toggle("active",panel.id===`tab-${tabName}`));
}
function bindTabs(){
  qa(".tab").forEach(btn=>btn.addEventListener("click",()=>activateTab(btn.dataset.tab)));
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
  renderSavedTables();
  renderLastDraftInfo();
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


function savedTableDateText(item){
  const date=item?.planilla?.fecha || "Sin fecha";
  const day=item?.planilla?.dia || "";
  return day ? `${day} · ${date}` : date;
}
function saveCurrentTableCopy(origin="Guardar tabla"){
  const errors=validateAllData();
  if(!hasMeaningfulPlanilla(state.planilla)) errors.unshift("La tabla está vacía. Cargá personal o completá datos antes de guardarla.");
  if(showValidationErrors(errors,"No se pudo guardar la tabla")) return false;
  const now=new Date().toISOString();
  const entry={
    id:`tabla-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    saved_at:now,
    planilla:clone(state.planilla)
  };
  state.saved_tables ||= [];
  state.saved_tables.unshift(entry);
  state.saved_tables=state.saved_tables.slice(0,MAX_SAVED_TABLES);
  state.saved_tables_updated_at=now;
  state.last_planilla_draft={saved_at:now,planilla:clone(state.planilla)};
  lastPlanillaSnapshot=JSON.stringify(state.planilla);
  save({action:`Guardar tabla ficticia ${state.planilla.fecha || ""}`,skipPlanillaDraft:true});
  renderSavedTables();
  renderLastDraftInfo();
  return true;
}
function openSavedTable(id){
  const entry=(state.saved_tables||[]).find(item=>item.id===id);
  if(!entry) return showValidationErrors(["La tabla seleccionada ya no existe."],"No se pudo abrir");
  const errors=validatePlanillaData(entry.planilla);
  if(showValidationErrors(errors,"La tabla guardada necesita correcciones")) return;
  const label=savedTableDateText(entry);
  if(hasMeaningfulPlanilla(state.planilla) && !confirm(`¿Abrir la tabla ${label}? La tabla actual será reemplazada, pero seguirá disponible en Deshacer si fue modificada.`)) return;
  state.planilla=clone(entry.planilla);
  state.last_planilla_draft={saved_at:new Date().toISOString(),planilla:clone(entry.planilla)};
  lastPlanillaSnapshot=JSON.stringify(state.planilla);
  save({action:`Abrir tabla guardada ${entry.planilla.fecha || ""}`,skipPlanillaDraft:true});
  activateTab("planilla");
  renderAll();
}
function deleteSavedTable(id){
  const entry=(state.saved_tables||[]).find(item=>item.id===id);
  if(!entry) return;
  const when=new Date(entry.saved_at).toLocaleString("es-AR");
  if(!confirm(`¿Borrar la tabla ${savedTableDateText(entry)} guardada el ${when}?`)) return;
  state.saved_tables=state.saved_tables.filter(item=>item.id!==id);
  state.saved_tables_updated_at=new Date().toISOString();
  save({action:`Borrar tabla guardada ${entry.planilla?.fecha || ""}`,skipPlanillaDraft:true});
  renderSavedTables();
}
function bindSavedTables(){
  q("#btnSaveCurrentTable")?.addEventListener("click",()=>saveCurrentTableCopy("Pestaña Tablas guardadas"));
}
function renderSavedTables(){
  const table=q("#savedTablesTable");
  const summary=q("#savedTablesSummary");
  if(!table || !summary || !state) return;
  const list=(state.saved_tables||[]).slice(0,MAX_SAVED_TABLES);
  summary.innerHTML=`<strong>${list.length} de ${MAX_SAVED_TABLES}</strong><span>espacios utilizados</span>`;
  table.innerHTML=`<tr><th>Tabla</th><th>Guardada</th><th>Turno</th><th>Filas</th><th>Acciones</th></tr>`;
  if(!list.length){
    table.innerHTML+=`<tr><td colspan="5" class="empty-cell">Todavía no hay tablas guardadas.</td></tr>`;
    return;
  }
  list.forEach((entry,index)=>{
    const planilla=entry.planilla||{};
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${esc(savedTableDateText(entry))}</strong><small class="saved-table-copy">Copia ${list.length-index}</small></td><td>${esc(new Date(entry.saved_at).toLocaleString("es-AR"))}</td><td>${esc(planilla.turno||"—")}</td><td>${(planilla.rows||[]).length}</td><td class="saved-table-actions"><button class="primary" data-st-action="open" data-st-id="${entry.id}">Abrir</button><button class="danger" data-st-action="delete" data-st-id="${entry.id}">Borrar</button></td>`;
    table.append(tr);
  });
  table.querySelectorAll("button[data-st-action]").forEach(button=>button.addEventListener("click",()=>{
    if(button.dataset.stAction==="open") openSavedTable(button.dataset.stId);
    if(button.dataset.stAction==="delete") deleteSavedTable(button.dataset.stId);
  }));
}

function bindPlanilla(){
  q("#btnHideControls").onclick = ()=> document.body.classList.add("focus-table");
  q("#btnShowControls").onclick = ()=> document.body.classList.remove("focus-table");
  q("#btnFullscreen").onclick = toggleFullscreen;
  q("#btnUndoTop").onclick = undoLastChange;
  window.addEventListener("beforeprint", ()=>{ if(!hasDebens()) document.body.classList.add("hide-empty-deben-print"); });
  window.addEventListener("afterprint", ()=> document.body.classList.remove("hide-empty-deben-print"));
  q("#btnAddRow").onclick = ()=> { state.planilla.rows.push(blankRow()); save({action:"Agregar fila"}); renderPlanilla(); };
  q("#btnSaveAll").onclick = ()=> saveCurrentTableCopy("Botón Guardar");
  q("#btnLoadDay").onclick = loadDay;
  q("#btnRecoverLastTable").onclick = recoverLastPlanilla;
  q("#btnClear").onclick = ()=> { if(confirm("¿Limpiar filas?")){ state.planilla.rows=[]; save({action:"Limpiar filas"}); renderAll(); } };
  q("#btnPrint").onclick = ()=> { const errors=validatePlanillaData(); if(showValidationErrors(errors,"Corregí la planilla antes de imprimir")) return; window.print(); };
  q("#btnExportJpg").onclick = ()=> { const errors=validatePlanillaData(); if(showValidationErrors(errors,"Corregí la planilla antes de exportar")) return; exportPlanillaJpg(); };
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
  qa(".deben").forEach(inp => inp.onchange = e=>{
    const value=e.target.value.trim();
    if(value && !/^\d+(?:[.,]\d+)?$/.test(value)){
      e.target.value=state.planilla.deben[Number(inp.dataset.i)]||"";
      return showValidationErrors([`Deben haber ${HOURS[Number(inp.dataset.i)]}: ingresá solamente un número.`]);
    }
    state.planilla.deben[Number(inp.dataset.i)] = value;
    save({action:"Modificar Deben haber"}); renderDashboard(); renderPlanilla();
  });

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
    inp.onchange = e=> {
      const r=Number(inp.dataset.r), row=state.planilla.rows[r], previous=row.nombre;
      const next=toTitleName(cleanName(e.target.value));
      if(!isReadableText(next)){
        e.target.value=previous;
        return showValidationErrors(["El nombre contiene caracteres ilegibles o inválidos."]);
      }
      if(next && state.planilla.rows.some((other,i)=>i!==r && norm(other.nombre)===norm(next))){
        e.target.value=previous;
        return showValidationErrors([`${next} ya está cargado en la planilla.`],"Personal repetido");
      }
      row.nombre=next;
      const p = getPerson(row.nombre); if(p && !row.servicio){ row.servicio=p.servicio||""; row.cells=personMarks(p); }
      save({action:"Modificar nombre en planilla"}); renderAll();
    };
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
  renderLastDraftInfo();
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

function formatTime(v){
  const h=parseHour(v);
  return h==null ? "--:--" : `${pad(h)}:00`;
}
function assignmentScheduleMeta(a,p,d){
  const range = assignmentRange(a,p,d);
  const service = serviceForAssignment(a,p);
  if(range.fullDay) return {text:"24 horas",start:"07",end:"07",fullDay:true,week:range.week||"",rotationType:""};
  const prefix = range.week ? `Semana ${range.week} · ` : "";
  return {
    text:`${prefix}${formatTime(range.start)} a ${formatTime(range.end)}`,
    start:range.start,
    end:range.end,
    fullDay:false,
    week:range.week||"",
    rotationWeek:range.week||"",
    rotationType:range.week ? "Rotativo semanal" : "",
    service
  };
}
function standardRow(name,service,cells,meta={}){
  return {
    nombre:name,
    servicio:service,
    cells,
    recargo:false,
    schedule_text:meta.text||"",
    range_start:meta.start||"",
    range_end:meta.end||"",
    full_day:!!meta.fullDay,
    source:meta.source||"",
    rotation_week:meta.rotationWeek||meta.week||"",
    rotation_type:meta.rotationType||""
  };
}

function loadDay(){
  const masterErrors=validateMasterData();
  if(showValidationErrors(masterErrors,"Corregí los datos antes de cargar la tabla")) return;
  const d = parseDMY(state.planilla.fecha);
  if(!d) return showValidationErrors(["Fecha inválida. Usá DD/MM/AAAA."],"No se pudo cargar la tabla");
  const previous=clone(state.planilla);
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
      const meta = assignmentScheduleMeta(a,p,d);
      state.planilla.rows.push(standardRow(p.nombre,serviceForAssignment(a,p),marksForAssignment(a,p),meta));
    });
  });
  addStandardRows(d);
  sortRows();
  const planErrors=validatePlanillaData();
  if(planErrors.length){
    state.planilla=previous;
    lastPlanillaSnapshot=JSON.stringify(state.planilla);
    renderAll();
    return showValidationErrors(planErrors,"La carga generó conflictos");
  }
  save({action:"Cargar personal del día"}); renderAll();
}
function addStandardRows(d){
  const turno = state.planilla.turno;
  const existing = new Set(state.planilla.rows.map(r=>norm(r.nombre)));
  const rotNames = new Set((state.turnos.rotativos_48||[]).map(x=>norm(x.nombre)));

  (state.turnos.turnos_24?.[turno] || []).forEach(n=>{
    const name = toTitleName(cleanName(n));
    if(rotNames.has(norm(name)) || isPersonUnavailableByName(name,d)) return;
    if(!existing.has(norm(name))){ state.planilla.rows.push(standardRow(name,"24hs",Array(12).fill(""),{text:`Turno ${turno} · 24 horas`,start:"07",end:"07",fullDay:true,source:"Turno fijo"})); existing.add(norm(name)); }
  });

  (state.turnos.rotativos_48||[]).forEach(item=>{
    if(rotativo48Present(item,d,turno)){
      const name = toTitleName(cleanName(item.nombre));
      if(isPersonUnavailableByName(name,d)) return;
      if(!existing.has(norm(name))){ state.planilla.rows.push(standardRow(name,"24hs",Array(12).fill(""),{text:`Turno ${turno} · Rotativo 48 · 24 horas`,start:"07",end:"07",fullDay:true,source:"Rotativo 48",rotationType:"Rotativo 48"})); existing.add(norm(name)); }
    }
  });

  const canes = toTitleName(cleanName(state.turnos.canes_por_turno?.[turno] || ""));
  if(canes && !isPersonUnavailableByName(canes,d) && !existing.has(norm(canes))){ state.planilla.rows.push(standardRow(canes,"Canes",Array(12).fill(""),{text:`Turno ${turno} · Canes · 24 horas`,start:"07",end:"07",fullDay:true,source:"Canes"})); existing.add(norm(canes)); }

  ["Rondin1","Rondin2","Rondin3"].forEach(n=>{
    state.planilla.rows.push(standardRow(n,"Rondin",marksFromRange("22","07"),{text:"22:00 a 07:00",start:"22",end:"07",source:"Rondín"}));
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
        const meta = assignmentScheduleMeta(a,p,d);
        rows.push(standardRow(p.nombre,serviceForAssignment(a,p),marksForAssignment(a,p),meta));
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
    if(!existing.has(norm(name))){ rows.push(standardRow(name,"24hs",Array(12).fill(""),{text:`Turno ${turno} · 24 horas`,start:"07",end:"07",fullDay:true,source:"Turno fijo"})); existing.add(norm(name)); }
  });
  (state.turnos.rotativos_48||[]).forEach(item=>{
    if(rotativo48Present(item,d,turno)){
      const name = toTitleName(cleanName(item.nombre));
      if(isPersonUnavailableByName(name,d)) return;
      if(!existing.has(norm(name))){ rows.push(standardRow(name,"24hs",Array(12).fill(""),{text:`Turno ${turno} · Rotativo 48 · 24 horas`,start:"07",end:"07",fullDay:true,source:"Rotativo 48",rotationType:"Rotativo 48"})); existing.add(norm(name)); }
    }
  });
  const canes = toTitleName(cleanName(state.turnos.canes_por_turno?.[turno] || ""));
  if(canes && !isPersonUnavailableByName(canes,d) && !existing.has(norm(canes))){ rows.push(standardRow(canes,"Canes",Array(12).fill(""),{text:`Turno ${turno} · Canes · 24 horas`,start:"07",end:"07",fullDay:true,source:"Canes"})); existing.add(norm(canes)); }
  ["Rondin1","Rondin2","Rondin3"].forEach(n=>rows.push(standardRow(n,"Rondin",marksFromRange("22","07"),{text:"22:00 a 07:00",start:"22",end:"07",source:"Rondín"})));
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
function dayKeyFromDate(d){ return norm(dayName(d)); }
function scheduleForPersonDate(p,d){
  if(!d) return null;
  const key = dayKeyFromDate(d);
  const s = p.horario_semanal?.[key];
  if(!s?.activo) return null;
  return {
    dias:dayName(d),
    servicio:s.servicio || p.servicio || "",
    modalidad:s.modalidad || "Fijo",
    hora_inicio:s.inicio || "",
    hora_fin:s.fin || "",
    rotativo_a_inicio:s.semana_a_inicio || "",
    rotativo_a_fin:s.semana_a_fin || "",
    rotativo_b_inicio:s.semana_b_inicio || "",
    rotativo_b_fin:s.semana_b_fin || "",
    fecha_base_rotacion:p.fecha_base_rotacion || ""
  };
}
function assignmentWorks(a){
  const days=dayTokens(a.dias||"");
  const day=selectedDayKey();
  return !day || days.size===0 || days.has("todos") || days.has(day);
}
function matchingAssignments(p){
  const date = parseDMY(state.planilla.fecha);
  const weekly = scheduleForPersonDate(p,date);
  if(weekly) return [weekly];
  if(p.horario_semanal) return [];
  const asg = Array.isArray(p.asignaciones) && p.asignaciones.length ? p.asignaciones : [{
    dias:p.dias, hora_inicio:p.hora_inicio, hora_fin:p.hora_fin, servicio:p.servicio, modalidad:p.modalidad,
    rotativo_a_inicio:p.rotativo_a_inicio, rotativo_a_fin:p.rotativo_a_fin, rotativo_b_inicio:p.rotativo_b_inicio, rotativo_b_fin:p.rotativo_b_fin, fecha_base_rotacion:p.fecha_base_rotacion
  }];
  return asg.filter(assignmentWorks);
}
function serviceForAssignment(a,p){ return a.servicio || p.servicio || ""; }
function personMarks(p){ const m = matchingAssignments(p)[0]; return m ? marksForAssignment(m,p) : Array(12).fill(""); }
function rotativeWeekInfo(a,dateOverride=null){
  const sel = dateOverride || parseDMY(state.planilla.fecha), base=parseDMY(a.fecha_base_rotacion);
  if(!sel || !base) return {key:"A", range:[a.rotativo_a_inicio,a.rotativo_a_fin]};
  const monday = d => addDays(d, -((d.getDay()+6)%7));
  const weeks = Math.floor(diffDays(monday(sel),monday(base))/7);
  return weeks%2===0 ? {key:"A",range:[a.rotativo_a_inicio,a.rotativo_a_fin]} : {key:"B",range:[a.rotativo_b_inicio,a.rotativo_b_fin]};
}
function assignmentRange(a,p,dateOverride=null){
  const service = serviceKey(serviceForAssignment(a,p));
  if(service === "24hs" || service === "canes") return {start:"07",end:"07",fullDay:true,week:""};
  if(service === "rondin") return {start:"22",end:"07",fullDay:false,week:""};
  if(norm(a.modalidad||p.modalidad)==="rotativo semanal"){
    const info = rotativeWeekInfo(a,dateOverride);
    return {start:info.range[0],end:info.range[1],fullDay:false,week:info.key};
  }
  return {start:a.hora_inicio||p.hora_inicio,end:a.hora_fin||p.hora_fin,fullDay:false,week:""};
}
function marksForAssignment(a,p){
  const range = assignmentRange(a,p);
  if(range.fullDay) return Array(12).fill("");
  return marksFromRange(range.start,range.end);
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
function rotativeRange(a){ return rotativeWeekInfo(a).range; }
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
  const root = q("#dashboardContent");
  root?.addEventListener("click",event=>{
    const cell = event.target.closest("[data-period-date][data-period-key]");
    if(!cell) return;
    showPeriodPersonnel(cell.dataset.periodDate,cell.dataset.periodKey);
  });
  root?.addEventListener("change",event=>{
    if(event.target.id !== "dashboardInclude24") return;
    dashboardInclude24 = !!event.target.checked;
    renderDashboard();
  });
  q("#btnClosePeriodModal")?.addEventListener("click",closePeriodPersonnelModal);
  q("#periodPersonnelModal")?.addEventListener("click",event=>{
    if(event.target.id === "periodPersonnelModal") closePeriodPersonnelModal();
  });
  document.addEventListener("keydown",event=>{
    if(event.key === "Escape") closePeriodPersonnelModal();
  });
}
function weekStart(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
function dashboardWeek(){
  const base = parseDMY(state.planilla.fecha) || new Date();
  const start = weekStart(base);
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
function axisRange(startValue,endValue){
  const sh=parseHour(startValue), eh=parseHour(endValue);
  if(sh==null || eh==null) return null;
  let start=axisHour(sh), end=axisHour(eh);
  if(end<=start) end+=24;
  return [start,end];
}
function rowPresentInPeriod(row,period){
  if(row.full_day || ["24hs","canes"].includes(serviceKey(row.servicio))) return true;
  const range=axisRange(row.range_start,row.range_end);
  const pRange = period.key === "manana" ? [7,13] : period.key === "tarde" ? [13,21] : [22,31];
  if(range) return range[0] < pRange[1] && range[1] > pRange[0];
  return period.idx.some(i=>token(row.cells?.[i]));
}
function isDashboard24Row(row){
  const service=serviceKey(row?.servicio);
  const source=norm(row?.source);
  return !!row?.full_day || service==="24hs" || service==="canes" ||
    source.includes("turno fijo") || source.includes("rotativo 48") || source==="canes";
}
function dashboardRotationWeek(row){
  const direct=String(row?.rotation_week||"").trim().toUpperCase();
  if(direct==="A" || direct==="B") return direct;
  const match=String(row?.schedule_text||"").match(/semana\s+([AB])/i);
  return match ? match[1].toUpperCase() : "";
}
function isDashboardWeeklyRotative(row){
  return !!dashboardRotationWeek(row) || norm(row?.rotation_type).includes("rotativo semanal");
}
function dashboardRows(rows,include24=dashboardInclude24){
  return (rows||[]).filter(row=>{
    if(/^rondin\d*$/i.test(String(row.nombre||"")) || serviceKey(row.servicio)==="rondin") return false;
    return include24 || !isDashboard24Row(row);
  });
}
function dashboardScheduleLabel(person){
  const week=dashboardRotationWeek(person);
  if(week){
    const range=axisRange(person.range_start,person.range_end);
    const time = range
      ? `${formatTime(person.range_start)} a ${formatTime(person.range_end)}`
      : String(person.schedule_text||"Horario cargado").replace(/^\s*Semana\s+[AB]\s*·?\s*/i,"");
    return `Rotativo semanal · Semana ${week} · ${time}`;
  }
  if(norm(person.rotation_type).includes("rotativo 48") || norm(person.source).includes("rotativo 48")){
    return person.schedule_text || "Rotativo 48 · 24 horas";
  }
  return person.schedule_text || (isDashboard24Row(person) ? "24 horas" : "Horario cargado");
}
function dashboardTypeLabel(person){
  const week=dashboardRotationWeek(person);
  if(week) return `Rotativo · Semana ${week}`;
  if(norm(person.rotation_type).includes("rotativo 48") || norm(person.source).includes("rotativo 48")) return "Rotativo 48";
  if(serviceKey(person.servicio)==="canes") return "Canes · 24 h";
  if(isDashboard24Row(person)) return "Turno fijo · 24 h";
  return "Servicio diario";
}
function personnelForPeriod(rows,period,include24=dashboardInclude24){
  const people=new Map();
  dashboardRows(rows,include24).forEach(row=>{
    if(!rowPresentInPeriod(row,period)) return;
    const key=norm(row.nombre);
    const current=people.get(key);
    if(current){
      if(row.schedule_text && !current.schedule_text.includes(row.schedule_text)) current.schedule_text += ` · ${row.schedule_text}`;
      return;
    }
    people.set(key,{...row});
  });
  return [...people.values()].sort((a,b)=>{
    const rank=row=>{
      if(isDashboardWeeklyRotative(row)) return 1;
      if(isDashboard24Row(row)) return 2;
      return 0;
    };
    return rank(a)-rank(b) || a.nombre.localeCompare(b.nombre);
  });
}
function dailyOperationalData(d,include24=dashboardInclude24){
  const allRows = rowsForDate(d);
  const rows = dashboardRows(allRows,include24);
  const detail = coverageDetail(rows);
  const periods = periodDefs().map(p=>{
    const score = periodScore(detail,p.idx);
    const avg = p.idx.map(i=>detail[i].value).reduce((a,b)=>a+b,0)/p.idx.length;
    const people = personnelForPeriod(allRows,p,include24);
    const rotativeCount = people.filter(isDashboardWeeklyRotative).length;
    const hour24Count = people.filter(isDashboard24Row).length;
    return {...p, score, avg, peopleCount:people.length, rotativeCount, hour24Count};
  });
  const totalScore = periods.reduce((a,b)=>a+b.score,0)/periods.length;
  return {date:d, rows, allRows, detail, periods, totalScore};
}
function showPeriodPersonnel(dateText,periodKey){
  const d=parseDMY(dateText);
  const period=periodDefs().find(p=>p.key===periodKey);
  if(!d || !period) return;
  const data=dailyOperationalData(d,dashboardInclude24);
  const people=personnelForPeriod(data.allRows,period,dashboardInclude24);
  const dailyCount=people.filter(p=>!isDashboard24Row(p)).length;
  const hour24Count=people.length-dailyCount;
  q("#periodModalTitle").textContent=`${dayName(d)} · ${period.label}`;
  q("#periodModalSubtitle").textContent=`${formatDMY(d)} · ${period.range} · ${dashboardInclude24 ? "Diarios + personal de 24 h" : "Solo servicios diarios"}`;
  q("#periodModalSummary").innerHTML=`
    <strong>${people.length}</strong>
    <span>${people.length===1?"centinela visible":"centinelas visibles"}</span>
    <small>${dailyCount} diarios${dashboardInclude24 ? ` · ${hour24Count} de 24 h/Canes` : ""}</small>
  `;
  q("#periodModalBody").innerHTML=people.length ? people.map(person=>{
    const service=person.servicio||"Sin servicio";
    const schedule=dashboardScheduleLabel(person);
    const type=dashboardTypeLabel(person);
    const week=dashboardRotationWeek(person);
    return `<div class="period-person-card ${isDashboard24Row(person)?"dashboard-person-24":"dashboard-person-daily"}">
      <div class="period-person-main">
        <strong>${esc(person.nombre)}</strong>
        <span>${esc(schedule)}</span>
        <div class="dashboard-person-tags">
          <em class="dashboard-type-badge ${week?"is-rotative":isDashboard24Row(person)?"is-24":"is-daily"}">${esc(type)}</em>
        </div>
      </div>
      <span class="service-badge service-${serviceKey(service)}">${esc(service)}</span>
    </div>`;
  }).join("") : `<p class="empty-period">No hay personal de servicios diarios programado en esta franja.</p>`;
  q("#periodPersonnelModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
}
function closePeriodPersonnelModal(){
  q("#periodPersonnelModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}
function renderDashboard(){
  const root = q("#dashboardContent");
  if(!root) return;
  const week = dashboardWeek().map(d=>dailyOperationalData(d,dashboardInclude24));
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
    <div class="card dashboard-filter-card">
      <div>
        <h2>Personal visible en el tablero</h2>
        <p>Por defecto se muestran únicamente los servicios diarios. Los horarios rotativos semanales siempre aparecen identificados como <strong>Rotativo · Semana A</strong> o <strong>Rotativo · Semana B</strong>.</p>
      </div>
      <label class="dashboard-switch">
        <input type="checkbox" id="dashboardInclude24" ${dashboardInclude24?"checked":""}>
        <span class="dashboard-switch-ui" aria-hidden="true"></span>
        <strong>Mostrar también personal de 24 h</strong>
        <small>Incluye turnos fijos, rotativos de 48 h y Canes.</small>
      </label>
    </div>
    <div class="dash-grid">
      <div class="metric-card"><div class="metric-title">Día más fuerte</div><div class="metric-value">${dayName(strongest.date)}</div><div>${formatDMY(strongest.date)}</div></div>
      <div class="metric-card"><div class="metric-title">Día más débil</div><div class="metric-value">${dayName(weakest.date)}</div><div>${formatDMY(weakest.date)}</div></div>
      <div class="metric-card"><div class="metric-title">Alertas críticas</div><div class="metric-value">${alerts.length}</div><div>según Deben haber cargado</div></div>
    </div>
    <div class="card"><h2>Cobertura por día y franja</h2><p class="dashboard-instruction">Presioná una franja para ver ${dashboardInclude24?"los servicios diarios y el personal de 24 h":"solo los servicios diarios"} programados. Los rotativos semanales muestran su Semana A o B.</p><div class="period-heatmap" id="periodHeatmap"></div></div>
    <div class="card"><h2>Detalle por horario</h2><div class="table-scroll"><table class="data-table striped" id="weekHeatTable"></table></div></div>
    <div class="card"><h2>Ranking semanal</h2><div id="rankingBars"></div></div>
    <div class="card"><h2>Alertas</h2><div id="dashboardAlerts"></div></div>
    <div class="card"><h2>Fatiga detectada hoy</h2><div id="dashboardFatigue"></div></div>
  `;
  const ph = q("#periodHeatmap");
  week.forEach(day=>{
    const row = document.createElement("div"); row.className="period-row";
    row.innerHTML = `<div class="period-day">${dayName(day.date)}<small>${formatDMY(day.date)}</small></div>` + day.periods.map(p=>{
      const rotText=p.rotativeCount ? ` · ${p.rotativeCount} rot.` : "";
      const h24Text=dashboardInclude24 && p.hour24Count ? ` · ${p.hour24Count} de 24 h` : "";
      return `<button type="button" class="period-cell ${coverageClass(p.score*7,7)}" data-period-date="${formatDMY(day.date)}" data-period-key="${p.key}" style="background:hsl(${Math.round(p.score*120)} 78% ${86-Math.round(p.score*12)}%)"><strong>${p.label}</strong><span>${p.range}</span><em>${p.peopleCount} visibles${rotText}${h24Text}</em><small>Ver personal</small></button>`;
    }).join("");
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
  renderFatigueInto(q("#dashboardFatigue"), dashboardRows(state.planilla.rows,dashboardInclude24));
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
  const matches = term ? state.personal.filter(p=>norm([p.nombre,p.jerarquia,p.legajo,p.servicio,p.observaciones,p.situacion,personScheduleSearchText(p),...(p.ausencias||[]).map(absenceLabel)].join(" ")).includes(term)).slice(0,20) : [];
  q("#dailyServices").innerHTML = serviceCards || `<p>No hay filas cargadas. Usá “Cargar personal del día”.</p>`;
  q("#searchResults").innerHTML = !term ? "" : (matches.length ? matches.map(p=>{
    const active = activeAbsences(p).map(absenceLabel).join(" · ");
    return `<div class="search-hit"><strong>${esc(p.nombre)}</strong><span>${esc(p.jerarquia||"")}${p.legajo?" · Legajo "+esc(p.legajo):""} · ${esc(p.servicio||"")} · ${esc(personSchedulePlainText(p))}${p.situacion?" · "+esc(p.situacion):""} · ${esc(p.estado||"Activo")}${active?" · LICENCIA: "+esc(active):""}</span></div>`;
  }).join("") : `<p>Sin resultados.</p>`);
  renderFatigueInto(q("#dailyFatigue"), rows);
}

function hourSelectHtml(value="",className=""){
  const options=[`<option value=""></option>`];
  for(let i=0;i<24;i++) options.push(`<option value="${pad(i)}" ${String(value)===pad(i)?"selected":""}>${pad(i)}:00</option>`);
  return `<select class="${className}">${options.join("")}</select>`;
}
function serviceSelectHtml(value="",className=""){
  return `<select class="${className}">${SERVICES.map(s=>`<option value="${s}" ${s===value?"selected":""}>${s}</option>`).join("")}</select>`;
}
function schedulePeriodClass(schedule){
  const start = schedule.modalidad === "Rotativo semanal" ? schedule.semana_a_inicio : schedule.inicio;
  const h=parseHour(start);
  if(h==null) return "schedule-neutral";
  if(h>=7 && h<13) return "schedule-morning";
  if(h>=13 && h<22) return "schedule-afternoon";
  return "schedule-night";
}
function scheduleText(schedule,compact=false){
  if(!schedule?.activo) return "No trabaja";
  if(serviceKey(schedule.servicio)==="24hs" || serviceKey(schedule.servicio)==="canes") return `${schedule.servicio} · 24 horas`;
  if(schedule.modalidad === "Rotativo semanal"){
    const a=`A ${formatTime(schedule.semana_a_inicio)}–${formatTime(schedule.semana_a_fin)}`;
    const b=`B ${formatTime(schedule.semana_b_inicio)}–${formatTime(schedule.semana_b_fin)}`;
    return compact ? `${a} / ${b}` : `Rotativo · ${a} · ${b}`;
  }
  return `${formatTime(schedule.inicio)}–${formatTime(schedule.fin)}`;
}
function personSchedulePlainText(p){
  const items=WEEK_DAYS.flatMap(day=>{
    const s=p.horario_semanal?.[day.key];
    return s?.activo ? [`${day.label}: ${scheduleText(s)}`] : [];
  });
  return items.length ? items.join("; ") : "Sin horario diario";
}
function personScheduleSearchText(p){ return personSchedulePlainText(p); }
function weeklyScheduleHtml(p){
  const chips=WEEK_DAYS.flatMap(day=>{
    const s=p.horario_semanal?.[day.key];
    if(!s?.activo) return [];
    return [`<div class="week-chip ${schedulePeriodClass(s)} ${s.modalidad==="Rotativo semanal"?"schedule-rotative":""}"><strong>${day.short}</strong><span>${esc(scheduleText(s,true))}</span><small>${esc(s.servicio||p.servicio||"")}</small></div>`];
  });
  return chips.length ? `<div class="week-chip-grid">${chips.join("")}</div>` : `<span class="no-schedule">Sin horario diario</span>`;
}
function renderWeeklyScheduleEditor(schedule=null){
  const weekly=schedule || Object.fromEntries(WEEK_DAYS.map(d=>[d.key,emptyDaySchedule(q("#personService")?.value||"Diario")]));
  const table=q("#weeklyScheduleEditor");
  table.innerHTML=`<thead><tr><th>Trabaja</th><th>Día</th><th>Servicio</th><th>Modalidad</th><th>Inicio / Semana A</th><th>Fin / Semana A</th><th>Inicio Semana B</th><th>Fin Semana B</th></tr></thead><tbody></tbody>`;
  const body=table.querySelector("tbody");
  WEEK_DAYS.forEach(day=>{
    const s=normalizeDaySchedule(weekly[day.key],q("#personService")?.value||"Diario");
    const tr=document.createElement("tr");
    tr.dataset.day=day.key;
    tr.className=s.activo?"schedule-row active":"schedule-row";
    tr.innerHTML=`
      <td class="schedule-toggle-cell"><input type="checkbox" class="schedule-active" ${s.activo?"checked":""} aria-label="Trabaja el ${day.label}"></td>
      <td class="schedule-day"><strong>${day.label}</strong><span class="schedule-inline-preview"></span></td>
      <td>${serviceSelectHtml(s.servicio,"schedule-service")}</td>
      <td><select class="schedule-mode"><option value="Fijo" ${s.modalidad==="Fijo"?"selected":""}>Fijo</option><option value="Rotativo semanal" ${s.modalidad==="Rotativo semanal"?"selected":""}>Rotativo semanal</option></select></td>
      <td>${hourSelectHtml(s.modalidad==="Fijo"?s.inicio:s.semana_a_inicio,"schedule-start-a")}</td>
      <td>${hourSelectHtml(s.modalidad==="Fijo"?s.fin:s.semana_a_fin,"schedule-end-a")}</td>
      <td class="week-b-cell">${hourSelectHtml(s.semana_b_inicio,"schedule-start-b")}</td>
      <td class="week-b-cell">${hourSelectHtml(s.semana_b_fin,"schedule-end-b")}</td>`;
    body.append(tr);
  });
  table.querySelectorAll("input,select").forEach(el=>el.addEventListener("change",()=>{
    updateWeeklyEditorVisuals();
    renderWeeklyPreviewFromEditor();
  }));
  updateWeeklyEditorVisuals();
  renderWeeklyPreviewFromEditor();
}
function updateWeeklyEditorVisuals(){
  q("#weeklyScheduleEditor")?.querySelectorAll(".schedule-row").forEach(row=>{
    const active=row.querySelector(".schedule-active").checked;
    const rot=row.querySelector(".schedule-mode").value==="Rotativo semanal";
    row.classList.toggle("active",active);
    row.classList.toggle("rotative",rot);
    row.querySelectorAll("select:not(.schedule-mode), .schedule-mode").forEach(el=>el.disabled=!active);
    row.querySelectorAll(".week-b-cell select").forEach(el=>el.disabled=!active||!rot);
    const s=readScheduleRow(row);
    row.querySelector(".schedule-inline-preview").textContent=active?scheduleText(s,true):"No trabaja";
  });
}
function readScheduleRow(row){
  const active=row.querySelector(".schedule-active").checked;
  const mode=row.querySelector(".schedule-mode").value;
  const startA=row.querySelector(".schedule-start-a").value;
  const endA=row.querySelector(".schedule-end-a").value;
  return normalizeDaySchedule({
    activo:active,
    servicio:row.querySelector(".schedule-service").value,
    modalidad:mode,
    inicio:mode==="Fijo"?startA:"",
    fin:mode==="Fijo"?endA:"",
    semana_a_inicio:mode==="Rotativo semanal"?startA:"",
    semana_a_fin:mode==="Rotativo semanal"?endA:"",
    semana_b_inicio:row.querySelector(".schedule-start-b").value,
    semana_b_fin:row.querySelector(".schedule-end-b").value
  });
}
function readWeeklyScheduleEditor(){
  const weekly={};
  q("#weeklyScheduleEditor").querySelectorAll(".schedule-row").forEach(row=>weekly[row.dataset.day]=readScheduleRow(row));
  return weekly;
}
function renderWeeklyPreviewFromEditor(){
  const root=q("#weeklySchedulePreview");
  if(!root || !q("#weeklyScheduleEditor")?.querySelector("tbody")) return;
  const weekly=readWeeklyScheduleEditor();
  const chips=WEEK_DAYS.map(day=>{
    const s=weekly[day.key];
    return `<div class="preview-day ${s.activo?schedulePeriodClass(s):"off"} ${s.modalidad==="Rotativo semanal"?"schedule-rotative":""}"><strong>${day.short}</strong><span>${esc(s.activo?scheduleText(s,true):"Libre")}</span><small>${s.activo?esc(s.servicio):""}</small></div>`;
  }).join("");
  root.innerHTML=`<div class="preview-title">Vista semanal</div><div class="preview-week-grid">${chips}</div>`;
}
function validateWeeklySchedule(weekly){
  return validateWeeklyScheduleDetailed(weekly,"Personal",isoToDMY(q("#rotBase")?.value||"")).join("\n");
}
function bindPersonal(){
  q("#personService").value = "Diario";
  q("#btnSavePerson").onclick = savePerson;
  q("#btnNewPerson").onclick = clearPersonForm;
  q("#btnPersonalBackupNow").onclick = createPersonalBackupNow;
  q("#btnEnableWeekdays").onclick=()=>{
    q("#weeklyScheduleEditor").querySelectorAll(".schedule-row").forEach((row,i)=>{ if(i<5) row.querySelector(".schedule-active").checked=true; });
    updateWeeklyEditorVisuals(); renderWeeklyPreviewFromEditor();
  };
  q("#btnCopyMonday").onclick=()=>{
    const rows=[...q("#weeklyScheduleEditor").querySelectorAll(".schedule-row")];
    const source=readScheduleRow(rows[0]);
    renderWeeklyScheduleEditor(Object.fromEntries(WEEK_DAYS.map((day,i)=>[day.key,i<5?{...source,activo:true}:readScheduleRow(rows[i])])));
  };
  q("#btnClearWeek").onclick=()=>renderWeeklyScheduleEditor();
  q("#personService").addEventListener("change",()=>{
    q("#weeklyScheduleEditor").querySelectorAll(".schedule-row:not(.active) .schedule-service").forEach(el=>el.value=q("#personService").value);
  });
  renderWeeklyScheduleEditor();
}
function renderPersonal(){
  const table = q("#personalTable");
  table.innerHTML = `<tr><th>Personal</th><th>Estado / licencia</th><th>Horario semanal</th><th>Observaciones</th></tr>`;
  state.personal.forEach((p,i)=>{
    const tr=document.createElement("tr");
    if(norm(p.estado)==="inactivo") tr.classList.add("inactive-row");
    const obs = [p.situacion,p.observaciones].filter(Boolean).join(" · ");
    const license = activeAbsences(p).map(absenceLabel).join(" · ");
    tr.innerHTML = `<td class="person-id-cell"><strong>${esc(p.nombre)}</strong><span>${esc(p.jerarquia||"")}${p.legajo?` · Legajo ${esc(p.legajo)}`:""}</span></td><td><strong>${esc(p.estado||"Activo")}</strong>${license?`<br><span class="license-badge">${esc(license)}</span>`:""}</td><td class="weekly-summary-cell">${weeklyScheduleHtml(p)}</td><td>${esc(obs)}</td>`;
    tr.onclick=()=>loadPersonForm(i);
    table.append(tr);
  });
  renderPersonalBackups();
}
function loadPersonForm(i){
  selectedPersonIndex=i;
  const p=state.personal[i];
  q("#personName").value=p.nombre||"";
  q("#personHierarchy").value=p.jerarquia||"";
  q("#personLegajo").value=p.legajo||"";
  q("#personSituation").value=p.situacion||"";
  q("#personObservations").value=p.observaciones||"";
  q("#personService").value=p.servicio||"Diario";
  q("#personState").value=p.estado||"Activo";
  q("#personTurno").value=p.turno_24||"";
  q("#rotBase").value=dmyToISO(p.fecha_base_rotacion||"");
  renderWeeklyScheduleEditor(p.horario_semanal);
  q("#personName").scrollIntoView({behavior:"smooth",block:"center"});
}
function clearPersonForm(){
  selectedPersonIndex=null;
  ["personName","personHierarchy","personLegajo","personSituation","personObservations","personTurno","rotBase"].forEach(id=>q("#"+id).value="");
  q("#personService").value="Diario";
  q("#personState").value="Activo";
  renderWeeklyScheduleEditor();
}
function savePerson(){
  const name=toTitleName(cleanName(q("#personName").value.trim()));
  const weekly=readWeeklyScheduleEditor();
  const existing=selectedPersonIndex!=null ? state.personal[selectedPersonIndex] : null;
  const p = normalizePersonRecord({
    nombre:name,
    jerarquia:q("#personHierarchy").value.trim(),
    legajo:q("#personLegajo").value.trim(),
    situacion:q("#personSituation").value.trim(),
    observaciones:q("#personObservations").value.trim(),
    servicio:q("#personService").value,
    estado:q("#personState").value,
    turno_24:q("#personTurno").value,
    fecha_base_rotacion:isoToDMY(q("#rotBase").value),
    horario_semanal:weekly,
    ausencias:existing?.ausencias || [],
    operational_only:existing?.operational_only || false
  });
  const errors=validatePersonRecordDetailed(p,selectedPersonIndex??state.personal.length);
  const duplicateIndex=state.personal.findIndex((x,i)=>i!==selectedPersonIndex && norm(x.nombre)===norm(name));
  if(duplicateIndex>=0) errors.unshift(`${name} ya existe en la nómina.`);
  if(showValidationErrors(errors,"No se pudo guardar el personal")) return;
  if(selectedPersonIndex!=null) state.personal[selectedPersonIndex]=p; else state.personal.push(p);
  state.personal.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  save({action:"Actualizar horario semanal del personal"});
  renderAll();
  clearPersonForm();
}

function createPersonalBackupNow(){
  const errors=validateMasterData();
  if(showValidationErrors(errors,"Corregí el personal antes de crear el backup")) return;
  state.personal_backups ||= [];
  const backup={
    id:`personal-backup-${Date.now()}`,
    at:new Date().toISOString(),
    data:{personal:clone(state.personal),turnos:clone(state.turnos)}
  };
  state.personal_backups.unshift(backup);
  state.personal_backups=state.personal_backups.slice(0,MAX_PERSONAL_BACKUPS);
  state.personal_backups_updated_at=new Date().toISOString();
  pushHistory("Crear backup del personal");
  save({silent:true,skipPlanillaDraft:true});
  renderPersonalBackups();
  alert("Backup del personal creado. Se conservarán como máximo 5.");
}
function restorePersonalBackup(id){
  const backup=(state.personal_backups||[]).find(b=>b.id===id);
  if(!backup) return alert("El backup ya no existe.");
  const candidatePersonal=(backup.data?.personal||[]).map(normalizePersonRecord);
  const candidateTurnos=normalizeTurnos(clone(backup.data?.turnos||{}));
  const errors=[...validatePersonalCatalog(candidatePersonal),...validateTurnosData(candidateTurnos)];
  if(showValidationErrors(errors,"El backup no puede restaurarse")) return;
  const when=new Date(backup.at).toLocaleString();
  if(!confirm(`¿Restaurar el personal del backup realizado el ${when}? Se creará una copia de seguridad del estado actual.`)) return;
  const safety={id:`personal-backup-${Date.now()}`,at:new Date().toISOString(),data:{personal:clone(state.personal),turnos:clone(state.turnos)}};
  state.personal=candidatePersonal;
  state.turnos=candidateTurnos;
  state.personal_backups=[safety,...(state.personal_backups||[]).filter(b=>b.id!==safety.id)].slice(0,MAX_PERSONAL_BACKUPS);
  state.personal_backups_updated_at=new Date().toISOString();
  selectedPersonIndex=null;
  pushHistory("Restaurar backup del personal");
  save({silent:true,skipPlanillaDraft:true});
  clearPersonForm();
  renderAll();
  alert("Backup del personal restaurado.");
}
function deletePersonalBackup(id){
  const backup=(state.personal_backups||[]).find(b=>b.id===id);
  if(!backup) return;
  if(!confirm(`¿Borrar el backup del ${new Date(backup.at).toLocaleString()}?`)) return;
  state.personal_backups=state.personal_backups.filter(b=>b.id!==id);
  state.personal_backups_updated_at=new Date().toISOString();
  pushHistory("Eliminar backup del personal");
  save({silent:true,skipPlanillaDraft:true});
  renderPersonalBackups();
}
function renderPersonalBackups(){
  const table=q("#personalBackupTable");
  if(!table) return;
  const list=(state.personal_backups||[]).slice(0,MAX_PERSONAL_BACKUPS);
  table.innerHTML=`<tr><th>Fecha del backup</th><th>Contenido</th><th>Acciones</th></tr>`;
  if(!list.length){
    table.innerHTML+=`<tr><td colspan="3" class="empty-cell">No hay backups del personal.</td></tr>`;
    return;
  }
  list.forEach(backup=>{
    const count=backup.data?.personal?.length||0;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${esc(new Date(backup.at).toLocaleString())}</strong></td><td>${count} personas · incluye horarios, licencias, turnos y Canes</td><td class="backup-actions"><button data-pb-act="restore" data-pb-id="${backup.id}" class="primary">Restaurar</button><button data-pb-act="download" data-pb-id="${backup.id}">JSON</button><button data-pb-act="delete" data-pb-id="${backup.id}" class="danger">Borrar</button></td>`;
    table.append(tr);
  });
  table.querySelectorAll("button[data-pb-act]").forEach(button=>button.onclick=()=>{
    const id=button.dataset.pbId, action=button.dataset.pbAct;
    if(action==="restore") restorePersonalBackup(id);
    if(action==="delete") deletePersonalBackup(id);
    if(action==="download"){
      const backup=(state.personal_backups||[]).find(b=>b.id===id);
      if(backup) downloadJson(`${id}.json`,backup.data);
    }
  });
}

function operationalNameConflict(name, options={}){
  const key=norm(name);
  const matches=[];
  for(const turno of TURNO_SEQ){
    (state.turnos.turnos_24?.[turno]||[]).forEach((n,i)=>{
      if(norm(n)===key && !(options.type==="fixed"&&options.turno===turno&&options.index===i)) matches.push(`turno fijo ${turno}`);
    });
    const canes=state.turnos.canes_por_turno?.[turno];
    if(canes && norm(canes)===key && !(options.type==="canes"&&options.turno===turno)) matches.push(`Canes ${turno}`);
  }
  (state.turnos.rotativos_48||[]).forEach((r,i)=>{
    if(norm(r.nombre)===key && !(options.type==="rot48"&&options.index===i)) matches.push("rotativo 48 h");
  });
  return matches;
}
function bindTurnos(){
  q("#btnUseTurno").onclick=()=>{ state.planilla.turno=selectedTurnoAdmin; save(); renderPlanilla(); document.querySelector('[data-tab="planilla"]').click(); };
  q("#btnAddTurnoPerson").onclick=()=>{
    const n=toTitleName(cleanName(q("#turnoPersonInput").value.trim())); if(!n)return;
    const conflicts=operationalNameConflict(n);
    if(conflicts.length) return showValidationErrors([`${n} ya figura como ${conflicts.join(", ")}.`],"Personal repetido");
    (state.turnos.turnos_24[selectedTurnoAdmin] ||= []).push(n); save({action:"Agregar personal a turno fijo"}); renderTurnos();
  };
  q("#btnUpdateTurnoPerson").onclick=()=>{
    if(selectedFixedIndex==null)return;
    const n=toTitleName(cleanName(q("#turnoPersonInput").value.trim())); if(!n)return;
    const conflicts=operationalNameConflict(n,{type:"fixed",turno:selectedTurnoAdmin,index:selectedFixedIndex});
    if(conflicts.length) return showValidationErrors([`${n} ya figura como ${conflicts.join(", ")}.`],"Personal repetido");
    state.turnos.turnos_24[selectedTurnoAdmin][selectedFixedIndex]=n; save({action:"Modificar personal de turno fijo"}); renderTurnos();
  };
  q("#btnRemoveTurnoPerson").onclick=()=>{ if(selectedFixedIndex==null)return; state.turnos.turnos_24[selectedTurnoAdmin].splice(selectedFixedIndex,1); selectedFixedIndex=null; save({action:"Quitar personal de turno fijo"}); renderTurnos(); };
  q("#btnSaveCanes").onclick=()=>{
    const name=toTitleName(cleanName(q("#canesInput").value.trim()));
    const conflicts=name?operationalNameConflict(name,{type:"canes",turno:selectedTurnoAdmin}):[];
    if(conflicts.length) return showValidationErrors([`${name} ya figura como ${conflicts.join(", ")}.`],"Personal repetido");
    state.turnos.canes_por_turno[selectedTurnoAdmin]=name; save({action:"Actualizar Canes"}); renderTurnos();
  };
  q("#btnSaveRot48").onclick=saveRot48;
  q("#btnRemoveRot48").onclick=()=>{ if(selectedRot48Index==null)return; state.turnos.rotativos_48.splice(selectedRot48Index,1); selectedRot48Index=null; save({action:"Quitar rotativo 48 h"}); renderTurnos(); };
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
  const name=toTitleName(cleanName(q("#rot48Name").value.trim()));
  const errors=[];
  if(!name) errors.push("Nombre requerido para el rotativo 48 h.");
  if(!parseAnyDate(q("#rot48Date").value)) errors.push("Fecha presente inválida.");
  const conflicts=name?operationalNameConflict(name,{type:"rot48",index:selectedRot48Index}):[];
  if(conflicts.length) errors.push(`${name} ya figura como ${conflicts.join(", ")}.`);
  if(showValidationErrors(errors,"No se pudo guardar el rotativo")) return;
  const item={nombre:name, turnos:q("#rot48Pair").value.split("-"), fecha_presente:isoToDMY(q("#rot48Date").value), activo:q("#rot48Active").value==="true"};
  if(selectedRot48Index!=null) state.turnos.rotativos_48[selectedRot48Index]=item; else state.turnos.rotativos_48.push(item);
  selectedRot48Index=null; save({action:"Actualizar rotativo 48 h"}); renderTurnos();
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
  const errors=[];
  if(!fromDate) errors.push("Indicá una fecha de inicio válida.");
  if(tipo === "Art 214" && !toDate) errors.push("El Art. 214 requiere una fecha de finalización válida.");
  if(tipo === "Carpeta Medica" && !articulo) errors.push("Indicá el artículo o motivo de la Carpeta Médica.");
  if(toDate && fromDate && toDate < fromDate) errors.push("La fecha de fin no puede ser anterior a la fecha de inicio.");
  if(!isReadableText([articulo,q("#absenceNotes").value].join(" "))) errors.push("La licencia contiene caracteres ilegibles o inválidos.");
  if(showValidationErrors(errors,"No se pudo guardar la licencia")) return;

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
      const previousState=clone(state);
      try{
        const data=JSON.parse(reader.result);
        if(Array.isArray(data)){
          state.personal = data.map(normalizePersonRecord);
        }else if(data.personal && data.turnos){
          const preserved = {history:state.history||[], backups:state.backups||[], personal_backups:state.personal_backups||[], personal_backups_updated_at:state.personal_backups_updated_at||"", saved_tables:state.saved_tables||[], saved_tables_updated_at:state.saved_tables_updated_at||"", last_planilla_draft:state.last_planilla_draft||null, undoStack:state.undoStack||[], backup_settings:state.backup_settings};
          state = {...data, ...preserved};
          state.personal = (state.personal||[]).map(normalizePersonRecord);
          state.turnos = normalizeTurnos(state.turnos || {});
        }else if(data.turnos_24 || data.canes_por_turno || data.rotativos_48){
          state.turnos = normalizeTurnos(data);
        }else{
          throw new Error("Formato no reconocido");
        }
        normalizeLoadedState();
        const importErrors=validateAllData();
        if(importErrors.length) throw new Error("El archivo contiene datos conflictivos:\n- "+importErrors.slice(0,12).join("\n- "));
        save({action:"Importar JSON"}); renderAll(); alert("Datos importados y validados.");
      }catch(err){
        state=previousState;
        normalizeLoadedState();
        lastPlanillaSnapshot=JSON.stringify(state.planilla);
        lastContentSnapshot=contentSnapshot();
        renderAll();
        alert("Archivo inválido: " + err.message);
      }
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

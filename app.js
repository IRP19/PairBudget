const STORAGE_KEY = "panel-hogar-state-v1";
const LEGACY_KEY = "panel-hogar-state-v2";
const IMPORT = window.HOUSEHOLD_IMPORT;
const COLLECTIONS = ["expenses", "incomes", "tasks", "reviews", "renovations", "appliances", "alerts"];
const EXPENSE_CATEGORIES = ["Alquiler", "Alimentación", "Deporte", "Luz", "Gas", "Agua", "Internet", "Ocio", "Gastos Comunes", "Inversión", "Universidades", "Fisio", "Peluquería", "Viajes", "Ropa", "Salud", "Transporte", "Estética", "Varios", "Mantenimiento", "Regalos", "Comida", "Otros"];
const CHART_PALETTES = {
  "persona-a": ["#183A7A", "#3B6FD4", "#4FA3D9", "#8CC3E8", "#B8C4DD"],
  "persona-b": ["#B8286A", "#F25C9E", "#F58BB9", "#F9B5D3", "#FCD9E8"],
  "comun": ["#7E1620", "#B3202F", "#D2555F", "#E58D93", "#F2C4C8"]
};
const TEMPLATE_STATE = {
  expenses: IMPORT.sheets.flatMap((sheet) => sheet.expenses.map((item) => ({ ...item, date: `${item.period}-01` }))),
  incomes: IMPORT.sheets.flatMap((sheet) => sheet.incomes.map((item) => ({ ...item, date: `${item.period}-01` }))),
  tasks: [], reviews: [], renovations: [], appliances: [], alerts: []
};
const currency = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const today = new Date();
today.setHours(0, 0, 0, 0);
const CURRENT_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
let selectedMonth = CURRENT_MONTH;
let selectedOwner = "persona-a";
let modalContext = { type: null, id: null };
let state = loadState();

const collectionFor = { expense: "expenses", income: "incomes", task: "tasks", review: "reviews", renovation: "renovations", appliance: "appliances", alert: "alerts" };
const modalConfig = {
  expense: { title: "Gasto", eyebrow: "MOVIMIENTO DEL HOGAR", fields: [
    { name: "name", label: "Concepto", type: "text", required: true, full: true },
    { name: "owner", label: "Cuenta", type: "select", options: ["persona-a", "persona-b", "comun"], required: true },
    { name: "category", label: "Categoría", type: "select", options: EXPENSE_CATEGORIES, required: true },
    { name: "amount", label: "Importe (€)", type: "number", min: "0.01", step: "0.01", required: true },
    { name: "period", label: "Mes", type: "month", required: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "note", label: "Nota", type: "textarea", full: true }
  ] },
  income: { title: "Ingreso", eyebrow: "DINERO QUE ENTRA", fields: [
    { name: "name", label: "Concepto", type: "text", required: true, full: true },
    { name: "owner", label: "Cuenta", type: "select", options: ["persona-a", "persona-b", "comun"], required: true },
    { name: "amount", label: "Importe (€)", type: "number", min: "0.01", step: "0.01", required: true },
    { name: "period", label: "Mes", type: "month", required: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "note", label: "Nota", type: "textarea", full: true }
  ] },
  task: { title: "Tarea", eyebrow: "LISTA DE TAREAS", fields: [
    { name: "title", label: "¿Qué hay que hacer?", type: "text", required: true, full: true },
    { name: "priority", label: "Prioridad", type: "select", options: ["Alta", "Media", "Baja"], required: true },
    { name: "dueDate", label: "Fecha límite", type: "date", required: true },
    { name: "done", label: "Estado", type: "select", options: ["Pendiente", "Completada"], required: true }
  ] },
  review: { title: "Revisión", eyebrow: "AGENDA DEL HOGAR", fields: [
    { name: "title", label: "¿Qué revisar?", type: "text", required: true, full: true },
    { name: "date", label: "Fecha", type: "date", required: true },
    { name: "detail", label: "Detalle", type: "textarea", full: true }
  ] },
  renovation: { title: "Reforma", eyebrow: "AGENDA DEL HOGAR", fields: [
    { name: "title", label: "Nombre de la reforma", type: "text", required: true, full: true },
    { name: "budget", label: "Presupuesto (€)", type: "number", min: "0", step: "0.01", required: true },
    { name: "status", label: "Estado", type: "select", options: ["Pendiente", "Planificada", "En marcha", "Terminada"], required: true },
    { name: "date", label: "Fecha objetivo", type: "date", required: true }
  ] },
  appliance: { title: "Electrodoméstico", eyebrow: "CUIDADO DE LA CASA", fields: [
    { name: "name", label: "Equipo", type: "text", required: true },
    { name: "status", label: "Estado", type: "select", options: ["Correcto", "Vigilar", "Reparar"], required: true },
    { name: "warranty", label: "Garantía hasta", type: "date", required: true },
    { name: "nextAction", label: "Próxima acción", type: "text", required: true, full: true }
  ] },
  alert: { title: "Alerta", eyebrow: "AGENDA DEL HOGAR", fields: [
    { name: "title", label: "Aviso", type: "text", required: true },
    { name: "level", label: "Nivel", type: "select", options: ["Crítica", "Aviso", "Info"], required: true },
    { name: "dueDate", label: "Fecha límite", type: "date", required: true },
    { name: "message", label: "Detalle", type: "textarea", required: true, full: true },
    { name: "done", label: "Estado", type: "select", options: ["Activa", "Resuelta"], required: true }
  ] }
};

const el = (selector) => document.querySelector(selector);
const listTargets = { expenses: el("#expenseList"), incomes: el("#incomeList"), tasks: el("#taskList"), agenda: el("#agendaList") };

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Error API ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function loadFinancialData() {
  try {
    const [expenses, incomes] = await Promise.all([api("/expenses"), api("/incomes")]);
    if (!expenses.length && !incomes.length) {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      let initial = saved ? normalizeState(JSON.parse(saved)) : clone(TEMPLATE_STATE);
      await api("/bootstrap", { method: "POST", body: JSON.stringify({ expenses: initial.expenses, incomes: initial.incomes }) });
      const loaded = await Promise.all([api("/expenses"), api("/incomes")]);
      state.expenses = loaded[0]; state.incomes = loaded[1];
    } else { state.expenses = expenses; state.incomes = incomes; }
    el(".privacy-note span:last-child").textContent = "Datos financieros en PostgreSQL";
    render();
  } catch (error) {
    console.error("No se pudo cargar la información financiera desde la API", error);
    showToast("No se pudo conectar con PostgreSQL. Comprueba que la API está activa.");
  }
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeState(candidate) {
  const normalized = {};
  COLLECTIONS.forEach((key) => { normalized[key] = Array.isArray(candidate?.[key]) ? candidate[key] : clone(TEMPLATE_STATE[key]); });
  return normalized;
}
function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return normalizeState(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = normalizeState(JSON.parse(legacy));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) { console.warn("No se pudo leer el estado guardado.", error); }
  return clone(TEMPLATE_STATE);
}
function saveState(message = "Cambios guardados") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    showToast(`${message}.`);
    return true;
  } catch (error) {
    console.error("No se pudo guardar el estado.", error);
    showToast("No se pudo guardar. Comprueba el almacenamiento del navegador.");
    return false;
  }
}
function parseLocalDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  return Number.isNaN(result.valueOf()) ? null : result;
}
function itemDate(item) { return item.period ? `${item.period}-01` : item.date || item.dueDate || item.warranty || ""; }
function ownerMatches(item) { return selectedOwner === "Todos" || item.owner === selectedOwner; }
function monthExpenses() {
  return state.expenses.filter((item) => String(item.period || itemDate(item)).slice(0, 7) === selectedMonth && ownerMatches(item));
}
function incomePeriodMatches(item, period) { return String(item.period || itemDate(item)).slice(0, 7) === period; }
function incomeOwnerMatches(item) { return selectedOwner === "Todos" || item.owner === selectedOwner; }
function monthIncomes() {
  return state.incomes.filter((item) => incomePeriodMatches(item, selectedMonth) && incomeOwnerMatches(item));
}
function incomeTotalFor(owner, year, throughMonth) {
  return state.incomes
    .filter((item) => (!owner || owner === "Todos" || item.owner === owner)
      && String(item.period || "").slice(0, 4) === year
      && String(item.period || "") <= throughMonth)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}
function balanceTone(amount) { return amount > 0.005 ? "positive" : amount < -0.005 ? "negative" : "neutral"; }
function balanceMessage(amount, period = "mes") {
  const label = period === "mes" ? "este mes" : period;
  if (amount > 0.005) return `Ahorro ${label}`;
  if (amount < -0.005) return `Excedido ${label} por ${currency.format(Math.abs(amount))}`;
  return "Presupuesto justo";
}
function upcomingItems() {
  const end = new Date(today); end.setDate(end.getDate() + 30);
  const candidates = [
    ...state.tasks.filter((item) => !item.done).map((item) => ({ ...item, kind: "task", date: item.dueDate })),
    ...state.reviews.map((item) => ({ ...item, kind: "review", date: item.date })),
    ...state.renovations.filter((item) => item.status !== "Terminada").map((item) => ({ ...item, kind: "renovation", date: item.date })),
    ...state.appliances.map((item) => ({ ...item, kind: "appliance", date: item.warranty, title: item.name })),
    ...state.alerts.filter((item) => !item.done).map((item) => ({ ...item, kind: "alert", date: item.dueDate }))
  ];
  return candidates.filter((item) => { const date = parseLocalDate(item.date); return date && date >= today && date <= end; }).sort((a, b) => a.date.localeCompare(b.date));
}
function calculateMetrics() {
  const expenses = monthExpenses();
  const chartExpenses = selectedOwner === "Todos"
    ? expenses.filter((item) => item.owner === "comun" || item.category !== "Gastos Comunes")
    : expenses;
  const grossMonthlyExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomes = monthIncomes();
  let monthIncome = incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthlySavings = monthIncome - (selectedOwner === "Todos" ? chartExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) : grossMonthlyExpenses);
  const categories = chartExpenses.reduce((result, item) => { const name = item.category || "Otros"; result[name] = (result[name] || 0) + Number(item.amount || 0); return result; }, {});
  const due = upcomingItems();
  const year = selectedMonth.slice(0, 4);
  const yearExpenses = state.expenses.filter((item) => {
    const period = String(item.period || itemDate(item)).slice(0, 7);
    return period.slice(0, 4) === year && period <= selectedMonth && ownerMatches(item);
  });
  const annualGrossExpenses = yearExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const annualRealExpenses = (selectedOwner === "Todos"
    ? yearExpenses.filter((item) => item.owner === "comun" || item.category !== "Gastos Comunes")
    : yearExpenses).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const annualIncome = incomeTotalFor(selectedOwner, year, selectedMonth);
  const annualSavings = annualIncome - (selectedOwner === "Todos" ? annualRealExpenses : annualGrossExpenses);
  return { total: chartExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0), categories, expenseCount: expenses.length,
    monthIncome, incomeCount: incomes.length, monthlySavings,
    annualRealExpenses, annualSavings, monthsElapsed: Number(selectedMonth.slice(5, 7)),
    pendingTasks: state.tasks.filter((item) => !item.done).length,
    criticalAlerts: state.alerts.filter((item) => !item.done && item.level === "Crítica").length,
    dueCount: due.length, due };
}

function render() {
  const metrics = calculateMetrics();
  renderHeader(metrics);
  renderChart(metrics.categories);
  renderExpenses();
  renderIncomes();
  renderNav();
}
function renderHeader(metrics) {
  el("#pageTitle").textContent = `Resumen de ${ownerLabel(selectedOwner)}`;
  const dataYears = [...new Set([...IMPORT.months, ...state.expenses.map((item) => String(item.period || itemDate(item)).slice(0, 7)), ...state.incomes.map((item) => String(item.period || itemDate(item)).slice(0, 7))])]
    .filter((month) => /^\d{4}-\d{2}$/.test(month))
    .map((month) => Number(month.slice(0, 4)));
  const firstYear = Math.min(today.getFullYear(), ...dataYears);
  const lastYear = Math.max(today.getFullYear() + 1, ...dataYears);
  const months = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index)
    .flatMap((year) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`));
  const yearPicker = el("#yearPicker");
  const selectedYear = selectedMonth.slice(0, 4);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  yearPicker.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
  yearPicker.value = selectedYear;
  const monthPicker = el("#monthPicker");
  monthPicker.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const month = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(new Date(Number(selectedYear), index, 1));
    return `<option value="${month}">${escapeHtml(label)}</option>`;
  }).join("");
  if (!months.includes(selectedMonth)) selectedMonth = months[0] || selectedMonth;
  yearPicker.value = selectedMonth.slice(0, 4);
  monthPicker.value = selectedMonth;
  el("#ownerFilter").value = selectedOwner;
  document.querySelectorAll("[data-owner-filter]").forEach((button) => {
    const active = button.dataset.ownerFilter === selectedOwner;
    button.setAttribute("aria-pressed", String(active));
  });
  el("#todayLabel").textContent = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(today).toLocaleUpperCase("es-ES");
  el("#metricMonthly").textContent = currency.format(metrics.total);
  el("#metricExpenseNote").textContent = `${metrics.expenseCount} ${metrics.expenseCount === 1 ? "movimiento" : "movimientos"} registrados${selectedOwner === "Todos" ? " · sin transferencias" : ""}`;
  el("#incomeCaption").textContent = `${metrics.incomeCount} ${metrics.incomeCount === 1 ? "ingreso" : "ingresos"} · total ${currency.format(metrics.monthIncome)} · ${selectedOwner === "Todos" ? "todas las cuentas" : ownerLabel(selectedOwner)}`;
  const monthTone = balanceTone(metrics.monthlySavings);
  el("#monthlySavingsCard").className = `metric-card savings-card balance-${monthTone}`;
  el("#monthlySavingsIcon").className = `metric-icon savings-icon balance-${monthTone}`;
  el("#monthlySavingsIcon").textContent = monthTone === "positive" ? "↗" : monthTone === "negative" ? "↘" : "=";
  el("#metricMonthlySavings").textContent = currency.format(metrics.monthlySavings);
  el("#monthlySavingsStatus").textContent = balanceMessage(metrics.monthlySavings);
  el("#expenseCaption").textContent = `${formatMonth(selectedMonth)} · ${selectedOwner === "Todos" ? "todas las cuentas, sin transferencias internas" : ownerLabel(selectedOwner)}`;
  el("#annualThrough").textContent = formatMonth(selectedMonth);
  el("#annualOwner").textContent = selectedOwner === "Todos" ? "Toda la casa" : ownerLabel(selectedOwner);
  el("#annualOwner").className = `annual-owner owner-${ownerKey(selectedOwner)}`;
  el("#annualExpenses").textContent = currency.format(metrics.annualRealExpenses);
  el("#annualMonthCount").textContent = `${metrics.monthsElapsed} ${metrics.monthsElapsed === 1 ? "mes" : "meses"}`;
  const annualTone = balanceTone(metrics.annualSavings);
  el("#annualBalance").textContent = currency.format(metrics.annualSavings);
  el("#annualBalanceCard").className = `annual-metric annual-balance balance-${annualTone}`;
  el("#annualBalanceLabel").textContent = metrics.annualSavings < -0.005 ? "Exceso neto acumulado" : "Ahorro neto acumulado";
  el("#annualBalanceStatus").textContent = balanceMessage(metrics.annualSavings, "acumulado");
}
function renderChart(byCategory) {
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const top = entries.length > 6 ? [...entries.slice(0, 5), ["Otras categorías", entries.slice(5).reduce((sum, item) => sum + item[1], 0)]] : entries;
  const total = top.reduce((sum, [, amount]) => sum + amount, 0);
  const palette = CHART_PALETTES[selectedOwner] || CHART_PALETTES["persona-a"];
  const chartColor = (index) => {
    if (index < palette.length) return palette[index];
    const mix = Math.min(0.72, (index - palette.length + 1) * 0.16);
    const from = palette[palette.length - 1].slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    const to = palette[0].slice(1).match(/.{2}/g).map((value) => parseInt(value, 16));
    return `#${from.map((value, channel) => Math.round(value + (to[channel] - value) * mix).toString(16).padStart(2, "0")).join("")}`;
  };
  let offset = 0;
  const segments = top.map(([, amount], index) => {
    const start = offset;
    const arc = total ? amount / total * 360 : 0;
    offset += arc;
    const separatorStart = Math.max(start, offset - Math.min(1, arc / 4));
    return `${chartColor(index)} ${start}deg ${separatorStart}deg, #fff ${separatorStart}deg ${offset}deg`;
  });
  el("#expenseChart").innerHTML = top.length ? `<div class="category-pie" role="img" aria-label="Gráfico circular: ${escapeHtml(top.map(([name, amount]) => `${name}, ${currency.format(amount)}`).join("; "))}" style="background:conic-gradient(${segments.join(",")})"></div><div class="category-legend">${top.map(([name, amount], index) => {
    const color = chartColor(index);
    const share = total ? amount / total * 100 : 0;
    return `<div class="category-row"><div class="category-label"><span class="category-dot" style="background:${color}"></span><span>${escapeHtml(name)}</span></div><strong class="category-value">${currency.format(amount)}</strong><span class="category-share">${share.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%</span></div>`;
  }).join("")}</div>` : emptyState("Aún no hay gastos este mes. Añade uno para ver el gráfico aquí.");
}
function renderExpenses() {
  const items = monthExpenses().slice().sort((a, b) => (b.period || itemDate(b)).localeCompare(a.period || itemDate(a)) || String(a.name).localeCompare(String(b.name)));
  listTargets.expenses.innerHTML = items.length ? items.map((item) => `<article class="record-item">
    <div class="record-main"><p class="record-title">${escapeHtml(item.name || item.category || "Gasto")}</p><div class="record-meta"><span class="tag" style="background:${softColor(item.category)}">${escapeHtml(item.category || "Otros")}</span><span class="tag owner-tag owner-${ownerKey(item.owner)}"><span class="account-dot ${ownerKey(item.owner)}"></span>${escapeHtml(ownerLabel(item.owner))}</span>${item.note ? `<span title="${escapeHtml(item.note)}">${escapeHtml(item.note)}</span>` : ""}</div></div>
    <strong class="record-amount">${currency.format(Number(item.amount || 0))}</strong><div class="record-actions"><button class="icon-action" type="button" data-action="edit" data-type="expense" data-id="${escapeHtml(item.id)}" aria-label="Editar ${escapeHtml(item.name)}" title="Editar">✎</button><button class="icon-action delete" type="button" data-action="delete" data-type="expense" data-id="${escapeHtml(item.id)}" aria-label="Borrar ${escapeHtml(item.name)}" title="Borrar">×</button></div>
  </article>`).join("") : emptyState("No hay gastos en esta cuenta y mes. Puedes añadir uno con el botón de arriba.");
}
function renderIncomes() {
  const items = monthIncomes();
  listTargets.incomes.innerHTML = items.length ? items.map((item) => `<article class="record-item">
    <div class="record-main"><p class="record-title">${escapeHtml(item.name || item.category || "Ingreso")}</p><div class="record-meta"><span class="tag owner-tag owner-${ownerKey(item.owner)}"><span class="account-dot ${ownerKey(item.owner)}"></span>${escapeHtml(ownerLabel(item.owner))}</span><span>${escapeHtml(formatMonth(item.period || selectedMonth))}</span>${item.category && item.category !== item.name ? `<span class="tag">${escapeHtml(item.category)}</span>` : ""}</div>${item.note ? `<p class="income-note">${escapeHtml(item.note)}</p>` : ""}</div>
    <strong class="record-amount">${currency.format(Number(item.amount || 0))}</strong><div class="record-actions"><button class="icon-action" type="button" data-action="edit" data-type="income" data-id="${escapeHtml(item.id)}" aria-label="Editar ingreso ${escapeHtml(item.name)}" title="Editar">✎</button><button class="icon-action delete" type="button" data-action="delete" data-type="income" data-id="${escapeHtml(item.id)}" aria-label="Borrar ingreso ${escapeHtml(item.name)}" title="Borrar">×</button></div>
  </article>`).join("") : emptyState("No hay ingresos en esta cuenta y mes. Añade uno para incluirlo en el balance.");
}
function renderTasks() {
  const items = state.tasks.slice().sort((a, b) => Number(a.done) - Number(b.done) || String(a.dueDate).localeCompare(String(b.dueDate)));
  listTargets.tasks.innerHTML = items.length ? items.map((item) => `<article class="record-item task-item ${item.done ? "done" : ""}">
    <input class="task-check" type="checkbox" data-action="toggle" data-type="task" data-id="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} aria-label="Marcar ${escapeHtml(item.title)} como completada" />
    <div class="task-content"><div class="task-text"><p class="record-title">${escapeHtml(item.title)}</p><div class="record-meta"><span class="tag priority-${priorityKey(item.priority)}">${escapeHtml(item.priority || "Media")}</span><span>${escapeHtml(formatDate(item.dueDate) || "Sin fecha")}</span></div></div></div>
    <div class="record-actions"><button class="icon-action" type="button" data-action="edit" data-type="task" data-id="${escapeHtml(item.id)}" aria-label="Editar tarea" title="Editar">✎</button><button class="icon-action delete" type="button" data-action="delete" data-type="task" data-id="${escapeHtml(item.id)}" aria-label="Borrar tarea" title="Borrar">×</button></div>
  </article>`).join("") : emptyState("Tu lista está despejada. Añade una tarea para tenerla a mano.");
}
function renderAgenda(upcoming) {
  const all = [
    ...state.reviews.map((item) => ({ ...item, kind: "review", displayTitle: item.title, date: item.date, detail: item.detail, badge: "Revisión" })),
    ...state.renovations.map((item) => ({ ...item, kind: "renovation", displayTitle: item.title, date: item.date, detail: item.status, badge: "Reforma" })),
    ...state.alerts.map((item) => ({ ...item, kind: "alert", displayTitle: item.title, date: item.dueDate, detail: item.message, badge: item.level, done: item.done })),
    ...upcoming.filter((item) => item.kind === "task").map((item) => ({ ...item, displayTitle: item.title, detail: item.priority, badge: "Tarea", done: item.done }))
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  listTargets.agenda.innerHTML = all.length ? all.map((item) => {
    const type = item.kind;
    const statusClass = item.kind === "alert" ? (item.level === "Crítica" ? "critical" : "warning") : item.kind === "renovation" ? (item.status === "Terminada" ? "status-ok" : "warning") : "";
    const action = type === "alert" ? `<input class="task-check" type="checkbox" data-action="toggle" data-type="alert" data-id="${escapeHtml(item.id)}" ${item.done ? "checked" : ""} aria-label="Marcar alerta como resuelta" />` : "";
    const secondaryAction = type === "task" ? "" : `<button class="icon-action" type="button" data-action="edit" data-type="${type}" data-id="${escapeHtml(item.id)}" aria-label="Editar elemento" title="Editar">✎</button><button class="icon-action delete" type="button" data-action="delete" data-type="${type}" data-id="${escapeHtml(item.id)}" aria-label="Borrar elemento" title="Borrar">×</button>`;
    return `<article class="record-item"><div class="record-main"><p class="record-title">${escapeHtml(item.displayTitle)}</p><div class="record-meta"><span class="tag ${statusClass}">${escapeHtml(item.badge || type)}</span><span>${escapeHtml(formatDate(item.date) || "Sin fecha")}</span>${item.detail ? `<span>${escapeHtml(item.detail)}</span>` : ""}</div></div><div class="record-actions">${action}${secondaryAction}</div></article>`;
  }).join("") : emptyState("No hay revisiones, reformas o alertas próximas. Usa + para añadir una.");
}
function renderAppliances() {
  listTargets.appliances.innerHTML = state.appliances.length ? state.appliances.map((item) => `<article class="record-item"><div class="record-main"><p class="record-title">${escapeHtml(item.name)}</p><div class="record-meta"><span class="tag ${item.status === "Correcto" ? "status-ok" : item.status === "Vigilar" ? "warning" : "critical"}">${escapeHtml(item.status)}</span><span>Garantía: ${escapeHtml(formatDate(item.warranty) || "Sin fecha")}</span>${item.nextAction ? `<span>${escapeHtml(item.nextAction)}</span>` : ""}</div></div><div class="record-actions"><button class="icon-action" type="button" data-action="edit" data-type="appliance" data-id="${escapeHtml(item.id)}" aria-label="Editar electrodoméstico" title="Editar">✎</button><button class="icon-action delete" type="button" data-action="delete" data-type="appliance" data-id="${escapeHtml(item.id)}" aria-label="Borrar electrodoméstico" title="Borrar">×</button></div></article>`).join("") : emptyState("Añade los equipos de casa para tener sus garantías y cuidados a mano.");
}
function renderNav() {
  const links = [...document.querySelectorAll(".nav-link")];
  const active = location.hash || "#resumen";
  links.forEach((link) => { link.classList.toggle("active", link.getAttribute("href") === active); });
}

function openModal(type, id = null) {
  const config = modalConfig[type];
  if (!config) return;
  modalContext = { type, id };
  const item = id ? getItem(type, id) : {};
  el("#modalEyebrow").textContent = id ? "EDITAR ELEMENTO" : config.eyebrow;
  el("#modalTitle").textContent = `${id ? "Editar" : "Añadir"} ${config.title.toLocaleLowerCase("es-ES")}`;
  el("#formFields").innerHTML = config.fields.map((field) => renderField(field, item?.[field.name])).join("");
  el("#itemModal").showModal();
  el("#formFields").querySelector("input,select,textarea")?.focus({ preventScroll: true });
}
function renderField(field, value) {
  let fieldValue = value ?? "";
  if (field.name === "period") fieldValue = value || selectedMonth;
  if (field.name === "date") fieldValue = value || `${selectedMonth}-01`;
  if (field.name === "done" && field.type === "select") fieldValue = modalContext.type === "alert" ? (value ? "Resuelta" : "Activa") : (value ? "Completada" : "Pendiente");
  const label = `<label for="field-${field.name}">${field.label}</label>`;
  const wrapper = (input) => `<div class="field ${field.full ? "full" : ""}">${label}${input}</div>`;
  if (field.type === "select") return wrapper(`<select id="field-${field.name}" name="${field.name}" ${field.required ? "required" : ""}>${field.options.map((option) => `<option value="${escapeHtml(option)}" ${String(fieldValue) === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`);
  if (field.type === "textarea") return wrapper(`<textarea id="field-${field.name}" name="${field.name}" ${field.required ? "required" : ""}>${escapeHtml(fieldValue)}</textarea>`);
  return wrapper(`<input id="field-${field.name}" name="${field.name}" type="${field.type}" value="${escapeHtml(fieldValue)}" ${field.min ? `min="${field.min}"` : ""} ${field.step ? `step="${field.step}"` : ""} ${field.required ? "required" : ""} />`);
}
function handleFormSubmit(event) {
  event.preventDefault();
  if (!el("#itemForm").reportValidity()) return;
  submitForm().catch((error) => { console.error(error); showToast(`No se pudo guardar: ${error.message}`); });
}
async function submitForm() {
  const { type, id } = modalContext;
  const config = modalConfig[type];
  if (!config) return;
  const formData = new FormData(el("#itemForm"));
  const item = id ? { ...getItem(type, id) } : { id: createId(type) };
  config.fields.forEach((field) => {
    const value = formData.get(field.name);
    if (["amount", "budget"].includes(field.name)) item[field.name] = Number(value);
    else if (field.name === "done") item.done = value === "Completada" || value === "Resuelta";
    else if (field.name === "period") { item.period = String(value); item.date = `${value}-01`; }
    else item[field.name] = String(value || "").trim();
  });
  if (type === "task" || type === "alert") item.done = Boolean(item.done);
  if (type === "expense" || type === "income") {
    const collection = type === "expense" ? "expenses" : "incomes";
    const saved = await api(`/${collection}${id ? `/${encodeURIComponent(id)}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(item) });
    state[collection] = id ? state[collection].map((entry) => entry.id === id ? saved : entry) : [saved, ...state[collection]];
  } else {
  const collection = collectionFor[type];
  if (id) state[collection] = state[collection].map((entry) => entry.id === id ? item : entry);
  else state[collection] = [item, ...state[collection]];
  saveState(id ? "Elemento actualizado" : "Elemento añadido");
  }
  el("#itemModal").close();
  showToast(`${id ? "Elemento actualizado" : "Elemento añadido"} en PostgreSQL.`);
  render();
}
function handleClick(event) {
  const open = event.target.closest("[data-open-modal]");
  if (open) { openModal(open.dataset.openModal); return; }
  const ownerButton = event.target.closest("[data-owner-filter]");
  if (ownerButton) { selectedOwner = ownerButton.dataset.ownerFilter; render(); return; }
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const { type, id } = action.dataset;
  if (action.dataset.action === "edit") openModal(type, id);
  if (action.dataset.action === "delete") deleteItem(type, id);
}
function handleChange(event) {
  if (event.target.id === "yearPicker") {
    selectedMonth = `${event.target.value}-${selectedMonth.slice(5, 7)}`;
    render();
    return;
  }
  if (event.target.id === "monthPicker") { selectedMonth = event.target.value; render(); return; }
  if (event.target.id === "ownerFilter") { selectedOwner = event.target.value; render(); return; }
  const checkbox = event.target.closest("[data-action='toggle']");
  if (!checkbox) return;
  const item = getItem(checkbox.dataset.type, checkbox.dataset.id);
  if (!item) return;
  item.done = checkbox.checked;
  saveState(checkbox.dataset.type === "alert" ? (item.done ? "Alerta resuelta" : "Alerta reabierta") : (item.done ? "Tarea completada" : "Tarea reabierta"));
  render();
}
async function deleteItem(type, id) {
  if (type === "expense" || type === "income") {
    try {
      const collection = type === "expense" ? "expenses" : "incomes";
      await api(`/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
      state[collection] = state[collection].filter((item) => item.id !== id);
      render(); showToast("Movimiento eliminado de PostgreSQL.");
    } catch (error) { showToast(`No se pudo eliminar: ${error.message}`); }
    return;
  }
  const collection = collectionFor[type];
  if (!collection) return;
  state[collection] = state[collection].filter((item) => item.id !== id);
  saveState("Elemento eliminado");
  render();
}
function getItem(type, id) { const key = collectionFor[type]; return key ? state[key].find((item) => item.id === id) : null; }
function restoreDefaults() {
  if (!window.confirm("Se restablecerán las secciones de planificación. Los ingresos y gastos de PostgreSQL se conservarán.")) return;
  state.tasks = []; state.reviews = []; state.renovations = []; state.appliances = []; state.alerts = [];
  saveState("Planificación restablecida; movimientos financieros conservados");
  selectedMonth = CURRENT_MONTH;
  selectedOwner = "persona-a";
  render();
}
function csvCell(value) {
  let text = value == null ? "" : typeof value === "number" ? value.toLocaleString("es-ES", { maximumFractionDigits: 2 }) : String(value);
  if (typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function buildCsvContent() {
  const columns = ["tipo", "id", "cuenta", "concepto", "categoría", "importe", "moneda", "mes", "fecha", "prioridad", "estado", "detalle", "presupuesto", "garantía hasta", "próxima acción", "origen"];
  const rows = [];
  const addRow = (type, item, fields = {}) => rows.push({
    tipo: type, id: item.id, cuenta: item.owner ? ownerLabel(item.owner) : "", concepto: item.name || item.title || "", categoria: item.category || "",
    importe: item.amount ?? "", moneda: item.amount != null ? "EUR" : "", mes: item.period || "", fecha: "", prioridad: "", estado: "", detalle: item.note || item.detail || item.message || "",
    presupuesto: item.budget ?? "", garantia: item.warranty || "", accion: item.nextAction || "", origen: "App", ...fields
  });
  state.expenses.forEach((item) => addRow("Gasto", item, { origen: String(item.id).startsWith("xls-") ? "Excel importado" : "App" }));
  state.incomes.forEach((item) => addRow("Ingreso", item, { origen: String(item.id).startsWith("xls-") ? "Excel importado" : "App" }));
  state.tasks.forEach((item) => addRow("Tarea", item, { prioridad: item.priority, estado: item.done ? "Completada" : "Pendiente", fecha: item.dueDate }));
  state.reviews.forEach((item) => addRow("Revisión", item, { fecha: item.date }));
  state.renovations.forEach((item) => addRow("Reforma", item, { estado: item.status, fecha: item.date }));
  state.appliances.forEach((item) => addRow("Electrodoméstico", item, { estado: item.status }));
  state.alerts.forEach((item) => addRow("Alerta", item, { prioridad: item.level, estado: item.done ? "Resuelta" : "Activa", fecha: item.dueDate }));
  const keyForColumn = { categoría: "categoria", "garantía hasta": "garantia", "próxima acción": "accion" };
  const header = columns.map(csvCell).join(";");
  const body = rows.map((row) => columns.map((column) => csvCell(row[keyForColumn[column] || column])).join(";")).join("\r\n");
  return `\uFEFF${header}\r\n${body}\r\n`;
}
function exportDataCsv() {
  try {
    const blob = new Blob([buildCsvContent()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `pairbudget-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("CSV descargado. Los datos siguen guardados en este navegador.");
  } catch (error) {
    console.error("No se pudo exportar el CSV.", error);
    showToast("No se pudo crear el CSV en este navegador.");
  }
}
function createId(type) { return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function formatMonth(value) {
  const [year, month] = String(value).split("-").map(Number);
  if (!year || !month) return String(value);
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}
function formatDate(value) {
  const date = parseLocalDate(String(value || "").slice(0, 10));
  return date ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date) : "";
}
function ownerLabel(value) { return value === "persona-a" ? "Persona A" : value === "persona-b" ? "Persona B" : value === "comun" ? "Común" : value || "Sin cuenta"; }
function ownerKey(value) { return value === "persona-a" ? "persona-a" : value === "persona-b" ? "persona-b" : value === "comun" ? "comun" : "todos"; }
function priorityKey(value) { return value === "Alta" ? "high" : value === "Baja" ? "low" : "medium"; }
function softColor() { return "#FBF8F2"; }
function emptyState(message) { return `<div class="empty-state">${escapeHtml(message)}</div>`; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }
function showToast(message) { const toast = el("#toast"); toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600); }

document.addEventListener("click", handleClick);
document.addEventListener("change", handleChange);
document.addEventListener("submit", (event) => { if (event.target.id === "itemForm") handleFormSubmit(event); });
el("#exportDataButton").addEventListener("click", exportDataCsv);
el("#cancelModalButton").addEventListener("click", () => el("#itemModal").close());
el("#closeModalButton").addEventListener("click", () => el("#itemModal").close());
el("#itemModal").addEventListener("click", (event) => { if (event.target === el("#itemModal")) el("#itemModal").close(); });
window.addEventListener("hashchange", renderNav);
render();
loadFinancialData();

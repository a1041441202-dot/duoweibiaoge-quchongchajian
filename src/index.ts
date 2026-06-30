import { bitable } from "@lark-base-open/js-sdk";

// ========== DOM ==========

const tableSelect = document.getElementById("tableSelect") as HTMLSelectElement;
const tableInfoEl = document.getElementById("tableInfo") as HTMLDivElement;
const groupListEl = document.getElementById("groupList") as HTMLDivElement;
const addGroupBtn = document.getElementById("addGroupBtn") as HTMLButtonElement;
const intervalSelect = document.getElementById("intervalSelect") as HTMLSelectElement;
const onceBtn = document.getElementById("onceBtn") as HTMLButtonElement;
const onceResult = document.getElementById("onceResult") as HTMLDivElement;
const addTaskBtn = document.getElementById("addTaskBtn") as HTMLButtonElement;
const taskListEl = document.getElementById("taskList") as HTMLDivElement;
const taskCountEl = document.getElementById("taskCount") as HTMLSpanElement;
const refreshBtn = document.getElementById("refreshBtn") as HTMLButtonElement;

// ========== 类型 ==========

type Logic = "and" | "or";

interface ConditionGroup {
  id: string;
  logic: Logic;
  fieldNames: string[];
}

interface Task {
  id: string;
  tableName: string;
  tableId: string;
  groups: ConditionGroup[];
  intervalMin: number;
  running: boolean;
  timer: ReturnType<typeof setInterval> | null;
  logs: string[];
  lastRun: string;
  lastResult: string;
  totalDeleted: number;
}

// ========== 状态 ==========

const tasks: Task[] = [];
let taskIdCounter = 0;
let groupIdCounter = 0;
const groups: ConditionGroup[] = [];
let tableFieldCache: Map<string, string[]> = new Map();

function uid(): string {
  return "t" + Date.now() + "_" + ++taskIdCounter;
}

function gid(): string {
  return "g" + Date.now() + "_" + ++groupIdCounter;
}

function timeStr(): string {
  return new Date().toLocaleTimeString();
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatGroups(gs: ConditionGroup[]): string {
  return gs.map(g => {
    const fields = g.fieldNames.join(" + ");
    const logic = g.logic === "and" ? "且" : "或";
    return "(" + fields + " " + logic + ")";
  }).join(" 且 ");
}

// ========== 表格 & 字段 ==========

async function loadTables() {
  tableInfoEl.textContent = "加载中...";
  tableInfoEl.style.display = "block";
  try {
    const tableList = await bitable.base.getTableList();
    tableSelect.innerHTML = "";
    tableFieldCache.clear();
    for (const t of tableList) {
      const name = await t.getName();
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = name;
      tableSelect.appendChild(opt);
    }
    if (tableList.length > 0) {
      await onTableChange();
    } else {
      tableSelect.innerHTML = "<option>没有数据表</option>";
      tableInfoEl.textContent = "未找到数据表";
    }
  } catch (e: any) {
    tableSelect.innerHTML = "<option>加载失败</option>";
    tableInfoEl.textContent = "加载失败: " + (e.message || e);
  }
}

async function updateTableInfo(tableId: string) {
  try {
    const table = await bitable.base.getTable(tableId);
    const recordIdList = await table.getRecordIdList();
    const fields = await table.getFieldMetaList();
    tableInfoEl.innerHTML =
      '记录数: <span>' + recordIdList.length + '</span> 条 &nbsp;|&nbsp; ' +
      '字段数: <span>' + fields.length + '</span> 个';
    tableInfoEl.style.display = "block";
  } catch (e: any) {
    tableInfoEl.textContent = "获取信息失败";
  }
}

async function loadFieldsForTable(tableId: string): Promise<string[]> {
  if (tableFieldCache.has(tableId)) return tableFieldCache.get(tableId)!;
  const table = await bitable.base.getTable(tableId);
  const fields = await table.getFieldMetaList();
  const names = fields.map((f) => f.name);
  tableFieldCache.set(tableId, names);
  return names;
}

// ========== 条件组渲染 & 管理 ==========

function initDefaultGroup(names: string[]) {
  groups.length = 0;
  groupIdCounter = 0;
  groups.push({
    id: gid(),
    logic: "and",
    fieldNames: names.length > 0 ? [names[0]] : [""],
  });
  renderGroups();
}

function updateGroupsFields() {
  const tid = tableSelect.value;
  const names = tableFieldCache.has(tid) ? tableFieldCache.get(tid)! : [];
  for (const group of groups) {
    group.fieldNames = group.fieldNames.map(fn => names.includes(fn) ? fn : (names[0] || ""));
  }
  renderGroups();
}

function renderGroups() {
  groupListEl.innerHTML = "";
  const tid = tableSelect.value;
  const names = tableFieldCache.has(tid) ? tableFieldCache.get(tid)! : [];

  groups.forEach((group, gi) => {
    const div = document.createElement("div");
    div.className = "condition-group";
    div.dataset.groupId = group.id;

    // Header: label + logic toggle + remove btn
    const header = document.createElement("div");
    header.className = "group-header";

    const label = document.createElement("span");
    label.className = "group-label";
    label.textContent = "条件组 " + (gi + 1);

    const actions = document.createElement("div");
    actions.className = "group-header-actions";

    const toggle = document.createElement("div");
    toggle.className = "logic-toggle";
    (["and", "or"] as Logic[]).forEach(l => {
      const btn = document.createElement("button");
      btn.dataset.logic = l;
      btn.textContent = l === "and" ? "且(AND)" : "或(OR)";
      if (group.logic === l) btn.classList.add("active");
      toggle.appendChild(btn);
    });
    actions.appendChild(toggle);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-group-btn";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "删除条件组";
    if (groups.length <= 1) removeBtn.disabled = true;
    actions.appendChild(removeBtn);

    header.appendChild(label);
    header.appendChild(actions);
    div.appendChild(header);

    // Field rows
    const fieldList = document.createElement("div");
    fieldList.className = "field-list";
    group.fieldNames.forEach((fname) => {
      const row = document.createElement("div");
      row.className = "field-row";

      const sel = document.createElement("select");
      sel.className = "field-select";
      if (names.length === 0) {
        sel.innerHTML = "<option>该表没有字段</option>";
        sel.disabled = true;
      } else {
        names.forEach(n => {
          const opt = document.createElement("option");
          opt.value = n;
          opt.textContent = n;
          if (n === fname) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      const rmBtn = document.createElement("button");
      rmBtn.className = "remove-field";
      rmBtn.innerHTML = "&minus;";
      rmBtn.title = "删除字段";
      rmBtn.disabled = group.fieldNames.length <= 1;

      row.appendChild(sel);
      row.appendChild(rmBtn);
      fieldList.appendChild(row);
    });
    div.appendChild(fieldList);

    // Add field button
    const addFieldBtn = document.createElement("button");
    addFieldBtn.className = "add-field-btn add-field-in-group";
    addFieldBtn.textContent = "+ 添加字段";
    div.appendChild(addFieldBtn);

    // Append group (with connector before it if not first)
    if (gi > 0) {
      const conn = document.createElement("div");
      conn.className = "group-connector";
      conn.textContent = "且 (AND)";
      groupListEl.appendChild(conn);
    }
    groupListEl.appendChild(div);
  });
}

// Event delegation for group interactions
groupListEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  // Logic toggle
  const logicBtn = target.closest("button[data-logic]") as HTMLElement | null;
  if (logicBtn && logicBtn.closest(".condition-group")) {
    const groupEl = logicBtn.closest(".condition-group")!;
    const g = groups.find(g => g.id === groupEl.dataset.groupId);
    if (g) {
      g.logic = logicBtn.dataset.logic as Logic;
      renderGroups();
    }
    return;
  }

  // Remove field
  const removeFieldBtn = target.closest(".remove-field") as HTMLElement | null;
  if (removeFieldBtn) {
    const row = removeFieldBtn.closest(".field-row") as HTMLElement;
    const groupEl = row?.closest(".condition-group") as HTMLElement | null;
    if (groupEl && row) {
      const g = groups.find(g => g.id === groupEl.dataset.groupId);
      if (g && g.fieldNames.length > 1) {
        const idx = Array.from(groupEl.querySelectorAll(".field-row")).indexOf(row);
        if (idx !== -1) {
          g.fieldNames.splice(idx, 1);
          renderGroups();
        }
      }
    }
    return;
  }

  // Remove group
  const removeGroupBtn = target.closest(".remove-group-btn") as HTMLElement | null;
  if (removeGroupBtn) {
    const groupEl = removeGroupBtn.closest(".condition-group") as HTMLElement | null;
    if (groupEl && groups.length > 1) {
      const idx = groups.findIndex(g => g.id === groupEl.dataset.groupId);
      if (idx !== -1) {
        groups.splice(idx, 1);
        renderGroups();
      }
    }
    return;
  }

  // Add field within group
  const addFieldInGroup = target.closest(".add-field-in-group") as HTMLElement | null;
  if (addFieldInGroup) {
    const groupEl = addFieldInGroup.closest(".condition-group") as HTMLElement;
    const g = groups.find(g => g.id === groupEl.dataset.groupId);
    if (g) {
      const tid = tableSelect.value;
      const names = tableFieldCache.has(tid) ? tableFieldCache.get(tid)! : [];
      g.fieldNames.push(names[0] || "");
      renderGroups();
    }
    return;
  }
});

// Field select change — update groups array
groupListEl.addEventListener("change", (e) => {
  const sel = e.target as HTMLSelectElement;
  if (!sel.classList.contains("field-select")) return;
  const row = sel.closest(".field-row") as HTMLElement;
  const groupEl = row?.closest(".condition-group") as HTMLElement | null;
  if (!groupEl || !row) return;
  const g = groups.find(g => g.id === groupEl.dataset.groupId);
  if (!g) return;
  const idx = Array.from(groupEl.querySelectorAll(".field-row")).indexOf(row);
  if (idx !== -1) g.fieldNames[idx] = sel.value;
});

// Add new condition group
addGroupBtn.addEventListener("click", () => {
  const tid = tableSelect.value;
  const names = tableFieldCache.has(tid) ? tableFieldCache.get(tid)! : [];
  groups.push({
    id: gid(),
    logic: "or",
    fieldNames: names.length > 0 ? [names[0]] : [""],
  });
  renderGroups();
});

// ========== 表格切换 ==========

async function onTableChange() {
  const tid = tableSelect.value;
  if (!tid) return;

  tableInfoEl.textContent = "加载中...";

  try {
    const names = await loadFieldsForTable(tid);
    if (groups.length === 0) {
      initDefaultGroup(names);
    } else {
      updateGroupsFields();
    }
    updateTableInfo(tid);
  } catch (e: any) {
    tableInfoEl.textContent = "加载失败";
  }
}

tableSelect.addEventListener("change", onTableChange);

// ========== 收集当前表单配置 ==========

function getFormConfig(): { tableName: string; tableId: string; groups: ConditionGroup[] } | null {
  const selectedOpt = tableSelect.options[tableSelect.selectedIndex];
  const tableName = selectedOpt ? selectedOpt.textContent : "";
  const tableId = tableSelect.value;
  if (!tableId) return null;

  const validGroups: ConditionGroup[] = [];
  for (const g of groups) {
    const fieldNames = g.fieldNames.filter(n => n !== "");
    if (fieldNames.length > 0) {
      validGroups.push({ id: g.id, logic: g.logic, fieldNames });
    }
  }
  if (validGroups.length === 0) return null;

  return { tableName, tableId, groups: validGroups };
}

// ========== 去重核心 ==========

const valToStr = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.map((v) => valToStr(v)).filter(Boolean).join(",");
  if (typeof val === "object") {
    if (val.text !== undefined) return String(val.text);
    if (val.name !== undefined) return String(val.name);
    if (val.title !== undefined) return String(val.title);
    if (val.link !== undefined) return String(val.link);
    if (val.url !== undefined) return String(val.url);
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  return String(val);
};

async function dedup(
  tableId: string,
  groupConfigs: ConditionGroup[],
  onLog?: (msg: string) => void
): Promise<{ total: number; deleted: number }> {
  const log = onLog || (() => {});

  const table = await bitable.base.getTable(tableId);
  const recordIdList = await table.getRecordIdList();

  if (recordIdList.length === 0) {
    log("表为空");
    return { total: 0, deleted: 0 };
  }

  const groupFieldInstances = new Map<string, any[]>();
  for (const g of groupConfigs) {
    const instances: any[] = [];
    for (const fname of g.fieldNames) {
      const fieldMeta = await table.getFieldByName(fname);
      if (!fieldMeta) {
        log("字段 " + fname + " 不存在");
        return { total: recordIdList.length, deleted: 0 };
      }
      instances.push(await table.getField(fieldMeta.id));
    }
    groupFieldInstances.set(g.id, instances);
  }

  const andGroups = groupConfigs.filter(g => g.logic === "and");
  const orGroups = groupConfigs.filter(g => g.logic === "or");

  const seen = new Map<string, Map<string, string>>();
  const toDelete: string[] = [];

  for (const recordId of recordIdList) {
    let hasAnyValue = false;

    const andParts: string[] = [];
    for (const g of andGroups) {
      const fields = groupFieldInstances.get(g.id)!;
      const vals: string[] = [];
      for (const f of fields) {
        const s = valToStr(await f.getValue(recordId));
        vals.push(s);
        if (s !== "") hasAnyValue = true;
      }
      andParts.push(vals.join("\x00"));
    }

    const orValues: string[] = [];
    for (const g of orGroups) {
      const fields = groupFieldInstances.get(g.id)!;
      for (const f of fields) {
        const s = valToStr(await f.getValue(recordId));
        if (s !== "") {
          orValues.push(s);
          hasAnyValue = true;
        }
      }
    }

    if (!hasAnyValue) continue;

    const andKey = andParts.join("\x01");

    if (seen.has(andKey)) {
      const seenOr = seen.get(andKey)!;
      if (orValues.length === 0 || orValues.some(v => seenOr.has(v))) {
        toDelete.push(recordId);
      } else {
        for (const v of orValues) seenOr.set(v, recordId);
      }
    } else {
      const m = new Map<string, string>();
      for (const v of orValues) m.set(v, recordId);
      seen.set(andKey, m);
    }
  }

  if (toDelete.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      await table.deleteRecords(toDelete.slice(i, i + batchSize));
    }
    log("删除 " + toDelete.length + " 条重复（共 " + recordIdList.length + " 条）");
  } else {
    log("无重复（共 " + recordIdList.length + " 条）");
  }

  return { total: recordIdList.length, deleted: toDelete.length };
}

// ========== 单次执行 ==========

onceBtn.addEventListener("click", async () => {
  const cfg = getFormConfig();
  if (!cfg) return;

  onceBtn.disabled = true;
  onceBtn.textContent = "执行中...";
  onceResult.style.display = "block";
  onceResult.className = "one-shot-result";
  onceResult.textContent = "[" + timeStr() + "] 正在执行...";

  try {
    const result = await dedup(cfg.tableId, cfg.groups, (msg) => {
      onceResult.textContent = "[" + timeStr() + "] " + msg;
    });
    if (result.deleted > 0) {
      onceResult.className = "one-shot-result";
      onceResult.textContent = "[" + timeStr() + "] 完成 — 删除 " + result.deleted + " 条重复（共 " + result.total + " 条）";
    } else {
      onceResult.className = "one-shot-result";
      onceResult.textContent = "[" + timeStr() + "] 完成 — 无重复数据（共 " + result.total + " 条）";
    }
  } catch (e: any) {
    onceResult.className = "one-shot-result error";
    onceResult.textContent = "[" + timeStr() + "] 出错: " + (e.message || e);
  }

  onceBtn.disabled = false;
  onceBtn.textContent = "立即执行一次";
  updateTableInfo(cfg.tableId);
});

// ========== 定时任务 ==========

async function dedupTask(task: Task) {
  task.lastRun = timeStr();
  const log = (m: string) => {
    task.logs.push("[" + timeStr() + "] " + m);
    if (task.logs.length > 50) task.logs.shift();
    renderTasks();
  };

  log("开始去重...");
  try {
    const result = await dedup(task.tableId, task.groups, log);
    task.lastResult = result.deleted > 0 ? "删除 " + result.deleted + " 条" : "无重复";
    task.totalDeleted += result.deleted;
  } catch (e: any) {
    task.lastResult = "出错";
    log("出错: " + (e.message || e));
  }
}

function startTask(task: Task) {
  if (task.running) return;
  task.running = true;
  task.logs = [];
  dedupTask(task);
  task.timer = setInterval(() => dedupTask(task), task.intervalMin * 60 * 1000);
  renderTasks();
}

function stopTask(task: Task) {
  task.running = false;
  if (task.timer) { clearInterval(task.timer); task.timer = null; }
  renderTasks();
}

function removeTask(task: Task) {
  stopTask(task);
  const idx = tasks.indexOf(task);
  if (idx !== -1) tasks.splice(idx, 1);
  renderTasks();
}

// ========== 渲染任务列表 ==========

function renderTasks() {
  const runningCount = tasks.filter((t) => t.running).length;
  taskCountEl.textContent = runningCount > 0 ? runningCount + " 个运行中" : "";

  if (tasks.length === 0) {
    taskListEl.innerHTML = '<div class="empty">暂无运行中的任务</div>';
    return;
  }

  taskListEl.innerHTML = "";
  for (const task of tasks) {
    const card = document.createElement("div");
    card.className = "task-card " + (task.running ? "running" : "stopped");

    const groupsDisplay = formatGroups(task.groups);

    card.innerHTML =
      '<div class="task-header">' +
        '<div class="task-title">' + escHtml(task.tableName) + '</div>' +
        '<span class="task-badge' + (task.running ? "" : " idle") + '">' +
          (task.running ? "运行中" : "已暂停") +
        '</span>' +
      '</div>' +
      '<div class="task-detail">' +
        '去重条件: <b>' + escHtml(groupsDisplay) + '</b><br>' +
        '执行间隔: <b>每 ' + task.intervalMin + ' 分钟</b>' +
        (task.lastRun
          ? '<br>上次执行: ' + escHtml(task.lastRun) + ' — <b>' + escHtml(task.lastResult) + '</b>'
          : "") +
        (task.totalDeleted > 0
          ? ' | 累计删除: <b style="color:#ff4d4f">' + task.totalDeleted + '</b> 条'
          : "") +
      '</div>' +
      '<div class="task-meta">' +
        (task.running ? '下次执行: ' + task.intervalMin + ' 分钟后' : '已暂停') +
      '</div>' +
      '<div class="task-actions">' +
        (task.running
          ? '<button class="btn-stop" data-action="stop" data-id="' + task.id + '">暂停</button>'
          : '<button data-action="start" data-id="' + task.id + '">启动</button>') +
        '<button class="btn-remove" data-action="remove" data-id="' + task.id + '">删除任务</button>' +
      '</div>';

    if (task.logs.length > 0) {
      const logDiv = document.createElement("div");
      logDiv.className = "task-log";
      logDiv.textContent = task.logs.join("\n");
      logDiv.scrollTop = logDiv.scrollHeight;
      card.appendChild(logDiv);
    }

    taskListEl.appendChild(card);
  }
}

// ========== 事件委托 ==========

taskListEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  if (action === "start") startTask(task);
  else if (action === "stop") stopTask(task);
  else if (action === "remove") removeTask(task);
});

// ========== 添加定时任务 ==========

addTaskBtn.addEventListener("click", () => {
  const cfg = getFormConfig();
  if (!cfg) return;

  const intervalMin = Number(intervalSelect.value);
  const task: Task = {
    id: uid(),
    tableName: cfg.tableName,
    tableId: cfg.tableId,
    groups: cfg.groups,
    intervalMin,
    running: false,
    timer: null,
    logs: [],
    lastRun: "",
    lastResult: "",
    totalDeleted: 0,
  };

  tasks.push(task);
  startTask(task);
});

// ========== 刷新 ==========

refreshBtn.addEventListener("click", () => {
  tableFieldCache.clear();
  loadTables();
});

// ========== 监听用户在飞书中切换数据表 ==========

try {
  bitable.base.onSelectionChange((event: { data: { tableId?: string } }) => {
    const tableId = event.data?.tableId;
    if (tableId && tableSelect.value !== tableId) {
      tableSelect.value = tableId;
      onTableChange();
    }
  });
} catch (_) {}

try {
  bitable.base.onTableAdd(() => loadTables());
} catch (_) {}
try {
  bitable.base.onTableDelete(() => loadTables());
} catch (_) {}

// ========== 初始化 ==========

loadTables();

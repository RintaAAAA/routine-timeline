(function () {
  "use strict";

  var STORAGE_KEY = "routine-timeline-v1";

  var CATEGORY_META = {
    medication: { label: "服薬", colorVar: "--series-1", defaultIcon: "💊" },
    workout: { label: "運動", colorVar: "--series-2", defaultIcon: "💪" },
    study: { label: "勉強", colorVar: "--series-3", defaultIcon: "📖" },
    other: { label: "その他", colorVar: "--series-4", defaultIcon: "⭐" },
  };

  var state = loadState();

  var els = {
    quickLogGrid: document.getElementById("quickLogGrid"),
    emptyRoutineHint: document.getElementById("emptyRoutineHint"),
    todaySummary: document.getElementById("todaySummary"),
    timeline: document.getElementById("timeline"),
    emptyTimelineHint: document.getElementById("emptyTimelineHint"),

    openAddRoutine: document.getElementById("openAddRoutine"),
    addRoutineDialog: document.getElementById("addRoutineDialog"),
    addRoutineForm: document.getElementById("addRoutineForm"),
    routineName: document.getElementById("routineName"),
    routineCategory: document.getElementById("routineCategory"),
    routineIcon: document.getElementById("routineIcon"),
    cancelAddRoutine: document.getElementById("cancelAddRoutine"),

    logDetailDialog: document.getElementById("logDetailDialog"),
    logDetailForm: document.getElementById("logDetailForm"),
    logDetailTitle: document.getElementById("logDetailTitle"),
    logTimestamp: document.getElementById("logTimestamp"),
    logNote: document.getElementById("logNote"),
    cancelLogDetail: document.getElementById("cancelLogDetail"),

    manageRoutinesBtn: document.getElementById("manageRoutinesBtn"),
    manageRoutinesDialog: document.getElementById("manageRoutinesDialog"),
    manageRoutinesList: document.getElementById("manageRoutinesList"),
    closeManageRoutines: document.getElementById("closeManageRoutines"),

    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),
    toastUndo: document.getElementById("toastUndo"),
  };

  var pendingDetailRoutineId = null;
  var toastTimer = null;

  init();

  function init() {
    els.openAddRoutine.addEventListener("click", function () {
      els.addRoutineForm.reset();
      els.addRoutineDialog.showModal();
    });
    els.cancelAddRoutine.addEventListener("click", function () {
      els.addRoutineDialog.close();
    });
    els.addRoutineForm.addEventListener("submit", onAddRoutineSubmit);

    els.cancelLogDetail.addEventListener("click", function () {
      els.logDetailDialog.close();
      pendingDetailRoutineId = null;
    });
    els.logDetailForm.addEventListener("submit", onLogDetailSubmit);

    els.manageRoutinesBtn.addEventListener("click", function () {
      renderManageList();
      els.manageRoutinesDialog.showModal();
    });
    els.closeManageRoutines.addEventListener("click", function () {
      els.manageRoutinesDialog.close();
    });

    renderAll();
  }

  // ---------- state ----------

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { routines: [], logs: [] };
      var parsed = JSON.parse(raw);
      return {
        routines: Array.isArray(parsed.routines) ? parsed.routines : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    } catch (e) {
      return { routines: [], logs: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function getRoutine(id) {
    for (var i = 0; i < state.routines.length; i++) {
      if (state.routines[i].id === id) return state.routines[i];
    }
    return null;
  }

  // ---------- render ----------

  function renderAll() {
    renderQuickLogGrid();
    renderTodaySummary();
    renderTimeline();
  }

  function renderQuickLogGrid() {
    els.quickLogGrid.innerHTML = "";
    var hasRoutines = state.routines.length > 0;
    els.emptyRoutineHint.hidden = hasRoutines;

    state.routines.forEach(function (routine) {
      var meta = CATEGORY_META[routine.category] || CATEGORY_META.other;

      var card = document.createElement("button");
      card.type = "button";
      card.className = "routine-card";
      card.style.setProperty("--card-color", "var(" + meta.colorVar + ")");
      card.setAttribute("aria-label", routine.name + "を記録");

      var icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = routine.icon || meta.defaultIcon;

      var info = document.createElement("span");
      info.className = "info";

      var name = document.createElement("span");
      name.className = "name";
      name.textContent = routine.name;

      var category = document.createElement("span");
      category.className = "category";
      category.textContent = meta.label;

      info.appendChild(name);
      info.appendChild(document.createElement("br"));
      info.appendChild(category);

      var detailBtn = document.createElement("span");
      detailBtn.className = "detail-btn";
      detailBtn.textContent = "⋯";
      detailBtn.setAttribute("role", "button");
      detailBtn.setAttribute("aria-label", routine.name + "の詳細を記録");

      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(detailBtn);

      card.addEventListener("click", function (e) {
        if (e.target === detailBtn) {
          openLogDetail(routine.id);
        } else {
          quickLog(routine.id);
        }
      });

      els.quickLogGrid.appendChild(card);
    });
  }

  function renderTodaySummary() {
    if (state.routines.length === 0) {
      els.todaySummary.hidden = true;
      return;
    }
    var todayStr = toDateStr(new Date());
    var doneIds = new Set();
    state.logs.forEach(function (log) {
      if (toDateStr(new Date(log.timestamp)) === todayStr) {
        doneIds.add(log.routineId);
      }
    });
    els.todaySummary.hidden = false;
    els.todaySummary.textContent =
      "今日: " + doneIds.size + " / " + state.routines.length + " 種類のルーティンを記録済み";
  }

  function renderTimeline() {
    els.timeline.innerHTML = "";
    var logs = state.logs.slice().sort(function (a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    els.emptyTimelineHint.hidden = logs.length > 0;
    if (logs.length === 0) return;

    var groups = [];
    var groupByDate = {};
    logs.forEach(function (log) {
      var dateStr = toDateStr(new Date(log.timestamp));
      if (!groupByDate[dateStr]) {
        groupByDate[dateStr] = [];
        groups.push(dateStr);
      }
      groupByDate[dateStr].push(log);
    });

    groups.forEach(function (dateStr) {
      var groupEl = document.createElement("div");
      groupEl.className = "timeline-date-group";

      var label = document.createElement("p");
      label.className = "timeline-date-label";
      label.textContent = dateGroupLabel(dateStr);
      groupEl.appendChild(label);

      groupByDate[dateStr].forEach(function (log) {
        groupEl.appendChild(renderTimelineEntry(log));
      });

      els.timeline.appendChild(groupEl);
    });
  }

  function renderTimelineEntry(log) {
    var routine = getRoutine(log.routineId);
    var meta = CATEGORY_META[(routine && routine.category) || "other"] || CATEGORY_META.other;

    var entry = document.createElement("div");
    entry.className = "timeline-entry";

    var dot = document.createElement("span");
    dot.className = "dot";
    dot.style.setProperty("--dot-color", "var(" + meta.colorVar + ")");

    var body = document.createElement("div");
    body.className = "body";

    var row1 = document.createElement("div");
    row1.className = "row1";

    var name = document.createElement("span");
    name.className = "routine-name";
    name.textContent = routine ? (routine.icon || meta.defaultIcon) + " " + routine.name : "(削除済み)";

    var category = document.createElement("span");
    category.className = "category-label";
    category.textContent = meta.label;

    var time = document.createElement("span");
    time.className = "time";
    time.textContent = formatTime(new Date(log.timestamp));

    row1.appendChild(name);
    row1.appendChild(category);
    row1.appendChild(time);
    body.appendChild(row1);

    if (log.note) {
      var note = document.createElement("div");
      note.className = "note";
      note.textContent = log.note;
      body.appendChild(note);
    }

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "削除");
    deleteBtn.addEventListener("click", function () {
      deleteLog(log.id);
    });

    entry.appendChild(dot);
    entry.appendChild(body);
    entry.appendChild(deleteBtn);
    return entry;
  }

  function renderManageList() {
    els.manageRoutinesList.innerHTML = "";
    if (state.routines.length === 0) {
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = "ルーティンがまだ登録されていません";
      els.manageRoutinesList.appendChild(p);
      return;
    }

    state.routines.forEach(function (routine) {
      var meta = CATEGORY_META[routine.category] || CATEGORY_META.other;
      var count = state.logs.filter(function (l) {
        return l.routineId === routine.id;
      }).length;

      var item = document.createElement("div");
      item.className = "manage-item";

      var swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.setProperty("--swatch-color", "var(" + meta.colorVar + ")");

      var info = document.createElement("div");
      info.className = "info";

      var name = document.createElement("div");
      name.className = "name";
      name.textContent = (routine.icon || meta.defaultIcon) + " " + routine.name;

      var metaLine = document.createElement("div");
      metaLine.className = "meta";
      metaLine.textContent = meta.label + " ・ 記録 " + count + " 件";

      info.appendChild(name);
      info.appendChild(metaLine);

      var deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "delete-btn";
      deleteBtn.textContent = "削除";
      deleteBtn.addEventListener("click", function () {
        deleteRoutine(routine.id);
      });

      item.appendChild(swatch);
      item.appendChild(info);
      item.appendChild(deleteBtn);
      els.manageRoutinesList.appendChild(item);
    });
  }

  // ---------- actions ----------

  function onAddRoutineSubmit(e) {
    e.preventDefault();
    var name = els.routineName.value.trim();
    if (!name) return;

    var routine = {
      id: newId(),
      name: name,
      category: els.routineCategory.value,
      icon: els.routineIcon.value.trim(),
    };
    state.routines.push(routine);
    saveState();
    els.addRoutineDialog.close();
    renderAll();
    showToast(name + " を追加しました");
  }

  function quickLog(routineId) {
    var routine = getRoutine(routineId);
    if (!routine) return;
    var log = { id: newId(), routineId: routineId, timestamp: new Date().toISOString(), note: "" };
    state.logs.push(log);
    saveState();
    renderTodaySummary();
    renderTimeline();
    showToast(routine.name + " を記録しました", function () {
      undoLog(log.id);
    });
  }

  function undoLog(logId) {
    state.logs = state.logs.filter(function (l) {
      return l.id !== logId;
    });
    saveState();
    renderTodaySummary();
    renderTimeline();
  }

  function deleteLog(logId) {
    var removed = state.logs.find(function (l) {
      return l.id === logId;
    });
    if (!removed) return;
    state.logs = state.logs.filter(function (l) {
      return l.id !== logId;
    });
    saveState();
    renderTodaySummary();
    renderTimeline();
    showToast("記録を削除しました", function () {
      state.logs.push(removed);
      saveState();
      renderTodaySummary();
      renderTimeline();
    });
  }

  function deleteRoutine(routineId) {
    var routine = getRoutine(routineId);
    if (!routine) return;
    var removedLogs = state.logs.filter(function (l) {
      return l.routineId === routineId;
    });
    state.routines = state.routines.filter(function (r) {
      return r.id !== routineId;
    });
    state.logs = state.logs.filter(function (l) {
      return l.routineId !== routineId;
    });
    saveState();
    renderAll();
    renderManageList();
    showToast(routine.name + " を削除しました", function () {
      state.routines.push(routine);
      state.logs = state.logs.concat(removedLogs);
      saveState();
      renderAll();
    });
  }

  function openLogDetail(routineId) {
    var routine = getRoutine(routineId);
    if (!routine) return;
    pendingDetailRoutineId = routineId;
    els.logDetailTitle.textContent = routine.name + "を記録";
    els.logTimestamp.value = formatDatetimeLocal(new Date());
    els.logNote.value = "";
    els.logDetailDialog.showModal();
  }

  function onLogDetailSubmit(e) {
    e.preventDefault();
    if (!pendingDetailRoutineId) return;
    var routine = getRoutine(pendingDetailRoutineId);
    if (!routine) return;

    var timestampValue = els.logTimestamp.value;
    var date = timestampValue ? new Date(timestampValue) : new Date();

    var log = {
      id: newId(),
      routineId: pendingDetailRoutineId,
      timestamp: date.toISOString(),
      note: els.logNote.value.trim(),
    };
    state.logs.push(log);
    saveState();
    els.logDetailDialog.close();
    pendingDetailRoutineId = null;
    renderTodaySummary();
    renderTimeline();
    showToast(routine.name + " を記録しました", function () {
      undoLog(log.id);
    });
  }

  // ---------- toast ----------

  function showToast(message, undoAction) {
    clearTimeout(toastTimer);
    els.toastMessage.textContent = message;
    els.toastUndo.hidden = !undoAction;
    els.toastUndo.onclick = function () {
      els.toast.hidden = true;
      if (undoAction) undoAction();
    };
    els.toast.hidden = false;
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 4000);
  }

  // ---------- date/time helpers ----------

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDateStr(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function formatDatetimeLocal(date) {
    return toDateStr(date) + "T" + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function formatTime(date) {
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function dateGroupLabel(dateStr) {
    var today = new Date();
    var todayStr = toDateStr(today);
    var yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    var yesterdayStr = toDateStr(yesterday);

    if (dateStr === todayStr) return "今日";
    if (dateStr === yesterdayStr) return "昨日";

    var parts = dateStr.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var weekday = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
    return d.getMonth() + 1 + "月" + d.getDate() + "日(" + weekday + ")";
  }
})();

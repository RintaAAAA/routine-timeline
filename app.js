(function () {
  "use strict";

  var STORAGE_KEY = "routine-timeline-v1";

  var CATEGORY_META = {
    medication: { label: "服薬", colorVar: "--series-1", defaultIcon: "💊" },
    workout: { label: "運動", colorVar: "--series-2", defaultIcon: "💪" },
    study: { label: "勉強", colorVar: "--series-3", defaultIcon: "📖" },
    other: { label: "その他", colorVar: "--series-4", defaultIcon: "⭐" },
  };

  var STRIP_DAYS = 14; // 統計の記録ストリップに表示する日数
  var RATE_DAYS = 30; // 達成率の集計上限日数

  var state = loadState();

  var els = {
    quickLogGrid: document.getElementById("quickLogGrid"),
    emptyRoutineHint: document.getElementById("emptyRoutineHint"),
    todaySummary: document.getElementById("todaySummary"),
    statsSection: document.getElementById("statsSection"),
    statTiles: document.getElementById("statTiles"),
    statRoutines: document.getElementById("statRoutines"),
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
    renderStats();
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

      var streak = currentStreak(logDateSet(routine.id));
      if (streak > 0) {
        category.textContent = meta.label + " ・ 🔥" + streak + "日";
      }

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

  // ---------- stats ----------

  // routineId を省略すると全ルーティン合算（どれか1つでも記録した日）
  function logDateSet(routineId) {
    var set = {};
    state.logs.forEach(function (log) {
      if (routineId && log.routineId !== routineId) return;
      set[toDateStr(new Date(log.timestamp))] = true;
    });
    return set;
  }

  function addDays(date, n) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function parseDateStr(str) {
    var p = str.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  // 今日まだ記録していなくても、昨日まで続いていれば連続は途切れていない扱い
  function currentStreak(set) {
    var d = addDays(new Date(), 0);
    if (!set[toDateStr(d)]) d = addDays(d, -1);
    var n = 0;
    while (set[toDateStr(d)]) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }

  function bestStreak(set) {
    var keys = Object.keys(set).sort();
    var best = 0;
    var run = 0;
    var prev = null;
    keys.forEach(function (k) {
      if (prev && toDateStr(addDays(prev, 1)) === k) run++;
      else run = 1;
      if (run > best) best = run;
      prev = parseDateStr(k);
    });
    return best;
  }

  // 記録開始日から今日まで（最大30日）のうち、記録した日の割合。記録が無ければ null
  function achievementRate(set) {
    var keys = Object.keys(set).sort();
    if (keys.length === 0) return null;
    var today = addDays(new Date(), 0);
    var span = Math.round((today - parseDateStr(keys[0])) / 86400000) + 1;
    var days = Math.min(RATE_DAYS, Math.max(span, 1));
    var done = 0;
    for (var i = 0; i < days; i++) {
      if (set[toDateStr(addDays(today, -i))]) done++;
    }
    return Math.round((done / days) * 100);
  }

  function renderStats() {
    els.statTiles.innerHTML = "";
    els.statRoutines.innerHTML = "";

    if (state.routines.length === 0 || state.logs.length === 0) {
      els.statsSection.hidden = true;
      return;
    }
    els.statsSection.hidden = false;

    var allSet = logDateSet();
    var today = addDays(new Date(), 0);
    var last7 = 0;
    state.logs.forEach(function (log) {
      var diff = Math.round((today - addDays(new Date(log.timestamp), 0)) / 86400000);
      if (diff >= 0 && diff < 7) last7++;
    });

    addTile("連続記録", currentStreak(allSet) + "日", "最長 " + bestStreak(allSet) + "日");
    addTile("直近7日", last7 + "回", "記録数");
    addTile("累計", state.logs.length + "回", Object.keys(allSet).length + "日分");

    state.routines.forEach(function (routine) {
      var meta = CATEGORY_META[routine.category] || CATEGORY_META.other;
      var set = logDateSet(routine.id);
      var total = state.logs.filter(function (l) {
        return l.routineId === routine.id;
      }).length;
      var rate = achievementRate(set);

      var row = document.createElement("div");
      row.className = "stat-row";
      row.style.setProperty("--row-color", "var(" + meta.colorVar + ")");

      var head = document.createElement("div");
      head.className = "stat-row-head";

      var name = document.createElement("span");
      name.className = "stat-name";
      name.textContent = (routine.icon || meta.defaultIcon) + " " + routine.name;

      var streak = document.createElement("span");
      streak.className = "stat-streak";
      var cur = currentStreak(set);
      streak.textContent = cur > 0 ? "🔥 " + cur + "日連続" : "連続なし";

      head.appendChild(name);
      head.appendChild(streak);

      var detail = document.createElement("div");
      detail.className = "stat-detail";
      detail.textContent =
        "最長 " + bestStreak(set) + "日 ・ 達成率 " + (rate === null ? "—" : rate + "%") + " ・ 累計 " + total + "回";

      var strip = document.createElement("div");
      strip.className = "stat-strip";
      var doneCount = 0;
      for (var i = STRIP_DAYS - 1; i >= 0; i--) {
        var d = addDays(today, -i);
        var ds = toDateStr(d);
        var cell = document.createElement("span");
        cell.className = "stat-cell";
        cell.title = d.getMonth() + 1 + "/" + d.getDate();
        if (set[ds]) {
          cell.classList.add("on");
          doneCount++;
        }
        strip.appendChild(cell);
      }
      strip.setAttribute("role", "img");
      strip.setAttribute("aria-label", "直近" + STRIP_DAYS + "日中 " + doneCount + "日記録");

      var axis = document.createElement("div");
      axis.className = "stat-axis";
      var axisStart = document.createElement("span");
      axisStart.textContent = STRIP_DAYS + "日前";
      var axisEnd = document.createElement("span");
      axisEnd.textContent = "今日";
      axis.appendChild(axisStart);
      axis.appendChild(axisEnd);

      row.appendChild(head);
      row.appendChild(detail);
      row.appendChild(strip);
      row.appendChild(axis);
      els.statRoutines.appendChild(row);
    });
  }

  function addTile(label, value, sub) {
    var tile = document.createElement("div");
    tile.className = "stat-tile";

    var l = document.createElement("div");
    l.className = "stat-tile-label";
    l.textContent = label;

    var v = document.createElement("div");
    v.className = "stat-tile-value";
    v.textContent = value;

    var s = document.createElement("div");
    s.className = "stat-tile-sub";
    s.textContent = sub;

    tile.appendChild(l);
    tile.appendChild(v);
    tile.appendChild(s);
    els.statTiles.appendChild(tile);
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
    renderAll();
    showToast(routine.name + " を記録しました", function () {
      undoLog(log.id);
    });
  }

  function undoLog(logId) {
    state.logs = state.logs.filter(function (l) {
      return l.id !== logId;
    });
    saveState();
    renderAll();
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
    renderAll();
    showToast("記録を削除しました", function () {
      state.logs.push(removed);
      saveState();
      renderAll();
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
    renderAll();
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

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

  var VIEW_KEY = "routine-timeline-view";
  var WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];
  var WEEK_HEAD = ["月", "火", "水", "木", "金", "土", "日"]; // 週は月曜始まり

  var state = loadState();

  var now = new Date();
  var calState = {
    year: now.getFullYear(),
    month: now.getMonth(),
    filter: "all",
    selected: null, // init() で今日にする
  };

  var els = {
    quickLogGrid: document.getElementById("quickLogGrid"),
    emptyRoutineHint: document.getElementById("emptyRoutineHint"),
    todaySummary: document.getElementById("todaySummary"),
    statsSection: document.getElementById("statsSection"),
    statTiles: document.getElementById("statTiles"),
    statRoutines: document.getElementById("statRoutines"),
    timeline: document.getElementById("timeline"),
    emptyTimelineHint: document.getElementById("emptyTimelineHint"),

    tabTimeline: document.getElementById("tabTimeline"),
    tabCalendar: document.getElementById("tabCalendar"),
    timelineView: document.getElementById("timelineView"),
    calendarView: document.getElementById("calendarView"),
    calPrev: document.getElementById("calPrev"),
    calNext: document.getElementById("calNext"),
    calToday: document.getElementById("calToday"),
    calTitle: document.getElementById("calTitle"),
    calFilter: document.getElementById("calFilter"),
    calSummary: document.getElementById("calSummary"),
    calGrid: document.getElementById("calGrid"),
    calLegend: document.getElementById("calLegend"),
    calDayDetail: document.getElementById("calDayDetail"),

    openAddRoutine: document.getElementById("openAddRoutine"),
    addRoutineDialog: document.getElementById("addRoutineDialog"),
    addRoutineForm: document.getElementById("addRoutineForm"),
    routineName: document.getElementById("routineName"),
    routineCategory: document.getElementById("routineCategory"),
    routineIcon: document.getElementById("routineIcon"),
    routineGoal: document.getElementById("routineGoal"),
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

    els.tabTimeline.addEventListener("click", function () {
      setView("timeline");
    });
    els.tabCalendar.addEventListener("click", function () {
      setView("calendar");
    });
    els.calPrev.addEventListener("click", function () {
      shiftMonth(-1);
    });
    els.calNext.addEventListener("click", function () {
      shiftMonth(1);
    });
    els.calToday.addEventListener("click", function () {
      var t = new Date();
      calState.year = t.getFullYear();
      calState.month = t.getMonth();
      calState.selected = toDateStr(t);
      renderCalendar();
    });
    els.calFilter.addEventListener("change", function () {
      calState.filter = els.calFilter.value;
      renderCalendar();
    });

    calState.selected = toDateStr(new Date());
    setView(loadView());
    renderAll();
  }

  // ---------- view switching ----------

  function loadView() {
    try {
      return localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "timeline";
    } catch (e) {
      return "timeline";
    }
  }

  function setView(view) {
    var isCal = view === "calendar";
    els.timelineView.hidden = isCal;
    els.calendarView.hidden = !isCal;
    els.tabTimeline.setAttribute("aria-selected", String(!isCal));
    els.tabCalendar.setAttribute("aria-selected", String(isCal));
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (e) {
      /* 保存できなくても表示は切り替える */
    }
  }

  function shiftMonth(delta) {
    var d = new Date(calState.year, calState.month + delta, 1);
    calState.year = d.getFullYear();
    calState.month = d.getMonth();
    var t = new Date();
    var isCurrent = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
    calState.selected = isCurrent ? toDateStr(t) : null;
    renderCalendar();
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
    renderCalendar();
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

      var progressText = routineProgressText(routine);
      if (progressText) {
        var progress = document.createElement("span");
        progress.className = "progress";
        progress.textContent = progressText;
        info.appendChild(document.createElement("br"));
        info.appendChild(progress);
      }

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
    // 「今日やること」= 毎日ルーティン + 今週の目標にまだ届いていない週目標ルーティン。
    // 週の目標を朝の時点で達成済みのものは休んでOKなので数えない。
    var today = new Date();
    var todayStr = toDateStr(today);
    var total = 0;
    var done = 0;
    state.routines.forEach(function (routine) {
      var set = logDateSet(routine.id);
      var goal = goalOf(routine);
      var needed = goal >= 7 || daysInWeek(set, today, todayStr) < goal;
      if (!needed) return;
      total++;
      if (set[todayStr]) done++;
    });
    els.todaySummary.hidden = false;
    els.todaySummary.textContent =
      total === 0
        ? "今週の目標はすべて達成済みです 🎉 今日は休んでもOK"
        : "今日: " + done + " / " + total + " 件のルーティンを記録済み";
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

  // ---- 週目標（週N回）----

  // 1〜7。未設定（旧データ）や7は「毎日」
  function goalOf(routine) {
    var g = Number(routine.weeklyGoal);
    return g >= 1 && g <= 7 ? Math.floor(g) : 7;
  }

  function goalLabel(goal) {
    return goal >= 7 ? "毎日" : "週" + goal + "回";
  }

  // 週は月曜始まり
  function weekStart(date) {
    var d = addDays(date, 0);
    return addDays(d, -((d.getDay() + 6) % 7));
  }

  // その週（refDate を含む週）に記録した日数。excludeDateStr の日は数えない
  function daysInWeek(set, refDate, excludeDateStr) {
    var start = weekStart(refDate);
    var n = 0;
    for (var i = 0; i < 7; i++) {
      var ds = toDateStr(addDays(start, i));
      if (set[ds] && ds !== excludeDateStr) n++;
    }
    return n;
  }

  // 週の先頭日(YYYY-MM-DD) -> その週に記録した日数
  function weekCounts(set) {
    var counts = {};
    Object.keys(set).forEach(function (k) {
      var ws = toDateStr(weekStart(parseDateStr(k)));
      counts[ws] = (counts[ws] || 0) + 1;
    });
    return counts;
  }

  // 今週がまだ目標に届いていなくても、先週まで続いていれば連続は途切れていない扱い
  function currentWeekStreak(set, goal) {
    var counts = weekCounts(set);
    var w = weekStart(new Date());
    if ((counts[toDateStr(w)] || 0) < goal) w = addDays(w, -7);
    var n = 0;
    while ((counts[toDateStr(w)] || 0) >= goal) {
      n++;
      w = addDays(w, -7);
    }
    return n;
  }

  function bestWeekStreak(set, goal) {
    var counts = weekCounts(set);
    var keys = Object.keys(counts)
      .filter(function (k) {
        return counts[k] >= goal;
      })
      .sort();
    var best = 0;
    var run = 0;
    var prev = null;
    keys.forEach(function (k) {
      if (prev && toDateStr(addDays(prev, 7)) === k) run++;
      else run = 1;
      if (run > best) best = run;
      prev = parseDateStr(k);
    });
    return best;
  }

  // 終わった週（今週は除く、最大12週）のうち目標を達成した週の割合。対象週が無ければ null
  function weeklyRate(set, goal) {
    var keys = Object.keys(weekCounts(set)).sort();
    if (keys.length === 0) return null;
    var counts = weekCounts(set);
    var thisWeek = weekStart(new Date());
    var weeks = Math.round((thisWeek - parseDateStr(keys[0])) / (7 * 86400000));
    weeks = Math.min(weeks, 12);
    if (weeks <= 0) return null;
    var met = 0;
    for (var i = 1; i <= weeks; i++) {
      if ((counts[toDateStr(addDays(thisWeek, -7 * i))] || 0) >= goal) met++;
    }
    return Math.round((met / weeks) * 100);
  }

  // 毎日目標は「連続日数」、週目標は「連続達成週数」
  function routineStreak(routine, set) {
    var goal = goalOf(routine);
    if (goal >= 7) {
      return { cur: currentStreak(set), best: bestStreak(set), unit: "日" };
    }
    return { cur: currentWeekStreak(set, goal), best: bestWeekStreak(set, goal), unit: "週" };
  }

  // クイック記録カードに出す1行（毎日: 🔥連続日数 / 週目標: 今週の進捗 + 連続週）
  function routineProgressText(routine) {
    var set = logDateSet(routine.id);
    var goal = goalOf(routine);
    var streak = routineStreak(routine, set);
    var parts = [];
    if (goal < 7) {
      var n = daysInWeek(set, new Date(), null);
      parts.push("今週 " + n + "/" + goal + "回" + (n >= goal ? " ✓" : ""));
    }
    if (streak.cur > 0) parts.push("🔥" + streak.cur + streak.unit);
    return parts.join(" ・ ");
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
      var goal = goalOf(routine);
      var weekly = goal < 7;
      var rate = weekly ? weeklyRate(set, goal) : achievementRate(set);
      var streakInfo = routineStreak(routine, set);

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
      streak.textContent =
        streakInfo.cur > 0 ? "🔥 " + streakInfo.cur + streakInfo.unit + "連続" : "連続なし";

      head.appendChild(name);
      head.appendChild(streak);

      var detail = document.createElement("div");
      detail.className = "stat-detail";
      var rateText = (weekly ? "週達成率 " : "達成率 ") + (rate === null ? "—" : rate + "%");
      var detailParts = [];
      if (weekly) {
        var weekDone = daysInWeek(set, new Date(), null);
        detailParts.push("目標 " + goalLabel(goal) + " ・ 今週 " + weekDone + "/" + goal + "回");
      }
      detailParts.push("最長 " + streakInfo.best + streakInfo.unit + " ・ " + rateText + " ・ 累計 " + total + "回");
      detail.textContent = detailParts.join("\n");

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

  // ---------- calendar ----------

  function renderCalendar() {
    renderCalFilterOptions();

    var y = calState.year;
    var m = calState.month;
    var filterRoutine = calState.filter === "all" ? null : getRoutine(calState.filter);
    els.calTitle.textContent = y + "年" + (m + 1) + "月";

    // 日付 -> { cats: 記録のあったカテゴリ, count: 記録数 }
    var dayMap = {};
    state.logs.forEach(function (log) {
      if (filterRoutine && log.routineId !== filterRoutine.id) return;
      var routine = getRoutine(log.routineId);
      var cat = (routine && routine.category) || "other";
      var ds = toDateStr(new Date(log.timestamp));
      var entry = dayMap[ds] || (dayMap[ds] = { cats: {}, count: 0 });
      entry.cats[cat] = true;
      entry.count++;
    });

    var showWeek = !!filterRoutine;
    var routineSet = filterRoutine ? logDateSet(filterRoutine.id) : null;
    var goal = filterRoutine ? goalOf(filterRoutine) : 0;
    var todayStr = toDateStr(new Date());

    els.calGrid.innerHTML = "";
    els.calGrid.style.setProperty("--cols", showWeek ? 8 : 7);
    WEEK_HEAD.forEach(function (w) {
      els.calGrid.appendChild(makeEl("div", "cal-head", w));
    });
    if (showWeek) els.calGrid.appendChild(makeEl("div", "cal-head", "週"));

    var lastDay = new Date(y, m + 1, 0);
    var cursor = weekStart(new Date(y, m, 1));
    while (cursor <= lastDay) {
      for (var i = 0; i < 7; i++) {
        els.calGrid.appendChild(buildCalCell(addDays(cursor, i), m, todayStr, dayMap));
      }
      if (showWeek) {
        var weekCell = makeEl("div", "cal-week");
        if (toDateStr(cursor) <= todayStr) {
          var n = daysInWeek(routineSet, cursor, null);
          var met = n >= goal;
          weekCell.textContent = (met ? "✓" : "") + n + "/" + goal;
          if (met) weekCell.classList.add("met");
          weekCell.setAttribute("aria-label", "この週 " + n + "回、目標 " + goal + "回" + (met ? "達成" : ""));
        }
        els.calGrid.appendChild(weekCell);
      }
      cursor = addDays(cursor, 7);
    }

    // 月のまとめ
    var activeDays = 0;
    var logCount = 0;
    for (var d = 1; d <= lastDay.getDate(); d++) {
      var e = dayMap[toDateStr(new Date(y, m, d))];
      if (e) {
        activeDays++;
        logCount += e.count;
      }
    }
    var scope = filterRoutine ? filterRoutine.name + "（" + goalLabel(goal) + "目標）" : "すべて";
    els.calSummary.textContent =
      (m + 1) + "月 " + scope + ": " + activeDays + "日記録 ・ 計" + logCount + "回";

    renderCalLegend(showWeek);
    renderCalDayDetail(filterRoutine);
  }

  function renderCalFilterOptions() {
    var sel = els.calFilter;
    var current = calState.filter;
    if (current !== "all" && !getRoutine(current)) current = "all";
    calState.filter = current;

    sel.innerHTML = "";
    var all = document.createElement("option");
    all.value = "all";
    all.textContent = "すべてのルーティン";
    sel.appendChild(all);
    state.routines.forEach(function (routine) {
      var meta = CATEGORY_META[routine.category] || CATEGORY_META.other;
      var opt = document.createElement("option");
      opt.value = routine.id;
      opt.textContent = (routine.icon || meta.defaultIcon) + " " + routine.name;
      sel.appendChild(opt);
    });
    sel.value = current;
  }

  function buildCalCell(date, month, todayStr, dayMap) {
    var ds = toDateStr(date);
    var entry = dayMap[ds];

    var cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-cell";
    if (date.getMonth() !== month) cell.classList.add("out");
    if (ds === todayStr) cell.classList.add("today");
    if (ds > todayStr) cell.classList.add("future");
    if (ds === calState.selected) cell.classList.add("selected");
    cell.setAttribute(
      "aria-label",
      date.getMonth() + 1 + "月" + date.getDate() + "日 " + (entry ? entry.count + "件の記録" : "記録なし")
    );
    cell.setAttribute("aria-pressed", String(ds === calState.selected));

    cell.appendChild(makeEl("span", "cal-day", String(date.getDate())));

    var dots = makeEl("span", "cal-dots");
    if (entry) {
      Object.keys(CATEGORY_META).forEach(function (cat) {
        if (!entry.cats[cat]) return;
        var dot = makeEl("span", "cal-dot");
        dot.style.setProperty("--dot-color", "var(" + CATEGORY_META[cat].colorVar + ")");
        dots.appendChild(dot);
      });
    }
    cell.appendChild(dots);

    cell.addEventListener("click", function () {
      calState.selected = ds;
      renderCalendar();
    });
    return cell;
  }

  function renderCalLegend(showWeek) {
    els.calLegend.innerHTML = "";
    if (showWeek) {
      els.calLegend.appendChild(makeEl("span", "cal-legend-note", "右端の列は、その週の記録回数 / 週の目標です"));
      return;
    }
    Object.keys(CATEGORY_META).forEach(function (cat) {
      var item = makeEl("span", "cal-legend-item");
      var dot = makeEl("span", "cal-dot");
      dot.style.setProperty("--dot-color", "var(" + CATEGORY_META[cat].colorVar + ")");
      item.appendChild(dot);
      item.appendChild(makeEl("span", "", CATEGORY_META[cat].label));
      els.calLegend.appendChild(item);
    });
  }

  function renderCalDayDetail(filterRoutine) {
    els.calDayDetail.innerHTML = "";
    var sel = calState.selected;
    if (!sel) return;

    els.calDayDetail.appendChild(makeEl("p", "timeline-date-label", formatDateJa(sel)));

    var logs = state.logs
      .filter(function (log) {
        if (filterRoutine && log.routineId !== filterRoutine.id) return false;
        return toDateStr(new Date(log.timestamp)) === sel;
      })
      .sort(function (a, b) {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

    if (logs.length === 0) {
      els.calDayDetail.appendChild(makeEl("p", "hint", "この日の記録はありません"));
      return;
    }
    logs.forEach(function (log) {
      els.calDayDetail.appendChild(renderTimelineEntry(log));
    });
  }

  function makeEl(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
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

      var goalSelect = document.createElement("select");
      goalSelect.className = "goal-select";
      goalSelect.setAttribute("aria-label", routine.name + "の目標頻度");
      for (var g = 7; g >= 1; g--) {
        var opt = document.createElement("option");
        opt.value = String(g);
        opt.textContent = goalLabel(g);
        goalSelect.appendChild(opt);
      }
      goalSelect.value = String(goalOf(routine));
      goalSelect.addEventListener("change", function () {
        routine.weeklyGoal = Number(goalSelect.value);
        saveState();
        renderAll();
      });

      info.appendChild(name);
      info.appendChild(metaLine);
      info.appendChild(goalSelect);

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
      weeklyGoal: Number(els.routineGoal.value) || 7,
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

    return formatDateJa(dateStr);
  }

  function formatDateJa(dateStr) {
    var d = parseDateStr(dateStr);
    return d.getMonth() + 1 + "月" + d.getDate() + "日(" + WEEKDAYS_JA[d.getDay()] + ")";
  }
})();

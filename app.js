(function () {
  "use strict";

  var SETTINGS_KEY = "jsc_settings";
  var APPS_KEY = "jsc_applications";
  var COURSES_KEY = "jsc_courses";
  var LAST_BACKUP_KEY = "jsc_last_backup";
  var SYNC_KEY = "jsc_sync_config";
  var LOCAL_UPDATED_KEY = "jsc_local_updated_at";
  var SYNC_FILE_PATH = "data.json";

  var settings = null;
  var apps = [];
  var courses = [];
  var sortKey = "dateApplied";
  var sortDir = "desc";
  var courseSortKey = "dateStarted";
  var courseSortDir = "desc";
  var autoBackupTimer = null;
  var audioCtx = null;
  var lastPlayedMinuteKey = null;
  var syncPushTimer = null;
  var suppressSyncPush = false;
  var syncInFlight = false;

  // ---------- storage ----------

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSettings(s) {
    settings = s;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    touchLocalUpdated();
  }

  function loadApps() {
    try {
      var raw = localStorage.getItem(APPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveApps() {
    localStorage.setItem(APPS_KEY, JSON.stringify(apps));
    touchLocalUpdated();
  }

  function loadCourses() {
    try {
      var raw = localStorage.getItem(COURSES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCourses() {
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
    touchLocalUpdated();
  }

  function loadSyncConfig() {
    try {
      var raw = localStorage.getItem(SYNC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveSyncConfig(cfg) {
    localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
  }

  function touchLocalUpdated() {
    localStorage.setItem(LOCAL_UPDATED_KEY, new Date().toISOString());
    if (!suppressSyncPush) scheduleSyncPush();
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- date helpers ----------

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function startOfWeek(d) {
    var date = new Date(d);
    var day = date.getDay(); // 0 = Sunday
    var diff = (day === 0 ? -6 : 1) - day; // Monday as start
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function daysBetween(a, b) {
    var MS = 24 * 60 * 60 * 1000;
    var da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db - da) / MS);
  }

  // ---------- setup / settings ----------

  function ensureSettings() {
    settings = loadSettings();
    if (!settings) {
      document.getElementById("setupOverlay").classList.remove("hidden");
    } else {
      applySettingsToUI();
    }
  }

  function applySettingsToUI() {
    document.getElementById("deadlineLabel").textContent = settings.label || "Deadline";
    setActiveView(settings.defaultView || "applications");
    scheduleAutoBackup();
  }

  function setActiveView(view) {
    document.getElementById("applicationsSection").classList.toggle("hidden", view !== "applications");
    document.getElementById("coursesSection").classList.toggle("hidden", view !== "courses");
    document.getElementById("statsRowApps").classList.toggle("hidden", view !== "applications");
    document.getElementById("statsRowCourses").classList.toggle("hidden", view !== "courses");
    document.getElementById("tabApplications").classList.toggle("active", view === "applications");
    document.getElementById("tabCourses").classList.toggle("active", view === "courses");
  }

  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var view = btn.dataset.view;
      setActiveView(view);
      if (settings) {
        settings.defaultView = view;
        saveSettings(settings);
        updateActionBanner(new Date());
      }
    });
  });

  document.getElementById("setupSave").addEventListener("click", function () {
    var deadline = document.getElementById("setupDeadline").value;
    var label = document.getElementById("setupLabel").value.trim() || "Deadline";
    var start = document.getElementById("setupStart").value;
    var goal = document.getElementById("setupGoal").value;
    var view = document.getElementById("setupView").value;
    var autoBackup = document.getElementById("setupAutoBackup").value;
    var tickSound = document.getElementById("setupTickSound").checked;

    if (!deadline || !start) {
      alert("Please fill in both dates to continue.");
      return;
    }

    saveSettings({
      deadline: deadline,
      label: label,
      startDate: start,
      weeklyGoal: goal ? parseInt(goal, 10) : 0,
      defaultView: view,
      autoBackupMinutes: autoBackup ? parseInt(autoBackup, 10) : 0,
      tickSound: tickSound
    });

    applySettingsToUI();
    document.getElementById("setupOverlay").classList.add("hidden");
    tick();
    renderStats();
  });

  // Settings modal
  var settingsModal = document.getElementById("settingsModal");

  document.getElementById("settingsBtn").addEventListener("click", function () {
    document.getElementById("setDeadline").value = settings.deadline;
    document.getElementById("setLabel").value = settings.label;
    document.getElementById("setStart").value = settings.startDate;
    document.getElementById("setGoal").value = settings.weeklyGoal || "";
    document.getElementById("setView").value = settings.defaultView || "applications";
    document.getElementById("setAutoBackup").value = settings.autoBackupMinutes || 0;
    document.getElementById("setTickSound").checked = !!settings.tickSound;

    var syncCfg = loadSyncConfig();
    document.getElementById("syncOwner").value = (syncCfg && syncCfg.owner) || document.getElementById("syncOwner").value;
    document.getElementById("syncRepoName").value = (syncCfg && syncCfg.repo) || document.getElementById("syncRepoName").value;
    document.getElementById("syncToken").value = "";
    document.getElementById("syncToken").placeholder = (syncCfg && syncCfg.token) ? "•••• token saved (leave blank to keep)" : "github_pat_…";
    setSyncStatus(syncCfg ? "Configured for " + syncCfg.owner + "/" + syncCfg.repo + "." : "Not configured.");

    settingsModal.classList.remove("hidden");
  });

  document.getElementById("testTickSoundBtn").addEventListener("click", function () {
    ensureAudioCtx().then(playTickSound);
  });

  document.getElementById("settingsCancelBtn").addEventListener("click", function () {
    settingsModal.classList.add("hidden");
  });

  document.getElementById("settingsSaveBtn").addEventListener("click", function () {
    var deadline = document.getElementById("setDeadline").value;
    var label = document.getElementById("setLabel").value.trim() || "Deadline";
    var start = document.getElementById("setStart").value;
    var goal = document.getElementById("setGoal").value;
    var view = document.getElementById("setView").value;
    var autoBackup = document.getElementById("setAutoBackup").value;
    var tickSound = document.getElementById("setTickSound").checked;

    if (!deadline || !start) {
      alert("Please fill in both dates.");
      return;
    }

    saveSettings({
      deadline: deadline,
      label: label,
      startDate: start,
      weeklyGoal: goal ? parseInt(goal, 10) : 0,
      defaultView: view,
      autoBackupMinutes: autoBackup ? parseInt(autoBackup, 10) : 0,
      tickSound: tickSound
    });

    applySettingsToUI();
    settingsModal.classList.add("hidden");
    tick();
    renderStats();
  });

  document.getElementById("wipeBtn").addEventListener("click", function () {
    var phrase = "DELETE ALL DATA";
    var typed = prompt(
      "This will permanently erase all settings, applications, and courses from this browser.\n\nType " + phrase + " to confirm:"
    );
    if (typed === null) return;
    if (typed.trim() !== phrase) {
      alert("That didn't match. Nothing was deleted.");
      return;
    }
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(APPS_KEY);
    localStorage.removeItem(COURSES_KEY);
    location.reload();
  });

  // ---------- tick sound ----------

  function ensureAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    if (audioCtx.state === "suspended") {
      return audioCtx.resume();
    }
    return Promise.resolve();
  }

  document.addEventListener("click", function () { ensureAudioCtx(); });

  function playClack(startTime, freq) {
    var duration = 0.09;
    var bufferSize = Math.floor(audioCtx.sampleRate * duration);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.5);
    }

    var noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    var filter = audioCtx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 2;

    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.9, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter).connect(gain).connect(audioCtx.destination);
    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  function playTickSound() {
    if (!audioCtx || audioCtx.state !== "running") return;
    var now = audioCtx.currentTime;
    playClack(now, 1400);
    playClack(now + 0.09, 2200);
  }

  function checkMinuteTick(now) {
    var minuteKey = now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate() + "-" + now.getHours() + "-" + now.getMinutes();
    if (lastPlayedMinuteKey === null) {
      lastPlayedMinuteKey = minuteKey;
      return;
    }
    if (minuteKey !== lastPlayedMinuteKey) {
      lastPlayedMinuteKey = minuteKey;
      if (settings && settings.tickSound) playTickSound();
    }
  }

  // ---------- clock + countdown ----------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    var now = new Date();
    document.getElementById("clock").textContent =
      now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  " + now.toLocaleTimeString();

    checkMinuteTick(now);

    if (!settings) return;

    var deadline = new Date(settings.deadline + "T23:59:59");
    var diff = deadline - now;
    var sub = document.getElementById("countdownSub");

    if (diff <= 0) {
      var pastDays = Math.abs(daysBetween(deadline, now));
      document.getElementById("numDays").textContent = "0";
      document.getElementById("numHours").textContent = "00";
      document.getElementById("numMins").textContent = "00";
      document.getElementById("numSecs").textContent = "00";
      sub.textContent = pastDays === 0
        ? "Today is the day."
        : pastDays + " day" + (pastDays === 1 ? "" : "s") + " past your deadline.";
      sub.classList.add("overdue");
    } else {
      var d = Math.floor(diff / (1000 * 60 * 60 * 24));
      var h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      var m = Math.floor((diff / (1000 * 60)) % 60);
      var s = Math.floor((diff / 1000) % 60);
      document.getElementById("numDays").textContent = d;
      document.getElementById("numHours").textContent = pad(h);
      document.getElementById("numMins").textContent = pad(m);
      document.getElementById("numSecs").textContent = pad(s);
      sub.classList.remove("overdue");
      sub.textContent = "until " + deadline.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

      var numbersEl = document.getElementById("countdownNumbers");
      numbersEl.classList.remove("urgency-warn", "urgency-critical");
      if (d <= 7) numbersEl.classList.add("urgency-critical");
      else if (d <= 30) numbersEl.classList.add("urgency-warn");
    }

    var startD = new Date(settings.startDate + "T00:00:00");
    var dayOfSearch = daysBetween(startD, now) + 1;
    var dayText = dayOfSearch > 0 ? dayOfSearch : 1;
    document.getElementById("statDay").textContent = dayText;
    document.getElementById("statCourseDay").textContent = dayText;

    updateActionBanner(now);
  }

  var COURSES_PER_APPLICATION = 5;

  function formatHour12(hour) {
    return (hour === 0 ? 12 : hour > 12 ? hour - 12 : hour) + (hour >= 12 ? "pm" : "am");
  }

  function updateActionBanner(now) {
    var banner = document.getElementById("actionBanner");
    var icon = document.getElementById("actionIcon");
    var text = document.getElementById("actionText");
    var cta = document.getElementById("actionCta");

    banner.classList.remove("state-ok", "state-behind", "state-urgent");

    if ((settings.defaultView || "applications") === "courses") {
      updateCoursesBanner(now, banner, icon, text, cta);
    } else {
      updateApplicationsBanner(now, banner, icon, text, cta);
    }
  }

  function updateApplicationsBanner(now, banner, icon, text, cta) {
    cta.textContent = "+ Log Application";

    var dailyTarget = settings.weeklyGoal ? Math.max(1, Math.round(settings.weeklyGoal / 7)) : 3;
    var appsToday = apps.filter(function (a) { return a.dateApplied === todayISO(); }).length;
    var coursesToday = courses.filter(function (c) { return c.dateStarted === todayISO(); }).length;
    var courseCredit = coursesToday / COURSES_PER_APPLICATION;
    var effectiveToday = appsToday + courseCredit;
    var hour = now.getHours();

    var progressNote = coursesToday > 0
      ? appsToday + " application" + (appsToday === 1 ? "" : "s") + " + " + coursesToday + " course" + (coursesToday === 1 ? "" : "s") + " logged today"
      : appsToday + " application" + (appsToday === 1 ? "" : "s") + " logged today";

    if (effectiveToday >= dailyTarget) {
      banner.classList.add("state-ok");
      icon.textContent = "✅";
      text.textContent = "Daily goal hit — " + progressNote + ". Nice work.";
      return;
    }

    var remaining = dailyTarget - effectiveToday;
    var appsNeeded = Math.ceil(remaining);
    var coursesNeeded = Math.ceil(remaining * COURSES_PER_APPLICATION);
    var remainingText = appsNeeded + " more application" + (appsNeeded === 1 ? "" : "s") +
      " (or " + coursesNeeded + " course" + (coursesNeeded === 1 ? "" : "s") + ") to hit today's goal";

    if (effectiveToday === 0 && hour >= 15) {
      banner.classList.add("state-urgent");
      icon.textContent = "⚠";
      text.textContent = "It's " + formatHour12(hour) + " and you haven't logged anything today.";
    } else if (hour >= 17) {
      banner.classList.add("state-urgent");
      icon.textContent = "⚠";
      text.textContent = "Day's almost over — " + remainingText + ".";
    } else if (hour >= 12) {
      banner.classList.add("state-behind");
      icon.textContent = "⏰";
      text.textContent = remainingText + " — good time to knock some out.";
    } else {
      banner.classList.add("state-behind");
      icon.textContent = "🎯";
      text.textContent = "Today's goal: " + remainingText + ".";
    }
  }

  function updateCoursesBanner(now, banner, icon, text, cta) {
    cta.textContent = "+ Log Course";

    var coursesToday = courses.filter(function (c) { return c.dateStarted === todayISO(); }).length;
    var hour = now.getHours();

    if (coursesToday > 0) {
      banner.classList.add("state-ok");
      icon.textContent = "✅";
      text.textContent = coursesToday + " course" + (coursesToday === 1 ? "" : "s") + " logged today. Nice work.";
      return;
    }

    if (hour >= 15) {
      banner.classList.add("state-urgent");
      icon.textContent = "⚠";
      text.textContent = "It's " + formatHour12(hour) + " and you haven't logged any courses today.";
    } else if (hour >= 12) {
      banner.classList.add("state-behind");
      icon.textContent = "⏰";
      text.textContent = "No courses logged today yet — good time to work on one.";
    } else {
      banner.classList.add("state-behind");
      icon.textContent = "🎯";
      text.textContent = "Haven't logged a course today yet.";
    }
  }

  // ---------- applications CRUD ----------

  function renderStats() {
    var now = new Date();
    var weekStart = startOfWeek(now);
    var total = apps.length;
    var today = apps.filter(function (a) { return a.dateApplied === todayISO(); }).length;
    var thisWeek = apps.filter(function (a) {
      var d = new Date(a.dateApplied + "T00:00:00");
      return d >= weekStart;
    }).length;

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statToday").textContent = today;
    document.getElementById("statWeek").textContent = settings && settings.weeklyGoal
      ? thisWeek + " / " + settings.weeklyGoal
      : thisWeek;

    document.getElementById("statCoursesTotal").textContent = courses.length;
    document.getElementById("statCoursesInProgress").textContent =
      courses.filter(function (c) { return c.status === "InProgress"; }).length;
    document.getElementById("statCoursesCompleted").textContent =
      courses.filter(function (c) { return c.status === "Completed"; }).length;
    document.getElementById("statCoursesNotStarted").textContent =
      courses.filter(function (c) { return c.status === "NotStarted"; }).length;

    if (settings) updateActionBanner(now);
  }

  function statusLabel(status) {
    return status.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + statusLabel(status) + "</span>";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function getFilteredSorted() {
    var q = document.getElementById("searchBox").value.trim().toLowerCase();
    var statusFilter = document.getElementById("statusFilter").value;

    var list = apps.filter(function (a) {
      var matchesQ = !q ||
        (a.company && a.company.toLowerCase().indexOf(q) !== -1) ||
        (a.role && a.role.toLowerCase().indexOf(q) !== -1);
      var matchesStatus = !statusFilter || a.status === statusFilter;
      return matchesQ && matchesStatus;
    });

    list.sort(function (a, b) {
      var va = (a[sortKey] || "").toString().toLowerCase();
      var vb = (b[sortKey] || "").toString().toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }

  function renderTable() {
    var list = getFilteredSorted();
    var tbody = document.getElementById("appsTableBody");
    tbody.innerHTML = "";

    document.getElementById("emptyState").classList.toggle("hidden", apps.length !== 0);

    list.forEach(function (a) {
      var tr = document.createElement("tr");
      tr.dataset.id = a.id;
      tr.innerHTML =
        "<td>" + escapeHtml(a.dateApplied) + "</td>" +
        "<td>" + escapeHtml(a.company) + "</td>" +
        "<td>" + escapeHtml(a.role) + "</td>" +
        "<td>" + statusBadge(a.status) + "</td>" +
        "<td>" + (a.link ? '<a href="' + escapeHtml(a.link) + '" target="_blank" rel="noopener">link</a>' : "") + "</td>" +
        '<td class="notes-cell">' + escapeHtml(a.notes) + "</td>" +
        "<td></td>";
      tr.addEventListener("click", function () { openAppModal(a.id); });
      tbody.appendChild(tr);
    });

    renderStats();
  }

  var appModal = document.getElementById("appModal");

  function openAppModal(id) {
    var a = id ? apps.find(function (x) { return x.id === id; }) : null;
    document.getElementById("appModalTitle").textContent = a ? "Edit Application" : "Log Application";
    document.getElementById("appId").value = a ? a.id : "";
    document.getElementById("appCompany").value = a ? a.company : "";
    document.getElementById("appRole").value = a ? a.role : "";
    document.getElementById("appDate").value = a ? a.dateApplied : todayISO();
    document.getElementById("appStatus").value = a ? a.status : "Applied";
    document.getElementById("appLink").value = a ? a.link : "";
    document.getElementById("appNotes").value = a ? a.notes : "";
    document.getElementById("appDeleteBtn").classList.toggle("hidden", !a);
    appModal.classList.remove("hidden");
    document.getElementById("appCompany").focus();
  }

  document.getElementById("addAppBtn").addEventListener("click", function () { openAppModal(null); });
  document.getElementById("actionCta").addEventListener("click", function () {
    if (settings && settings.defaultView === "courses") {
      openCourseModal(null);
    } else {
      openAppModal(null);
    }
  });
  document.getElementById("appCancelBtn").addEventListener("click", function () { appModal.classList.add("hidden"); });

  document.getElementById("appSaveBtn").addEventListener("click", function () {
    var company = document.getElementById("appCompany").value.trim();
    var dateApplied = document.getElementById("appDate").value;

    if (!company || !dateApplied) {
      alert("Company and date applied are required.");
      return;
    }

    var id = document.getElementById("appId").value;
    var record = {
      id: id || uid(),
      company: company,
      role: document.getElementById("appRole").value.trim(),
      dateApplied: dateApplied,
      status: document.getElementById("appStatus").value,
      link: document.getElementById("appLink").value.trim(),
      notes: document.getElementById("appNotes").value.trim()
    };

    if (id) {
      var idx = apps.findIndex(function (x) { return x.id === id; });
      if (idx !== -1) apps[idx] = record;
    } else {
      apps.push(record);
    }

    saveApps();
    appModal.classList.add("hidden");
    renderTable();
  });

  document.getElementById("appDeleteBtn").addEventListener("click", function () {
    var id = document.getElementById("appId").value;
    if (id && confirm("Delete this application?")) {
      apps = apps.filter(function (x) { return x.id !== id; });
      saveApps();
      appModal.classList.add("hidden");
      renderTable();
    }
  });

  // ---------- search / filter / sort (applications) ----------

  document.getElementById("searchBox").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);

  document.querySelectorAll("#appsTable th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = key;
        sortDir = "asc";
      }
      renderTable();
    });
  });

  // ---------- courses CRUD ----------

  function getCoursesFilteredSorted() {
    var q = document.getElementById("courseSearchBox").value.trim().toLowerCase();
    var statusFilter = document.getElementById("courseStatusFilter").value;

    var list = courses.filter(function (c) {
      var matchesQ = !q ||
        (c.courseName && c.courseName.toLowerCase().indexOf(q) !== -1) ||
        (c.provider && c.provider.toLowerCase().indexOf(q) !== -1);
      var matchesStatus = !statusFilter || c.status === statusFilter;
      return matchesQ && matchesStatus;
    });

    list.sort(function (a, b) {
      var va = (a[courseSortKey] || "").toString().toLowerCase();
      var vb = (b[courseSortKey] || "").toString().toLowerCase();
      if (va < vb) return courseSortDir === "asc" ? -1 : 1;
      if (va > vb) return courseSortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }

  function renderCoursesTable() {
    var list = getCoursesFilteredSorted();
    var tbody = document.getElementById("coursesTableBody");
    tbody.innerHTML = "";

    document.getElementById("coursesEmptyState").classList.toggle("hidden", courses.length !== 0);

    list.forEach(function (c) {
      var tr = document.createElement("tr");
      tr.dataset.id = c.id;
      tr.innerHTML =
        "<td>" + escapeHtml(c.dateStarted) + "</td>" +
        "<td>" + escapeHtml(c.courseName) + "</td>" +
        "<td>" + escapeHtml(c.provider) + "</td>" +
        "<td>" + statusBadge(c.status) + "</td>" +
        "<td>" + (c.link ? '<a href="' + escapeHtml(c.link) + '" target="_blank" rel="noopener">link</a>' : "") + "</td>" +
        '<td class="notes-cell">' + escapeHtml(c.notes) + "</td>" +
        "<td></td>";
      tr.addEventListener("click", function () { openCourseModal(c.id); });
      tbody.appendChild(tr);
    });

    renderStats();
  }

  var courseModal = document.getElementById("courseModal");

  function openCourseModal(id) {
    var c = id ? courses.find(function (x) { return x.id === id; }) : null;
    document.getElementById("courseModalTitle").textContent = c ? "Edit Course" : "Log Course";
    document.getElementById("courseId").value = c ? c.id : "";
    document.getElementById("courseName").value = c ? c.courseName : "";
    document.getElementById("courseProvider").value = c ? c.provider : "";
    document.getElementById("courseDateStarted").value = c ? c.dateStarted : todayISO();
    document.getElementById("courseStatus").value = c ? c.status : "InProgress";
    document.getElementById("courseLink").value = c ? c.link : "";
    document.getElementById("courseNotes").value = c ? c.notes : "";
    document.getElementById("courseDeleteBtn").classList.toggle("hidden", !c);
    courseModal.classList.remove("hidden");
    document.getElementById("courseName").focus();
  }

  document.getElementById("addCourseBtn").addEventListener("click", function () { openCourseModal(null); });
  document.getElementById("courseCancelBtn").addEventListener("click", function () { courseModal.classList.add("hidden"); });

  document.getElementById("courseSaveBtn").addEventListener("click", function () {
    var courseName = document.getElementById("courseName").value.trim();
    var dateStarted = document.getElementById("courseDateStarted").value;

    if (!courseName || !dateStarted) {
      alert("Course name and date started are required.");
      return;
    }

    var id = document.getElementById("courseId").value;
    var record = {
      id: id || uid(),
      courseName: courseName,
      provider: document.getElementById("courseProvider").value.trim(),
      dateStarted: dateStarted,
      status: document.getElementById("courseStatus").value,
      link: document.getElementById("courseLink").value.trim(),
      notes: document.getElementById("courseNotes").value.trim()
    };

    if (id) {
      var idx = courses.findIndex(function (x) { return x.id === id; });
      if (idx !== -1) courses[idx] = record;
    } else {
      courses.push(record);
    }

    saveCourses();
    courseModal.classList.add("hidden");
    renderCoursesTable();
  });

  document.getElementById("courseDeleteBtn").addEventListener("click", function () {
    var id = document.getElementById("courseId").value;
    if (id && confirm("Delete this course?")) {
      courses = courses.filter(function (x) { return x.id !== id; });
      saveCourses();
      courseModal.classList.add("hidden");
      renderCoursesTable();
    }
  });

  document.getElementById("courseSearchBox").addEventListener("input", renderCoursesTable);
  document.getElementById("courseStatusFilter").addEventListener("change", renderCoursesTable);

  document.querySelectorAll("#coursesTable th[data-sort]").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.dataset.sort;
      if (courseSortKey === key) {
        courseSortDir = courseSortDir === "asc" ? "desc" : "asc";
      } else {
        courseSortKey = key;
        courseSortDir = "asc";
      }
      renderCoursesTable();
    });
  });

  // ---------- export / import / auto-backup ----------

  function downloadBackup(auto) {
    var now = new Date();
    var payload = { settings: settings, applications: apps, courses: courses, exportedAt: now.toISOString() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    var stamp = now.toISOString().replace(/[:.]/g, "-");
    a.download = (auto ? "job-search-autobackup-" : "job-search-backup-") + stamp + ".json";
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
    updateAutoBackupStatus();
  }

  function updateAutoBackupStatus() {
    var el = document.getElementById("autoBackupStatus");
    var minutes = settings ? (settings.autoBackupMinutes || 0) : 0;

    if (!minutes) {
      el.textContent = "Auto-backup: off";
      return;
    }

    var label = minutes < 60 ? minutes + " min"
      : minutes < 1440 ? (minutes / 60) + "h"
      : (minutes / 1440) + "d";

    var last = localStorage.getItem(LAST_BACKUP_KEY);
    var lastText = last ? new Date(last).toLocaleTimeString() : "never yet";
    el.textContent = "Auto-backup: every " + label + " (last: " + lastText + ")";
  }

  function scheduleAutoBackup() {
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer);
      autoBackupTimer = null;
    }
    var minutes = settings ? (settings.autoBackupMinutes || 0) : 0;
    if (minutes > 0) {
      autoBackupTimer = setInterval(function () { downloadBackup(true); }, minutes * 60 * 1000);
    }
    updateAutoBackupStatus();
  }

  document.getElementById("exportBtn").addEventListener("click", function () {
    downloadBackup(false);
  });

  document.getElementById("importBtn").addEventListener("click", function () {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!confirm("Import will replace your current settings, applications, and courses in this browser. Continue?")) return;
        if (data.settings) saveSettings(data.settings);
        if (Array.isArray(data.applications)) {
          apps = data.applications;
          saveApps();
        }
        if (Array.isArray(data.courses)) {
          courses = data.courses;
          saveCourses();
        }
        applySettingsToUI();
        document.getElementById("setupOverlay").classList.add("hidden");
        tick();
        renderTable();
        renderCoursesTable();
      } catch (err) {
        alert("Could not read that file. Make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // ---------- GitHub sync ----------

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function base64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  function ghApiUrl(cfg) {
    return "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + SYNC_FILE_PATH;
  }

  function ghHeaders(cfg) {
    return {
      "Authorization": "Bearer " + cfg.token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }

  function setSyncStatus(msg) {
    var el = document.getElementById("syncStatus");
    if (el) el.textContent = msg;
  }

  function fetchRemoteFile(cfg) {
    return fetch(ghApiUrl(cfg), { headers: ghHeaders(cfg) }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) {
        return res.text().then(function (t) { throw new Error("GitHub API error " + res.status + ": " + t); });
      }
      return res.json().then(function (json) {
        return { sha: json.sha, data: JSON.parse(base64ToUtf8(json.content)) };
      });
    });
  }

  function pushToGitHub(cfg) {
    var payload = {
      settings: settings,
      applications: apps,
      courses: courses,
      updatedAt: localStorage.getItem(LOCAL_UPDATED_KEY) || new Date().toISOString()
    };

    return fetchRemoteFile(cfg).then(function (remote) {
      var body = {
        message: "Sync from browser at " + new Date().toISOString(),
        content: utf8ToBase64(JSON.stringify(payload, null, 2))
      };
      if (remote) body.sha = remote.sha;

      return fetch(ghApiUrl(cfg), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders(cfg)),
        body: JSON.stringify(body)
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) { throw new Error("Push failed " + res.status + ": " + t); });
        }
        return res.json();
      });
    });
  }

  function applyRemoteData(remoteData) {
    suppressSyncPush = true;
    if (remoteData.settings) saveSettings(remoteData.settings);
    if (Array.isArray(remoteData.applications)) {
      apps = remoteData.applications;
      saveApps();
    }
    if (Array.isArray(remoteData.courses)) {
      courses = remoteData.courses;
      saveCourses();
    }
    if (remoteData.updatedAt) localStorage.setItem(LOCAL_UPDATED_KEY, remoteData.updatedAt);
    suppressSyncPush = false;
    applySettingsToUI();
    tick();
    renderTable();
    renderCoursesTable();
  }

  function scheduleSyncPush() {
    var cfg = loadSyncConfig();
    if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) return;
    if (syncPushTimer) clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(function () {
      syncPushTimer = null;
      pushToGitHub(cfg).then(function () {
        setSyncStatus("Synced just now.");
      }).catch(function (err) {
        setSyncStatus("Sync push failed: " + err.message);
      });
    }, 4000);
  }

  function syncNow(showAlerts) {
    var cfg = loadSyncConfig();
    if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) {
      setSyncStatus("Not configured.");
      return Promise.resolve();
    }
    if (syncInFlight) return Promise.resolve();
    syncInFlight = true;
    setSyncStatus("Syncing…");

    return fetchRemoteFile(cfg).then(function (remote) {
      var localUpdatedAt = localStorage.getItem(LOCAL_UPDATED_KEY) || "1970-01-01T00:00:00.000Z";

      if (!remote) {
        return pushToGitHub(cfg).then(function () {
          setSyncStatus("Created remote data file. Synced just now.");
        });
      }

      var remoteUpdatedAt = remote.data.updatedAt || "1970-01-01T00:00:00.000Z";

      if (remoteUpdatedAt > localUpdatedAt) {
        applyRemoteData(remote.data);
        setSyncStatus("Pulled newer data from GitHub. Synced just now.");
      } else if (localUpdatedAt > remoteUpdatedAt) {
        return pushToGitHub(cfg).then(function () {
          setSyncStatus("Pushed local changes to GitHub. Synced just now.");
        });
      } else {
        setSyncStatus("Already up to date.");
      }
    }).catch(function (err) {
      setSyncStatus("Sync failed: " + err.message);
      if (showAlerts) alert("Sync failed: " + err.message);
    }).then(function () {
      syncInFlight = false;
    });
  }

  document.getElementById("syncTestBtn").addEventListener("click", function () {
    var owner = document.getElementById("syncOwner").value.trim();
    var repo = document.getElementById("syncRepoName").value.trim();
    var typedToken = document.getElementById("syncToken").value.trim();
    var existingCfg = loadSyncConfig();
    var token = typedToken || (existingCfg && existingCfg.token) || "";

    if (!owner || !repo || !token) {
      setSyncStatus("Fill in owner, repo, and token.");
      return;
    }

    var cfg = { owner: owner, repo: repo, token: token };
    setSyncStatus("Testing connection…");

    fetchRemoteFile(cfg).then(function () {
      saveSyncConfig(cfg);
      document.getElementById("syncToken").value = "";
      document.getElementById("syncToken").placeholder = "•••• token saved (leave blank to keep)";
      setSyncStatus("Connected. Saved — syncing now…");
      return syncNow(true);
    }).catch(function (err) {
      setSyncStatus("Connection failed: " + err.message);
    });
  });

  document.getElementById("syncNowBtn").addEventListener("click", function () {
    syncNow(true);
  });

  // ---------- init ----------

  ensureSettings();
  apps = loadApps();
  courses = loadCourses();
  renderTable();
  renderCoursesTable();
  tick();
  setInterval(tick, 1000);

  if (settings) {
    syncNow(false);
  }
})();

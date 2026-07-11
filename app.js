(function () {
  "use strict";

  var SETTINGS_KEY = "jsc_settings";
  var APPS_KEY = "jsc_applications";

  var settings = null;
  var apps = [];
  var sortKey = "dateApplied";
  var sortDir = "desc";

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
  }

  document.getElementById("setupSave").addEventListener("click", function () {
    var deadline = document.getElementById("setupDeadline").value;
    var label = document.getElementById("setupLabel").value.trim() || "Deadline";
    var start = document.getElementById("setupStart").value;
    var goal = document.getElementById("setupGoal").value;

    if (!deadline || !start) {
      alert("Please fill in both dates to continue.");
      return;
    }

    saveSettings({
      deadline: deadline,
      label: label,
      startDate: start,
      weeklyGoal: goal ? parseInt(goal, 10) : 0
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
    settingsModal.classList.remove("hidden");
  });

  document.getElementById("settingsCancelBtn").addEventListener("click", function () {
    settingsModal.classList.add("hidden");
  });

  document.getElementById("settingsSaveBtn").addEventListener("click", function () {
    var deadline = document.getElementById("setDeadline").value;
    var label = document.getElementById("setLabel").value.trim() || "Deadline";
    var start = document.getElementById("setStart").value;
    var goal = document.getElementById("setGoal").value;

    if (!deadline || !start) {
      alert("Please fill in both dates.");
      return;
    }

    saveSettings({
      deadline: deadline,
      label: label,
      startDate: start,
      weeklyGoal: goal ? parseInt(goal, 10) : 0
    });

    applySettingsToUI();
    settingsModal.classList.add("hidden");
    tick();
    renderStats();
  });

  document.getElementById("wipeBtn").addEventListener("click", function () {
    if (confirm("This will permanently erase all settings and logged applications from this browser. Continue?")) {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(APPS_KEY);
      location.reload();
    }
  });

  // ---------- clock + countdown ----------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    var now = new Date();
    document.getElementById("clock").textContent =
      now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  " + now.toLocaleTimeString();

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
    }

    var startD = new Date(settings.startDate + "T00:00:00");
    var dayOfSearch = daysBetween(startD, now) + 1;
    document.getElementById("statDay").textContent = dayOfSearch > 0 ? dayOfSearch : 1;
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
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + status + "</span>";
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

  // ---------- search / filter / sort ----------

  document.getElementById("searchBox").addEventListener("input", renderTable);
  document.getElementById("statusFilter").addEventListener("change", renderTable);

  document.querySelectorAll("th[data-sort]").forEach(function (th) {
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

  // ---------- export / import ----------

  document.getElementById("exportBtn").addEventListener("click", function () {
    var payload = { settings: settings, applications: apps, exportedAt: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "job-search-backup-" + todayISO() + ".json";
    a.click();
    URL.revokeObjectURL(url);
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
        if (!confirm("Import will replace your current settings and applications in this browser. Continue?")) return;
        if (data.settings) saveSettings(data.settings);
        if (Array.isArray(data.applications)) {
          apps = data.applications;
          saveApps();
        }
        applySettingsToUI();
        document.getElementById("setupOverlay").classList.add("hidden");
        tick();
        renderTable();
      } catch (err) {
        alert("Could not read that file. Make sure it's a backup exported from this app.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  // ---------- init ----------

  ensureSettings();
  apps = loadApps();
  renderTable();
  tick();
  setInterval(tick, 1000);
})();

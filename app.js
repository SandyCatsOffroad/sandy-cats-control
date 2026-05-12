// Sandy Cats Mission Control
// Pure client-side dashboard. Data loaded from /data/*.json with cache-busting.

(function () {
  "use strict";

  // ---------- Config ----------
  const REFRESH_MS = 60_000;
  const DATA_FILES = {
    tasks: "data/tasks.json",
    calendar: "data/calendar.json",
    seo: "data/seo.json",
    ads: "data/ads.json",
    social: "data/social.json",
  };

  // ---------- State ----------
  const state = {
    activeTab: "tasks",
    data: { tasks: null, calendar: null, seo: null, ads: null, social: null },
    taskFilter: "all",
    socialPlatform: "all",
    calendarView: "month",
    calendarCursor: new Date(),
    lastUpdated: null,
    online: navigator.onLine,
  };

  // ---------- Utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, children = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "data" && typeof v === "object") {
        for (const [dk, dv] of Object.entries(v)) n.dataset[dk] = dv;
      } else if (v !== null && v !== undefined) n.setAttribute(k, v);
    }
    const kids = Array.isArray(children) ? children : [children];
    for (const c of kids) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  };

  const formatDate = (d, opts = { month: "short", day: "numeric" }) => {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleDateString(undefined, opts);
  };

  const formatDateTime = (d) => {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const formatTime = (d) => {
    if (!d) return "";
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };

  const daysFromNow = (d) => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date)) return null;
    const a = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const t = new Date();
    const b = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - b) / 86400000);
  };

  const formatMoney = (n) => {
    if (typeof n !== "number") return "—";
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: n >= 100 ? 0 : 2 });
  };

  const formatNum = (n) => {
    if (typeof n !== "number") return "—";
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return n.toLocaleString();
  };

  const formatPct = (n, digits = 1) => {
    if (typeof n !== "number") return "—";
    return n.toFixed(digits) + "%";
  };

  // ---------- Theme ----------
  const THEME_KEY = "sandycats.theme";

  function applyTheme(theme) {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }

  function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
    $("#themeBtn").addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  // ---------- Status ----------
  function setStatus(kind, label) {
    const node = $("#status");
    node.classList.remove("is-ok", "is-err", "is-loading");
    if (kind) node.classList.add("is-" + kind);
    $(".status__label", node).textContent = label;
  }

  function setLastUpdated() {
    state.lastUpdated = new Date();
    $("#lastUpdated").textContent = "Updated " + state.lastUpdated.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  // ---------- Data loading ----------
  async function fetchJSON(path) {
    const url = path + (path.includes("?") ? "&" : "?") + "v=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed: ${path} (${res.status})`);
    return res.json();
  }

  async function loadAll() {
    setStatus("loading", "Syncing…");
    const entries = Object.entries(DATA_FILES);
    const results = await Promise.allSettled(entries.map(([, path]) => fetchJSON(path)));
    let okCount = 0;
    results.forEach((r, i) => {
      const key = entries[i][0];
      if (r.status === "fulfilled") {
        state.data[key] = r.value;
        okCount++;
      } else {
        console.warn("Failed to load", entries[i][1], r.reason);
        if (!state.data[key]) state.data[key] = null;
      }
    });
    if (okCount === entries.length) setStatus("ok", "Live");
    else if (okCount === 0) setStatus("err", "Offline");
    else setStatus("ok", "Partial");
    setLastUpdated();
    renderActive();
  }

  // ---------- Render router ----------
  function renderActive() {
    switch (state.activeTab) {
      case "tasks": renderTasks(); break;
      case "calendar": renderCalendar(); break;
      case "seo": renderSEO(); break;
      case "ads": renderAds(); break;
      case "social": renderSocial(); break;
    }
  }

  // ---------- Tabs ----------
  function initTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        if (tab === state.activeTab) return;
        state.activeTab = tab;
        $$(".tab").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false"));
        $$(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== "panel-" + tab));
        renderActive();
      });
    });
  }

  // ---------- Tasks ----------
  const TASK_PRIORITY_BADGE = {
    high: { cls: "badge--red", label: "High" },
    medium: { cls: "badge--amber", label: "Medium" },
    low: { cls: "badge--cyan", label: "Low" },
  };

  const TASK_STATUS_BADGE = {
    open: { cls: "badge--gray", label: "Open" },
    in_progress: { cls: "badge--blue", label: "In Progress" },
    done: { cls: "badge--green", label: "Done" },
    blocked: { cls: "badge--red", label: "Blocked" },
  };

  function renderTasks() {
    const data = state.data.tasks;
    const list = $("#tasksList");
    const stats = $("#tasksStats");
    list.innerHTML = "";
    stats.innerHTML = "";

    if (!data || !Array.isArray(data.tasks)) {
      $("#tasksSubtitle").textContent = "Couldn't load tasks data.";
      list.appendChild(emptyState());
      return;
    }

    const tasks = data.tasks.slice().sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      const pa = order[a.priority] ?? 9;
      const pb = order[b.priority] ?? 9;
      if (pa !== pb) return pa - pb;
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
    });

    const counts = {
      total: tasks.length,
      open: tasks.filter((t) => t.status === "open").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      done: tasks.filter((t) => t.status === "done").length,
      overdue: tasks.filter((t) => t.status !== "done" && t.due_date && daysFromNow(t.due_date) < 0).length,
    };

    $("#tasksSubtitle").textContent = `${counts.total} task${counts.total === 1 ? "" : "s"} · ${counts.open} open · ${counts.in_progress} in progress · ${counts.done} done`;

    stats.append(
      statCard("Open", counts.open, counts.open ? "Needs pickup" : "All clear"),
      statCard("In Progress", counts.in_progress, "Actively working"),
      statCard("Done", counts.done, "Completed"),
      statCard("Overdue", counts.overdue, counts.overdue ? "Past due" : "On schedule", counts.overdue ? "down" : "up"),
    );

    const filtered = tasks.filter((t) => state.taskFilter === "all" || t.status === state.taskFilter);

    if (!filtered.length) {
      list.appendChild(emptyState());
      return;
    }

    for (const task of filtered) list.appendChild(taskCard(task));
  }

  function taskCard(task) {
    const checked = task.status === "done";
    const prio = task.priority || "medium";
    const due = task.due_date ? new Date(task.due_date) : null;
    const dueIn = due ? daysFromNow(due) : null;
    const overdue = !checked && dueIn !== null && dueIn < 0;
    const soon = !checked && dueIn !== null && dueIn >= 0 && dueIn <= 2;

    const dueBadge = due
      ? el("span", { class: `badge ${overdue ? "badge--red" : soon ? "badge--amber" : "badge--gray"}` }, [
          overdue ? `${Math.abs(dueIn)}d overdue` : dueIn === 0 ? "Due today" : dueIn === 1 ? "Due tomorrow" : `Due ${formatDate(due)}`,
        ])
      : null;

    const prioMeta = TASK_PRIORITY_BADGE[prio] || TASK_PRIORITY_BADGE.medium;
    const statusMeta = TASK_STATUS_BADGE[task.status] || TASK_STATUS_BADGE.open;

    return el("div", { class: `card prio-${prio}${checked ? " is-done" : ""}` }, [
      el("div", { class: "card__head" }, [
        el("div", { class: "card__title-row" }, [
          el("input", {
            type: "checkbox",
            class: "check",
            checked: checked ? "" : null,
            "aria-label": "Toggle done",
            onclick: (e) => {
              task.status = e.target.checked ? "done" : "open";
              renderTasks();
            },
          }),
          el("div", {}, [
            el("h3", { class: "card__title", text: task.title || "Untitled task" }),
            task.description ? el("div", { class: "card__body", text: task.description }) : null,
          ]),
        ]),
        el("span", { class: `badge ${prioMeta.cls}`, text: prioMeta.label }),
      ]),
      el("div", { class: "card__meta" }, [
        el("span", { class: `badge ${statusMeta.cls}`, text: statusMeta.label }),
        task.category ? el("span", { class: "badge badge--gray", text: task.category }) : null,
        dueBadge,
        task.assignee ? el("span", { text: "· " + task.assignee }) : null,
      ]),
    ]);
  }

  function initTasksFilters() {
    $$("#tasksFilters .chip").forEach((c) => {
      c.addEventListener("click", () => {
        $$("#tasksFilters .chip").forEach((b) => b.classList.toggle("is-active", b === c));
        state.taskFilter = c.dataset.filter;
        renderTasks();
      });
    });
  }

  // ---------- Calendar ----------
  function eventType(ev) {
    const t = (ev.type || "other").toLowerCase();
    const map = { meeting: "meeting", deadline: "deadline", launch: "launch", content: "content", ads: "ads", social: "social" };
    return map[t] || "other";
  }

  function renderCalendar() {
    const data = state.data.calendar;
    const body = $("#calendarBody");
    const legend = $("#calendarLegend");
    body.innerHTML = "";
    legend.innerHTML = "";

    if (!data || !Array.isArray(data.events)) {
      $("#calendarSubtitle").textContent = "Couldn't load calendar data.";
      body.appendChild(emptyState());
      return;
    }

    const events = data.events.map((e) => ({ ...e, _date: new Date(e.date || e.start) })).filter((e) => !isNaN(e._date));
    events.sort((a, b) => a._date - b._date);

    const cursor = state.calendarCursor;
    const view = state.calendarView;

    let title;
    if (view === "month") title = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    else if (view === "week") title = "Week of " + startOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    else title = cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    $("#calendarTitle").textContent = title;
    $("#calendarSubtitle").textContent = `${events.length} event${events.length === 1 ? "" : "s"} on the calendar`;

    if (view === "month") body.appendChild(renderMonth(cursor, events));
    else if (view === "week") body.appendChild(renderDayList(daysOfWeek(cursor), events));
    else body.appendChild(renderDayList([startOfDay(cursor)], events));

    const types = [
      ["meeting", "Meetings"],
      ["deadline", "Deadlines"],
      ["launch", "Launches"],
      ["content", "Content"],
      ["ads", "Ads"],
      ["social", "Social"],
    ];
    types.forEach(([k, label]) => {
      legend.appendChild(el("span", { class: "legend-item" }, [
        el("span", { class: `legend-swatch ev--${k}`, style: swatchStyle(k) }),
        label,
      ]));
    });
  }

  function swatchStyle(type) {
    const map = {
      meeting: "var(--primary)",
      deadline: "var(--danger)",
      launch: "var(--success)",
      content: "var(--purple)",
      ads: "var(--warning)",
      social: "var(--pink)",
      other: "var(--text-faint)",
    };
    return `background:${map[type] || map.other}`;
  }

  function renderMonth(cursor, events) {
    const wrap = el("div", { class: "cal-month" });
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    dayNames.forEach((d) => wrap.appendChild(el("div", { class: "cal-month__head", text: d })));

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = first.getDay();
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startDay);

    const today = startOfDay(new Date());
    const monthIdx = cursor.getMonth();

    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      const isOther = day.getMonth() !== monthIdx;
      const isToday = +day === +today;
      const dayEvents = events.filter((ev) => sameDay(ev._date, day));

      const cell = el("div", { class: `cal-day${isOther ? " is-other" : ""}${isToday ? " is-today" : ""}` }, [
        el("span", { class: "cal-day__num", text: String(day.getDate()) }),
      ]);
      dayEvents.slice(0, 3).forEach((ev) => {
        cell.appendChild(el("div", { class: `cal-event ev--${eventType(ev)}`, title: `${ev.title}${ev.time ? " · " + ev.time : ""}`, text: ev.title }));
      });
      if (dayEvents.length > 3) {
        cell.appendChild(el("div", { class: "cal-more", text: `+${dayEvents.length - 3} more` }));
      }
      wrap.appendChild(cell);
    }
    return wrap;
  }

  function renderDayList(days, events) {
    const wrap = el("div", { class: "cal-list" });
    const today = startOfDay(new Date());
    days.forEach((day) => {
      const dayEvents = events.filter((ev) => sameDay(ev._date, day));
      dayEvents.sort((a, b) => +a._date - +b._date);
      const isToday = +day === +today;

      const head = el("div", { class: `cal-list__head${isToday ? " is-today" : ""}` }, [
        el("span", { text: day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) }),
        el("span", { text: dayEvents.length ? `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : "Free" }),
      ]);

      const items = el("div", { class: "cal-list__items" });
      if (!dayEvents.length) items.appendChild(el("div", { class: "cal-list__empty", text: "Nothing scheduled" }));
      else {
        dayEvents.forEach((ev) => {
          items.appendChild(el("div", { class: "cal-list__item" }, [
            el("span", { class: "cal-list__time", text: ev.time || formatTime(ev._date) || "All day" }),
            el("span", { class: `dot-color`, style: swatchStyle(eventType(ev)) }),
            el("span", { class: "cal-list__title", text: ev.title }),
            ev.location ? el("span", { class: "card__row-label", text: ev.location }) : null,
          ]));
        });
      }

      wrap.appendChild(el("div", { class: "cal-list__day" }, [head, items]));
    });
    return wrap;
  }

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
  function daysOfWeek(d) {
    const start = startOfWeek(d);
    return Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return x; });
  }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function initCalendarControls() {
    $$(".seg__btn").forEach((b) => {
      b.addEventListener("click", () => {
        $$(".seg__btn").forEach((x) => x.classList.toggle("is-active", x === b));
        state.calendarView = b.dataset.view;
        renderCalendar();
      });
    });
    $("#calPrev").addEventListener("click", () => { shiftCursor(-1); renderCalendar(); });
    $("#calNext").addEventListener("click", () => { shiftCursor(1); renderCalendar(); });
    $("#calToday").addEventListener("click", () => { state.calendarCursor = new Date(); renderCalendar(); });
  }

  function shiftCursor(dir) {
    const c = new Date(state.calendarCursor);
    if (state.calendarView === "month") c.setMonth(c.getMonth() + dir);
    else if (state.calendarView === "week") c.setDate(c.getDate() + 7 * dir);
    else c.setDate(c.getDate() + dir);
    state.calendarCursor = c;
  }

  // ---------- SEO ----------
  function renderSEO() {
    const data = state.data.seo;
    const stats = $("#seoStats");
    const kwBody = $("#seoKeywordsBody");
    const taskList = $("#seoTasksList");
    const contentList = $("#seoContentList");
    stats.innerHTML = "";
    kwBody.innerHTML = "";
    taskList.innerHTML = "";
    contentList.innerHTML = "";

    if (!data) {
      $("#seoSubtitle").textContent = "Couldn't load SEO data.";
      taskList.appendChild(emptyState());
      return;
    }

    const kws = data.keywords || [];
    const tasks = data.tasks || [];
    const content = data.content || [];

    const top3 = kws.filter((k) => typeof k.rank === "number" && k.rank <= 3).length;
    const top10 = kws.filter((k) => typeof k.rank === "number" && k.rank <= 10).length;
    const improving = kws.filter((k) => typeof k.change === "number" && k.change > 0).length;
    const totalVolume = kws.reduce((s, k) => s + (k.volume || 0), 0);

    $("#seoSubtitle").textContent = `${kws.length} tracked keywords · ${tasks.length} SEO task${tasks.length === 1 ? "" : "s"}`;

    stats.append(
      statCard("Top 3", top3, "Keywords ranking high"),
      statCard("Top 10", top10, "First page"),
      statCard("Improving", improving, "Climbing this week", "up"),
      statCard("Search Volume", formatNum(totalVolume), "Monthly searches"),
    );

    kws.slice().sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).forEach((k) => {
      const delta = typeof k.change === "number" ? k.change : 0;
      const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat";
      const sym = delta > 0 ? "▲" : delta < 0 ? "▼" : "–";
      kwBody.appendChild(el("tr", {}, [
        el("td", {}, [
          el("div", { style: "font-weight:600", text: k.keyword || "—" }),
          k.url ? el("div", { class: "card__row-label", text: k.url, style: "font-size:11px" }) : null,
        ]),
        el("td", { class: "num", text: k.rank ? "#" + k.rank : "—" }),
        el("td", { class: `num ${cls}`, text: `${sym} ${Math.abs(delta) || 0}` }),
        el("td", { class: "num hide-sm", text: formatNum(k.volume) }),
        el("td", { class: "hide-sm" }, [intentBadge(k.intent)]),
      ]));
    });

    if (!tasks.length) taskList.appendChild(emptyState());
    else tasks.forEach((t) => taskList.appendChild(taskCard(t)));

    if (!content.length) contentList.appendChild(emptyState());
    else content.slice().sort((a, b) => new Date(a.publish_date || 0) - new Date(b.publish_date || 0)).forEach((c) => contentList.appendChild(contentCard(c)));
  }

  function intentBadge(intent) {
    if (!intent) return el("span", { text: "—" });
    const map = {
      informational: "badge--cyan",
      transactional: "badge--green",
      commercial: "badge--amber",
      navigational: "badge--purple",
    };
    return el("span", { class: `badge ${map[intent.toLowerCase()] || "badge--gray"}`, text: intent });
  }

  function contentCard(c) {
    const status = (c.status || "planned").toLowerCase();
    const statusMap = {
      planned: "badge--gray",
      drafting: "badge--amber",
      review: "badge--blue",
      published: "badge--green",
    };
    const date = c.publish_date ? new Date(c.publish_date) : null;
    const due = date ? daysFromNow(date) : null;
    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("h3", { class: "card__title", text: c.title || "Untitled" }),
        el("span", { class: `badge ${statusMap[status] || "badge--gray"}`, text: status }),
      ]),
      c.target_keyword ? el("div", { class: "card__body" }, [
        "Target: ",
        el("strong", { text: c.target_keyword, style: "color:var(--text)" }),
      ]) : null,
      el("div", { class: "card__meta" }, [
        c.type ? el("span", { class: "badge badge--purple", text: c.type }) : null,
        date ? el("span", { text: (due >= 0 ? "Publishes " : "Was due ") + formatDate(date) }) : null,
        c.author ? el("span", { text: "· " + c.author }) : null,
      ]),
    ]);
  }

  // ---------- Ads ----------
  function renderAds() {
    const data = state.data.ads;
    const stats = $("#adsStats");
    const list = $("#adsCampaigns");
    stats.innerHTML = "";
    list.innerHTML = "";

    if (!data || !Array.isArray(data.campaigns)) {
      $("#adsSubtitle").textContent = "Couldn't load ads data.";
      list.appendChild(emptyState());
      return;
    }

    const camps = data.campaigns;
    const active = camps.filter((c) => (c.status || "").toLowerCase() === "active").length;
    const totalSpend = camps.reduce((s, c) => s + (c.spend || 0), 0);
    const totalBudget = camps.reduce((s, c) => s + (c.budget || 0), 0);
    const totalRev = camps.reduce((s, c) => s + (c.revenue || 0), 0);
    const roi = totalSpend > 0 ? ((totalRev - totalSpend) / totalSpend) * 100 : 0;

    $("#adsSubtitle").textContent = `${camps.length} campaign${camps.length === 1 ? "" : "s"} · ${active} active`;

    stats.append(
      statCard("Spend", formatMoney(totalSpend), `of ${formatMoney(totalBudget)} budget`),
      statCard("Revenue", formatMoney(totalRev), "Attributed"),
      statCard("ROI", formatPct(roi, 0), roi >= 0 ? "Profitable" : "Loss", roi >= 0 ? "up" : "down"),
      statCard("Active", active, "Campaigns running"),
    );

    camps.slice().sort((a, b) => (b.spend || 0) - (a.spend || 0)).forEach((c) => list.appendChild(campaignCard(c)));
  }

  function campaignCard(c) {
    const status = (c.status || "").toLowerCase();
    const statusMap = {
      active: "badge--green",
      paused: "badge--amber",
      ended: "badge--gray",
      draft: "badge--gray",
    };
    const platMap = {
      google: "badge--blue",
      meta: "badge--blue",
      facebook: "badge--blue",
      instagram: "badge--pink",
      tiktok: "badge--purple",
      linkedin: "badge--blue",
      youtube: "badge--red",
    };
    const platform = (c.platform || "").toLowerCase();
    const spend = c.spend || 0;
    const budget = c.budget || 0;
    const revenue = c.revenue || 0;
    const roas = spend > 0 ? revenue / spend : 0;
    const pct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
    const pctCls = pct >= 100 ? "is-over" : pct >= 85 ? "is-warn" : pct >= 0 ? "is-ok" : "";
    const ctr = c.clicks && c.impressions ? (c.clicks / c.impressions) * 100 : null;
    const cpc = c.clicks ? spend / c.clicks : null;

    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", {}, [
          el("h3", { class: "card__title", text: c.name || "Untitled campaign" }),
          el("div", { class: "card__meta", style: "margin-top:4px" }, [
            c.platform ? el("span", { class: `badge ${platMap[platform] || "badge--gray"}`, text: c.platform }) : null,
            el("span", { class: `badge ${statusMap[status] || "badge--gray"}`, text: c.status || "—" }),
            c.objective ? el("span", { text: "· " + c.objective }) : null,
          ]),
        ]),
        el("div", { style: "text-align:right" }, [
          el("div", { style: "font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em", text: "ROAS" }),
          el("div", { style: "font-size:18px;font-weight:700", text: roas ? roas.toFixed(2) + "×" : "—" }),
        ]),
      ]),
      el("div", { class: "card__row" }, [
        el("span", { class: "card__row-label", text: "Budget" }),
        el("span", { class: "card__row-value", text: `${formatMoney(spend)} / ${formatMoney(budget)}` }),
      ]),
      budget > 0 ? el("div", { class: "progress" }, [el("div", { class: `progress__fill ${pctCls}`, style: `width:${pct}%` })]) : null,
      el("div", { class: "card__row" }, [
        el("span", { class: "card__row-label", text: "Revenue" }),
        el("span", { class: "card__row-value", text: formatMoney(revenue) }),
      ]),
      ctr !== null ? el("div", { class: "card__row" }, [
        el("span", { class: "card__row-label", text: "CTR · CPC" }),
        el("span", { class: "card__row-value", text: `${formatPct(ctr, 2)} · ${cpc != null ? formatMoney(cpc) : "—"}` }),
      ]) : null,
      c.conversions != null ? el("div", { class: "card__row" }, [
        el("span", { class: "card__row-label", text: "Conversions" }),
        el("span", { class: "card__row-value", text: formatNum(c.conversions) }),
      ]) : null,
    ]);
  }

  // ---------- Social ----------
  const PLATFORM_INITIALS = {
    instagram: { i: "Ig", cls: "pl-instagram" },
    twitter: { i: "Tw", cls: "pl-twitter" },
    x: { i: "X", cls: "pl-x" },
    facebook: { i: "Fb", cls: "pl-facebook" },
    linkedin: { i: "In", cls: "pl-linkedin" },
    tiktok: { i: "Tt", cls: "pl-tiktok" },
    youtube: { i: "Yt", cls: "pl-youtube" },
    pinterest: { i: "Pi", cls: "pl-pinterest" },
    threads: { i: "Th", cls: "pl-threads" },
  };

  function renderSocial() {
    const data = state.data.social;
    const stats = $("#socialStats");
    const posts = $("#socialPosts");
    const platforms = $("#socialPlatforms");
    stats.innerHTML = "";
    posts.innerHTML = "";
    platforms.innerHTML = "";

    if (!data || !Array.isArray(data.posts)) {
      $("#socialSubtitle").textContent = "Couldn't load social data.";
      posts.appendChild(emptyState());
      return;
    }

    const all = data.posts.slice().sort((a, b) => new Date(a.scheduled_date || 0) - new Date(b.scheduled_date || 0));
    const platSet = Array.from(new Set(all.map((p) => (p.platform || "other").toLowerCase())));

    const scheduled = all.filter((p) => (p.status || "").toLowerCase() === "scheduled").length;
    const published = all.filter((p) => (p.status || "").toLowerCase() === "published").length;
    const totalEng = all.reduce((s, p) => s + (p.engagement?.likes || 0) + (p.engagement?.comments || 0) + (p.engagement?.shares || 0), 0);
    const totalReach = all.reduce((s, p) => s + (p.engagement?.reach || p.engagement?.impressions || 0), 0);
    const engRate = totalReach > 0 ? (totalEng / totalReach) * 100 : 0;

    $("#socialSubtitle").textContent = `${all.length} post${all.length === 1 ? "" : "s"} across ${platSet.length} platform${platSet.length === 1 ? "" : "s"}`;

    stats.append(
      statCard("Scheduled", scheduled, "Upcoming posts"),
      statCard("Published", published, "Posted"),
      statCard("Engagement", formatNum(totalEng), "Likes · comments · shares"),
      statCard("Engagement Rate", formatPct(engRate, 2), "vs. reach"),
    );

    const allChip = el("button", { class: `chip ${state.socialPlatform === "all" ? "is-active" : ""}`, text: "All" });
    allChip.addEventListener("click", () => { state.socialPlatform = "all"; renderSocial(); });
    platforms.appendChild(allChip);
    platSet.forEach((p) => {
      const chip = el("button", { class: `chip ${state.socialPlatform === p ? "is-active" : ""}`, text: capitalize(p) });
      chip.addEventListener("click", () => { state.socialPlatform = p; renderSocial(); });
      platforms.appendChild(chip);
    });

    const filtered = all.filter((p) => state.socialPlatform === "all" || (p.platform || "").toLowerCase() === state.socialPlatform);

    if (!filtered.length) posts.appendChild(emptyState());
    else filtered.forEach((p) => posts.appendChild(socialPostCard(p)));
  }

  function socialPostCard(p) {
    const status = (p.status || "").toLowerCase();
    const statusMap = { scheduled: "badge--blue", published: "badge--green", draft: "badge--gray", failed: "badge--red" };
    const plat = (p.platform || "other").toLowerCase();
    const pmeta = PLATFORM_INITIALS[plat] || { i: "•", cls: "pl-other" };
    const date = p.scheduled_date ? new Date(p.scheduled_date) : null;
    const eng = p.engagement || {};

    return el("div", { class: "card" }, [
      el("div", { class: "card__head" }, [
        el("div", { class: "card__title-row" }, [
          el("span", { class: `platform-icon ${pmeta.cls}`, text: pmeta.i }),
          el("div", {}, [
            el("h3", { class: "card__title", text: capitalize(plat) + (p.campaign ? " · " + p.campaign : "") }),
            date ? el("div", { class: "card__row-label", style: "font-size:12px;margin-top:2px", text: formatDateTime(date) }) : null,
          ]),
        ]),
        el("span", { class: `badge ${statusMap[status] || "badge--gray"}`, text: p.status || "—" }),
      ]),
      p.content ? el("div", { class: "card__body", style: "margin-top:8px", text: p.content }) : null,
      (eng.likes != null || eng.comments != null || eng.shares != null || eng.reach != null) ? el("div", { class: "post-engagement" }, [
        eng.reach != null ? el("span", {}, [el("span", { text: "👁 " }), el("strong", { text: formatNum(eng.reach) }), " reach"]) : null,
        eng.likes != null ? el("span", {}, [el("span", { text: "♥ " }), el("strong", { text: formatNum(eng.likes) })]) : null,
        eng.comments != null ? el("span", {}, [el("span", { text: "💬 " }), el("strong", { text: formatNum(eng.comments) })]) : null,
        eng.shares != null ? el("span", {}, [el("span", { text: "↗ " }), el("strong", { text: formatNum(eng.shares) })]) : null,
      ]) : null,
    ]);
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

  // ---------- Helpers ----------
  function statCard(label, value, hint, trend) {
    return el("div", { class: "stat" }, [
      el("div", { class: "stat__label", text: label }),
      el("div", { class: "stat__value", text: String(value) }),
      hint ? el("div", { class: `stat__hint${trend ? " " + trend : ""}`, text: hint }) : null,
    ]);
  }

  function emptyState() {
    const tpl = $("#emptyTpl");
    return tpl.content.firstElementChild.cloneNode(true);
  }

  // ---------- Online / offline ----------
  function initOnlineState() {
    window.addEventListener("online", () => { state.online = true; loadAll(); });
    window.addEventListener("offline", () => { state.online = false; setStatus("err", "Offline"); });
  }

  // ---------- Init ----------
  function init() {
    initTheme();
    initTabs();
    initTasksFilters();
    initCalendarControls();
    initOnlineState();
    $("#refreshBtn").addEventListener("click", loadAll);
    loadAll();
    setInterval(() => { if (document.visibilityState === "visible") loadAll(); }, REFRESH_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.lastUpdated && Date.now() - state.lastUpdated > REFRESH_MS) loadAll();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

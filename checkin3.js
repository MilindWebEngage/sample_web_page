/* =========================================================
   GENERIC DAILY CHECK-IN WIDGET
   Replaces the old test.js logic.

   FIXES vs test.js:

   1. DATE FORMAT BUG
      test.js only understood "YYYY-MM-DD" (or an ISO string
      starting with it). Any other format - e.g. "03-09-2026"
      or "03/09/2026" (day-month-year, which is what the
      sample UI's dates like 01/11, 02/11 ... use) - fell
      through to `new Date(string)`, whose parsing of
      non-ISO strings is inconsistent across browsers and
      easily flips day/month. That silently produced an
      "Invalid Date" or the wrong date, which broke the
      whole streak calculation.

      parseFlexibleDate() below explicitly recognizes
      YYYY-MM-DD, DD-MM-YYYY and DD/MM/YYYY before ever
      falling back to the native parser.

   2. "WHICH DAYS WERE VISITED" BUG
      test.js tried to reconstruct which days in the 7-day
      grid were completed / missed from just a single
      "last check-in date" plus a day-count gap. That can
      only ever represent ONE missed day per cycle - two
      separate missed days in the same week rendered wrong.

      Fix: keep an explicit list of which days (by position
      in the cycle, 1..N) were checked in - VISITED_DAYS.
      We do NOT store full dates in that array (that would
      grow unbounded and still needs date-parsing to read
      back) - just the small integer position, e.g. [1,2,4].
      CycleStartDate + a day position is all that's needed
      to redraw the actual calendar date for that cell.
   ========================================================= */

(function () {

  "use strict";


  /* =======================================================
     CONFIG
     Everything campaign-specific lives here so the rest of
     the file is reusable for any N-day streak campaign.
  ======================================================= */

  var CONFIG = {

    totalDays: 7,

    dailyPoints: 50,

    pointsLabel: "U-Points",

    // Any number of milestones. When the CURRENT consecutive
    // streak first reaches `day`, `bonus` points are added on
    // top of whatever's already accumulated.
    //
    // This is deliberately additive rather than "floor to X",
    // because TotalPoints carries over across cycles (it's
    // never reset) - a floor only ever helps once; after the
    // first cycle the total is already past it and the reward
    // silently stops firing. Additive keeps working every cycle.
    //
    // NOTE: this client-side total is only an optimistic
    // preview for the current session's UI. The authoritative
    // TotalPoints is computed server-side by the WebEngage
    // journey (see journey template) from the profile's
    // previously-persisted TotalPoints, so it can't be
    // double-counted or tampered with client-side - the next
    // view picks up the real number.
    milestones: [
      { day: 4, bonus: 200, badge: "X2" },
      { day: 7, bonus: 250, badge: "GET 800" }
    ],

    // The final configured day is visually called out as the
    // big pay-off day (gift icon + highlighted card).
    bonusDayLabel: "BONUS DAY"

  };


  /* =======================================================
     WEBENGAGE USER DATA

     4 custom attributes:

       CycleStartDate  - date the current cycle began
       VisitedDays     - array of day positions as STRINGS,
                          e.g. ["1","2","4"] (NOT dates - see
                          fix #2 above; backend expects a
                          string array). Also accepted back as
                          a JSON array string ("[1,2,4]") or
                          plain CSV ("1,2,4") for round-tripping
                          through wherever it ends up persisted.
       TotalPoints     - running total across the cycle
       LastStreakDate  - calendar date of the most recent
                          check-in. Not needed to compute
                          anything in THIS file (VisitedDays +
                          CycleStartDate already fully determine
                          UI state) - but the backend journey
                          uses it as a duplicate-checkin guard
                          (see journey-attribute-update.liquid),
                          so it must stay accurate.
  ======================================================= */

  var customData = window.WE_CUSTOM_DATA || {};


  /* =======================================================
     DATE HELPERS
  ======================================================= */

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISO(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function diffInDays(a, b) {
    var ms = startOfDay(a).getTime() - startOfDay(b).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

  /*
   * A raw WebEngage attribute can arrive as "", "nil", "null",
   * "0", or an unresolved liquid tag like {{user["custom"][...]}}
   * when it has never been set. Treat all of those as "missing".
   */
  function isMissingValue(value) {

    if (value === undefined || value === null) {
      return true;
    }

    var s = String(value).trim().toLowerCase();

    if (s.indexOf("{{") !== -1) {
      return true;
    }

    return s === "" || s === "nil" || s === "null" || s === "undefined" || s === "nan" || s === "0";
  }

  /*
   * WebEngage's own docs say a "Date" custom attribute can come
   * back through a liquid tag in whatever shape WebEngage feels
   * like rendering it that day - so this can't assume any single
   * format. Tried in order, first match wins:
   *
   *   1. A pure number            -> Unix timestamp (sec or ms)
   *   2. YYYY-M-D / YYYY/M/D      -> unambiguous, year-first
   *   3. D-M-YYYY / D/M/YYYY      -> day-first, 4-digit year
   *      (also D-M-YY with a 2-digit year)
   *   4. anything else            -> handed to the native Date
   *      parser, which handles named-month formats like
   *      "Sep 3, 2026" or a full Date.toString() dump fine on
   *      its own; it's only unreliable for the ambiguous
   *      all-numeric shapes above, which is why those are
   *      matched explicitly first.
   *
   * Where day vs. month is ambiguous (case 3), day-first is
   * assumed to match this project's own DD/MM day labels.
   *
   * Returns a Date, or null if nothing could be parsed.
   */
  function parseFlexibleDate(value) {

    if (isMissingValue(value)) {
      return null;
    }

    var s = String(value).trim();

    var epoch = s.match(/^\d{10,13}$/);
    if (epoch) {
      var ms = epoch[0].length === 13 ? Number(epoch[0]) : Number(epoch[0]) * 1000;
      var epochDate = new Date(ms);
      return isNaN(epochDate.getTime()) ? null : epochDate;
    }

    var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    var dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
    if (dmy) {
      var year = Number(dmy[3]);
      if (dmy[3].length === 2) {
        year += 2000;
      }
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }

    var fallback = new Date(s);
    if (!isNaN(fallback.getTime())) {
      return fallback;
    }

    return null;
  }

  function formatDayLabel(date) {
    return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1);
  }


  /* =======================================================
     VISITED-DAYS HELPERS

     An array of day POSITIONS (1..totalDays), never dates.
     Accepts a real array, a JSON array string, or plain CSV
     on the way in; always emitted as a real array.
  ======================================================= */

  function parseVisitedDays(raw) {

    if (isMissingValue(raw)) {
      return [];
    }

    var items = Array.isArray(raw)
      ? raw
      : String(raw).replace(/[\[\]"]/g, "").split(",");

    return items
      .map(function (part) { return parseInt(part, 10); })
      .filter(function (n) { return !isNaN(n) && n >= 1 && n <= CONFIG.totalDays; })
      .filter(function (n, index, arr) { return arr.indexOf(n) === index; })
      .sort(function (a, b) { return a - b; });
  }


  /* =======================================================
     STATE
  ======================================================= */

  var today = new Date();

  var cycleStartDate = parseFlexibleDate(customData.CycleStartDate);
  var visitedDays = parseVisitedDays(customData.VisitedDays);
  var totalPoints = Number(customData.TotalPoints) || 0;

  var currentDay = cycleStartDate ? diffInDays(today, cycleStartDate) + 1 : 1;

  /*
   * No cycle start yet, or the previous cycle has fully
   * elapsed -> begin a fresh cycle today.
   */
  if (!cycleStartDate || currentDay > CONFIG.totalDays) {
    cycleStartDate = startOfDay(today);
    visitedDays = [];
    currentDay = 1;
  }

  currentDay = Math.max(1, Math.min(CONFIG.totalDays, currentDay));

  var alreadyCheckedInToday = visitedDays.indexOf(currentDay) !== -1;


  function dateForDay(dayPosition) {
    var d = new Date(cycleStartDate);
    d.setDate(d.getDate() + (dayPosition - 1));
    return d;
  }

  function lastStreakDateISO() {
    if (visitedDays.length === 0) {
      return "";
    }
    return toISO(dateForDay(visitedDays[visitedDays.length - 1]));
  }

  /*
   * Length of the consecutive run of visited days trailing
   * up to "today" (or up to yesterday if today isn't checked
   * in yet), used for the progress bar and milestone checks.
   */
  function getCurrentStreak() {

    var from = alreadyCheckedInToday ? currentDay : currentDay - 1;
    var streak = 0;

    for (var d = from; d >= 1; d--) {
      if (visitedDays.indexOf(d) !== -1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  function getDayStatus(dayPosition) {

    if (visitedDays.indexOf(dayPosition) !== -1) {
      return "completed";
    }

    if (dayPosition < currentDay) {
      return "missed";
    }

    if (dayPosition === currentDay) {
      return "active";
    }

    return "locked";
  }


  /* =======================================================
     UI ELEMENTS
  ======================================================= */

  var pointsValueEl = document.getElementById("pointsValue");
  var milestoneListEl = document.getElementById("milestoneList");
  var daysContainerEl = document.getElementById("daysContainer");
  var progressBarEl = document.getElementById("progressBar");
  var progressLabelEl = document.getElementById("progressLabel");
  var checkinButtonEl = document.getElementById("checkinButton");
  var closeButtonEl = document.getElementById("closeButton");
  var maxPointsEl = document.getElementById("maxPoints");
  var cardEl = document.querySelector(".card");


  /* =======================================================
     RENDER
  ======================================================= */

  function maxMilestonePoints() {
    var totalBonus = CONFIG.milestones.reduce(function (sum, m) {
      return sum + m.bonus;
    }, 0);
    return CONFIG.dailyPoints * CONFIG.totalDays + totalBonus;
  }

  function renderHeader() {
    if (maxPointsEl) {
      maxPointsEl.textContent = maxMilestonePoints();
    }
  }

  /*
   * The grid layout (columns per row) is derived from
   * CONFIG.totalDays instead of being fixed in the CSS, so
   * changing totalDays in one place doesn't break the layout.
   */
  function renderGridLayout() {
    var columns = Math.min(CONFIG.totalDays, 4);
    daysContainerEl.style.gridTemplateColumns = "repeat(" + columns + ", minmax(0, 1fr))";
  }

  function renderPoints() {
    pointsValueEl.textContent = totalPoints;
  }

  function renderMilestones() {

    milestoneListEl.innerHTML = "";

    CONFIG.milestones.forEach(function (m) {

      var card = document.createElement("div");
      card.className = "milestone-card";

      var star = document.createElement("div");
      star.className = "milestone-star";
      star.textContent = "⭐";

      var label = document.createElement("div");
      label.className = "milestone-label";
      label.textContent = m.day + "-Day Streak";

      var value = document.createElement("div");
      value.className = "milestone-value";
      value.textContent = m.badge;

      var sub = document.createElement("div");
      sub.className = "milestone-sub";
      sub.textContent = "ACCUMULATED POINTS";

      card.appendChild(star);
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(sub);

      milestoneListEl.appendChild(card);
    });
  }

  function renderProgress() {

    var streak = getCurrentStreak();

    progressLabelEl.textContent = streak + " / " + CONFIG.totalDays + " days";
    progressBarEl.style.width = (streak / CONFIG.totalDays * 100) + "%";
  }

  function renderDays() {

    renderGridLayout();

    daysContainerEl.innerHTML = "";

    for (var day = 1; day <= CONFIG.totalDays; day++) {

      var status = getDayStatus(day);
      var isFinalDay = day === CONFIG.totalDays;

      var item = document.createElement("div");
      item.className = "day-item " + status + (isFinalDay ? " bonus-day" : "");

      var circle = document.createElement("div");
      circle.className = "day-circle";
      circle.textContent = isFinalDay ? "🎁" : (status === "completed" ? "✓" : "");

      var label = document.createElement("div");
      label.className = "day-label";
      label.textContent = formatDayLabel(dateForDay(day));

      var points = document.createElement("div");
      points.className = "day-points";

      if (isFinalDay) {
        points.textContent = CONFIG.bonusDayLabel;
      } else if (status === "completed") {
        points.textContent = "+" + CONFIG.dailyPoints;
      } else {
        points.textContent = "";
      }

      item.appendChild(circle);
      item.appendChild(label);
      item.appendChild(points);
      daysContainerEl.appendChild(item);
    }
  }

  function renderButton() {

    if (alreadyCheckedInToday) {
      checkinButtonEl.textContent = "✓ Today's " + CONFIG.dailyPoints + " " + CONFIG.pointsLabel + " Claimed";
      checkinButtonEl.classList.add("completed-btn");
      checkinButtonEl.disabled = true;
    } else {
      checkinButtonEl.textContent = "Check In & Earn " + CONFIG.dailyPoints + " " + CONFIG.pointsLabel;
      checkinButtonEl.classList.remove("completed-btn");
      checkinButtonEl.disabled = false;
    }
  }

  /*
   * Safety net so the widget never has to scroll: if the card
   * (at its natural size) is taller than the viewport - a short
   * phone, a landscape orientation, a cramped in-app webview -
   * scale it down just enough to fit. On most screens the
   * content already fits and this is a no-op (scale 1).
   */
  function fitCardToViewport() {

    if (!cardEl) {
      return;
    }

    cardEl.style.transform = "scale(1)";

    var availableHeight = window.innerHeight - 20;
    var cardHeight = cardEl.getBoundingClientRect().height;

    if (cardHeight > availableHeight) {
      var scale = Math.max(0.5, availableHeight / cardHeight);
      cardEl.style.transform = "scale(" + scale + ")";
    }
  }

  function renderAll() {
    renderHeader();
    renderPoints();
    renderMilestones();
    renderProgress();
    renderDays();
    renderButton();
    fitCardToViewport();
  }


  /* =======================================================
     WEBENGAGE HOOKS
  ======================================================= */

  function trackEvent(eventName, payload) {
    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.trackEvent === "function") {
        weNotification.trackEvent(eventName, JSON.stringify(payload || {}));
      }
    } catch (error) {
      console.log("WebEngage tracking error:", error);
    }
  }

  function buildUpdatedData() {
    return {
      CycleStartDate: toISO(cycleStartDate),
      VisitedDays: visitedDays.map(function (d) { return String(d); }),
      TotalPoints: totalPoints,
      LastStreakDate: lastStreakDateISO()
    };
  }

  /*
   * Every tracked event (view or claim) carries this exact same
   * set of attributes, so dashboards/journeys built off one
   * event's attributes work identically for the other - only
   * the event name tells them apart.
   */
  function buildEventPayload() {
    return Object.assign({
      day: currentDay,
      dailyPoints: CONFIG.dailyPoints,
      streak: getCurrentStreak()
    }, buildUpdatedData());
  }


  /* =======================================================
     CHECK-IN
  ======================================================= */

  function handleCheckIn() {

    if (alreadyCheckedInToday) {
      return;
    }

    checkinButtonEl.disabled = true;

    visitedDays.push(currentDay);
    visitedDays.sort(function (a, b) { return a - b; });
    alreadyCheckedInToday = true;

    totalPoints += CONFIG.dailyPoints;

    var streak = getCurrentStreak();

    CONFIG.milestones.forEach(function (m) {
      if (streak === m.day) {
        totalPoints += m.bonus;
      }
    });

    trackEvent("daily_checkin_claim", buildEventPayload());

    renderAll();

    setTimeout(function () {
      try {
        if (typeof weNotification !== "undefined" && typeof weNotification.click === "function") {
          weNotification.click("", "", "");
        }
      } catch (error) {
        console.log("WebEngage click error:", error);
      }
    }, 300);
  }


  /* =======================================================
     WIRE UP
  ======================================================= */

  if (closeButtonEl) {
    closeButtonEl.addEventListener("click", function () {
      try {
        if (typeof weNotification !== "undefined" && typeof weNotification.close === "function") {
          weNotification.close();
        }
      } catch (error) {
        console.log("WebEngage close error:", error);
      }
    });
  }

  checkinButtonEl.addEventListener("click", handleCheckIn);

  window.addEventListener("resize", fitCardToViewport);
  window.addEventListener("orientationchange", fitCardToViewport);

  renderAll();

  trackEvent("daily_checkin_view", buildEventPayload());

})();

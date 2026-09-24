/* =========================================================
   DAILY CHECK-IN WIDGET (new UI) - logic layer

   Wires the redesigned markup in index.html to the WebEngage
   attribute schema produced by backend-logic.txt:

     TotalPoints, CycleStartDate, LastStreakDate,
     StreakCount, VisitedDays (int positions, e.g. [1,2,4])

   These no longer live as flat user custom attributes - they're
   nested inside a Map-type user attribute (currently "Age", a
   placeholder attribute used for testing) keyed by this campaign's
   id, so several campaigns can share that one attribute:

     user.custom.Age = { "abcd": { TotalPoints: 50, ... }, "other-campaign": {...} }

   The campaign id ("abcd") is hardcoded in index.html only (as
   WE_CUSTOM_DATA.CampaignId) - this file has no copy of its own, it
   just reads that value, so the two files can't drift out of sync.

   index.html passes the WHOLE Age map through as one JSON blob
   (WE_CUSTOM_DATA.CampaignData) rather than indexing into it - a
   single-level attribute read is the pattern already proven safe for
   an unset attribute, whereas indexing a second level ("abcd") into a
   possibly-never-set Age isn't confirmed safe in that rendering
   context. This file narrows it down to just this campaign's own
   entry itself (see campaignMap/campaignData below), where a missing
   Age attribute, a missing entry for this campaign id, missing
   individual fields, or the tag not resolving at all all collapse to
   the same "no cycle yet" handling via parseCampaignMap().

   On check-in click we track CONFIG.eventName ("7-DAY STREAK") with a
   flat payload the journey's liquid can read as:

     event["custom"]["event_time"]
     event["custom"]["cycle_start_date"]
     event["custom"]["campaign_id"]
     event["custom"]["server_time"]
     event["custom"]["dailyPoints"]
     event["custom"]["streak"]
     event["custom"]["TotalPoints"]

   i.e. the event's custom data must be:
     { event_time: "...", cycle_start_date: "...", campaign_id: "...",
       server_time: "...", dailyPoints: 50, streak: 1, TotalPoints: 50 }

   The server (backend-logic.txt) recomputes TotalPoints /
   StreakCount / VisitedDays authoritatively from these values plus
   the profile's previously-persisted per-campaign data; what we
   update locally below is only an optimistic preview for this
   session - the next load picks up the real numbers.
   ========================================================= */

(function () {

  "use strict";

  var CONFIG = {
    totalDays: 7,
    dailyPoints: 50,
    milestones: [
      { day: 4, bonus: 200 },
      { day: 7, bonus: 250 }
    ],
    eventName: "7-DAY STREAK",

    /*
     * Fixed, shared day-1 for every user - used when the profile
     * doesn't have a CycleStartDate yet (first-ever visit). Everyone's
     * 7-day grid is pinned to this same calendar date rather than to
     * whenever they personally first check in; someone checking in for
     * the first time after this date just starts partway through
     * (e.g. on "day 4"). Single source of truth for that default - it
     * drives both the very first render's grid/CTA AND the
     * cycle_start_date sent on check-in (see buildClaimEventPayload),
     * so the server just persists what we decided here instead of
     * applying its own empty-value fallback.
     *
     * Format: a full UTC instant ("YYYY-MM-DDT00:00:00.000Z"), not a
     * bare "YYYY-MM-DD" - parseFlexibleDate parses a bare date using
     * the BROWSER'S LOCAL timezone (new Date(y, m, d)), so on an IST
     * browser a bare date here would silently resolve to the previous
     * UTC calendar day (local midnight IST = 18:30 UTC the day
     * before). journey.txt now computes every day/streak boundary in
     * UTC, so this default has to already be an unambiguous UTC
     * instant to land on the right day.
     */
    defaultCycleStartDate: "2026-09-24T00:00:00.000Z"
  };

  /* Field keys within this campaign's own entry - the schema backend-logic.txt reads/writes. */
  var ATTR = {
    CYCLE_START_DATE: "CycleStartDate",
    VISITED_DAYS: "VisitedDays",
    TOTAL_POINTS: "TotalPoints",
    LAST_STREAK_DATE: "LastStreakDate",
    STREAK_COUNT: "StreakCount"
  };

  /*
   * WE_CUSTOM_DATA fields (see index.html). CampaignId is the single
   * source of truth for this campaign's id - hardcoded only in
   * index.html's liquid tags, read here rather than duplicated as a
   * separate CONFIG value. CampaignData is the WHOLE Map-type "Age"
   * attribute (every campaign's entry, not just this one) - index.html
   * deliberately doesn't narrow it down to user["custom"]["Age"][CampaignId]
   * itself, since a single-level attribute read is the pattern already
   * proven safe for an unset attribute, while indexing a second level
   * into a possibly-never-set Age isn't confirmed safe in that
   * rendering context. This file does that narrowing in plain JS
   * instead (see campaignData below), where a missing key just behaves
   * predictably as undefined.
   */
  var CAMPAIGN_ID_KEY = "CampaignId";
  var CAMPAIGN_DATA_KEY = "CampaignData";

  /*
   * Event custom-data keys, flat on the event - so the journey's
   * liquid can read them as event["custom"]["event_time"] / ["cycle_start_date"]
   * / ["campaign_id"] / etc.
   */
  var EVENT_PAYLOAD_KEY = {
    EVENT_TIME: "event_time",
    CYCLE_START_DATE: "cycle_start_date",
    CAMPAIGN_ID: "campaign_id",
    SERVER_TIME: "server_time",
    DAILY_POINTS: "dailyPoints",
    STREAK: "streak",
    TOTAL_POINTS: "TotalPoints"
  };

  /* Third-party UTC time source for EVENT_PAYLOAD_KEY.SERVER_TIME. */
  var SERVER_TIME_URL = "https://utctime.app/api/now";

  /*
   * WebEngage's own marker for a Date-typed custom value - required so
   * the backend parses a value as a date rather than a plain string.
   * Expected shape: "'~t'yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", i.e. this
   * prefix directly followed by a Date.prototype.toISOString() value
   * (which already produces exactly that yyyy-MM-ddTHH:mm:ss.sssZ shape).
   * Both event_time and cycle_start_date get this prefix - a bare
   * "YYYY-MM-DD" string round-trips through the backend's local
   * timezone and can silently land on the wrong calendar day.
   */
  var WE_DATE_PREFIX = "~t";

  /* index.html element ids. */
  var ELEMENT_ID = {
    POINTS_VALUE: "pointsVal",
    MILESTONE_4: "ms4",
    MILESTONE_7: "ms7",
    GRID: "grid",
    PAYOUT_DATE: "payoutDate",
    CTA_BUTTON: "ctaBtn",
    CLOSE_BUTTON: "closeBtn",
    SCREEN_CHECKIN: "screenCheckin",
    SCREEN_REWARD: "screenReward",
    REWARD_FLAIR: "rewardFlair",
    REWARD_AMOUNT: "rewardAmount",
    REWARD_MSG: "rewardMsg"
  };

  var DAY_STATUS = {
    CLAIMED: "claimed",
    TODAY: "today",
    MISSED: "missed",
    UPCOMING: "upcoming"
  };

  var SCREEN = {
    CHECKIN: "checkin",
    REWARD: "reward"
  };

  var COPY = {
    coinIcon: "U",
    tickIcon: "✓",
    giftIcon: "🎁",
    bonusFlag: "Bonus day",
    payoutLabel: "Payout",
    missedLabel: "Missed",
    ctaCheckIn: "Check in",
    ctaCheckedInToday: "Checked in today",
    ctaStreakFinished: "Streak finished",
    milestoneBonusFlair: function (milestone) {
      return milestone.day + "-day milestone bonus: +" + milestone.bonus;
    },
    rewardMessage: function (points) {
      return "Your current U-Points is <b>" + points + "</b>.<br>Keep the streak to earn more points.";
    }
  };

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  var customData = window.WE_CUSTOM_DATA || {};


  /* =======================================================
     DATE HELPERS
  ======================================================= */

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function diffInDays(a, b) {
    var ms = startOfDay(a).getTime() - startOfDay(b).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }

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

  function parseFlexibleDate(value) {

    if (isMissingValue(value)) {
      return null;
    }

    var s = String(value).trim();

    if (s.indexOf(WE_DATE_PREFIX) === 0) {
      s = s.slice(WE_DATE_PREFIX.length);
    }

    var epoch = s.match(/^\d{10,13}$/);
    if (epoch) {
      var ms = epoch[0].length === 13 ? Number(epoch[0]) : Number(epoch[0]) * 1000;
      var epochDate = new Date(ms);
      return isNaN(epochDate.getTime()) ? null : epochDate;
    }

    /*
     * A full timestamp with a time-of-day AND an explicit UTC/offset
     * marker (e.g. "2026-09-09T18:30:00Z" - exactly what backend-logic.txt
     * now persists for CycleStartDate) is a genuine instant, not a bare
     * calendar date. It has to go through the native parser so the
     * UTC/offset correctly resolves to OUR local calendar day - reading
     * just its leading Y-M-D digits (like the bare-date branch below)
     * silently mis-dates it by a day whenever the instant's UTC date
     * differs from its local one, which is guaranteed whenever the
     * account timezone is ahead of UTC (e.g. IST is UTC+5:30, so
     * "midnight IST" is always stored as 18:30 UTC the PREVIOUS day).
     */
    var hasExplicitZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+\-]\d{2}:?\d{2})$/.test(s);
    if (hasExplicitZone) {
      var instant = new Date(s);
      if (!isNaN(instant.getTime())) {
        return instant;
      }
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

  function formatFullDayLabel(date) {
    return date.getDate() + " " + MONTHS[date.getMonth()];
  }


  /* =======================================================
     VISITED-DAYS HELPERS
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
     CAMPAIGN DATA HELPERS

     Handles every "nothing saved yet" shape in one place: the Age
     attribute was never set, this tag didn't resolve at all, or the
     JSON is malformed - all of these just fall back to {}. Narrowing
     that map down to this campaign's own entry happens separately in
     STATE below (campaignMap[campaignId] || {}), which is likewise
     safe when campaignId has no entry yet - every ATTR.* read further
     down already treats an empty {} as "no cycle yet".
  ======================================================= */

  function parseCampaignMap(raw) {

    if (isMissingValue(raw)) {
      return {};
    }

    if (typeof raw === "object") {
      return raw;
    }

    try {
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (error) {
      console.warn("WebEngage CampaignData did not parse as JSON - falling back to {}. Raw value:", raw);
      return {};
    }
  }


  /* =======================================================
     STATE

     No reset-to-a-new-cycle logic here on purpose:
     backend-logic.txt never rewinds CycleStartDate on its
     own either - it only defaults it once, when empty. A
     finished cycle (currentDay > totalDays) just stays
     finished; the CTA reflects that instead of the widget
     silently starting a cycle the server was never told about.
  ======================================================= */

  var today = new Date();

  var campaignId = customData[CAMPAIGN_ID_KEY];
  var campaignMap = parseCampaignMap(customData[CAMPAIGN_DATA_KEY]);
  if (Object.keys(campaignMap).length > 0 && !campaignMap[campaignId]) {
    console.warn("WebEngage CampaignData parsed but has no entry for CampaignId '" + campaignId + "' - treating as no cycle yet. Parsed keys:", Object.keys(campaignMap));
  }
  var campaignData = campaignMap[campaignId] || {};

  var cycleStartDate = parseFlexibleDate(campaignData[ATTR.CYCLE_START_DATE]) || parseFlexibleDate(CONFIG.defaultCycleStartDate);

  var visitedDays = parseVisitedDays(campaignData[ATTR.VISITED_DAYS]);
  var totalPoints = Number(campaignData[ATTR.TOTAL_POINTS]) || 0;

  var currentDay = Math.max(1, diffInDays(today, cycleStartDate) + 1);
  var cycleFinished = currentDay > CONFIG.totalDays;
  var alreadyCheckedInToday = visitedDays.indexOf(currentDay) !== -1;


  function dateForDay(dayPosition) {
    var d = new Date(cycleStartDate);
    d.setDate(d.getDate() + (dayPosition - 1));
    return d;
  }

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

  function dayState(dayPosition) {
    if (visitedDays.indexOf(dayPosition) !== -1) {
      return DAY_STATUS.CLAIMED;
    }
    if (dayPosition === currentDay && !cycleFinished) {
      return DAY_STATUS.TODAY;
    }
    if (dayPosition < currentDay) {
      return DAY_STATUS.MISSED;
    }
    return DAY_STATUS.UPCOMING;
  }


  /* =======================================================
     UI ELEMENTS
  ======================================================= */

  var pointsValEl = document.getElementById(ELEMENT_ID.POINTS_VALUE);
  var ms4El = document.getElementById(ELEMENT_ID.MILESTONE_4);
  var ms7El = document.getElementById(ELEMENT_ID.MILESTONE_7);
  var gridEl = document.getElementById(ELEMENT_ID.GRID);
  var payoutDateEl = document.getElementById(ELEMENT_ID.PAYOUT_DATE);
  var ctaBtnEl = document.getElementById(ELEMENT_ID.CTA_BUTTON);
  var closeBtnEl = document.getElementById(ELEMENT_ID.CLOSE_BUTTON);
  var screenCheckinEl = document.getElementById(ELEMENT_ID.SCREEN_CHECKIN);
  var screenRewardEl = document.getElementById(ELEMENT_ID.SCREEN_REWARD);
  var rewardFlairEl = document.getElementById(ELEMENT_ID.REWARD_FLAIR);
  var rewardAmountEl = document.getElementById(ELEMENT_ID.REWARD_AMOUNT);
  var rewardMsgEl = document.getElementById(ELEMENT_ID.REWARD_MSG);


  /* =======================================================
     RENDER
  ======================================================= */

  function render() {

    gridEl.innerHTML = "";

    for (var n = 1; n <= CONFIG.totalDays; n++) {
      var st = dayState(n);
      var el = document.createElement("div");
      el.className = "day " + st;
      el.innerHTML =
        '<div class="date">' + formatDayLabel(dateForDay(n)) + '</div>' +
        '<div class="coin">' + COPY.coinIcon + '</div>' +
        '<div class="pts">' + (st === DAY_STATUS.MISSED ? COPY.missedLabel : "+" + CONFIG.dailyPoints) + '</div>' +
        (st === DAY_STATUS.CLAIMED ? '<div class="tick">' + COPY.tickIcon + '</div>' : '');
      gridEl.appendChild(el);
    }

    var bonusDate = dateForDay(CONFIG.totalDays + 1);
    var bonus = document.createElement("div");
    bonus.className = "day bonus";
    bonus.innerHTML =
      '<div class="flag">' + COPY.bonusFlag + '</div>' +
      '<div class="date">' + formatDayLabel(bonusDate) + '</div>' +
      '<span class="gift">' + COPY.giftIcon + '</span>' +
      '<div class="pts">' + COPY.payoutLabel + '</div>';
    gridEl.appendChild(bonus);

    pointsValEl.textContent = totalPoints;
    payoutDateEl.textContent = formatFullDayLabel(bonusDate);

    var streak = getCurrentStreak();
    ms4El.classList.toggle("hit", streak >= 4);
    ms7El.classList.toggle("hit", streak >= 7);

    if (cycleFinished) {
      ctaBtnEl.disabled = true;
      ctaBtnEl.textContent = COPY.ctaStreakFinished;
    } else if (alreadyCheckedInToday) {
      ctaBtnEl.disabled = true;
      ctaBtnEl.textContent = COPY.ctaCheckedInToday;
    } else {
      ctaBtnEl.disabled = false;
      ctaBtnEl.textContent = COPY.ctaCheckIn;
    }
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

  /*
   * utc_iso from SERVER_TIME_URL, for EVENT_PAYLOAD_KEY.SERVER_TIME.
   * Resolves to null (rather than rejecting) on any network/parse
   * failure, so callers can just omit the field instead of handling
   * an error case.
   */
  function fetchServerTime() {
    return fetch(SERVER_TIME_URL)
      .then(function (response) { return response.json(); })
      .then(function (data) { return (data && data.utc_iso) || null; })
      .catch(function () { return null; });
  }

  /*
   * Flat, so the journey's liquid can read it as
   * event["custom"]["event_time"], ["cycle_start_date"] and
   * ["campaign_id"] - see backend-logic.txt.
   *
   * cycle_start_date always carries an actual date - on a user's very
   * first check-in that's our own CONFIG.defaultCycleStartDate, not an
   * empty string, so WE decide the cycle's start date rather than
   * leaving it to the server's own empty-value fallback.
   *
   * campaign_id tells the backend which entry inside the shared Map
   * attribute to update, without touching any other campaign's data.
   *
   * serverTime is the utc_iso fetched from SERVER_TIME_URL - optional
   * since that fetch can fail, in which case the event is just sent
   * without it rather than blocked on it.
   *
   * streak and totalPoints are read as-of AFTER this check-in's own
   * point/bonus updates (see checkIn), so they reflect the streak
   * just claimed rather than the prior one.
   */
  function buildClaimEventPayload(streak, totalPoints, serverTime) {
    var payload = {};
    payload[EVENT_PAYLOAD_KEY.EVENT_TIME] = WE_DATE_PREFIX + new Date().toISOString();
    payload[EVENT_PAYLOAD_KEY.CYCLE_START_DATE] = WE_DATE_PREFIX + cycleStartDate.toISOString();
    payload[EVENT_PAYLOAD_KEY.CAMPAIGN_ID] = campaignId;
    payload[EVENT_PAYLOAD_KEY.DAILY_POINTS] = CONFIG.dailyPoints;
    payload[EVENT_PAYLOAD_KEY.STREAK] = streak;
    payload[EVENT_PAYLOAD_KEY.TOTAL_POINTS] = totalPoints;
    if (serverTime) {
      payload[EVENT_PAYLOAD_KEY.SERVER_TIME] = WE_DATE_PREFIX + serverTime;
    }
    return payload;
  }


  /* =======================================================
     SCREENS
  ======================================================= */

  var pendingMilestone = null;

  function show(id) {
    screenCheckinEl.classList.toggle("is-on", id === SCREEN.CHECKIN);
    screenRewardEl.classList.toggle("is-on", id === SCREEN.REWARD);
    window.scrollTo(0, 0);
  }

  function showReward(opts) {
    rewardAmountEl.textContent = opts.amount;
    rewardMsgEl.innerHTML = opts.msg;
    if (opts.flair) {
      rewardFlairEl.textContent = opts.flair;
      rewardFlairEl.hidden = false;
    } else {
      rewardFlairEl.hidden = true;
    }
    show(SCREEN.REWARD);
  }


  /* =======================================================
     CHECK-IN
  ======================================================= */

  function checkIn() {

    if (cycleFinished || alreadyCheckedInToday) {
      return;
    }

    ctaBtnEl.disabled = true;

    visitedDays.push(currentDay);
    visitedDays.sort(function (a, b) { return a - b; });
    alreadyCheckedInToday = true;

    totalPoints += CONFIG.dailyPoints;

    var streak = getCurrentStreak();
    var hitMilestone = null;

    CONFIG.milestones.forEach(function (m) {
      if (streak === m.day) {
        totalPoints += m.bonus;
        hitMilestone = m;
      }
    });

    fetchServerTime().then(function (serverTime) {
      trackEvent(CONFIG.eventName, buildClaimEventPayload(streak, totalPoints, serverTime));
    });

    pendingMilestone = hitMilestone;

    render();
    showReward({
      amount: CONFIG.dailyPoints,
      msg: COPY.rewardMessage(totalPoints)
    });
  }


  /* =======================================================
     WIRE UP
  ======================================================= */

  ctaBtnEl.addEventListener("click", checkIn);

  closeBtnEl.addEventListener("click", function () {

    if (pendingMilestone) {
      var m = pendingMilestone;
      pendingMilestone = null;
      showReward({
        flair: COPY.milestoneBonusFlair(m),
        amount: totalPoints,
        msg: COPY.rewardMessage(totalPoints)
      });
      return;
    }

    show(SCREEN.CHECKIN);

    try {
      if (typeof weNotification !== "undefined" && typeof weNotification.click === "function") {
        weNotification.click("", "", "");
      }
    } catch (error) {
      console.log("WebEngage click error:", error);
    }
  });

  render();

})();

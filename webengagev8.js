  
    /* =========================================================
       DAILY CHECK-IN
       SINGLE PAGE / SINGLE JS LOGIC
    ========================================================= */

    (function () {

      "use strict";


      /* =======================================================
         CONFIG
      ======================================================= */

      var DAILY_POINTS = 50;

      var FOUR_DAY_REWARD = 400;

      var SEVEN_DAY_REWARD = 800;

      var TOTAL_DAYS = 7;


      /* =======================================================
         WEBENGAGE USER DATA
         
         IMPORTANT:
         We keep two different concepts:

         1. StreakCount
            Current consecutive streak.

         2. TotalUpoints
            Total points earned in this 7-day challenge.

         A missed day ONLY breaks StreakCount.
         It NEVER resets TotalUpoints.
      ======================================================= */

      /*
       * These values are resolved by WebEngage in the
       * notification's OWN inline HTML (see streck.html),
       * not in this externally-hosted script.
       *
       * WebEngage's personalization engine only substitutes
       * {{user["custom"][...]}} tags in content it renders
       * and serves itself. A file loaded via <script src>
       * from a third-party URL (GitHub/jsDelivr) is fetched
       * directly by the browser and never passes through
       * WebEngage's server, so tags placed here would stay
       * literal text forever - hence reading them off
       * window.WE_CUSTOM_DATA instead.
       */

      var customData =
        window.WE_CUSTOM_DATA || {};

      var rawStreakCount =
        customData.StreakCount;

      var rawTotalUpoints =
        customData.TotalUpoints;

      var rawCompletedDays =
        customData.CompletedDays;

      var rawStreakDate =
        customData.StreakDate;

      var rawCycleStartDate =
        customData.CycleStartDate;


      /* =======================================================
         TEMP TEST HOOK

         Confirms this externally-hosted script can read
         window.WE_CUSTOM_DATA once fetched from the real
         GitHub / jsDelivr URL.

         No-op in the real check-in widget since it has no
         element with this id. Safe to remove once verified.
      ======================================================= */

      var externalScriptTestElement =
        document.getElementById("dateFromExternalScript");

      if (externalScriptTestElement) {

        externalScriptTestElement.textContent =
          rawStreakDate;

      }


      var streakCount =
        Number(rawStreakCount) || 0;

      var totalUpoints =
        Number(rawTotalUpoints) || 0;

      var completedDays =
        Number(rawCompletedDays) || 0;

      var streakDate =
        rawStreakDate;

      var cycleStartDate =
        rawCycleStartDate;


      /* =======================================================
         SAFE DATE HELPERS
      ======================================================= */

      function getToday() {

        var d = new Date();

        var year = d.getFullYear();

        var month = String(d.getMonth() + 1).padStart(2, "0");

        var day = String(d.getDate()).padStart(2, "0");

        return year + "-" + month + "-" + day;
      }


      /*
       * WebEngage renders an unset custom attribute as an
       * empty string, or as the literal text "nil" / "null",
       * or as "0" for a date field that has never been written.
       *
       * If the attribute has NEVER been set on the user's
       * profile, WebEngage leaves the liquid template
       * completely unresolved instead, e.g. the literal text
       * {{user["custom"]["CycleStartDate"]}}.
       *
       * Treat all of these as "not received".
       */

      function isMissingValue(value) {

        if (value === undefined || value === null) {
          return true;
        }

        var stringValue =
          String(value);

        if (stringValue.indexOf("{{") !== -1) {
          return true;
        }

        var normalized =
          stringValue.trim().toLowerCase();

        return (
          normalized === "" ||
          normalized === "nil" ||
          normalized === "null" ||
          normalized === "undefined" ||
          normalized === "nan" ||
          normalized === "0"
        );
      }


      function normalizeDate(value) {

        if (!value) {
          return "";
        }

        value = String(value);

        /*
         * Handle WebEngage ISO date values.
         * Example:
         * 2026-09-03T12:30:00+0530
         */

        if (value.indexOf("T") !== -1) {

          return value.split("T")[0];

        }

        return value.substring(0, 10);
      }


      function parseDate(value) {

        var normalized = normalizeDate(value);

        if (!normalized) {
          return null;
        }

        var parts = normalized.split("-");

        if (parts.length !== 3) {
          return null;
        }

        return new Date(
          Number(parts[0]),
          Number(parts[1]) - 1,
          Number(parts[2])
        );
      }


      function differenceInDays(date1, date2) {

        var d1 = new Date(
          date1.getFullYear(),
          date1.getMonth(),
          date1.getDate()
        );

        var d2 = new Date(
          date2.getFullYear(),
          date2.getMonth(),
          date2.getDate()
        );

        var difference =
          d1.getTime() - d2.getTime();

        return Math.round(
          difference / (1000 * 60 * 60 * 24)
        );
      }


      /* =======================================================
         CURRENT DATE
      ======================================================= */

      var today = getToday();


      /*
       * If StreakDate / CycleStartDate were never written
       * (WebEngage sends "", "nil", "null" or "0" for an
       * unset custom attribute), treat them as not received.
       *
       * StreakDate → no previous check-in exists.
       * CycleStartDate → start a fresh cycle today.
       */

      if (isMissingValue(streakDate)) {
        streakDate = "";
      }

      if (isMissingValue(cycleStartDate)) {
        cycleStartDate = today;
      }


      var normalizedStreakDate =
        normalizeDate(streakDate);

      var todayDate =
        parseDate(today);

      var lastCheckInDate =
        parseDate(normalizedStreakDate);


      /* =======================================================
         DETERMINE CHECK-IN STATE
      ======================================================= */

      var alreadyCheckedIn =
        normalizedStreakDate === today;


      /* =======================================================
         DETERMINE CURRENT 7-DAY POSITION
         
         This controls the visual 7-day calendar.

         IMPORTANT:
         A missed day is NOT treated as a completed day.
         It is simply blank.
      ======================================================= */

      var currentDay = 1;


      /*
       * cycleStartDate is guaranteed to be set by now
       * (defaulted to today above if it was missing),
       * so this always resolves to a real date.
       */

      var startDate =
        parseDate(cycleStartDate);

      if (startDate) {

        var daysFromStart =
          differenceInDays(
            todayDate,
            startDate
          );

        currentDay =
          daysFromStart + 1;

      }


      /*
       * Keep currentDay within 1-7.
       */

      currentDay =
        Math.max(
          1,
          Math.min(
            TOTAL_DAYS,
            currentDay
          )
        );


      /* =======================================================
         DETERMINE IF PREVIOUS DAY WAS MISSED
         
         Example:

         Last check-in = Day 2
         Today = Day 4

         Difference = 2

         Therefore Day 3 was missed.

         We DO NOT reset TotalUpoints.
      ======================================================= */

      var gapDays = 0;

      if (lastCheckInDate) {

        gapDays =
          differenceInDays(
            todayDate,
            lastCheckInDate
          );

      }


      /* =======================================================
         UI ELEMENTS
      ======================================================= */

      var bottomTotalPointsElement =
        document.getElementById("bottomTotalPoints");

      var debugStreakCountElement =
        document.getElementById("debugStreakCount");

      var debugTotalUpointsElement =
        document.getElementById("debugTotalUpoints");

      var debugCompletedDaysElement =
        document.getElementById("debugCompletedDays");

      var debugStreakDateElement =
        document.getElementById("debugStreakDate");

      var debugCycleStartDateElement =
        document.getElementById("debugCycleStartDate");

      var milestoneValueElement =
        document.getElementById("milestoneValue");

      var milestoneProgressBar =
        document.getElementById("milestoneProgressBar");

      var milestoneMessage =
        document.getElementById("milestoneMessage");

      var daysContainer =
        document.getElementById("daysContainer");

      var checkinButton =
        document.getElementById("checkinButton");

      var closeButton =
        document.getElementById("closeButton");


      /* =======================================================
         UPDATE TOTAL UI
      ======================================================= */

      function updateTotalUI() {

        bottomTotalPointsElement.textContent =
          totalUpoints;

      }


      /* =======================================================
         UPDATE DEBUG UI

         Shows the RAW values received from WebEngage for
         this custom attribute, before any sanitization
         (Number() coercion, isMissingValue() defaulting).

         Useful for confirming what is actually coming in
         on repeat visits.
      ======================================================= */

      function updateDebugUI() {

        debugStreakCountElement.textContent =
          rawStreakCount;

        debugTotalUpointsElement.textContent =
          rawTotalUpoints;

        debugCompletedDaysElement.textContent =
          rawCompletedDays;

        debugStreakDateElement.textContent =
          rawStreakDate;

        debugCycleStartDateElement.textContent =
          rawCycleStartDate;

      }


      /* =======================================================
         UPDATE MILESTONE UI
      ======================================================= */

      function updateMilestoneUI() {

        var displayStreak =
          Math.min(
            streakCount,
            TOTAL_DAYS
          );

        milestoneValueElement.textContent =
          displayStreak + " / 7 days";

        var progress =
          (displayStreak / TOTAL_DAYS) * 100;

        milestoneProgressBar.style.width =
          progress + "%";


        /*
         * Milestone message
         */

        if (streakCount >= 7) {

          milestoneMessage.innerHTML =
            "🎉 <strong>7-day streak completed!</strong> " +
            "Your total milestone reward is 800 UPoints.";

        }

        else if (streakCount >= 4) {

          milestoneMessage.innerHTML =
            "🔥 <strong>4-day streak completed!</strong> " +
            "Your total milestone reward is 400 UPoints.";

        }

        else {

          var remaining =
            4 - streakCount;

          if (remaining < 1) {
            remaining = 1;
          }

          milestoneMessage.innerHTML =
            "Complete <strong>" +
            remaining +
            " more consecutive day" +
            (remaining > 1 ? "s" : "") +
            "</strong> to unlock 400 UPoints.";

        }

      }


      /* =======================================================
         GET DAY STATUS
         
         POSSIBLE VALUES:

         completed
         missed
         active
         locked
      ======================================================= */

      function getDayStatus(dayNumber) {

        /*
         * Day is before current day.
         */

        if (dayNumber < currentDay) {

          /*
           * We don't have individual historical event
           * dates stored here, so use completedDays and
           * streak history to determine visual state.
           *
           * For the current 7-day cycle:
           * completed days are represented by the
           * successful check-in count.
           */

          var successfulDaysBefore =
            completedDays;


          /*
           * If current user has completed N days,
           * first N historical positions are completed
           * unless a missed date exists.
           *
           * The missed-date logic below creates the blank
           * position.
           */

          if (
            lastCheckInDate &&
            gapDays > 1
          ) {

            var missedDayPosition =
              currentDay - gapDays + 1;

            if (
              dayNumber === missedDayPosition
            ) {

              return "missed";

            }

          }


          /*
           * If we have enough completed days,
           * mark this position completed.
           */

          if (
            dayNumber <= successfulDaysBefore
          ) {

            return "completed";

          }

          /*
           * Otherwise this day is blank.
           */

          return "missed";

        }


        /*
         * Today
         */

        if (dayNumber === currentDay) {

          return alreadyCheckedIn
            ? "completed"
            : "active";

        }


        /*
         * Future
         */

        return "locked";

      }


      /* =======================================================
         RENDER 7 DAYS
      ======================================================= */

      function renderDays() {

        daysContainer.innerHTML = "";


        for (
          var i = 1;
          i <= TOTAL_DAYS;
          i++
        ) {

          var status =
            getDayStatus(i);


          var dayItem =
            document.createElement("div");

          dayItem.className =
            "day-item " + status;


          var dayCircle =
            document.createElement("div");

          dayCircle.className =
            "day-circle";


          /*
           * Completed day
           */

          if (status === "completed") {

            dayCircle.textContent = "✓";

          }


          /*
           * Missed day
           *
           * Keep it BLANK.
           */

          else if (status === "missed") {

            dayCircle.textContent = "";

          }


          /*
           * Active day
           */

          else if (status === "active") {

            dayCircle.textContent = i;

          }


          /*
           * Future
           */

          else {

            dayCircle.textContent = i;

          }


          var dayLabel =
            document.createElement("div");

          dayLabel.className =
            "day-label";

          dayLabel.textContent =
            "Day " + i;


          var dayPoints =
            document.createElement("div");

          dayPoints.className =
            "day-points";


          if (status === "completed") {

            dayPoints.textContent =
              "+" + DAILY_POINTS;

          }

          else {

            /*
             * Missed / locked / active
             * do not show reward as completed.
             */

            dayPoints.textContent =
              "";

          }


          dayItem.appendChild(
            dayCircle
          );

          dayItem.appendChild(
            dayLabel
          );

          dayItem.appendChild(
            dayPoints
          );

          daysContainer.appendChild(
            dayItem
          );

        }

      }


      /* =======================================================
         UPDATE CTA
      ======================================================= */

      function updateButton() {

        if (alreadyCheckedIn) {

          checkinButton.textContent =
            "✓ Today's 50 UPoints Claimed";

          checkinButton.classList.add(
            "completed-btn"
          );

          checkinButton.disabled = true;

        }

        else {

          checkinButton.textContent =
            "Check In & Earn 50 UPoints";

          checkinButton.classList.remove(
            "completed-btn"
          );

          checkinButton.disabled = false;

        }

      }


      /* =======================================================
         TRACK WEBENGAGE EVENT
      ======================================================= */

      function trackEvent(
        eventName,
        payload
      ) {

        try {

          if (
            typeof weNotification !== "undefined" &&
            typeof weNotification.trackEvent === "function"
          ) {

            weNotification.trackEvent(
              eventName,
              JSON.stringify(payload || {})
            );

          }

        }
        catch (error) {

          console.log(
            "WebEngage tracking error:",
            error
          );

        }

      }


      /* =======================================================
         SAVE USER ATTRIBUTES
         
         NOTE:
         This JSON is generated separately below as the
         WebEngage API payload.

         The notification itself should update the attributes
         using your WebEngage API / journey action.
      ======================================================= */

      function buildUpdatedData() {

        return {

          StreakCount: streakCount,

          StreakDate: streakDate,

          CompletedDays: completedDays,

          TotalUpoints: totalUpoints,

          CycleStartDate: cycleStartDate

        };

      }


      /* =======================================================
         CHECK-IN
      ======================================================= */

      function handleCheckIn() {

        /*
         * Prevent duplicate check-in.
         */

        if (alreadyCheckedIn) {

          return;

        }


        /*
         * Disable immediately so multiple clicks
         * cannot create multiple rewards.
         */

        checkinButton.disabled = true;


        /* =====================================================
           CONSECUTIVE STREAK LOGIC

           If yesterday was completed:
             streak + 1

           If yesterday was NOT completed:
             new consecutive streak = 1

           IMPORTANT:
           TotalUpoints is NEVER reset here.
        ===================================================== */

        if (
          lastCheckInDate &&
          gapDays === 1
        ) {

          streakCount =
            streakCount + 1;

        }

        else {

          /*
           * A missed day breaks ONLY the consecutive streak.
           *
           * Previous total points remain untouched.
           */

          streakCount = 1;

        }


        /* =====================================================
           ADD DAILY POINTS

           EVERY VALID CHECK-IN:
             +50 UPoints
        ===================================================== */

        totalUpoints =
          totalUpoints + DAILY_POINTS;


        /* =====================================================
           COMPLETED DAYS

           A successful check-in counts as one completed
           day in the 7-day challenge.
        ===================================================== */

        completedDays =
          completedDays + 1;


        /*
         * Do not allow completedDays to exceed 7.
         */

        completedDays =
          Math.min(
            completedDays,
            TOTAL_DAYS
          );


        /* =====================================================
           MILESTONE 4 DAYS

           When current CONSECUTIVE streak reaches 4:

             Base points = whatever user has accumulated.

             Minimum total milestone reward = 400.

           Example:

             50 + 50 + 50 + 50 = 200

             milestone → 400
        ===================================================== */

        if (
          streakCount === 4 &&
          totalUpoints < FOUR_DAY_REWARD
        ) {

          totalUpoints =
            FOUR_DAY_REWARD;

        }


        /* =====================================================
           MILESTONE 7 DAYS

           When current CONSECUTIVE streak reaches 7:

             Minimum total milestone reward = 800.
        ===================================================== */

        if (
          streakCount === 7 &&
          totalUpoints < SEVEN_DAY_REWARD
        ) {

          totalUpoints =
            SEVEN_DAY_REWARD;

        }


        /*
         * Store today's date as the last successful
         * check-in date.
         */

        streakDate =
          today;


        /* =====================================================
           TRACK EVENT
        ===================================================== */

        trackEvent(
          "daily_coin_claim",
          {
            day: currentDay,

            dailyPoints: DAILY_POINTS,

            streakCount: streakCount,

            completedDays: completedDays,

            totalUpoints: totalUpoints,

            streakDate: streakDate,

            cycleStartDate: cycleStartDate,

            milestone:
              streakCount >= 7
                ? "7_day"
                : (
                    streakCount >= 4
                      ? "4_day"
                      : null
                  )
          }
        );


        /* =====================================================
           UPDATE UI
        ===================================================== */

        updateTotalUI();

        updateMilestoneUI();


        /*
         * Mark today's button as completed.
         */

        checkinButton.textContent =
          "✓ Today's 50 UPoints Claimed";

        checkinButton.classList.add(
          "completed-btn"
        );

        checkinButton.disabled = true;


        /*
         * Re-render days.
         */

        renderDays();


        /* =====================================================
           WEBENGAGE CTA
        ===================================================== */

        try {

          if (
            typeof weNotification !== "undefined" &&
            typeof weNotification.click === "function"
          ) {

            weNotification.click(
              "",
              "",
              ""
            );

          }

        }
        catch (error) {

          console.log(
            "WebEngage click error:",
            error
          );

        }

      }


      /* =======================================================
         CLOSE
      ======================================================= */

      closeButton.addEventListener(
        "click",
        function () {

          try {

            if (
              typeof weNotification !== "undefined" &&
              typeof weNotification.close === "function"
            ) {

              weNotification.close();

            }

          }
          catch (error) {

            console.log(
              "WebEngage close error:",
              error
            );

          }

        }
      );


      /* =======================================================
         CTA EVENT
      ======================================================= */

      checkinButton.addEventListener(
        "click",
        handleCheckIn
      );


      /* =======================================================
         INITIAL RENDER
      ======================================================= */

      updateTotalUI();

      updateMilestoneUI();

      updateDebugUI();

      renderDays();

      updateButton();


      /* =======================================================
         VIEW EVENT
      ======================================================= */

      trackEvent(
        "daily_coin_view",
        {
          streakCount: streakCount,

          completedDays: completedDays,

          totalUpoints: totalUpoints,

          streakDate: streakDate,

          cycleStartDate: cycleStartDate
        }
      );

    })();
  

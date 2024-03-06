  var webengage;
  ! function(w, e, b, n, g) {
    function o(e, t) {
      e[t[t.length - 1]] = function() {
        r.__queue.push([t.join("."), arguments])
      }
    }
    var i, s, r = w[b],
      z = " ",
      l = "init options track screen onReady".split(z),
      a = "feedback survey notification".split(z),
      c = "options render clear abort".split(z),
      p = "Open Close Submit Complete View Click".split(z),
      u = "identify login logout setAttribute".split(z);
    if (!r || !r.__v) {
      for (w[b] = r = {
          __queue: [],
          __v: "6.0",
          user: {}
        }, i = 0; i < l.length; i++) o(r, [l[i]]);
      for (i = 0; i < a.length; i++) {
        for (r[a[i]] = {}, s = 0; s < c.length; s++) o(r[a[i]], [a[i], c[s]]);
        for (s = 0; s < p.length; s++) o(r[a[i]], [a[i], "on" + p[s]])
      }
      for (i = 0; i < u.length; i++) o(r.user, ["user", u[i]])
    }
  }(window, document, "webengage");


  if (window.__WEBENGAGE_MOBILE_BRIDGE__) {
    console.log("WE_MOBILE_BRIDGE -> initialising mobile sdk");
    (function(bridge) {
      console.log("Calling bridge method ");
      var type = Object.prototype.toString;

      webengage.user.login = webengage.user.identify = function(id) {
        console.log("calling login via bridge");
        window.login.postMessage(id);
      };
      webengage.user.logout = function() {
        console.log("calling logout via bridge");
        window.logout.postMessage();
      };

      webengage.user.setAttribute = function(name, value) {
        var attr = null;

        if (type.call(name) === '[object Object]') {
          attr = name;
        } else {
          attr = {};
          attr[name] = value;
        }

        if (type.call(attr) === '[object Object]') {
          window.setAttribute.postMessage(JSON.stringify(attr));
        }
      };

      webengage.screen = function(name, data) {
        if (arguments.length === 1 && type.call(name) === '[object Object]') {
          data = name;
          name = null;
        }

        window.screen.postMessage(name || null, type.call(data) === '[object Object]' ? JSON.stringify(data) : null);
      };

      webengage.track = function(name, data) {
        window.track.postMessage(name, type.call(data) === '[object Object]' ? JSON.stringify(data) : null);
      };

    })(window.__WEBENGAGE_MOBILE_BRIDGE__);

  } else {
    console.log("WE_MOBILE_BRIDGE -> initialising web sdk")
    setTimeout(function() {
      var f = document.createElement("script"),
        d = document.getElementById("_webengage_script_tag");
      f.type = "text/javascript",
        f.async = !0,
        f.src = ("https:" == window.location.protocol ? "https://ssl.widgets.webengage.com" : "http://cdn.widgets.webengage.com") + "/js/webengage-min-v-6.0.js",
        d.parentNode.insertBefore(f, d)
    });

  }

  webengage.init("~2024bb40");

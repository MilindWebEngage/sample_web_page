
// Make channel check global
window.isFlutterChannelAvailable = function () {
    return (
        typeof window.webengage_flutter !== "undefined" &&
        typeof webengage_flutter.postMessage === "function"
    );
};

// Expose WebEngage Flutter Bridge as callable function
window.initializeWebEngageFlutterBridge = function () {
    const type = Object.prototype.toString;

    function sendToFlutter(method, ...args) {
        if (window.isFlutterChannelAvailable()) {
            const payload = JSON.stringify({ method, args });
            window.webengage_flutter.postMessage(payload);
        } else {
            console.warn("webengage_flutter channel not available.");
        }
    }

    window.webengage = window.webengage || {};
    window.webengage.user = window.webengage.user || {};

    window.webengage.user.login = window.webengage.user.identify = function (id) {
        sendToFlutter("Login", id);
    };

    window.webengage.user.logout = function () {
        sendToFlutter("Logout", {});
    };

    window.webengage.user.setAttribute = function (name, value) {
        let attr = null;
        if (type.call(name) === '[object Object]') {
            attr = name;
        } else {
            attr = {};
            attr[name] = value;
        }
        sendToFlutter("setAttribute", attr);
    };

    window.webengage.screen = function (name, data) {
        if (arguments.length === 1 && type.call(name) === '[object Object]') {
            data = name;
            name = null;
        }
        sendToFlutter("screen", name || null, type.call(data) === '[object Object]' ? data : null);
    };

    window.webengage.track = function (name, data) {
        sendToFlutter("trackEvent", name, type.call(data) === '[object Object]' ? data : null);
    };

    console.log("WebEngage Flutter bridge initialized");
};

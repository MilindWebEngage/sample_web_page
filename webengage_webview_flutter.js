function isWebViewFlutterAvailable() {
    return (
        typeof window.webengage_flutter !== "undefined" &&
        typeof window.webengage_flutter.postMessage === "function"
    );
}

function isInAppWebViewAvailable() {
    return typeof window.flutter_inappwebview !== "undefined";
}

// WebEngage bridge init for webview_flutter
function initializeWebViewFlutterBridge() {
    const type = Object.prototype.toString;

    const sendToWebViewFlutter = function (method, ...args) {
        const payload = JSON.stringify({ method, args });
        window.webengage_flutter.postMessage(payload);
    };

    initWebEngageBridge(sendToWebViewFlutter);
}
// Core init logic used by both
function initWebEngageBridge(sendFunction) {
    const type = Object.prototype.toString;
    const we = window.webengage || (window.webengage = {});
    const user = (we.user = we.user || {});

    user.login = user.identify = function (id) {
        sendFunction("Login", id);
    };

    user.logout = function () {
        sendFunction("Logout", {});
    };

    user.setAttribute = function (name, value) {
        let attr = {};
        if (type.call(name) === "[object Object]") {
            attr = name;
        } else {
            attr[name] = value;
        }
        sendFunction("setAttribute", attr);
    };

    we.screen = function (name, data) {
        if (arguments.length === 1 && type.call(name) === "[object Object]") {
            data = name;
            name = null;
        }
        sendFunction("screen", name || null, type.call(data) === "[object Object]" ? data : null);
    };

    we.track = function (name, data) {
        sendFunction("trackEvent", name, type.call(data) === "[object Object]" ? data : null);
    };

    console.log("WebEngage Flutter bridge initialized");
}
/**
 * Checks if `webview_flutter` bridge is available.
 * @returns {boolean} True if the webview_flutter channel is available.
 */
function isWebViewFlutterAvailable() {
    return (
        typeof window.webengage_flutter !== "undefined" &&
        typeof window.webengage_flutter.postMessage === "function"
    );
}

/**
 * Checks if `flutter_inappwebview` bridge is available.
 * @returns {boolean} True if the inappwebview handler is available.
 */
function isInAppWebViewAvailable() {
    return typeof window.flutter_inappwebview !== "undefined";
}

// ====================================
// Constants
// ====================================
const CHANNEL_NAME = "webengage_flutter";

const METHOD_LOGIN = "login";
const METHOD_LOGOUT = "logout";
const METHOD_SET_ATTRIBUTE = "setAttribute";
const METHOD_SCREEN = "screen";
const METHOD_TRACK_EVENT = "trackEvent";

const OBJECT_TYPE = "[object Object]";

// ====================================
// Initialization for `webview_flutter`
// ====================================

/**
 * Initializes the WebEngage bridge for `webview_flutter`.
 * Sets up function bindings and message handler.
 */
function initializeWebViewFlutterBridge() {
    const sendToWebViewFlutter = function (method, ...args) {
        const payload = JSON.stringify({ method, args });
        window.webengage_flutter.postMessage(payload);
    };
    initWebEngageBridge(sendToWebViewFlutter);
}

// ====================================
// Initialization for `flutter_inappwebview`
// ====================================

/**
 * Initializes the WebEngage bridge for `flutter_inappwebview`.
 * Sets up handler callbacks for native communication.
 */
function initializeInAppWebViewBridge() {
    const sendToInAppWebView = function (method, ...args) {
        window.flutter_inappwebview.callHandler(CHANNEL_NAME, method, ...args);
    };
    initWebEngageBridge(sendToInAppWebView);
}

// ====================================
// Common Bridge Logic
// ====================================

/**
 * Initializes the core WebEngage bridge by attaching WebEngage methods
 * and routing method calls to the native layer using the provided sender.
 *
 * @param {function} sendFunction - Function to dispatch method + args to native side.
 */
function initWebEngageBridge(sendFunction) {
    const type = Object.prototype.toString;

    // Setup global namespace if not already defined
    const we = window.webengage || (window.webengage = {});
    const user = (we.user = we.user || {});

    /**
     * Logs in or identifies the user by user ID.
     * @param {string} id - Unique user ID.
     */
    user.login = user.identify = function (id) {
        sendFunction(METHOD_LOGIN, id);
    };

    /**
     * Logs out the current user.
     */
    user.logout = function () {
        sendFunction(METHOD_LOGOUT, {});
    };

    /**
     * Sets user attributes (single or multiple).
     * @param {string|object} name - Attribute name or object of key-value pairs.
     * @param {*} [value] - Value if name is a string.
     */
    user.setAttribute = function (name, value) {
        let attr = {};
        if (type.call(name) === OBJECT_TYPE) {
            attr = name;
        } else {
            attr[name] = value;
        }
        sendFunction(METHOD_SET_ATTRIBUTE, attr);
    };

    /**
     * Tracks screen navigation within the app.
     * @param {string|object} name - Screen name or data.
     * @param {object} [data] - Optional metadata.
     */
    we.screen = function (name, data) {
        if (arguments.length === 1 && type.call(name) === OBJECT_TYPE) {
            data = name;
            name = null;
        }
        sendFunction(
            METHOD_SCREEN,
            name || null,
            type.call(data) === OBJECT_TYPE ? data : null
        );
    };

    /**
     * Tracks a custom event with optional metadata.
     * @param {string} name - Event name.
     * @param {object} [data] - Optional metadata.
     */
    we.track = function (name, data) {
        sendFunction(
            METHOD_TRACK_EVENT,
            name,
            type.call(data) === OBJECT_TYPE ? data : null
        );
    };

    console.log("WebEngage Flutter bridge initialized");
}

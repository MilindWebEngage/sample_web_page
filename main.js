function loadFromLocalStorage() {
    const cuidFromStorage = localStorage.getItem("cuid");
    if (cuidFromStorage !== null && cuidFromStorage !== "") {
        document.getElementById("cuid").value = cuidFromStorage;
        setWebEngageCUID(cuidFromStorage);
        document.getElementById("login_button").disabled = true;
        document.getElementById("logout_button").disabled = false;
        document.getElementById("cuid").disabled = true;

        // Load additional user attributes
        if (localStorage.getItem("fname") !== "") {
            document.getElementById("fname").value = localStorage.getItem("fname");
        }
        if (localStorage.getItem("sname") !== "") {
            document.getElementById("sname").value = localStorage.getItem("sname");
        }
        if (localStorage.getItem("phone") !== "") {
            document.getElementById("phone").value = localStorage.getItem("phone");
        }
    } else {
        document.getElementById("login_button").disabled = false;
        document.getElementById("logout_button").disabled = true;
    }
}

function onFormSubmit() {
    const fname = document.getElementById("fname").value;
    const sname = document.getElementById("sname").value;
    const phone = document.getElementById("phone").value;
    const cuid = document.getElementById("cuid").value;
    console.log("fname -> ", fname);
    console.log("sname -> ", sname);
    console.log("phone -> ", phone);
    console.log("cuid -> ", cuid);

    const isValid = validate(cuid);
    console.log("isValid -> ", isValid);

    if (isValid === true) {
        document.getElementById("login_button").disabled = true;
        document.getElementById("logout_button").disabled = false;
        document.getElementById("cuid").disabled = true;  // Change to true for better UX
        setWebEngageCUID(cuid);
        storeInLocalStorage("cuid", cuid);
    }
    if (fname !== "") {
        setWebEngageAttributes("we_first_name", fname);
        storeInLocalStorage("fname", fname);
    }
    if (sname !== "") {
        setWebEngageAttributes("we_second_name", sname);
        storeInLocalStorage("sname", sname);
    }
    if (phone !== "") {
        setWebEngageAttributes("we_phone", phone);
        storeInLocalStorage("phone", phone);
    }
}

function validate(string) {
    return string !== "";  // Simplified for readability
}

function setWebEngageAttributes(key, value) {
    webengage.user.setAttribute(key, value);
}

function setWebEngageCUID(cuid) {
    webengage.user.login(cuid);
}

function onLogout() {
    document.getElementById("logout_button").disabled = true;
    document.getElementById("login_button").disabled = false;
    document.getElementById("cuid").disabled = false;
    webengage.user.logout();
    clearLocalStorage();
}

function clearLocalStorage() {
    localStorage.removeItem("cuid");
    localStorage.removeItem("fname");
    localStorage.removeItem("sname");
    localStorage.removeItem("phone");
}

function storeInLocalStorage(key, value) {
    console.log("storing ", key, " with value ", value, " in local storage");
    localStorage.setItem(key, value);
}

// Updated onEventClick to allow custom events
function onEventClick() {
    const eventName = document.getElementById("eventName").value;
    const eventData = document.getElementById("eventData").value;  // Assuming this is used somewhere

    // Prepare the event data
    const eventDetails = {
        "Amount": 808.48,
        "Product 1 SKU Code": "UHUH799",
        "Product 1 Name": "Armani Jeans",
        "Product 1 Price": 300.49,
        "Product 1 Size": "L",
        "Product 2 SKU Code": "FBHG746",
        "Product 2 Name": "Hugo Boss Jacket",
        "Product 2 Price": 507.99,
        "Product 2 Size": "L",
        "Delivery Date": new Date("2017-01-09T00:00:00.000Z"),
        "Delivery City": "San Francisco",
        "Delivery ZIP": "94121",
        "Coupon Applied": "BOGO17",
        // Include any additional properties from eventData if needed
    };

    if (validate(eventName) === true) {
        webengage.track(eventName, eventDetails);  // Track the event with structured data
        console.log("Event tracked:", eventName, eventDetails);  // Log the tracking for debugging
    } else {
        console.log("Invalid event name:", eventName);  // Log error for invalid name
    }
}

// Function to handle screen tracking
function onScreenClick() {
    const screenName = document.getElementById("screenName").value;
    const screenData = document.getElementById("screenData").value;

    if (validate(screenName) === true) {
        // Track the screen view with the screen name
        console.log("Screen tracked:", screenName, screenData);
        webengage.screen(screenName, screenData);

    } else {

    }
}

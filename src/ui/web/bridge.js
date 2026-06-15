// ── Native Bridge ───────────────────────────────────────
// Communicates with the C++ backend via WebView2 postMessage

function nativeSend(msg) {
    try {
        if (window.chrome?.webview?.postMessage) {
            window.chrome.webview.postMessage(JSON.stringify(msg));
        }
    } catch(e) {
        console.error('Bridge send failed:', e);
    }
}

// Messages from native C++ arrive here
window.__nativeMessage = function(json) {
    try {
        const msg = typeof json === 'string' ? JSON.parse(json) : json;
        handleNativeMessage(msg);
    } catch(e) {
        console.error('Bridge parse failed:', e);
    }
};

// ── Auth helpers ────────────────────────────────────────
function nativeLogin(username, password) {
    nativeSend({ action: 'login', username, password });
}

function nativeVerify2FA(otp) {
    nativeSend({ action: 'verify_2fa', otp });
}

function nativeLogout() {
    nativeSend({ action: 'logout' });
}

function nativeNavigate(page) {
    nativeSend({ action: 'navigate', page });
}

function nativeOpenExternal(url) {
    nativeSend({ action: 'open_external', url });
}

// ── Handle native responses ─────────────────────────────
let nativeHandlers = {};

function handleNativeMessage(msg) {
    const handler = nativeHandlers[msg.action];
    if (handler) handler(msg);

    // Dispatch DOM events for the pages to listen to
    const event = new CustomEvent('native-' + msg.action, { detail: msg });
    document.dispatchEvent(event);
}

// Start: request config from native
document.addEventListener('DOMContentLoaded', () => {
    nativeSend({ action: 'get_config' });
});

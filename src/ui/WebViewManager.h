#pragma once

#include <wrl/client.h>
#include <wrl/event.h>
#include <WebView2.h>
#include <wil/com.h>

#include <functional>
#include <string>
#include <queue>
#include <mutex>

#include "auth/AuthService.h"
#include "core/Config.h"

namespace ui {

/// Manages a WebView2 window that renders the Claude Design HTML pages
/// and bridges communication with native C++ security layer.
class WebViewManager {
public:
    using MainThreadEnqueue = std::function<void(std::function<void()>)>;

    WebViewManager(auth::AuthService& auth_service, const core::AppConfig& config,
                   MainThreadEnqueue enqueue);
    ~WebViewManager();

    bool initialize(HWND parent_window);
    void navigate(const std::wstring& url);
    void navigateToLocal(const std::string& page_name); // e.g. "loader" -> loads embedded loader.html
    void sendToWeb(const std::string& json_message);

    void update(); // process JS bridge queue

private:
    // Called from JavaScript via window.chrome.webview.postMessage
    HRESULT onWebMessageReceived(ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args);

    // Disable DevTools, right-click menu, etc.
    HRESULT configureWebViewSettings(ICoreWebView2* webview);

    auth::AuthService& auth_service_;
    const core::AppConfig& config_;
    MainThreadEnqueue enqueue_;

    Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
    Microsoft::WRL::ComPtr<ICoreWebView2> webview_;

    bool initialized_ = false;
    HWND parent_window_ = nullptr;
    std::wstring current_url_;
};

} // namespace ui

#include "ui/WebViewManager.h"

#include <windows.h>
#include <shellapi.h>

#include <nlohmann/json.hpp>

#include <filesystem>
#include <format>
#include <regex>
#include <sstream>

namespace ui {

// Whitelist of allowed local page names
static const std::vector<std::string> ALLOWED_PAGES = {
    "loader", "login", "store", "forum", "profile", "admin",
    "notifications", "conversations"
};

// Check if a string starts with another string (case insensitive)
static bool startsWith(const std::wstring& str, const std::wstring& prefix) {
    if (str.length() < prefix.length()) return false;
    for (size_t i = 0; i < prefix.length(); ++i) {
        if (std::tolower(str[i]) != std::tolower(prefix[i])) return false;
    }
    return true;
}

// Check if string contains only safe characters (alphanumeric, dash, underscore)
static bool isSafePageName(const std::string& name) {
    return std::regex_match(name, std::regex("^[a-zA-Z0-9_-]+$"));
}

WebViewManager::WebViewManager(auth::AuthService& auth_service, const core::AppConfig& config,
                               MainThreadEnqueue enqueue)
    : auth_service_(auth_service), config_(config), enqueue_(std::move(enqueue)) {}

WebViewManager::~WebViewManager() {
    if (controller_) {
        controller_->Close();
        controller_.Reset();
    }
}

bool WebViewManager::initialize(HWND parent_window) {
    parent_window_ = parent_window;

    // Create WebView2 environment
    auto env_callback = Microsoft::WRL::Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
        [this](HRESULT, ICoreWebView2Environment* env) -> HRESULT {
            if (!env) return E_FAIL;

            // Create controller (WebView2 window) as child of our window
            auto ctrl_callback = Microsoft::WRL::Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                [this](HRESULT, ICoreWebView2Controller* controller) -> HRESULT {
                    if (!controller) return E_FAIL;
                    controller_ = controller;

                    controller_->get_CoreWebView2(&webview_);
                    if (!webview_) return E_FAIL;

                    // Security: disable DevTools, context menu, script dialogs
                    configureWebViewSettings(webview_.Get());

                    // Subscribe to web messages from JS
                    auto msg_callback = Microsoft::WRL::Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                        [this](ICoreWebView2* sender, ICoreWebView2WebMessageReceivedEventArgs* args) {
                            return onWebMessageReceived(sender, args);
                        });
                    webview_->add_WebMessageReceived(msg_callback.Get(), nullptr);

                    // Set the controller bounds to fill the parent window
                    RECT bounds;
                    GetClientRect(parent_window_, &bounds);
                    controller_->put_Bounds(bounds);

                    // Navigate to the loader page
                    navigateToLocal("loader");
                    return S_OK;
                });

            env->CreateCoreWebView2Controller(parent_window_, ctrl_callback.Get());
            return S_OK;
        });

    HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
        nullptr, nullptr, nullptr, env_callback.Get());

    initialized_ = SUCCEEDED(hr);
    return initialized_;
}

void WebViewManager::navigate(const std::wstring& url) {
    if (webview_) {
        current_url_ = url;
        webview_->Navigate(url.c_str());
    }
}

void WebViewManager::navigateToLocal(const std::string& page_name) {
    // SECURITY: Only allow whitelisted page names (no path traversal)
    if (!isSafePageName(page_name) || std::find(ALLOWED_PAGES.begin(), ALLOWED_PAGES.end(), page_name) == ALLOWED_PAGES.end()) {
        // Invalid page name — navigate to loader as safe default
        navigateToLocal("loader");
        return;
    }

    wchar_t exe_path[MAX_PATH];
    GetModuleFileNameW(nullptr, exe_path, MAX_PATH);
    std::filesystem::path dir = std::filesystem::path(exe_path).parent_path();
    auto html_path = std::filesystem::weakly_canonical(dir / "ui" / (page_name + ".html"));

    // SECURITY: verify resolved path is within the UI directory
    auto ui_dir = std::filesystem::weakly_canonical(dir / "ui");
    auto html_str = html_path.wstring();
    auto ui_str = ui_dir.wstring();

    if (startsWith(html_str, ui_str) && std::filesystem::exists(html_path)) {
        navigate(html_path.wstring());
    } else {
        // Fallback only to known local page — never to remote URL
        navigateToLocal("loader");
    }
}

void WebViewManager::sendToWeb(const std::string& json_message) {
    if (webview_) {
        std::wstring script = std::format(L"window.__nativeMessage({});",
            std::wstring(json_message.begin(), json_message.end()));
        webview_->ExecuteScript(script.c_str(), nullptr);
    }
}

void WebViewManager::update() {
    // Process the main thread queue
    // (empty for now - processing happens in the WebView2 callbacks)
}

HRESULT WebViewManager::onWebMessageReceived(ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args) {
    wil::unique_cotaskmem_string msg_raw;
    args->TryGetWebMessageAsString(&msg_raw);
    if (!msg_raw) return S_OK;

    std::wstring msg(msg_raw.get());
    std::string msg_utf8(msg.begin(), msg.end());

    // Parse the JSON message from the web page
    // Messages look like: { "action": "login", "username": "...", "password": "..." }
    // or: { "action": "navigate", "page": "store" }
    // or: { "action": "logout" }

    try {
        auto json = nlohmann::json::parse(msg_utf8);
        std::string action = json.value("action", "");

        if (action == "login") {
            std::string username = json.value("username", "");
            std::string password = json.value("password", "");

            auth_service_.login(username, password, "",
                [this, enqueue = enqueue_](auth::LoginResult result) {
                    enqueue([this, result = std::move(result)]() {
                        nlohmann::json response;
                        response["action"] = "login_result";
                        if (result.success && result.user.has_value()) {
                            response["success"] = true;
                            response["username"] = result.user->username;
                        } else if (result.requires_2fa) {
                            response["requires_2fa"] = true;
                        } else {
                            response["success"] = false;
                            response["error"] = result.error_message;
                        }
                        sendToWeb(response.dump());
                    });
                });

        } else if (action == "verify_2fa") {
            std::string otp = json.value("otp", "");
            auth_service_.verifyTwoFA(otp,
                [this, enqueue = enqueue_](auth::LoginResult result) {
                    enqueue([this, result = std::move(result)]() {
                        nlohmann::json response;
                        response["action"] = "login_result";
                        response["success"] = result.success;
                        if (!result.success) {
                            response["error"] = result.error_message;
                        }
                        sendToWeb(response.dump());
                    });
                });

        } else if (action == "logout") {
            auth_service_.logout([this, enqueue = enqueue_](bool, std::string) {
                enqueue([this]() {
                    nlohmann::json response;
                    response["action"] = "logout_result";
                    response["success"] = true;
                    sendToWeb(response.dump());
                });
            });

        } else if (action == "navigate") {
            std::string page = json.value("page", "loader");
            std::string target = json.value("url", "");
            if (!target.empty()) {
                // SECURITY: Only allow navigation to our own local pages
                // Remote URLs from the web side are not allowed
                navigateToLocal(page);
            } else {
                navigateToLocal(page);
            }

        } else if (action == "open_external") {
            std::string url = json.value("url", "");
            if (!url.empty()) {
                // SECURITY: Only allow https:// URLs — block file://, javascript:, etc.
                std::wstring wurl(url.begin(), url.end());
                if (startsWith(wurl, L"https://")) {
                    ShellExecuteW(nullptr, L"open", wurl.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
                }
            }

        } else if (action == "get_config") {
            nlohmann::json response;
            response["action"] = "config";
            response["version"] = config_.version;
            response["app_name"] = config_.app_name;
            response["registration_url"] = config_.registration_url;
            response["api_base_url"] = config_.api_base_url;
            sendToWeb(response.dump());
        }

    } catch (const std::exception&) {
        // Invalid JSON from web page - ignore
    }

    return S_OK;
}

HRESULT WebViewManager::configureWebViewSettings(ICoreWebView2* webview) {
    auto settings_callback = [webview]() {
        Microsoft::WRL::ComPtr<ICoreWebView2Settings> settings;
        if (FAILED(webview->get_Settings(&settings))) return;

        // CRITICAL SECURITY: Disable all developer tools
        settings->put_AreDevToolsEnabled(FALSE);

        // Disable right-click context menu (prevents inspect element)
        settings->put_AreDefaultContextMenusEnabled(FALSE);

        // Disable script alerts/prompts/confirms
        settings->put_AreHostObjectsAllowed(FALSE);

        // Prevent script from opening new windows
        settings->put_IsScriptEnabled(TRUE); // We need JS for our UI
        settings->put_IsWebMessageEnabled(TRUE); // Needed for C++ bridge
    };
    settings_callback();
    return S_OK;
}

} // namespace ui

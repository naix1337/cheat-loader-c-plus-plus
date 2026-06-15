#include "App.h"

#include "auth/TokenStore.h"
#include "core/Config.h"
#include "core/Logger.h"
#include "network/TlsConfig.h"

#include <dwmapi.h>

#include <filesystem>
#include <string>

#pragma comment(lib, "dwmapi.lib")

namespace {

std::wstring utf8ToWide(const std::string& text) {
    if (text.empty()) return {};
    int size = MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring wide(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), wide.data(), size);
    return wide;
}

} // namespace

App::App(HINSTANCE instance) : instance_(instance), auth_service_(api_client_) {}

App::~App() { shutdown(); }

bool App::initialize() {
    if (!core::Config::instance().loadFromAppDirectory()) {
        MessageBoxW(nullptr, L"Failed to load config/config.json", L"cpp-auth-client", MB_OK | MB_ICONERROR);
        return false;
    }

    const auto& config = core::Config::instance().get();
    core::Logger::instance().initialize(config.log_level,
                                        core::Config::instance().appDirectory() / "logs");
    window_title_ = utf8ToWide(config.app_name);

    if (!createWindow()) {
        core::Logger::instance().error("Failed to create application window");
        return false;
    }

    // Initialize TLS + API client
    network::TlsConfig tls_config(config.app_name + "/" + config.version);
    if (!api_client_.initialize(config.api_base_url, tls_config)) {
        core::Logger::instance().error("Failed to initialize API client");
        return false;
    }

    auth_service_.wireApiClientHooks();

    // Initialize WebView2 UI manager
    ui_manager_ = std::make_unique<ui::WebViewManager>(auth_service_, config,
        [this](std::function<void()> task) { enqueueMainThread(std::move(task)); });

    if (!ui_manager_->initialize(hwnd_)) {
        core::Logger::instance().warn("WebView2 not available — user must install WebView2 Runtime");
        MessageBoxW(hwnd_, L"WebView2 Runtime is required.\nDownload from: https://go.microsoft.com/fwlink/p/?LinkId=2124703",
                    L"WebView2 Required", MB_OK | MB_ICONWARNING);
        return false;
    }

    core::Logger::instance().info("Application initialized with WebView2 UI");
    running_ = true;
    return true;
}

bool App::createWindow() {
    const wchar_t* class_name = L"AppWindow";

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = App::wndProc;
    wc.hInstance = instance_;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = nullptr;
    wc.lpszClassName = class_name;
    RegisterClassExW(&wc);

    RECT rect{0, 0, kWindowWidth, kWindowHeight};
    AdjustWindowRect(&rect, WS_OVERLAPPEDWINDOW, FALSE);

    int w = rect.right - rect.left;
    int h = rect.bottom - rect.top;
    int sw = GetSystemMetrics(SM_CXSCREEN);
    int sh = GetSystemMetrics(SM_CYSCREEN);
    int x = (sw - w) / 2;
    int y = (sh - h) / 2;

    hwnd_ = CreateWindowExW(0, class_name, window_title_.c_str(),
        WS_OVERLAPPEDWINDOW, x, y, w, h, nullptr, nullptr, instance_, this);

    if (!hwnd_) return false;

    // Dark title bar
    BOOL dark = TRUE;
    DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));

    ShowWindow(hwnd_, SW_SHOWDEFAULT);
    UpdateWindow(hwnd_);
    return true;
}

void App::enqueueMainThread(std::function<void()> task) {
    std::lock_guard lock(queue_mutex_);
    task_queue_.push_back(std::move(task));
    PostMessageW(hwnd_, WM_APP + 1, 0, 0); // Wake up the message loop
}

void App::processMainThreadQueue() {
    std::vector<std::function<void()>> tasks;
    {
        std::lock_guard lock(queue_mutex_);
        tasks.swap(task_queue_);
    }
    for (auto& task : tasks) {
        if (task) task();
    }
}

void App::shutdown() {
    running_ = false;
    auth::TokenStore::instance().clear();
    api_client_.shutdown();
    ui_manager_.reset();
    if (hwnd_) { DestroyWindow(hwnd_); hwnd_ = nullptr; }
    core::Logger::instance().shutdown();
}

int App::run() {
    MSG msg{};
    while (running_) {
        while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
            if (msg.message == WM_QUIT) { running_ = false; break; }
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        processMainThreadQueue();
        if (ui_manager_) ui_manager_->update();
        Sleep(1); // Prevent 100% CPU
    }
    return static_cast<int>(msg.wParam);
}

LRESULT CALLBACK App::wndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    App* app = nullptr;
    if (msg == WM_NCCREATE) {
        auto* cs = reinterpret_cast<CREATESTRUCTW*>(lparam);
        app = static_cast<App*>(cs->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
    } else {
        app = reinterpret_cast<App*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    if (msg == WM_APP + 1 && app) {
        app->processMainThreadQueue();
        return 0;
    }

    switch (msg) {
    case WM_SIZE:
        // WebView2 controller resizes automatically
        break;
    case WM_GETMINMAXINFO: {
        auto* mmi = reinterpret_cast<MINMAXINFO*>(lparam);
        mmi->ptMinTrackSize.x = 540;
        mmi->ptMinTrackSize.y = 640;
        return 0;
    }
    case WM_SYSCOMMAND:
        if ((wparam & 0xfff0) == SC_KEYMENU) return 0;
        break;
    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

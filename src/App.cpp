#include "App.h"

#include "auth/TokenStore.h"
#include "core/Config.h"
#include "core/Logger.h"
#include "network/TlsConfig.h"
#include "ui/theme/Theme.h"

#include <dwmapi.h>
#include <imgui.h>
#include <imgui_impl_dx11.h>
#include <imgui_impl_win32.h>

#include <filesystem>
#include <string>

#pragma comment(lib, "dwmapi.lib")

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hwnd, UINT msg, WPARAM wparam,
                                                             LPARAM lparam);

namespace {

std::wstring utf8ToWide(const std::string& text) {
    if (text.empty()) {
        return {};
    }
    const int size =
        MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), nullptr, 0);
    std::wstring wide(static_cast<std::size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, text.c_str(), static_cast<int>(text.size()), wide.data(),
                        size);
    return wide;
}

} // namespace

App::App(HINSTANCE instance) : instance_(instance), auth_service_(api_client_) {}

App::~App() { shutdown(); }

bool App::initialize() {
    if (!core::Config::instance().loadFromAppDirectory()) {
        MessageBoxW(nullptr, L"Failed to load config/config.json", L"cpp-auth-client",
                    MB_OK | MB_ICONERROR);
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

    if (!createDevice()) {
        core::Logger::instance().error("Failed to create DirectX 11 device");
        return false;
    }

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.IniFilename = nullptr; // Do not persist ImGui state to disk.
    io.LogFilename = nullptr;

    ImGui_ImplWin32_Init(hwnd_);
    ImGui_ImplDX11_Init(device_, device_context_);
    imgui_initialized_ = true;

    ui::theme::apply();

    network::TlsConfig tls_config(config.app_name + "/" + config.version);
    if (!api_client_.initialize(config.api_base_url, tls_config)) {
        core::Logger::instance().error("Failed to initialize API client");
        return false;
    }

    auth_service_.wireApiClientHooks();

    ui_manager_ = std::make_unique<ui::UIManager>(auth_service_, config);
    (void)ui_manager_->loadFonts(core::Config::instance().appDirectory());

    core::Logger::instance().info("Application initialized");
    running_ = true;
    return true;
}

bool App::createWindow() {
    const wchar_t* class_name = L"CppAuthClientWindow";

    WNDCLASSEXW wc{};
    wc.cbSize = sizeof(wc);
    wc.style = CS_CLASSDC;
    wc.lpfnWndProc = App::wndProc;
    wc.hInstance = instance_;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.lpszClassName = class_name;
    RegisterClassExW(&wc);

    RECT rect{0, 0, kWindowWidth, kWindowHeight};
    AdjustWindowRect(&rect, WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX, FALSE);

    const int window_width = rect.right - rect.left;
    const int window_height = rect.bottom - rect.top;
    const int screen_width = GetSystemMetrics(SM_CXSCREEN);
    const int screen_height = GetSystemMetrics(SM_CYSCREEN);
    const int pos_x = (screen_width - window_width) / 2;
    const int pos_y = (screen_height - window_height) / 2;

    hwnd_ = CreateWindowExW(
        0, class_name, window_title_.c_str(),
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX, pos_x, pos_y, window_width,
        window_height, nullptr, nullptr, instance_, this);

    if (hwnd_ == nullptr) {
        return false;
    }

    BOOL use_dark_mode = TRUE;
    DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &use_dark_mode,
                          sizeof(use_dark_mode));

    ShowWindow(hwnd_, SW_SHOWDEFAULT);
    UpdateWindow(hwnd_);
    return true;
}

bool App::createDevice() {
    DXGI_SWAP_CHAIN_DESC swap_desc{};
    swap_desc.BufferCount = 2;
    swap_desc.BufferDesc.Width = kWindowWidth;
    swap_desc.BufferDesc.Height = kWindowHeight;
    swap_desc.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    swap_desc.BufferDesc.RefreshRate.Numerator = 60;
    swap_desc.BufferDesc.RefreshRate.Denominator = 1;
    swap_desc.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_MODE_SWITCH;
    swap_desc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    swap_desc.OutputWindow = hwnd_;
    swap_desc.SampleDesc.Count = 1;
    swap_desc.SampleDesc.Quality = 0;
    swap_desc.Windowed = TRUE;
    swap_desc.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;

    constexpr UINT create_device_flags = 0;
    D3D_FEATURE_LEVEL feature_level{};
    constexpr D3D_FEATURE_LEVEL feature_levels[] = {D3D_FEATURE_LEVEL_11_0};

    const HRESULT hr = D3D11CreateDeviceAndSwapChain(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, create_device_flags, feature_levels, 1,
        D3D11_SDK_VERSION, &swap_desc, &swap_chain_, &device_, &feature_level, &device_context_);

    if (FAILED(hr)) {
        return false;
    }

    createRenderTarget();
    return true;
}

void App::createRenderTarget() {
    ID3D11Texture2D* back_buffer = nullptr;
    swap_chain_->GetBuffer(0, IID_PPV_ARGS(&back_buffer));
    if (back_buffer != nullptr) {
        device_->CreateRenderTargetView(back_buffer, nullptr, &render_target_);
        back_buffer->Release();
    }
}

void App::cleanupRenderTarget() {
    if (render_target_ != nullptr) {
        render_target_->Release();
        render_target_ = nullptr;
    }
}

void App::cleanupDevice() {
    cleanupRenderTarget();
    if (swap_chain_ != nullptr) {
        swap_chain_->Release();
        swap_chain_ = nullptr;
    }
    if (device_context_ != nullptr) {
        device_context_->Release();
        device_context_ = nullptr;
    }
    if (device_ != nullptr) {
        device_->Release();
        device_ = nullptr;
    }
}

void App::renderFrame() {
    if (ui_manager_) {
        ui_manager_->update();
    }

    ImGui_ImplDX11_NewFrame();
    ImGui_ImplWin32_NewFrame();
    ImGui::NewFrame();

    if (ui_manager_) {
        ui_manager_->render();
    }

    ImGui::Render();

    const float clear_color[4] = {0.039f, 0.039f, 0.059f, 1.0f};
    device_context_->OMSetRenderTargets(1, &render_target_, nullptr);
    device_context_->ClearRenderTargetView(render_target_, clear_color);
    ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

    swap_chain_->Present(1, 0);
}

int App::run() {
    MSG msg{};
    while (running_) {
        while (PeekMessageW(&msg, nullptr, 0U, 0U, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
            if (msg.message == WM_QUIT) {
                running_ = false;
            }
        }

        if (!running_) {
            break;
        }

        if (device_context_ == nullptr) {
            break;
        }

        renderFrame();
    }

    return static_cast<int>(msg.wParam);
}

void App::shutdown() {
    running_ = false;

    // Wipe tokens from RAM before tearing down subsystems.
    auth::TokenStore::instance().clear();

    api_client_.shutdown();

    if (imgui_initialized_) {
        ImGui_ImplDX11_Shutdown();
        ImGui_ImplWin32_Shutdown();
        ImGui::DestroyContext();
        imgui_initialized_ = false;
    }

    cleanupDevice();

    if (hwnd_ != nullptr) {
        DestroyWindow(hwnd_);
        hwnd_ = nullptr;
    }

    ui_manager_.reset();
    core::Logger::instance().shutdown();
}

LRESULT CALLBACK App::wndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
    if (ImGui_ImplWin32_WndProcHandler(hwnd, msg, wparam, lparam) != 0) {
        return true;
    }

    App* app = nullptr;
    if (msg == WM_NCCREATE) {
        const auto* create_struct = reinterpret_cast<CREATESTRUCTW*>(lparam);
        app = static_cast<App*>(create_struct->lpCreateParams);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
    } else {
        app = reinterpret_cast<App*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    }

    switch (msg) {
    case WM_SIZE:
        if (app != nullptr && app->device_context_ != nullptr && wparam != SIZE_MINIMIZED) {
            app->cleanupRenderTarget();
            app->swap_chain_->ResizeBuffers(0, 0, 0, DXGI_FORMAT_UNKNOWN, 0);
            app->createRenderTarget();
        }
        return 0;

    case WM_GETMINMAXINFO: {
        auto* mmi = reinterpret_cast<MINMAXINFO*>(lparam);
        RECT rect{0, 0, kWindowWidth, kWindowHeight};
        AdjustWindowRect(&rect, WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX, FALSE);
        const int width = rect.right - rect.left;
        const int height = rect.bottom - rect.top;
        mmi->ptMinTrackSize.x = width;
        mmi->ptMinTrackSize.y = height;
        mmi->ptMaxTrackSize.x = width;
        mmi->ptMaxTrackSize.y = height;
        return 0;
    }

    case WM_SYSCOMMAND:
        if ((wparam & 0xfff0) == SC_KEYMENU) {
            return 0;
        }
        break;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;

    default:
        break;
    }

    return DefWindowProcW(hwnd, msg, wparam, lparam);
}

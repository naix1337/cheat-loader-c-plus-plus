#pragma once

#include "auth/AuthService.h"
#include "network/ApiClient.h"
#include "ui/UIManager.h"

#include <Windows.h>
#include <d3d11.h>
#include <dxgi.h>

#include <memory>
#include <string>

class App {
public:
    static constexpr int kWindowWidth = 480;
    static constexpr int kWindowHeight = 520;

    explicit App(HINSTANCE instance);
    ~App();

    App(const App&) = delete;
    App& operator=(const App&) = delete;

    [[nodiscard]] bool initialize();

    [[nodiscard]] int run();

    void shutdown();

private:
    [[nodiscard]] bool createWindow();
    [[nodiscard]] bool createDevice();
    void cleanupDevice();
    void createRenderTarget();
    void cleanupRenderTarget();

    void renderFrame();

    static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);

    HINSTANCE instance_ = nullptr;
    HWND hwnd_ = nullptr;
    std::wstring window_title_;

    ID3D11Device* device_ = nullptr;
    ID3D11DeviceContext* device_context_ = nullptr;
    IDXGISwapChain* swap_chain_ = nullptr;
    ID3D11RenderTargetView* render_target_ = nullptr;

    network::ApiClient api_client_;
    auth::AuthService auth_service_;
    std::unique_ptr<ui::UIManager> ui_manager_;

    bool imgui_initialized_ = false;
    bool running_ = false;
};

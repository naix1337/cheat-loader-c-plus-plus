#pragma once

#include "auth/AuthService.h"
#include "network/ApiClient.h"
#include "ui/WebViewManager.h"

#include <Windows.h>

#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

class App {
public:
    static constexpr int kWindowWidth = 520;
    static constexpr int kWindowHeight = 620;

    explicit App(HINSTANCE instance);
    ~App();

    App(const App&) = delete;
    App& operator=(const App&) = delete;

    [[nodiscard]] bool initialize();
    [[nodiscard]] int run();
    void shutdown();

private:
    [[nodiscard]] bool createWindow();

    void enqueueMainThread(std::function<void()> task);
    void processMainThreadQueue();

    static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam);

    HINSTANCE instance_ = nullptr;
    HWND hwnd_ = nullptr;
    std::wstring window_title_;

    network::ApiClient api_client_;
    auth::AuthService auth_service_;
    std::unique_ptr<ui::WebViewManager> ui_manager_;

    std::mutex queue_mutex_;
    std::vector<std::function<void()>> task_queue_;

    bool running_ = false;
};

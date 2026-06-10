#pragma once

#include "auth/AuthService.h"
#include "auth/SessionManager.h"
#include "core/Config.h"
#include "ui/components/Notification.h"
#include "ui/views/DashboardView.h"
#include "ui/views/LoginView.h"
#include "ui/views/TwoFAView.h"

#include <filesystem>
#include <functional>
#include <mutex>
#include <vector>

struct ImFont;

namespace ui {

class UIManager {
public:
    UIManager(auth::AuthService& auth_service, const core::AppConfig& config);

    [[nodiscard]] bool loadFonts(const std::filesystem::path& app_directory);

    void update();

    void render();

    void enqueueMainThread(std::function<void()> task);

private:
    void processMainThreadQueue();

    void onSessionStateChanged(auth::SessionState state);

    auth::AuthService& auth_service_;
    core::AppConfig config_;

    components::NotificationStack notifications_;
    views::LoginView login_view_;
    views::TwoFAView twofa_view_;
    views::DashboardView dashboard_view_;

    auth::SessionState current_state_ = auth::SessionState::LoggedOut;

    std::mutex queue_mutex_;
    std::vector<std::function<void()>> main_thread_queue_;

    ImFont* primary_font_ = nullptr;
};

} // namespace ui

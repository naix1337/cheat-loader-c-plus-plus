#pragma once

#include "auth/AuthService.h"
#include "auth/SessionManager.h"
#include "core/Config.h"
#include "models/User.h"

#include <functional>
#include <string>
#include <vector>

namespace ui::views {

struct LogLine {
    std::string time;
    std::string tag;
    std::string text;
    unsigned int color;
};

class DashboardView {
public:
    using MainThreadEnqueue = std::function<void(std::function<void()>)>;

    DashboardView(auth::AuthService& auth_service, const core::AppConfig& config,
                  MainThreadEnqueue enqueue);

    void setUser(const User& user);
    void render();

private:
    auth::AuthService& auth_service_;
    const core::AppConfig& config_;
    MainThreadEnqueue enqueue_;
    User user_;
    bool logging_out_ = false;

    // Loader state
    float boot_start_ = -1.0f;
    int log_next_ = 0;
    std::vector<LogLine> logs_;
    bool auto_scrolled_ = false;
    bool scroll_to_bottom_ = false;
};

} // namespace ui::views

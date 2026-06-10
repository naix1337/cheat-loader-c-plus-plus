#pragma once

#include "auth/AuthService.h"
#include "core/Config.h"

#include <functional>
#include <string>

namespace ui::views {

class LoginView {
public:
    using MainThreadEnqueue = std::function<void(std::function<void()>)>;

    LoginView(auth::AuthService& auth_service, const core::AppConfig& config,
              MainThreadEnqueue enqueue);

    void render();

    void reset();

    [[nodiscard]] bool isLoading() const noexcept { return loading_; }

private:
    void submitLogin();

    auth::AuthService& auth_service_;
    core::AppConfig config_;
    MainThreadEnqueue enqueue_;

    char username_[128]{};
    char password_[128]{};
    bool show_password_ = false;
    bool loading_ = false;
    std::string error_message_;
    float error_alpha_ = 0.0f;
};

} // namespace ui::views

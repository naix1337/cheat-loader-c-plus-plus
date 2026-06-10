#pragma once

#include "auth/AuthService.h"
#include "auth/SessionManager.h"
#include "models/User.h"

#include <functional>
#include <string>

namespace ui::views {

class DashboardView {
public:
    using MainThreadEnqueue = std::function<void(std::function<void()>)>;

    DashboardView(auth::AuthService& auth_service, MainThreadEnqueue enqueue);

    void setUser(const User& user);

    void render();

private:
    auth::AuthService& auth_service_;
    MainThreadEnqueue enqueue_;
    User user_;
    bool logging_out_ = false;
};

} // namespace ui::views

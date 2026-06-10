#pragma once

#include "auth/AuthService.h"

#include <functional>
#include <string>

namespace ui::views {

class TwoFAView {
public:
    using MainThreadEnqueue = std::function<void(std::function<void()>)>;

    TwoFAView(auth::AuthService& auth_service, MainThreadEnqueue enqueue);

    void render();

    void reset();

private:
    void submitOtp();
    [[nodiscard]] int totpSecondsRemaining() const;

    auth::AuthService& auth_service_;
    MainThreadEnqueue enqueue_;

    char otp_[8]{};
    bool loading_ = false;
    std::string error_message_;
};

} // namespace ui::views

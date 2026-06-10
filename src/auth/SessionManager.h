#pragma once

#include "models/User.h"

#include <chrono>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace auth {

enum class SessionState { LoggedOut, Awaiting2FA, LoggedIn };

using SessionStateCallback = std::function<void(SessionState state)>;

class SessionManager {
public:
    static SessionManager& instance();

    static constexpr std::chrono::minutes kInactivityTimeout{30};

    void setLogoutHandler(std::function<void()> handler);

    void registerObserver(SessionStateCallback callback);

    void unregisterAllObservers();

    [[nodiscard]] SessionState state() const;

    [[nodiscard]] std::optional<User> currentUser() const;

    [[nodiscard]] std::chrono::seconds inactivityRemaining() const;

    void setAwaiting2FA(const User& user);

    void setLoggedIn(const User& user);

    void setLoggedOut();

    void recordActivity();

    // Call each frame/tick to enforce inactivity logout.
    void update();

    SessionManager(const SessionManager&) = delete;
    SessionManager& operator=(const SessionManager&) = delete;

private:
    SessionManager() = default;

    void notifyObservers(SessionState state);

    mutable std::mutex mutex_;
    SessionState state_ = SessionState::LoggedOut;
    std::optional<User> user_;
    std::chrono::steady_clock::time_point last_activity_ = std::chrono::steady_clock::now();
    std::vector<SessionStateCallback> observers_;
    std::function<void()> logout_handler_;
};

} // namespace auth

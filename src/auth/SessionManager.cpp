#include "auth/SessionManager.h"

#include "core/Logger.h"

namespace auth {

SessionManager& SessionManager::instance() {
    static SessionManager manager;
    return manager;
}

void SessionManager::setLogoutHandler(std::function<void()> handler) {
    std::lock_guard lock(mutex_);
    logout_handler_ = std::move(handler);
}

void SessionManager::registerObserver(SessionStateCallback callback) {
    std::lock_guard lock(mutex_);
    observers_.push_back(std::move(callback));
}

void SessionManager::unregisterAllObservers() {
    std::lock_guard lock(mutex_);
    observers_.clear();
}

SessionState SessionManager::state() const {
    std::lock_guard lock(mutex_);
    return state_;
}

std::optional<User> SessionManager::currentUser() const {
    std::lock_guard lock(mutex_);
    return user_;
}

std::chrono::seconds SessionManager::inactivityRemaining() const {
    std::lock_guard lock(mutex_);
    if (state_ != SessionState::LoggedIn) {
        return std::chrono::seconds{0};
    }

    const auto elapsed = std::chrono::steady_clock::now() - last_activity_;
    const auto remaining = kInactivityTimeout - elapsed;
    if (remaining.count() <= 0) {
        return std::chrono::seconds{0};
    }
    return std::chrono::duration_cast<std::chrono::seconds>(remaining);
}

void SessionManager::setAwaiting2FA(const User& user) {
    {
        std::lock_guard lock(mutex_);
        state_ = SessionState::Awaiting2FA;
        user_ = user;
    }
    notifyObservers(SessionState::Awaiting2FA);
}

void SessionManager::setLoggedIn(const User& user) {
    {
        std::lock_guard lock(mutex_);
        state_ = SessionState::LoggedIn;
        user_ = user;
        last_activity_ = std::chrono::steady_clock::now();
    }
    notifyObservers(SessionState::LoggedIn);
}

void SessionManager::setLoggedOut() {
    {
        std::lock_guard lock(mutex_);
        state_ = SessionState::LoggedOut;
        user_.reset();
    }
    notifyObservers(SessionState::LoggedOut);
}

void SessionManager::recordActivity() {
    std::lock_guard lock(mutex_);
    if (state_ == SessionState::LoggedIn) {
        last_activity_ = std::chrono::steady_clock::now();
    }
}

void SessionManager::update() {
    std::function<void()> logout_handler;
    std::optional<std::string> username;

    {
        std::lock_guard lock(mutex_);
        if (state_ != SessionState::LoggedIn) {
            return;
        }

        const auto elapsed = std::chrono::steady_clock::now() - last_activity_;
        if (elapsed < kInactivityTimeout) {
            return;
        }

        if (user_.has_value()) {
            username = user_->username;
        }
        state_ = SessionState::LoggedOut;
        user_.reset();
        logout_handler = logout_handler_;
    }

    if (username.has_value()) {
        core::Logger::instance().logSessionTimeout(*username);
    }

    notifyObservers(SessionState::LoggedOut);

    if (logout_handler) {
        logout_handler();
    }
}

void SessionManager::notifyObservers(SessionState state) {
    std::vector<SessionStateCallback> observers_copy;
    {
        std::lock_guard lock(mutex_);
        observers_copy = observers_;
    }

    for (const auto& observer : observers_copy) {
        if (observer) {
            observer(state);
        }
    }
}

} // namespace auth

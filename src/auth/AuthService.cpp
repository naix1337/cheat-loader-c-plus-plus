#include "auth/AuthService.h"

#include "auth/SessionManager.h"
#include "auth/TokenStore.h"
#include "core/Logger.h"
#include "core/SecureMemory.h"
#include "network/ApiClient.h"
#include "util/JsonHelpers.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <mutex>

namespace auth {
namespace {

[[nodiscard]] int64_t currentUnixTime() {
    return std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

[[nodiscard]] std::string buildLoginPayload(const std::string& username,
                                            const std::string& password,
                                            const std::string& otp_code) {
    nlohmann::json payload;
    payload["username"] = username;
    payload["password"] = password;
    if (!otp_code.empty()) {
        payload["otp"] = otp_code;
    }
    return payload.dump();
}

} // namespace

AuthService::AuthService(network::ApiClient& api_client) : api_client_(api_client) {}

void AuthService::wireApiClientHooks() {
    network::AuthHooks hooks;
    hooks.get_access_token = []() { return TokenStore::instance().getAccessToken(); };
    hooks.refresh_access_token = [this]() { return refreshSession(); };
    hooks.force_logout = [this]() { logoutLocal(); };
    api_client_.setAuthHooks(std::move(hooks));

    SessionManager::instance().setLogoutHandler([this]() { logoutLocal(); });
}

void AuthService::storePendingCredentials(const std::string& username,
                                          const std::string& password) {
    std::lock_guard lock(pending_mutex_);
    pending_username_.assign(username);
    pending_password_.assign(password);
}

void AuthService::clearPendingCredentials() {
    std::lock_guard lock(pending_mutex_);
    pending_username_.clear();
    pending_password_.clear();
}

bool AuthService::hasPendingTwoFA() const {
    std::lock_guard lock(pending_mutex_);
    return !pending_username_.empty();
}

int64_t AuthService::computeExpiration(int expires_in_seconds) {
    if (expires_in_seconds <= 0) {
        expires_in_seconds = 900;
    }
    return currentUnixTime() + expires_in_seconds;
}

void AuthService::handleLoginResponse(const std::string& username, RawApiResponse response,
                                      LoginCallback callback) {
    LoginResult result{};

    if (!response.success) {
        result.error_message = response.error_message.empty() ? "Login failed" : response.error_message;
        core::Logger::instance().logLoginFailure(username, result.error_message);
        if (callback) {
            callback(std::move(result));
        }
        return;
    }

    try {
        const auto json = nlohmann::json::parse(response.body);

        const bool requires_2fa =
            json.contains("requires_2fa") && json["requires_2fa"].get<bool>();

        if (requires_2fa) {
            User partial_user{};
            if (json.contains("user")) {
                const auto parsed = util::parseUser(json["user"]);
                if (parsed.has_value()) {
                    partial_user = *parsed;
                }
            }
            if (partial_user.username.empty()) {
                partial_user.username = username;
            }

            result.requires_2fa = true;
            result.success = false;
            result.user = partial_user;
            SessionManager::instance().setAwaiting2FA(partial_user);
            core::Logger::instance().logTwoFaRequired(username);
            if (callback) {
                callback(std::move(result));
            }
            return;
        }

        if (!json.contains("access_token") || !json.contains("refresh_token")) {
            result.error_message = "Malformed login response";
            core::Logger::instance().logLoginFailure(username, result.error_message);
            if (callback) {
                callback(std::move(result));
            }
            return;
        }

        const int expires_in =
            json.contains("expires_in") ? json["expires_in"].get<int>() : 900;

        AuthTokens tokens;
        tokens.access_token.assign(json["access_token"].get<std::string>());
        tokens.refresh_token.assign(json["refresh_token"].get<std::string>());
        tokens.access_token_expires_at = computeExpiration(expires_in);
        TokenStore::instance().setTokens(tokens);

        std::optional<User> user;
        if (json.contains("user")) {
            user = util::parseUser(json["user"]);
        }
        if (!user.has_value()) {
            user = User{};
            user->username = username;
        }

        clearPendingCredentials();
        SessionManager::instance().setLoggedIn(*user);

        result.success = true;
        result.user = *user;
        core::Logger::instance().logLoginSuccess(username);
        if (callback) {
            callback(std::move(result));
        }
    } catch (const nlohmann::json::exception&) {
        result.error_message = "Failed to parse login response";
        core::Logger::instance().logLoginFailure(username, result.error_message);
        if (callback) {
            callback(std::move(result));
        }
    }
}

void AuthService::login(const std::string& username, const std::string& password,
                        const std::string& otp_code, LoginCallback callback) {
    core::Logger::instance().logLoginAttempt(username);

    if (otp_code.empty()) {
        storePendingCredentials(username, password);
    }

    // SecureString is wiped automatically when it goes out of scope.
    core::SecureString secure_password(password);
    const std::string payload = buildLoginPayload(username, secure_password.view(), otp_code);

    api_client_.post(
        "/api/auth/login", payload,
        [this, username, callback](RawApiResponse response) {
            handleLoginResponse(username, std::move(response), std::move(callback));
        },
        false);
}

void AuthService::verifyTwoFA(const std::string& otp_code, LoginCallback callback) {
    std::string username;
    core::SecureString password;

    {
        std::lock_guard lock(pending_mutex_);
        if (pending_username_.empty() || pending_password_.empty()) {
            LoginResult result{};
            result.error_message = "No pending login session";
            if (callback) {
                callback(std::move(result));
            }
            return;
        }
        username = pending_username_.view();
        password = pending_password_;
    }

    const std::string payload = buildLoginPayload(username, password.view(), otp_code);

    api_client_.post(
        "/api/auth/login", payload,
        [this, username, callback](RawApiResponse response) {
            if (!response.success) {
                core::Logger::instance().logTwoFaFailure(username);
            }
            handleLoginResponse(username, std::move(response), std::move(callback));
        },
        false);
}

bool AuthService::refreshSession() { return refreshSessionInternal(); }

bool AuthService::refreshSessionInternal() {
    const auto refresh_token = TokenStore::instance().getRefreshToken();
    if (!refresh_token.has_value()) {
        return false;
    }

    nlohmann::json payload;
    payload["refresh_token"] = *refresh_token;

    const RawApiResponse response =
        api_client_.postSync("/api/auth/refresh", payload.dump(), false);

    if (!response.success) {
        return false;
    }

    try {
        const auto json = nlohmann::json::parse(response.body);
        if (!json.contains("access_token") || !json.contains("refresh_token")) {
            return false;
        }

        const int expires_in =
            json.contains("expires_in") ? json["expires_in"].get<int>() : 900;

        AuthTokens tokens;
        tokens.access_token.assign(json["access_token"].get<std::string>());
        tokens.refresh_token.assign(json["refresh_token"].get<std::string>());
        tokens.access_token_expires_at = computeExpiration(expires_in);
        TokenStore::instance().setTokens(tokens);
        return true;
    } catch (const nlohmann::json::exception&) {
        return false;
    }
}

void AuthService::logout(VoidResultCallback callback) {
    const auto refresh_token = TokenStore::instance().getRefreshToken();
    const auto user = SessionManager::instance().currentUser();

    if (!refresh_token.has_value()) {
        logoutLocal();
        if (callback) {
            callback(true, {});
        }
        return;
    }

    nlohmann::json payload;
    payload["refresh_token"] = *refresh_token;

    api_client_.post(
        "/api/auth/logout", payload.dump(),
        [this, user, callback](RawApiResponse response) {
            logoutLocal();
            if (user.has_value()) {
                core::Logger::instance().logLogout(user->username);
            }
            if (callback) {
                const bool success = response.success || response.status_code == 401;
                callback(success, response.error_message);
            }
        },
        false);
}

void AuthService::logoutLocal() {
    TokenStore::instance().clear();
    clearPendingCredentials();
    SessionManager::instance().setLoggedOut();
}

} // namespace auth

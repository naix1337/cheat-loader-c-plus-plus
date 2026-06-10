#pragma once

#include "core/SecureMemory.h"
#include "models/ApiResponse.h"
#include "models/User.h"

#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>

namespace network {
class ApiClient;
}

namespace auth {

struct LoginResult {
    bool success = false;
    bool requires_2fa = false;
    std::string error_message;
    std::optional<User> user;
};

using LoginCallback = std::function<void(LoginResult result)>;
using VoidResultCallback = std::function<void(bool success, std::string error_message)>;

class AuthService {
public:
    explicit AuthService(network::ApiClient& api_client);

    void wireApiClientHooks();

    void login(const std::string& username, const std::string& password,
               const std::string& otp_code, LoginCallback callback);

    void verifyTwoFA(const std::string& otp_code, LoginCallback callback);

    // Synchronous refresh used by ApiClient 401-retry logic (runs on worker thread).
    [[nodiscard]] bool refreshSession();

    void logout(VoidResultCallback callback = nullptr);

    void logoutLocal();

    [[nodiscard]] bool hasPendingTwoFA() const;

    AuthService(const AuthService&) = delete;
    AuthService& operator=(const AuthService&) = delete;

private:
    [[nodiscard]] bool refreshSessionInternal();

    void handleLoginResponse(const std::string& username, RawApiResponse response,
                             LoginCallback callback);

    [[nodiscard]] static int64_t computeExpiration(int expires_in_seconds);

    void clearPendingCredentials();

    void storePendingCredentials(const std::string& username, const std::string& password);

    network::ApiClient& api_client_;
    core::SecureString pending_username_;
    core::SecureString pending_password_;
    mutable std::mutex pending_mutex_;
};

} // namespace auth

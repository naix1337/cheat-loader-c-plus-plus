#pragma once

#include "core/SecureMemory.h"
#include "models/AuthTokens.h"

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>

namespace auth {

// Holds access and refresh tokens exclusively in process memory (RAM).
// Never persist tokens to disk, registry, or the Windows Credential Manager —
// volatile RAM prevents theft via filesystem or offline credential-store access.
class TokenStore {
public:
    static TokenStore& instance();

    void setAccessToken(core::SecureString token, int64_t expires_at_unix);

    void setRefreshToken(core::SecureString token);

    void setTokens(const AuthTokens& tokens);

    [[nodiscard]] std::optional<std::string> getAccessToken() const;

    [[nodiscard]] std::optional<std::string> getRefreshToken() const;

    [[nodiscard]] int64_t accessTokenExpiresAt() const;

    [[nodiscard]] bool hasAccessToken() const;

    [[nodiscard]] bool hasRefreshToken() const;

    // Parses JWT payload (Base64url + JSON) to check the exp claim without a JWT library.
    [[nodiscard]] bool isAccessTokenExpired(int64_t skew_seconds = 30) const;

    void clear();

    TokenStore(const TokenStore&) = delete;
    TokenStore& operator=(const TokenStore&) = delete;

private:
    TokenStore() = default;

    mutable std::mutex mutex_;
    core::SecureString access_token_;
    core::SecureString refresh_token_;
    int64_t access_token_expires_at_ = 0;
};

} // namespace auth

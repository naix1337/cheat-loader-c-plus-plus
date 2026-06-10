#include "auth/TokenStore.h"

#include "util/Base64.h"

#include <chrono>
#include <nlohmann/json.hpp>

namespace auth {
namespace {

[[nodiscard]] int64_t currentUnixTime() {
    return std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}

[[nodiscard]] std::optional<int64_t> extractJwtExpiration(std::string_view jwt) {
    const auto first_dot = jwt.find('.');
    if (first_dot == std::string_view::npos) {
        return std::nullopt;
    }
    const auto second_dot = jwt.find('.', first_dot + 1);
    if (second_dot == std::string_view::npos) {
        return std::nullopt;
    }

    const auto payload_segment = jwt.substr(first_dot + 1, second_dot - first_dot - 1);
    const auto payload_json = util::decodeBase64UrlToString(payload_segment);
    if (!payload_json.has_value()) {
        return std::nullopt;
    }

    try {
        const auto json = nlohmann::json::parse(*payload_json);
        if (!json.contains("exp")) {
            return std::nullopt;
        }
        if (json["exp"].is_number_integer()) {
            return json["exp"].get<int64_t>();
        }
        if (json["exp"].is_number_unsigned()) {
            return static_cast<int64_t>(json["exp"].get<std::uint64_t>());
        }
    } catch (const nlohmann::json::exception&) {
        return std::nullopt;
    }

    return std::nullopt;
}

} // namespace

TokenStore& TokenStore::instance() {
    static TokenStore store;
    return store;
}

void TokenStore::setAccessToken(core::SecureString token, int64_t expires_at_unix) {
    std::lock_guard lock(mutex_);
    access_token_ = std::move(token);
    access_token_expires_at_ = expires_at_unix;
}

void TokenStore::setRefreshToken(core::SecureString token) {
    std::lock_guard lock(mutex_);
    refresh_token_ = std::move(token);
}

void TokenStore::setTokens(const AuthTokens& tokens) {
    std::lock_guard lock(mutex_);
    access_token_ = tokens.access_token;
    refresh_token_ = tokens.refresh_token;
    access_token_expires_at_ = tokens.access_token_expires_at;
}

std::optional<std::string> TokenStore::getAccessToken() const {
    std::lock_guard lock(mutex_);
    if (access_token_.empty()) {
        return std::nullopt;
    }
    return access_token_.view();
}

std::optional<std::string> TokenStore::getRefreshToken() const {
    std::lock_guard lock(mutex_);
    if (refresh_token_.empty()) {
        return std::nullopt;
    }
    return refresh_token_.view();
}

int64_t TokenStore::accessTokenExpiresAt() const {
    std::lock_guard lock(mutex_);
    return access_token_expires_at_;
}

bool TokenStore::hasAccessToken() const {
    std::lock_guard lock(mutex_);
    return !access_token_.empty();
}

bool TokenStore::hasRefreshToken() const {
    std::lock_guard lock(mutex_);
    return !refresh_token_.empty();
}

bool TokenStore::isAccessTokenExpired(int64_t skew_seconds) const {
    std::lock_guard lock(mutex_);
    if (access_token_.empty()) {
        return true;
    }

    int64_t expires_at = access_token_expires_at_;
    if (expires_at <= 0) {
        const auto parsed = extractJwtExpiration(access_token_.view());
        if (!parsed.has_value()) {
            return true;
        }
        expires_at = *parsed;
    }

    return currentUnixTime() + skew_seconds >= expires_at;
}

void TokenStore::clear() {
    std::lock_guard lock(mutex_);
    access_token_.clear();
    refresh_token_.clear();
    access_token_expires_at_ = 0;
}

} // namespace auth

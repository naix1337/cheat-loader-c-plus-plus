#pragma once

#include "models/ApiResponse.h"

#include <functional>
#include <optional>
#include <string>

namespace network {

enum class HttpMethod { Get, Post, Put, Delete };

using ResponseCallback = std::function<void(RawApiResponse)>;

// Injected by App — wired to TokenStore / AuthService / SessionManager (step 6).
struct AuthHooks {
    std::function<std::optional<std::string>()> get_access_token;
    std::function<bool()> refresh_access_token;
    std::function<void()> force_logout;
};

} // namespace network

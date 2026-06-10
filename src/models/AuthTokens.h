#pragma once

#include "core/SecureMemory.h"

#include <cstdint>

struct AuthTokens {
    core::SecureString access_token;
    core::SecureString refresh_token;
    int64_t access_token_expires_at = 0; // Unix timestamp (seconds)
};

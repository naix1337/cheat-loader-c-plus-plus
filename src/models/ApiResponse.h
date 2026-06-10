#pragma once

#include <optional>
#include <string>

template <typename T>
struct ApiResponse {
    bool success = false;
    int status_code = 0;
    std::string error_message;
    std::optional<T> data;
};

struct RawApiResponse {
    bool success = false;
    int status_code = 0;
    std::string error_message;
    std::string body;
    int retry_after_seconds = 0;
};

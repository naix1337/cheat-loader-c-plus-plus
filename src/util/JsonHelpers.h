#pragma once

#include "models/User.h"

#include <nlohmann/json.hpp>
#include <optional>
#include <string>

namespace util {

[[nodiscard]] inline std::optional<User> parseUser(const nlohmann::json& json) {
    if (!json.is_object()) {
        return std::nullopt;
    }

    User user;
    if (json.contains("id") && json["id"].is_string()) {
        user.id = json["id"].get<std::string>();
    }
    if (json.contains("username") && json["username"].is_string()) {
        user.username = json["username"].get<std::string>();
    }
    if (json.contains("email") && json["email"].is_string()) {
        user.email = json["email"].get<std::string>();
    }
    if (json.contains("two_fa_enabled") && json["two_fa_enabled"].is_boolean()) {
        user.two_fa_enabled = json["two_fa_enabled"].get<bool>();
    }
    if (json.contains("created_at") && json["created_at"].is_string()) {
        user.created_at = json["created_at"].get<std::string>();
    }

    if (user.username.empty()) {
        return std::nullopt;
    }
    return user;
}

[[nodiscard]] inline std::string readJsonString(const nlohmann::json& json,
                                                const char* key) {
    if (json.contains(key) && json[key].is_string()) {
        return json[key].get<std::string>();
    }
    return {};
}

} // namespace util

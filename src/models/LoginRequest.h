#pragma once

#include <nlohmann/json.hpp>
#include <string>

struct LoginRequest {
    std::string username;
    std::string password;
    std::string otp;

    [[nodiscard]] std::string toJson() const {
        nlohmann::json json;
        json["username"] = username;
        json["password"] = password;
        if (!otp.empty()) {
            json["otp"] = otp;
        }
        return json.dump();
    }
};

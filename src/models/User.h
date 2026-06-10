#pragma once

#include <string>

struct User {
    std::string id;
    std::string username;
    std::string email;
    bool two_fa_enabled = false;
    std::string created_at;
};

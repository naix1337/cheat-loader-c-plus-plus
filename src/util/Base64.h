#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace util {

// Decodes a Base64url-encoded string (JWT payload segment).
[[nodiscard]] inline std::optional<std::vector<std::uint8_t>> decodeBase64Url(std::string_view input) {
    std::string normalized(input);
    for (char& ch : normalized) {
        if (ch == '-') {
            ch = '+';
        } else if (ch == '_') {
            ch = '/';
        }
    }

    while (normalized.size() % 4 != 0) {
        normalized.push_back('=');
    }

    static constexpr char kAlphabet[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    auto charValue = [](char ch) -> int {
        if (ch >= 'A' && ch <= 'Z') {
            return ch - 'A';
        }
        if (ch >= 'a' && ch <= 'z') {
            return ch - 'a' + 26;
        }
        if (ch >= '0' && ch <= '9') {
            return ch - '0' + 52;
        }
        if (ch == '+') {
            return 62;
        }
        if (ch == '/') {
            return 63;
        }
        return -1;
    };

    std::vector<std::uint8_t> output;
    output.reserve(normalized.size() * 3 / 4);

    int val = 0;
    int valb = -8;
    for (char ch : normalized) {
        if (ch == '=') {
            break;
        }
        const int decoded = charValue(ch);
        if (decoded < 0) {
            return std::nullopt;
        }
        val = (val << 6) + decoded;
        valb += 6;
        if (valb >= 0) {
            output.push_back(static_cast<std::uint8_t>((val >> valb) & 0xFF));
            valb -= 8;
        }
    }

    return output;
}

[[nodiscard]] inline std::optional<std::string> decodeBase64UrlToString(std::string_view input) {
    const auto bytes = decodeBase64Url(input);
    if (!bytes.has_value()) {
        return std::nullopt;
    }
    return std::string(bytes->begin(), bytes->end());
}

} // namespace util

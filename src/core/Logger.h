#pragma once

#include <filesystem>
#include <memory>
#include <string>
#include <string_view>

#include <spdlog/common.h>

namespace spdlog {
class logger;
}

namespace core {

// Centralised logging. Never pass passwords, tokens, or other secrets to log calls.
class Logger {
public:
    static Logger& instance();

    bool initialize(const std::string& log_level, const std::filesystem::path& log_directory);

    void shutdown() noexcept;

    [[nodiscard]] bool isInitialized() const noexcept { return initialized_; }

    void trace(std::string_view message);
    void debug(std::string_view message);
    void info(std::string_view message);
    void warn(std::string_view message);
    void error(std::string_view message);

    // Security-relevant events (always logged at info/warn/error as appropriate).
    void logLoginAttempt(std::string_view username);
    void logLoginSuccess(std::string_view username);
    void logLoginFailure(std::string_view username, std::string_view reason);
    void logTokenRefresh(bool success, std::string_view reason = {});
    void logLogout(std::string_view username);
    void logSessionTimeout(std::string_view username);
    void logTwoFaRequired(std::string_view username);
    void logTwoFaFailure(std::string_view username);
    void logRateLimited(std::string_view context, int retry_after_seconds);

    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;
    Logger(Logger&&) = delete;
    Logger& operator=(Logger&&) = delete;

private:
    Logger() = default;

    [[nodiscard]] static std::filesystem::path resolveAppDirectory();
    void log(spdlog::level::level_enum level, std::string_view message);

    std::shared_ptr<spdlog::logger> logger_;
    bool initialized_ = false;
};

} // namespace core

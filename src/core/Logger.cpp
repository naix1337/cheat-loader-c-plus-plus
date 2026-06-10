#include "core/Logger.h"

#include <Windows.h>

#include <filesystem>
#include <vector>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/sinks/rotating_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/spdlog.h>

namespace core {
namespace {

[[nodiscard]] spdlog::level::level_enum parseLogLevel(std::string_view level) {
    if (level == "trace") {
        return spdlog::level::trace;
    }
    if (level == "debug") {
        return spdlog::level::debug;
    }
    if (level == "warn" || level == "warning") {
        return spdlog::level::warn;
    }
    if (level == "error") {
        return spdlog::level::err;
    }
    if (level == "critical") {
        return spdlog::level::critical;
    }
    if (level == "off") {
        return spdlog::level::off;
    }
    return spdlog::level::info;
}

[[nodiscard]] std::string sanitizeIdentifier(std::string_view value) {
    std::string sanitized(value);
    for (char& ch : sanitized) {
        if (ch == '\n' || ch == '\r' || ch == '\t') {
            ch = ' ';
        }
    }
    return sanitized;
}

} // namespace

Logger& Logger::instance() {
    static Logger instance;
    return instance;
}

std::filesystem::path Logger::resolveAppDirectory() {
    wchar_t buffer[MAX_PATH]{};
    const DWORD length = ::GetModuleFileNameW(nullptr, buffer, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) {
        return std::filesystem::current_path();
    }
    return std::filesystem::path(buffer).parent_path();
}

bool Logger::initialize(const std::string& log_level,
                        const std::filesystem::path& log_directory) {
    if (initialized_) {
        return true;
    }

    try {
        std::filesystem::path logs_dir = log_directory;
        if (logs_dir.empty()) {
            logs_dir = resolveAppDirectory() / "logs";
        }
        std::filesystem::create_directories(logs_dir);

        const auto level = parseLogLevel(log_level);
        std::vector<spdlog::sink_ptr> sinks;

#if defined(DEBUG_BUILD)
        auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
        console_sink->set_level(level);
        console_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] %v");
        sinks.push_back(console_sink);
#endif

        const auto log_file = logs_dir / "client.log";
        auto file_sink = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
            log_file.string(), 5 * 1024 * 1024, 3);
        file_sink->set_level(level);
        file_sink->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%l] [%t] %v");
        sinks.push_back(file_sink);

        logger_ = std::make_shared<spdlog::logger>("client", sinks.begin(), sinks.end());
        logger_->set_level(level);
        logger_->flush_on(spdlog::level::warn);

        spdlog::register_logger(logger_);
        initialized_ = true;
        logger_->info("Logger initialized (level={})", log_level);
        return true;
    } catch (const spdlog::spdlog_ex& ex) {
        initialized_ = false;
        logger_.reset();
        return false;
    }
}

void Logger::shutdown() noexcept {
    if (!initialized_) {
        return;
    }

    try {
        if (logger_) {
            logger_->info("Logger shutting down");
            logger_->flush();
        }
        spdlog::drop("client");
    } catch (...) {
        // shutdown must not throw
    }

    logger_.reset();
    initialized_ = false;
}

void Logger::log(spdlog::level::level_enum level, std::string_view message) {
    if (!initialized_ || !logger_) {
        return;
    }
    logger_->log(level, "{}", message);
}

void Logger::trace(std::string_view message) { log(spdlog::level::trace, message); }

void Logger::debug(std::string_view message) { log(spdlog::level::debug, message); }

void Logger::info(std::string_view message) { log(spdlog::level::info, message); }

void Logger::warn(std::string_view message) { log(spdlog::level::warn, message); }

void Logger::error(std::string_view message) { log(spdlog::level::err, message); }

void Logger::logLoginAttempt(std::string_view username) {
    info("[SECURITY] Login attempt for user '" + sanitizeIdentifier(username) + "'");
}

void Logger::logLoginSuccess(std::string_view username) {
    info("[SECURITY] Login successful for user '" + sanitizeIdentifier(username) + "'");
}

void Logger::logLoginFailure(std::string_view username, std::string_view reason) {
    warn("[SECURITY] Login failed for user '" + sanitizeIdentifier(username) + "': " +
         sanitizeIdentifier(reason));
}

void Logger::logTokenRefresh(bool success, std::string_view reason) {
    if (success) {
        info("[SECURITY] Access token refreshed successfully");
        return;
    }
    warn("[SECURITY] Token refresh failed: " + sanitizeIdentifier(reason));
}

void Logger::logLogout(std::string_view username) {
    info("[SECURITY] User logged out: '" + sanitizeIdentifier(username) + "'");
}

void Logger::logSessionTimeout(std::string_view username) {
    warn("[SECURITY] Session timed out due to inactivity: '" + sanitizeIdentifier(username) + "'");
}

void Logger::logTwoFaRequired(std::string_view username) {
    info("[SECURITY] 2FA verification required for user '" + sanitizeIdentifier(username) + "'");
}

void Logger::logTwoFaFailure(std::string_view username) {
    warn("[SECURITY] 2FA verification failed for user '" + sanitizeIdentifier(username) + "'");
}

void Logger::logRateLimited(std::string_view context, int retry_after_seconds) {
    warn("[SECURITY] Rate limited (" + sanitizeIdentifier(context) + "), retry after " +
         std::to_string(retry_after_seconds) + " seconds");
}

} // namespace core

#pragma once

#include <filesystem>
#include <optional>
#include <string>

namespace core {

struct AppConfig {
    std::string api_base_url;
    std::string app_name;
    std::string version;
    std::string log_level;
    std::string registration_url;
};

// Singleton that loads non-sensitive settings from config/config.json.
// Secrets (API keys, tokens) must never be stored in this file.
class Config {
public:
    static Config& instance();

    [[nodiscard]] bool load(const std::filesystem::path& config_path);
    [[nodiscard]] bool loadFromAppDirectory();

    [[nodiscard]] const AppConfig& get() const noexcept { return config_; }

    [[nodiscard]] const std::string& apiBaseUrl() const noexcept {
        return config_.api_base_url;
    }

    [[nodiscard]] const std::string& appName() const noexcept {
        return config_.app_name;
    }

    [[nodiscard]] const std::string& version() const noexcept { return config_.version; }

    [[nodiscard]] const std::string& logLevel() const noexcept { return config_.log_level; }

    [[nodiscard]] const std::string& registrationUrl() const noexcept {
        return config_.registration_url;
    }

    [[nodiscard]] std::filesystem::path appDirectory() const noexcept {
        return app_directory_;
    }

    [[nodiscard]] std::filesystem::path configPath() const noexcept { return config_path_; }

    [[nodiscard]] bool isLoaded() const noexcept { return loaded_; }

    [[nodiscard]] const std::string& lastError() const noexcept { return last_error_; }

    Config(const Config&) = delete;
    Config& operator=(const Config&) = delete;
    Config(Config&&) = delete;
    Config& operator=(Config&&) = delete;

private:
    Config() = default;

    [[nodiscard]] static std::filesystem::path resolveAppDirectory();
    [[nodiscard]] static std::optional<std::string> readFile(const std::filesystem::path& path);

    AppConfig config_{};
    std::filesystem::path app_directory_;
    std::filesystem::path config_path_;
    std::string last_error_;
    bool loaded_ = false;
};

} // namespace core

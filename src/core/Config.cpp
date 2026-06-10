#include "core/Config.h"

#include <Windows.h>

#include <fstream>
#include <nlohmann/json.hpp>
#include <sstream>

namespace core {
namespace {

[[nodiscard]] std::string trimTrailingSlashes(std::string value) {
    while (!value.empty() && value.back() == '/') {
        value.pop_back();
    }
    return value;
}

[[nodiscard]] bool parseConfigJson(const std::string& json_text, AppConfig& out,
                                   std::string& error) {
    try {
        const auto json = nlohmann::json::parse(json_text);

        if (!json.contains("api_base_url") || !json["api_base_url"].is_string()) {
            error = "Missing or invalid field: api_base_url";
            return false;
        }
        if (!json.contains("app_name") || !json["app_name"].is_string()) {
            error = "Missing or invalid field: app_name";
            return false;
        }
        if (!json.contains("version") || !json["version"].is_string()) {
            error = "Missing or invalid field: version";
            return false;
        }
        if (!json.contains("log_level") || !json["log_level"].is_string()) {
            error = "Missing or invalid field: log_level";
            return false;
        }

        out.api_base_url = trimTrailingSlashes(json["api_base_url"].get<std::string>());
        out.app_name = json["app_name"].get<std::string>();
        out.version = json["version"].get<std::string>();
        out.log_level = json["log_level"].get<std::string>();

        if (json.contains("registration_url") && json["registration_url"].is_string()) {
            out.registration_url = json["registration_url"].get<std::string>();
        } else {
            out.registration_url.clear();
        }

        if (out.api_base_url.empty()) {
            error = "api_base_url must not be empty";
            return false;
        }
        if (out.app_name.empty()) {
            error = "app_name must not be empty";
            return false;
        }

        return true;
    } catch (const nlohmann::json::exception& ex) {
        error = std::string("JSON parse error: ") + ex.what();
        return false;
    }
}

} // namespace

Config& Config::instance() {
    static Config instance;
    return instance;
}

std::filesystem::path Config::resolveAppDirectory() {
    wchar_t buffer[MAX_PATH]{};
    const DWORD length = ::GetModuleFileNameW(nullptr, buffer, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) {
        return std::filesystem::current_path();
    }
    return std::filesystem::path(buffer).parent_path();
}

std::optional<std::string> Config::readFile(const std::filesystem::path& path) {
    std::ifstream stream(path, std::ios::binary);
    if (!stream) {
        return std::nullopt;
    }

    std::ostringstream contents;
    contents << stream.rdbuf();
    return contents.str();
}

bool Config::load(const std::filesystem::path& config_path) {
    loaded_ = false;
    last_error_.clear();

    config_path_ = config_path;
    app_directory_ = config_path.parent_path().parent_path();

    if (app_directory_.empty()) {
        app_directory_ = resolveAppDirectory();
    }

    const auto file_contents = readFile(config_path);
    if (!file_contents.has_value()) {
        last_error_ = "Unable to read config file: " + config_path.string();
        return false;
    }

    AppConfig parsed{};
    if (!parseConfigJson(*file_contents, parsed, last_error_)) {
        return false;
    }

    config_ = std::move(parsed);
    loaded_ = true;
    return true;
}

bool Config::loadFromAppDirectory() {
    const auto app_dir = resolveAppDirectory();
    app_directory_ = app_dir;

    const auto primary = app_dir / "config" / "config.json";
    if (std::filesystem::exists(primary)) {
        return load(primary);
    }

    const auto example = app_dir / "config" / "config.example.json";
    if (std::filesystem::exists(example)) {
        return load(example);
    }

    last_error_ = "No config file found in " + (app_dir / "config").string();
    config_path_.clear();
    loaded_ = false;
    return false;
}

} // namespace core

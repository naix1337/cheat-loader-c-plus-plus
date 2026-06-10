#include "network/ApiClient.h"

#include "core/Logger.h"

#include <curl/curl.h>
#include <nlohmann/json.hpp>

#include <sstream>
#include <utility>
#include <vector>

namespace network {
namespace {

struct CurlResponse {
    std::string body;
    long status_code = 0;
};

size_t writeCallback(char* ptr, size_t size, size_t nmemb, void* userdata) {
    const size_t total = size * nmemb;
    auto* response = static_cast<CurlResponse*>(userdata);
    response->body.append(ptr, total);
    return total;
}

[[nodiscard]] std::string methodToString(HttpMethod method) {
    switch (method) {
    case HttpMethod::Get:
        return "GET";
    case HttpMethod::Post:
        return "POST";
    case HttpMethod::Put:
        return "PUT";
    case HttpMethod::Delete:
        return "DELETE";
    }
    return "GET";
}

[[nodiscard]] std::string extractJsonErrorMessage(const std::string& body) {
    try {
        const auto json = nlohmann::json::parse(body);
        if (json.contains("error") && json["error"].is_string()) {
            return json["error"].get<std::string>();
        }
        if (json.contains("message") && json["message"].is_string()) {
            return json["message"].get<std::string>();
        }
    } catch (const nlohmann::json::exception&) {
        // fall through
    }
    return {};
}

[[nodiscard]] int extractRetryAfterSeconds(const std::string& body) {
    try {
        const auto json = nlohmann::json::parse(body);
        if (json.contains("retry_after") && json["retry_after"].is_number_integer()) {
            return json["retry_after"].get<int>();
        }
    } catch (const nlohmann::json::exception&) {
        // fall through
    }
    return 0;
}

} // namespace

ApiClient::~ApiClient() { shutdown(); }

bool ApiClient::initialize(const std::string& base_url, TlsConfig tls_config) {
    if (initialized_) {
        return true;
    }

    if (base_url.empty()) {
        return false;
    }

    const CURLcode global_init = curl_global_init(CURL_GLOBAL_DEFAULT);
    if (global_init != CURLE_OK) {
        return false;
    }

    base_url_ = base_url;
    while (!base_url_.empty() && base_url_.back() == '/') {
        base_url_.pop_back();
    }

    tls_config_ = std::move(tls_config);
    shutting_down_ = false;
    initialized_ = true;
    return true;
}

void ApiClient::shutdown() noexcept {
    if (!initialized_) {
        return;
    }

    shutting_down_ = true;
    curl_global_cleanup();
    initialized_ = false;
}

void ApiClient::setAuthHooks(AuthHooks hooks) {
    std::lock_guard lock(hooks_mutex_);
    auth_hooks_ = std::move(hooks);
}

void ApiClient::get(const std::string& path, ResponseCallback callback, bool authorized) {
    dispatch(RequestOptions{HttpMethod::Get, path, {}, authorized, std::move(callback)});
}

void ApiClient::post(const std::string& path, const std::string& json_body,
                     ResponseCallback callback, bool authorized) {
    dispatch(RequestOptions{HttpMethod::Post, path, json_body, authorized, std::move(callback)});
}

void ApiClient::put(const std::string& path, const std::string& json_body,
                    ResponseCallback callback, bool authorized) {
    dispatch(RequestOptions{HttpMethod::Put, path, json_body, authorized, std::move(callback)});
}

void ApiClient::del(const std::string& path, ResponseCallback callback, bool authorized) {
    dispatch(RequestOptions{HttpMethod::Delete, path, {}, authorized, std::move(callback)});
}

RawApiResponse ApiClient::getSync(const std::string& path, bool authorized) {
    return execute(RequestOptions{HttpMethod::Get, path, {}, authorized, nullptr}, false);
}

RawApiResponse ApiClient::postSync(const std::string& path, const std::string& json_body,
                                   bool authorized) {
    return execute(RequestOptions{HttpMethod::Post, path, json_body, authorized, nullptr}, false);
}

RawApiResponse ApiClient::putSync(const std::string& path, const std::string& json_body,
                                  bool authorized) {
    return execute(RequestOptions{HttpMethod::Put, path, json_body, authorized, nullptr}, false);
}

RawApiResponse ApiClient::delSync(const std::string& path, bool authorized) {
    return execute(RequestOptions{HttpMethod::Delete, path, {}, authorized, nullptr}, false);
}

void ApiClient::dispatch(RequestOptions options) {
    if (!initialized_ || shutting_down_) {
        if (options.callback) {
            RawApiResponse response{};
            response.success = false;
            response.status_code = 0;
            response.error_message = "API client is not initialized";
            options.callback(std::move(response));
        }
        return;
    }

    std::thread([this, options = std::move(options)]() mutable {
        RawApiResponse response = execute(options, false);
        if (options.callback) {
            options.callback(std::move(response));
        }
    }).detach();
}

std::string ApiClient::buildUrl(const std::string& path) const {
    if (path.empty()) {
        return base_url_;
    }
    if (path.front() == '/') {
        return base_url_ + path;
    }
    return base_url_ + '/' + path;
}

std::optional<std::string> ApiClient::resolveAuthorizationHeader() const {
    std::lock_guard lock(hooks_mutex_);
    if (!auth_hooks_.get_access_token) {
        return std::nullopt;
    }

    const auto token = auth_hooks_.get_access_token();
    if (!token.has_value() || token->empty()) {
        return std::nullopt;
    }

    return "Authorization: Bearer " + *token;
}

RawApiResponse ApiClient::execute(const RequestOptions& options, bool is_retry) {
    RawApiResponse result{};

    CURL* handle = curl_easy_init();
    if (handle == nullptr) {
        result.error_message = "Failed to create HTTP handle";
        return result;
    }

    const std::string url = buildUrl(options.path);
    CurlResponse curl_response{};

    curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(handle, CURLOPT_WRITEDATA, &curl_response);
    curl_easy_setopt(handle, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(handle, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(handle, CURLOPT_CONNECTTIMEOUT, 10L);

    if (!tls_config_.applyTo(handle)) {
        curl_easy_cleanup(handle);
        result.error_message = "Failed to apply TLS configuration";
        return result;
    }

    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, "Accept: application/json");

    if (options.authorized) {
        const auto auth_header = resolveAuthorizationHeader();
        if (!auth_header.has_value()) {
            curl_slist_free_all(headers);
            curl_easy_cleanup(handle);
            result.status_code = 401;
            result.error_message = "No access token available";
            return result;
        }
        headers = curl_slist_append(headers, auth_header->c_str());
    }

    const std::string method = methodToString(options.method);
    curl_easy_setopt(handle, CURLOPT_CUSTOMREQUEST, method.c_str());

    if (options.method == HttpMethod::Post || options.method == HttpMethod::Put) {
        curl_easy_setopt(handle, CURLOPT_POSTFIELDS, options.body.c_str());
        curl_easy_setopt(handle, CURLOPT_POSTFIELDSIZE, static_cast<long>(options.body.size()));
    }

    curl_easy_setopt(handle, CURLOPT_HTTPHEADER, headers);

    const CURLcode perform_result = curl_easy_perform(handle);
    if (perform_result != CURLE_OK) {
        result.error_message = curl_easy_strerror(perform_result);
        curl_slist_free_all(headers);
        curl_easy_cleanup(handle);
        return result;
    }

    curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &curl_response.status_code);
    curl_slist_free_all(headers);
    curl_easy_cleanup(handle);

    result = mapHttpStatus(static_cast<int>(curl_response.status_code), curl_response.body);

    // 401 → attempt token refresh once, then retry the original request.
    if (result.status_code == 401 && options.authorized && !is_retry) {
        bool refresh_succeeded = false;
        {
            std::lock_guard lock(hooks_mutex_);
            if (auth_hooks_.refresh_access_token) {
                refresh_succeeded = auth_hooks_.refresh_access_token();
            }
        }

        if (refresh_succeeded) {
            core::Logger::instance().logTokenRefresh(true);
            return execute(options, true);
        }

        core::Logger::instance().logTokenRefresh(false, "refresh failed after 401");
        {
            std::lock_guard lock(hooks_mutex_);
            if (auth_hooks_.force_logout) {
                auth_hooks_.force_logout();
            }
        }
        result.error_message = "Session expired. Please log in again.";
    }

    return result;
}

RawApiResponse ApiClient::mapHttpStatus(int status_code, const std::string& body) {
    RawApiResponse response{};
    response.status_code = status_code;
    response.body = body;

    switch (status_code) {
    case 200:
    case 201:
        response.success = true;
        break;

    case 400: {
        response.success = false;
        const auto message = extractJsonErrorMessage(body);
        response.error_message = message.empty() ? "Validation error" : message;
        break;
    }

    case 401:
        response.success = false;
        response.error_message = extractJsonErrorMessage(body);
        if (response.error_message.empty()) {
            response.error_message = "Unauthorized";
        }
        break;

    case 403:
        response.success = false;
        response.error_message = "Access denied";
        break;

    case 409:
        response.success = false;
        response.error_message = extractJsonErrorMessage(body);
        if (response.error_message.empty()) {
            response.error_message = "Conflict";
        }
        break;

    case 429:
        response.success = false;
        response.retry_after_seconds = extractRetryAfterSeconds(body);
        if (response.retry_after_seconds > 0) {
            core::Logger::instance().logRateLimited("API request", response.retry_after_seconds);
            response.error_message =
                "Too many requests. Try again in " + std::to_string(response.retry_after_seconds) +
                " seconds.";
        } else {
            response.error_message = "Too many requests. Please wait and try again.";
        }
        break;

    case 500:
    case 502:
    case 503:
        response.success = false;
        response.error_message = "Server error. Please try again later.";
        break;

    default:
        response.success = false;
        response.error_message =
            status_code >= 400 ? "Request failed (" + std::to_string(status_code) + ")" : body;
        break;
    }

    return response;
}

} // namespace network

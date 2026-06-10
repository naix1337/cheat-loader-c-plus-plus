#pragma once

#include "network/HttpTypes.h"
#include "network/TlsConfig.h"

#include <atomic>
#include <mutex>
#include <string>
#include <thread>

namespace network {

// Thread-safe HTTP client built on libcurl.
// Callbacks are invoked on a worker thread — marshal to the UI thread before updating ImGui.
class ApiClient {
public:
    ApiClient() = default;
    ~ApiClient();

    ApiClient(const ApiClient&) = delete;
    ApiClient& operator=(const ApiClient&) = delete;

    [[nodiscard]] bool initialize(const std::string& base_url, TlsConfig tls_config);

    void shutdown() noexcept;

    void setAuthHooks(AuthHooks hooks);

    [[nodiscard]] bool isInitialized() const noexcept { return initialized_; }

    void get(const std::string& path, ResponseCallback callback, bool authorized = true);

    void post(const std::string& path, const std::string& json_body, ResponseCallback callback,
              bool authorized = false);

    void put(const std::string& path, const std::string& json_body, ResponseCallback callback,
             bool authorized = true);

    void del(const std::string& path, ResponseCallback callback, bool authorized = true);

    // Blocking requests for auth flows (token refresh on 401-retry path).
    [[nodiscard]] RawApiResponse getSync(const std::string& path, bool authorized = true);

    [[nodiscard]] RawApiResponse postSync(const std::string& path, const std::string& json_body,
                                          bool authorized = false);

    [[nodiscard]] RawApiResponse putSync(const std::string& path, const std::string& json_body,
                                         bool authorized = true);

    [[nodiscard]] RawApiResponse delSync(const std::string& path, bool authorized = true);

private:
    struct RequestOptions {
        HttpMethod method;
        std::string path;
        std::string body;
        bool authorized;
        ResponseCallback callback;
    };

    void dispatch(RequestOptions options);

    [[nodiscard]] RawApiResponse execute(const RequestOptions& options, bool is_retry);

    [[nodiscard]] std::string buildUrl(const std::string& path) const;

    [[nodiscard]] std::optional<std::string> resolveAuthorizationHeader() const;

    [[nodiscard]] static RawApiResponse mapHttpStatus(int status_code, const std::string& body);

    std::string base_url_;
    TlsConfig tls_config_;
    AuthHooks auth_hooks_;
    mutable std::mutex hooks_mutex_;
    std::atomic<bool> initialized_{false};
    std::atomic<bool> shutting_down_{false};
};

} // namespace network

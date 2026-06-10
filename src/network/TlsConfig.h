#pragma once

#include <string>

namespace network {

using CurlEasyHandle = void;

// TLS settings for libcurl. Peer verification is always enabled — never disable in production.
class TlsConfig {
public:
    TlsConfig() = default;

    explicit TlsConfig(std::string user_agent);

    void setUserAgent(std::string user_agent);

    [[nodiscard]] const std::string& userAgent() const noexcept { return user_agent_; }

    // Applies TLS 1.3-only settings and certificate verification to a curl easy handle.
    [[nodiscard]] bool applyTo(CurlEasyHandle* handle) const;

    // -----------------------------------------------------------------------
    // Certificate pinning (optional hardening — disabled by default).
    //
    // Pinning binds the client to a specific server public key, mitigating
    // compromised CAs. Trade-off: certificate rotation requires a client update
    // unless pins are managed remotely (not implemented here).
    //
    // struct SpkiPin {
    //     std::string hostname;       // e.g. "api.example.com"
    //     std::string sha256_spki_b64; // Base64-encoded SHA-256 of SPKI DER
    // };
    //
    // void setPinnedKeys(std::vector<SpkiPin> pins);
    // bool verifyPinnedKey(CURL* handle) const;
    // -----------------------------------------------------------------------

private:
    std::string user_agent_ = "cpp-auth-client/1.0";
};

} // namespace network

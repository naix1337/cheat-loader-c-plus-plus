#include "network/TlsConfig.h"

#include <curl/curl.h>

namespace network {

TlsConfig::TlsConfig(std::string user_agent) : user_agent_(std::move(user_agent)) {}

void TlsConfig::setUserAgent(std::string user_agent) { user_agent_ = std::move(user_agent); }

bool TlsConfig::applyTo(CurlEasyHandle* handle) const {
    if (handle == nullptr) {
        return false;
    }

    CURL* curl = static_cast<CURL*>(handle);

    // TLS 1.3 only — reject TLS 1.2 and below (OWASP transport recommendation).
    const CURLcode tls_version =
        curl_easy_setopt(curl, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_3);
    if (tls_version != CURLE_OK) {
        return false;
    }

    // Always verify server certificate and hostname — never set these to 0.
    if (curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L) != CURLE_OK) {
        return false;
    }
    if (curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L) != CURLE_OK) {
        return false;
    }

    if (curl_easy_setopt(curl, CURLOPT_USERAGENT, user_agent_.c_str()) != CURLE_OK) {
        return false;
    }

    // Enforce modern TLS cipher preference where supported.
    if (curl_easy_setopt(curl, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA) != CURLE_OK) {
        return false;
    }

    return true;
}

} // namespace network

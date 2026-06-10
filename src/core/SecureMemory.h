#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <type_traits>
#include <utility>

namespace core {

// Securely zero memory so the compiler cannot elide the wipe (unlike memset,
// which may be optimized away when the buffer is not read afterward).
inline void SecureZero(void* ptr, std::size_t len) noexcept {
    if (ptr == nullptr || len == 0) {
        return;
    }

    volatile std::uint8_t* p = static_cast<volatile std::uint8_t*>(ptr);
    while (len-- > 0) {
        *p++ = 0;
    }
}

// RAII wrapper that zeroes heap-allocated string contents on destruction.
class SecureString {
public:
    SecureString() = default;

    explicit SecureString(std::string value) : data_(std::move(value)) {}

    SecureString(const SecureString& other) : data_(other.data_) {}

    SecureString(SecureString&& other) noexcept : data_(std::move(other.data_)) {
        other.wipe();
    }

    SecureString& operator=(const SecureString& other) {
        if (this != &other) {
            wipe();
            data_ = other.data_;
        }
        return *this;
    }

    SecureString& operator=(SecureString&& other) noexcept {
        if (this != &other) {
            wipe();
            data_ = std::move(other.data_);
            other.wipe();
        }
        return *this;
    }

    ~SecureString() { wipe(); }

    [[nodiscard]] bool empty() const noexcept { return data_.empty(); }

    [[nodiscard]] std::size_t size() const noexcept { return data_.size(); }

    [[nodiscard]] const char* c_str() const noexcept { return data_.c_str(); }

    [[nodiscard]] const std::string& view() const noexcept { return data_; }

    void assign(std::string value) {
        wipe();
        data_ = std::move(value);
    }

    void clear() { wipe(); }

    [[nodiscard]] std::string release() {
        std::string released = std::move(data_);
        data_.clear();
        return released;
    }

private:
    void wipe() noexcept {
        if (!data_.empty()) {
            SecureZero(data_.data(), data_.size());
            data_.clear();
        }
    }

    std::string data_;
};

static_assert(!std::is_trivially_copyable_v<SecureString>);

} // namespace core

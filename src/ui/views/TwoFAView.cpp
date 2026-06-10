#include "ui/views/TwoFAView.h"

#include "ui/components/Button.h"
#include "ui/components/InputField.h"
#include "ui/theme/Theme.h"

#include <imgui.h>

#include <chrono>
#include <cstring>

namespace ui::views {

TwoFAView::TwoFAView(auth::AuthService& auth_service, MainThreadEnqueue enqueue)
    : auth_service_(auth_service), enqueue_(std::move(enqueue)) {}

void TwoFAView::reset() {
    std::memset(otp_, 0, sizeof(otp_));
    loading_ = false;
    error_message_.clear();
}

int TwoFAView::totpSecondsRemaining() const {
    const auto now = std::chrono::system_clock::now();
    const auto seconds =
        std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    return 30 - static_cast<int>(seconds % 30);
}

void TwoFAView::submitOtp() {
    if (loading_) {
        return;
    }

    if (std::strlen(otp_) != 6) {
        error_message_ = "Enter the 6-digit code";
        return;
    }

    loading_ = true;
    error_message_.clear();

    const std::string otp(otp_);
    auth_service_.verifyTwoFA(
        otp, [this, enqueue = enqueue_](auth::LoginResult result) {
            enqueue([this, result = std::move(result)]() mutable {
                loading_ = false;
                if (!result.success) {
                    error_message_ = result.error_message.empty()
                                         ? "Invalid authentication code"
                                         : result.error_message;
                    std::memset(otp_, 0, sizeof(otp_));
                }
            });
        });
}

void TwoFAView::render() {
    const ImVec2 window_size = ImGui::GetIO().DisplaySize;
    const ImVec2 panel_size(360.0f, 320.0f);
    ImGui::SetNextWindowPos(
        ImVec2((window_size.x - panel_size.x) * 0.5f, (window_size.y - panel_size.y) * 0.5f),
        ImGuiCond_Always);
    ImGui::SetNextWindowSize(panel_size, ImGuiCond_Always);

    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.45f));
    ImGui::Begin("##twofa_panel", nullptr,
                 ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
                     ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("TWO-FACTOR AUTH");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted("Enter the 6-digit code from your authenticator app");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    const bool edited =
        components::inputDigitsOnly("Authentication code", otp_, sizeof(otp_), 6, loading_);
    if (edited && std::strlen(otp_) == 6) {
        submitOtp();
    }

    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::Text("Code refreshes in %d s", totpSecondsRemaining());
    ImGui::PopStyleColor();
    ImGui::Spacing();

    if (components::button("VERIFY", loading_, loading_, ImVec2(-1, 36))) {
        submitOtp();
    }

    if (!error_message_.empty()) {
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::kError);
        ImGui::TextWrapped("%s", error_message_.c_str());
        ImGui::PopStyleColor();
    }

    ImGui::Spacing();
    if (components::button("Back to login", false, loading_, ImVec2(-1, 30))) {
        auth_service_.logoutLocal();
        reset();
    }

    ImGui::End();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

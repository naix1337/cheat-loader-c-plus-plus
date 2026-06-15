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
    const ImVec2 panel_size(400.0f, 340.0f);
    ImGui::SetNextWindowPos(
        ImVec2((window_size.x - panel_size.x) * 0.5f, (window_size.y - panel_size.y) * 0.5f),
        ImGuiCond_Always);
    ImGui::SetNextWindowSize(panel_size, ImGuiCond_Always);

    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.3f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 1.0f);

    ImGui::Begin("##twofa_panel", nullptr,
                 ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
                     ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

    ImDrawList* dl = ImGui::GetWindowDrawList();

    // AETHER logo
    const ImVec2 panel_pos = ImGui::GetWindowPos();
    theme::drawLogo(dl, ImVec2(panel_pos.x + panel_size.x * 0.5f, panel_pos.y + 38.0f), 14.0f);

    ImGui::SetCursorPosY(60.0f);

    // Title
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    const float title_w = ImGui::CalcTextSize("TWO-FACTOR AUTH").x;
    ImGui::SetCursorPosX((panel_size.x - title_w) * 0.5f);
    ImGui::TextUnformatted("TWO-FACTOR AUTH");
    ImGui::PopStyleColor();

    ImGui::Spacing();

    // Subtitle
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    const float sub_w = ImGui::CalcTextSize("Enter the 6-digit code from your authenticator app").x;
    ImGui::SetCursorPosX((panel_size.x - sub_w) * 0.5f);
    ImGui::TextUnformatted("Enter the 6-digit code from your authenticator app");
    ImGui::PopStyleColor();

    ImGui::Spacing();
    const float sep_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(panel_pos.x + 30, sep_y), ImVec2(panel_pos.x + panel_size.x - 30, sep_y),
                ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.12f)));
    ImGui::Spacing();

    // OTP input
    const bool edited =
        components::inputDigitsOnly("AUTHENTICATION CODE", otp_, sizeof(otp_), 6, loading_);
    if (edited && std::strlen(otp_) == 6) {
        submitOtp();
    }

    ImGui::Spacing();
    ImGui::Spacing();

    // TOTP timer
    const int secs = totpSecondsRemaining();
    ImGui::PushStyleColor(ImGuiCol_Text, secs <= 5 ? theme::kRed : theme::kTextDim);
    const float timer_w = ImGui::CalcTextSize("Code refreshes in %d s").x;
    ImGui::SetCursorPosX((panel_size.x - timer_w) * 0.5f);
    ImGui::Text("Code refreshes in %d s", secs);
    ImGui::PopStyleColor();

    ImGui::Spacing();

    // Verify button
    if (components::button("VERIFY", loading_, loading_, ImVec2(-1, 40))) {
        submitOtp();
    }

    // Error
    if (!error_message_.empty()) {
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::kRed);
        const float err_w = ImGui::CalcTextSize(error_message_.c_str()).x;
        ImGui::SetCursorPosX((panel_size.x - err_w) * 0.5f);
        ImGui::TextUnformatted(error_message_.c_str());
        ImGui::PopStyleColor();
    }

    ImGui::Spacing();
    const float sep2_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(panel_pos.x + 30, sep2_y), ImVec2(panel_pos.x + panel_size.x - 30, sep2_y),
                ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.12f)));
    ImGui::Spacing();

    // Back button
    if (components::button("BACK TO LOGIN", false, loading_, ImVec2(-1, 32))) {
        auth_service_.logoutLocal();
        reset();
    }

    ImGui::End();
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

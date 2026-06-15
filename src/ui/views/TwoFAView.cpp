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

void TwoFAView::reset() { std::memset(otp_, 0, sizeof(otp_)); loading_ = false; error_message_.clear(); }

int TwoFAView::totpSecondsRemaining() const {
    auto now = std::chrono::system_clock::now();
    auto sec = std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count();
    return 30 - (int)(sec % 30);
}

void TwoFAView::submitOtp() {
    if (loading_) return;
    if (std::strlen(otp_) != 6) { error_message_ = "Enter the 6-digit code"; return; }
    loading_ = true; error_message_.clear();
    std::string otp(otp_);
    auth_service_.verifyTwoFA(otp, [this, enqueue = enqueue_](auth::LoginResult r) {
        enqueue([this, r = std::move(r)]() mutable {
            loading_ = false;
            if (!r.success) { error_message_ = r.error_message.empty() ? "Invalid code" : r.error_message; std::memset(otp_, 0, sizeof(otp_)); }
        });
    });
}

void TwoFAView::render() {
    auto vs = ImGui::GetIO().DisplaySize;
    ImVec2 ps(380.0f, 300.0f);
    float cx = (vs.x - ps.x) * 0.5f, cy = (vs.y - ps.y) * 0.5f;
    ImGui::SetNextWindowPos(ImVec2(cx, cy), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ps, ImGuiCond_Always);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.35f));
    ImGui::Begin("##2fa", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

    auto* dl = ImGui::GetWindowDrawList();
    ImVec2 wp = ImGui::GetWindowPos();

    // Diamond logo
    float lx = wp.x + ps.x * 0.5f, ly = wp.y + 34.0f;
    dl->AddCircleFilled(ImVec2(lx, ly), 20.0f, IM_COL32(0, 212, 255, 25), 40);
    dl->AddQuadFilled(ImVec2(lx - 7, ly), ImVec2(lx, ly - 10), ImVec2(lx + 7, ly), ImVec2(lx, ly + 10), IM_COL32(0, 212, 255, 220));

    ImGui::SetCursorPosY(54.0f);
    const char* title = "TWO-FACTOR AUTH";
    float tw = ImGui::CalcTextSize(title).x;
    ImGui::SetCursorPosX((ps.x - tw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent); ImGui::TextUnformatted(title); ImGui::PopStyleColor();

    ImGui::Spacing();
    const char* sub = "Enter the 6-digit code from your authenticator app";
    float sw = ImGui::CalcTextSize(sub).x;
    ImGui::SetCursorPosX((ps.x - sw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim); ImGui::TextUnformatted(sub); ImGui::PopStyleColor();

    ImGui::Spacing();
    float sep = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, sep), ImVec2(wp.x + ps.x - 30, sep), IM_COL32(0, 212, 255, 25));
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 4.0f);

    bool edited = components::inputDigitsOnly("AUTHENTICATION CODE", otp_, sizeof(otp_), 6, loading_);
    if (edited && std::strlen(otp_) == 6) submitOtp();

    ImGui::Spacing();
    ImGui::Spacing();

    int sec = totpSecondsRemaining();
    std::string timer = std::format("Code refreshes in {} s", sec);
    float tiw = ImGui::CalcTextSize(timer.c_str()).x;
    ImGui::SetCursorPosX((ps.x - tiw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Text, sec <= 5 ? theme::kRed : theme::kTextDim);
    ImGui::TextUnformatted(timer.c_str());
    ImGui::PopStyleColor();

    ImGui::Spacing();
    if (components::button("VERIFY", loading_, loading_, ImVec2(-1, 38))) submitOtp();

    if (!error_message_.empty()) {
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::kRed);
        float ew = ImGui::CalcTextSize(error_message_.c_str()).x;
        ImGui::SetCursorPosX((ps.x - ew) * 0.5f);
        ImGui::TextUnformatted(error_message_.c_str());
        ImGui::PopStyleColor();
    }

    ImGui::Spacing();
    float s2 = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, s2), ImVec2(wp.x + ps.x - 30, s2), IM_COL32(0, 212, 255, 25));
    ImGui::Spacing();

    if (components::button("BACK TO LOGIN", false, loading_, ImVec2(-1, 30))) {
        auth_service_.logoutLocal(); reset();
    }

    ImGui::End();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

#include "ui/views/LoginView.h"

#include "ui/components/Button.h"
#include "ui/components/InputField.h"
#include "ui/theme/Theme.h"

#include <Windows.h>
#include <shellapi.h>

#include <imgui.h>

#include <algorithm>
#include <cstring>
#include <format>

namespace ui::views {

LoginView::LoginView(auth::AuthService& auth_service, const core::AppConfig& config,
                     MainThreadEnqueue enqueue)
    : auth_service_(auth_service), config_(config), enqueue_(std::move(enqueue)) {}

void LoginView::reset() {
    std::memset(username_, 0, sizeof(username_));
    std::memset(password_, 0, sizeof(password_));
    show_password_ = false;
    loading_ = false;
    error_message_.clear();
    error_alpha_ = 0.0f;
}

void LoginView::submitLogin() {
    if (loading_) return;
    const std::string username(username_);
    if (username.empty()) { error_message_ = "Username required"; error_alpha_ = 1.0f; return; }
    if (std::strlen(password_) == 0) { error_message_ = "Password required"; error_alpha_ = 1.0f; return; }

    loading_ = true;
    error_message_.clear();
    const std::string password(password_);
    auth_service_.login(username, password, "",
        [this, enqueue = enqueue_](auth::LoginResult result) {
            enqueue([this, result = std::move(result)]() mutable {
                loading_ = false;
                if (result.requires_2fa) return;
                if (!result.success) { error_message_ = result.error_message.empty() ? "Login failed" : result.error_message; error_alpha_ = 1.0f; }
            });
        });
}

void LoginView::render() {
    const ImVec2 vs = ImGui::GetIO().DisplaySize;
    const ImVec2 ps(380.0f, 430.0f);
    float cx = (vs.x - ps.x) * 0.5f, cy = (vs.y - ps.y) * 0.5f;
    ImGui::SetNextWindowPos(ImVec2(cx, cy), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ps, ImGuiCond_Always);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.35f));

    ImGui::Begin("##login", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoScrollbar);

    auto* dl = ImGui::GetWindowDrawList();
    ImVec2 wp = ImGui::GetWindowPos();

    // ── Diamond logo ──
    float lx = wp.x + ps.x * 0.5f, ly = wp.y + 44.0f;
    dl->AddCircleFilled(ImVec2(lx, ly), 24.0f, IM_COL32(0, 212, 255, 25), 40);
    dl->AddQuadFilled(ImVec2(lx - 8, ly), ImVec2(lx, ly - 12), ImVec2(lx + 8, ly), ImVec2(lx, ly + 12), IM_COL32(0, 212, 255, 220));
    dl->AddQuadFilled(ImVec2(lx - 5, ly), ImVec2(lx, ly - 7), ImVec2(lx + 5, ly), ImVec2(lx, ly + 7), IM_COL32(0, 212, 255, 80));

    // ── Title ──
    ImGui::SetCursorPosY(68.0f);
    const char* title = "AETHER";
    float tw = ImGui::CalcTextSize(title).x;
    ImGui::SetCursorPosX((ps.x - tw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted(title);
    ImGui::PopStyleColor();

    // Subtitle
    ImGui::Spacing();
    const char* sub = "SECURE MODULE LOADER";
    float sw = ImGui::CalcTextSize(sub).x;
    ImGui::SetCursorPosX((ps.x - sw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted(sub);
    ImGui::PopStyleColor();

    // Version badge
    ImGui::Spacing();
    std::string ver = std::format("v{}", config_.version);
    float vw = ImGui::CalcTextSize(ver.c_str()).x + 16.0f;
    ImGui::SetCursorPosX((ps.x - vw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Button, theme::withAlpha(theme::kPurple, 0.15f));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kPurple);
    ImGui::Button(ver.c_str(), ImVec2(vw, 22.0f));
    ImGui::PopStyleColor(2);

    // ── Separator ──
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 10.0f);
    float sep_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, sep_y), ImVec2(wp.x + ps.x - 30, sep_y), IM_COL32(0, 212, 255, 30));
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 8.0f);

    // ── Fields ──
    components::inputField("USERNAME", username_, sizeof(username_), "Enter username", false, !error_message_.empty(), loading_);
    ImGui::Spacing();
    auto pw = components::inputField("PASSWORD", password_, sizeof(password_), "Enter password", !show_password_, !error_message_.empty(), loading_);
    ImGui::SameLine();
    if (components::button(show_password_ ? "HIDE" : "SHOW", false, loading_, ImVec2(56, 0))) show_password_ = !show_password_;

    ImGui::Spacing();
    ImGui::Spacing();

    // ── LOGIN ──
    if (components::button("LOGIN", loading_, loading_, ImVec2(-1, 40))) submitLogin();
    if (pw.submitted && !loading_) submitLogin();

    // ── Error ──
    if (!error_message_.empty()) {
        error_alpha_ = std::min(error_alpha_ + ImGui::GetIO().DeltaTime * 3.0f, 1.0f);
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::withAlpha(theme::kRed, error_alpha_));
        ImGui::SetCursorPosX((ps.x - ImGui::CalcTextSize(error_message_.c_str()).x) * 0.5f);
        ImGui::TextUnformatted(error_message_.c_str());
        ImGui::PopStyleColor();
    }

    // ── Separator ──
    ImGui::Spacing();
    float s2_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, s2_y), ImVec2(wp.x + ps.x - 30, s2_y), IM_COL32(0, 212, 255, 30));
    ImGui::Spacing();

    // ── Register link ──
    if (!config_.registration_url.empty()) {
        ImGui::PushStyleColor(ImGuiCol_Text, theme::withAlpha(theme::kAccent, 0.8f));
        ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0, 0, 0, 0));
        const char* rl = "Create account ->";
        float rw = ImGui::CalcTextSize(rl).x;
        ImGui::SetCursorPosX((ps.x - rw) * 0.5f);
        if (ImGui::Button(rl) && !loading_) ShellExecuteA(nullptr, "open", config_.registration_url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        ImGui::PopStyleColor(2);
    }

    // Version bottom-right
    std::string vd = std::format("v{}", config_.version);
    float vx = ImGui::CalcTextSize(vd.c_str()).x;
    ImGui::SetCursorPos(ImVec2(ps.x - vx - 20.0f, ps.y - 24.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted(vd.c_str());
    ImGui::PopStyleColor();

    ImGui::End();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

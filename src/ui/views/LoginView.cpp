#include "ui/views/LoginView.h"

#include "ui/components/Button.h"
#include "ui/components/InputField.h"
#include "ui/theme/Theme.h"

#include <Windows.h>
#include <shellapi.h>

#include <imgui.h>

#include <algorithm>
#include <cstring>

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
    if (loading_) {
        return;
    }

    const std::string username(username_);
    if (username.empty()) {
        error_message_ = "Username is required";
        error_alpha_ = 1.0f;
        return;
    }
    if (std::strlen(password_) == 0) {
        error_message_ = "Password is required";
        error_alpha_ = 1.0f;
        return;
    }

    loading_ = true;
    error_message_.clear();

    const std::string password(password_);
    auth_service_.login(
        username, password, "",
        [this, enqueue = enqueue_](auth::LoginResult result) {
            enqueue([this, result = std::move(result)]() mutable {
                loading_ = false;
                if (result.requires_2fa) {
                    return;
                }
                if (!result.success) {
                    error_message_ = result.error_message.empty() ? "Login failed"
                                                                  : result.error_message;
                    error_alpha_ = 1.0f;
                }
            });
        });
}

void LoginView::render() {
    const ImVec2 window_size = ImGui::GetIO().DisplaySize;
    const ImVec2 panel_size(400.0f, 460.0f);
    ImGui::SetNextWindowPos(
        ImVec2((window_size.x - panel_size.x) * 0.5f, (window_size.y - panel_size.y) * 0.5f),
        ImGuiCond_Always);
    ImGui::SetNextWindowSize(panel_size, ImGuiCond_Always);

    // AETHER login panel
    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.3f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 1.0f);

    ImGui::Begin("##login_panel", nullptr,
                 ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
                     ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse |
                     ImGuiWindowFlags_NoScrollbar);

    // ── AETHER Logo ──
    const ImVec2 panel_pos = ImGui::GetWindowPos();
    const float logo_center_x = panel_pos.x + panel_size.x * 0.5f;
    const float logo_center_y = panel_pos.y + 54.0f;

    ImDrawList* dl = ImGui::GetWindowDrawList();
    theme::drawLogo(dl, ImVec2(logo_center_x, logo_center_y), 18.0f);

    ImGui::SetCursorPosY(74.0f);

    // ── Title ──
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    const std::string title = config_.app_name.empty() ? "AETHER" : config_.app_name;
    const float title_w = ImGui::CalcTextSize(title.c_str()).x;
    ImGui::SetCursorPosX((panel_size.x - title_w) * 0.5f);
    ImGui::TextUnformatted(title.c_str());
    ImGui::PopStyleColor();

    ImGui::Spacing();

    // Subtitle with version badge
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    const char* subtitle = "SECURE MODULE LOADER";
    const float sub_w = ImGui::CalcTextSize(subtitle).x;
    ImGui::SetCursorPosX((panel_size.x - sub_w) * 0.5f);
    ImGui::TextUnformatted(subtitle);
    ImGui::PopStyleColor();

    // Version badge
    ImGui::Spacing();
    const std::string version = "v" + config_.version;
    const float ver_w = ImGui::CalcTextSize(version.c_str()).x + 20.0f;
    ImGui::SetCursorPosX((panel_size.x - ver_w) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Button, theme::withAlpha(theme::kPurple, 0.15f));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kPurple);
    if (ImGui::Button(version.c_str(), ImVec2(ver_w, 22.0f))) {}
    ImGui::PopStyleColor(2);

    ImGui::Spacing();
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 6.0f);

    // ── Scanline divider ──
    const float divider_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(panel_pos.x + 30, divider_y), ImVec2(panel_pos.x + panel_size.x - 30, divider_y),
                ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.15f)));

    ImGui::Spacing();
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 4.0f);

    // ── Fields ──
    components::inputField("USERNAME", username_, sizeof(username_), "Enter username", false,
                           !error_message_.empty(), loading_);

    ImGui::Spacing();

    components::InputFieldResult password_result =
        components::inputField("PASSWORD", password_, sizeof(password_), "Enter password",
                               !show_password_, !error_message_.empty(), loading_);

    ImGui::SameLine();
    if (components::button(show_password_ ? "HIDE" : "SHOW", false, loading_, ImVec2(60, 0))) {
        show_password_ = !show_password_;
    }

    ImGui::Spacing();
    ImGui::Spacing();

    // ── LOGIN button ──
    if (components::button("LOGIN", loading_, loading_, ImVec2(-1, 42))) {
        submitLogin();
    }

    if (password_result.submitted && !loading_) {
        submitLogin();
    }

    // ── Error message ──
    if (!error_message_.empty()) {
        error_alpha_ = std::min(error_alpha_ + ImGui::GetIO().DeltaTime * 3.0f, 1.0f);
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::withAlpha(theme::kRed, error_alpha_));
        const float err_w = ImGui::CalcTextSize(error_message_.c_str()).x;
        ImGui::SetCursorPosX((panel_size.x - err_w) * 0.5f);
        ImGui::TextUnformatted(error_message_.c_str());
        ImGui::PopStyleColor();
    }

    ImGui::Spacing();
    const float sep_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(panel_pos.x + 30, sep_y), ImVec2(panel_pos.x + panel_size.x - 30, sep_y),
                ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.15f)));

    ImGui::Spacing();

    // ── Register link ──
    if (!config_.registration_url.empty()) {
        ImGui::PushStyleColor(ImGuiCol_Text, theme::withAlpha(theme::kAccent, 0.8f));
        ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0, 0, 0, 0));
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0, 0, 0, 0));
        const std::string link_label = "Create account ->";
        const float link_w = ImGui::CalcTextSize(link_label.c_str()).x;
        ImGui::SetCursorPosX((panel_size.x - link_w) * 0.5f);
        if (ImGui::Button(link_label.c_str()) && !loading_) {
            ShellExecuteA(nullptr, "open", config_.registration_url.c_str(), nullptr, nullptr,
                          SW_SHOWNORMAL);
        }
        ImGui::PopStyleColor(3);
    }

    // Version bottom-right
    const std::string ver_display = "v" + config_.version;
    const ImVec2 ver_size = ImGui::CalcTextSize(ver_display.c_str());
    ImGui::SetCursorPos(ImVec2(panel_size.x - ver_size.x - 20.0f, panel_size.y - 24.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted(ver_display.c_str());
    ImGui::PopStyleColor();

    ImGui::End();
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

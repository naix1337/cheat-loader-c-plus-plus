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
    const ImVec2 panel_size(360.0f, 420.0f);
    ImGui::SetNextWindowPos(
        ImVec2((window_size.x - panel_size.x) * 0.5f, (window_size.y - panel_size.y) * 0.5f),
        ImGuiCond_Always);
    ImGui::SetNextWindowSize(panel_size, ImGuiCond_Always);

    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kSurface);
    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.45f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 1.0f);

    ImGui::Begin("##login_panel", nullptr,
                 ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
                     ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse |
                     ImGuiWindowFlags_NoScrollbar);

    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    const std::string title = config_.app_name.empty() ? "AUTH CLIENT" : config_.app_name;
    ImGui::TextUnformatted(title.c_str());
    ImGui::PopStyleColor();

    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted("Secure access gateway");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    components::inputField("Username", username_, sizeof(username_), "Enter username", false,
                           !error_message_.empty(), loading_);

    ImGui::Spacing();

    components::InputFieldResult password_result =
        components::inputField("Password", password_, sizeof(password_), "Enter password",
                               !show_password_, !error_message_.empty(), loading_);

    ImGui::SameLine();
    if (components::button(show_password_ ? "Hide" : "Show", false, loading_, ImVec2(56, 0))) {
        show_password_ = !show_password_;
    }

    ImGui::Spacing();
    ImGui::Spacing();

    if (components::button("LOGIN", loading_, loading_, ImVec2(-1, 38))) {
        submitLogin();
    }

    if (password_result.submitted && !loading_) {
        submitLogin();
    }

    if (!error_message_.empty()) {
        error_alpha_ = std::min(error_alpha_ + ImGui::GetIO().DeltaTime * 3.0f, 1.0f);
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, theme::withAlpha(theme::kError, error_alpha_));
        ImGui::TextWrapped("%s", error_message_.c_str());
        ImGui::PopStyleColor();
    }

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    if (!config_.registration_url.empty()) {
        ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
        const std::string link_label = "Create account -> " + config_.registration_url;
        if (ImGui::Selectable(link_label.c_str(), false) && !loading_) {
            ShellExecuteA(nullptr, "open", config_.registration_url.c_str(), nullptr, nullptr,
                          SW_SHOWNORMAL);
        }
        ImGui::PopStyleColor();
    }

    const std::string version_text = "v" + config_.version;
    const ImVec2 version_size = ImGui::CalcTextSize(version_text.c_str());
    ImGui::SetCursorPos(ImVec2(panel_size.x - version_size.x - 16.0f, panel_size.y - 24.0f));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted(version_text.c_str());
    ImGui::PopStyleColor();

    ImGui::End();
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

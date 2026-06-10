#include "ui/views/DashboardView.h"

#include "ui/components/Button.h"
#include "ui/theme/Theme.h"

#include <imgui.h>

namespace ui::views {

DashboardView::DashboardView(auth::AuthService& auth_service, MainThreadEnqueue enqueue)
    : auth_service_(auth_service), enqueue_(std::move(enqueue)) {}

void DashboardView::setUser(const User& user) { user_ = user; }

void DashboardView::render() {
    auth::SessionManager::instance().recordActivity();

    const ImVec2 window_size = ImGui::GetIO().DisplaySize;
    ImGui::SetNextWindowPos(ImVec2(0, 0), ImGuiCond_Always);
    ImGui::SetNextWindowSize(window_size, ImGuiCond_Always);

    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kBackground);
    ImGui::Begin("##dashboard", nullptr,
                 ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
                     ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

  // Sidebar placeholder for future features
    ImGui::BeginChild("##sidebar", ImVec2(120, 0), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("HOME");
    ImGui::PopStyleColor();
    // ImGui::TextDisabled("Modules");
    // ImGui::TextDisabled("  - Loader");
    // ImGui::TextDisabled("  - Settings");
    ImGui::EndChild();

    ImGui::SameLine();

    ImGui::BeginChild("##content", ImVec2(0, 0), false);

    if (components::button("Logout", logging_out_, logging_out_, ImVec2(80, 28))) {
        logging_out_ = true;
        auth_service_.logout([this, enqueue = enqueue_](bool, std::string) {
            enqueue([this]() { logging_out_ = false; });
        });
    }

    ImGui::SameLine();
    const auto remaining = auth::SessionManager::instance().inactivityRemaining();
    ImGui::SetCursorPosX(ImGui::GetWindowWidth() - 180.0f);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::Text("Session: %dm %02ds", static_cast<int>(remaining.count() / 60),
                static_cast<int>(remaining.count() % 60));
    ImGui::PopStyleColor();

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::Text("Welcome, %s", user_.username.c_str());
    ImGui::PopStyleColor();
    ImGui::Spacing();

    ImGui::BeginChild("##account_card", ImVec2(0, 180), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted("ACCOUNT");
    ImGui::PopStyleColor();
    ImGui::Separator();
    ImGui::Spacing();

    ImGui::Text("Email:  %s", user_.email.empty() ? "—" : user_.email.c_str());
    ImGui::Text("2FA:    %s", user_.two_fa_enabled ? "Enabled" : "Disabled");
    ImGui::Text("Joined: %s", user_.created_at.empty() ? "—" : user_.created_at.c_str());
    ImGui::EndChild();

    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextWrapped("Additional modules will appear here in a future release.");
    ImGui::PopStyleColor();

    ImGui::EndChild();
    ImGui::End();
    ImGui::PopStyleColor();
}

} // namespace ui::views

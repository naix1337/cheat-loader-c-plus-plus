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

    ImDrawList* dl = ImGui::GetWindowDrawList();

    // ── Top bar with AETHER logo + logout ──
    const ImVec2 win_pos = ImGui::GetWindowPos();

    // Draw AETHER diamond logo
    theme::drawLogo(dl, ImVec2(win_pos.x + 32, win_pos.y + 30), 14.0f);

    ImGui::SetCursorPos(ImVec2(52, 16));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("AETHER");
    ImGui::PopStyleColor();
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kPurple);
    ImGui::TextUnformatted("SECURE");
    ImGui::PopStyleColor();

    ImGui::SameLine();
    ImGui::SetCursorPosX(window_size.x - 200.0f);
    const auto remaining = auth::SessionManager::instance().inactivityRemaining();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::Text("%dm %02ds", static_cast<int>(remaining.count() / 60),
                static_cast<int>(remaining.count() % 60));
    ImGui::PopStyleColor();

    ImGui::SameLine();
    if (components::button("LOGOUT", logging_out_, logging_out_, ImVec2(90, 30))) {
        logging_out_ = true;
        auth_service_.logout([this, enqueue = enqueue_](bool, std::string) {
            enqueue([this]() { logging_out_ = false; });
        });
    }

    ImGui::SetCursorPosY(52);
    const float top_sep_y = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(win_pos.x + 20, top_sep_y), ImVec2(win_pos.x + window_size.x - 20, top_sep_y),
                ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.12f)));

    // ── Main layout: sidebar | content ──
    ImGui::SetCursorPos(ImVec2(12, 60));
    ImGui::BeginChild("##sidebar", ImVec2(200, window_size.y - 80), false);
    ImGui::PushStyleColor(ImGuiCol_ChildBg, theme::kPanel);
    ImGui::BeginChild("##sidebar_inner", ImVec2(0, 0), true);

    // Sidebar: Account card
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted("ACCOUNT");
    ImGui::PopStyleColor();

    ImGui::Spacing();
    // Avatar circle with initial
    const float av_size = 40.0f;
    const ImVec2 av_pos = ImGui::GetCursorScreenPos();
    const float av_center_x = av_pos.x + av_size * 0.5f;
    const float av_center_y = av_pos.y + av_size * 0.5f;
    dl->AddCircleFilled(ImVec2(av_center_x, av_center_y), av_size * 0.5f,
                        ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.2f)));
    dl->AddCircleFilled(ImVec2(av_center_x, av_center_y), av_size * 0.45f,
                        ImGui::ColorConvertFloat4ToU32(theme::withAlpha(theme::kAccent, 0.35f)));
    // Online dot
    dl->AddCircleFilled(ImVec2(av_center_x + 14, av_center_y + 14), 5.0f,
                        ImGui::ColorConvertFloat4ToU32(theme::kGreen));

    ImGui::SetCursorPos(ImVec2(50, ImGui::GetCursorPosY()));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::TextUnformatted(user_.username.c_str());
    ImGui::PopStyleColor();
    ImGui::SetCursorPos(ImVec2(50, ImGui::GetCursorPosY() - 4));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("PREMIUM");
    ImGui::PopStyleColor();

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 8);

    // Stats in sidebar
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted("2FA:");
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, user_.two_fa_enabled ? theme::kGreen : theme::kTextDim);
    ImGui::TextUnformatted(user_.two_fa_enabled ? "ENABLED" : "DISABLED");
    ImGui::PopStyleColor(2);

    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::Text("Email: %s", user_.email.empty() ? "—" : user_.email.c_str());
    ImGui::Text("Joined: %s", user_.created_at.empty() ? "—" : user_.created_at.c_str());
    ImGui::PopStyleColor();

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    // Nav links
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("◈ HOME");
    ImGui::PopStyleColor();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::Selectable("Store", false);
    ImGui::Selectable("Forum", false);
    ImGui::Selectable("Settings", false);
    ImGui::PopStyleColor();

    ImGui::EndChild();
    ImGui::PopStyleColor(); // ChildBg
    ImGui::EndChild();

    ImGui::SameLine();

    // ── Content area ──
    ImGui::PushStyleColor(ImGuiCol_ChildBg, theme::kPanel);
    ImGui::BeginChild("##content", ImVec2(0, window_size.y - 80), true);

    // Welcome header
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::Text("Welcome, %s", user_.username.c_str());
    ImGui::PopStyleColor();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextUnformatted("SECURE MODULE LOADER · ALL SYSTEMS NOMINAL");
    ImGui::PopStyleColor();

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    // ── Stats cards row ──
    const float card_w = (ImGui::GetContentRegionAvail().x - 24.0f) / 3.0f;

    ImGui::BeginChild("##stat1", ImVec2(card_w, 80), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("STATUS");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kGreen);
    ImGui::TextUnformatted("● ACTIVE");
    ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::SameLine(0, 12);

    ImGui::BeginChild("##stat2", ImVec2(card_w, 80), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("2FA");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, user_.two_fa_enabled ? theme::kGreen : theme::kRed);
    ImGui::TextUnformatted(user_.two_fa_enabled ? "● ENABLED" : "● DISABLED");
    ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::SameLine(0, 12);

    ImGui::BeginChild("##stat3", ImVec2(card_w, 80), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("SESSION");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::Text("%dm %02ds", static_cast<int>(remaining.count() / 60),
                static_cast<int>(remaining.count() % 60));
    ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    // ── Account details card ──
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted("ACCOUNT DETAILS");
    ImGui::PopStyleColor();
    ImGui::Spacing();

    ImGui::BeginChild("##account_card", ImVec2(0, 120), true);
    ImGui::Text("Username:");
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::TextUnformatted(user_.username.c_str());
    ImGui::PopStyleColor();

    ImGui::Text("Email:");
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::TextUnformatted(user_.email.empty() ? "—" : user_.email.c_str());
    ImGui::PopStyleColor();

    ImGui::Text("2FA:");
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, user_.two_fa_enabled ? theme::kGreen : theme::kTextMuted);
    ImGui::TextUnformatted(user_.two_fa_enabled ? "Enabled" : "Disabled");
    ImGui::PopStyleColor();

    ImGui::Text("Joined:");
    ImGui::SameLine();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::TextUnformatted(user_.created_at.empty() ? "—" : user_.created_at.c_str());
    ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextWrapped("Additional modules and features will appear here in a future release.");
    ImGui::PopStyleColor();

    ImGui::EndChild();
    ImGui::PopStyleColor(); // ChildBg

    ImGui::End();
    ImGui::PopStyleColor(); // WindowBg
}

} // namespace ui::views

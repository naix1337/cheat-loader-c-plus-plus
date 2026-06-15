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

    auto* dl = ImGui::GetWindowDrawList();
    const ImVec2 vs = ImGui::GetIO().DisplaySize;
    ImGui::SetNextWindowPos(ImVec2(0, 0), ImGuiCond_Always);
    ImGui::SetNextWindowSize(vs, ImGuiCond_Always);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, theme::kBackground);
    ImGui::Begin("##dash", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

    ImVec2 wp = ImGui::GetWindowPos();

    // ── Top bar: logo + title + session + logout ──
    float lx = wp.x + 28.0f, ly = wp.y + 24.0f;
    dl->AddCircleFilled(ImVec2(lx, ly), 14.0f, IM_COL32(0, 212, 255, 30), 30);
    dl->AddQuadFilled(ImVec2(lx - 5, ly), ImVec2(lx, ly - 8), ImVec2(lx + 5, ly), ImVec2(lx, ly + 8), IM_COL32(0, 212, 255, 220));

    ImGui::SetCursorPos(ImVec2(44, 12));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::TextUnformatted("AETHER");
    ImGui::PopStyleColor();
    ImGui::SameLine(0, 6);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kPurple);
    ImGui::TextUnformatted("SECURE");
    ImGui::PopStyleColor();

    // Session timer + logout right side
    auto remaining = auth::SessionManager::instance().inactivityRemaining();
    std::string sess = std::format("{}m {:02d}s", (int)(remaining.count() / 60), (int)(remaining.count() % 60));
    float sx = ImGui::CalcTextSize(sess.c_str()).x;
    ImGui::SetCursorPos(ImVec2(vs.x - sx - 120, 14));
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted(sess.c_str());
    ImGui::PopStyleColor();
    ImGui::SameLine(0, 8);
    if (components::button("LOGOUT", logging_out_, logging_out_, ImVec2(80, 26))) {
        logging_out_ = true;
        auth_service_.logout([this, enqueue = enqueue_](bool, std::string) { enqueue([this]() { logging_out_ = false; }); });
    }

    // Top separator
    ImGui::SetCursorPosY(40);
    float ts = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 16, ts), ImVec2(wp.x + vs.x - 16, ts), IM_COL32(0, 212, 255, 20));

    // ── Content area ──
    ImGui::SetCursorPos(ImVec2(16, 48));
    ImGui::BeginChild("##main", ImVec2(0, vs.y - 64), false);

    // Welcome
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kAccent);
    ImGui::Text("Welcome, %s", user_.username.c_str());
    ImGui::PopStyleColor();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted("SECURE MODULE LOADER · ALL SYSTEMS NOMINAL");
    ImGui::PopStyleColor();
    ImGui::Spacing();

    // ── Stats row ──
    float cw = (ImGui::GetContentRegionAvail().x - 16.0f) / 3.0f;

    ImGui::BeginChild("##st1", ImVec2(cw, 70), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim); ImGui::TextUnformatted("STATUS"); ImGui::PopStyleColor();
    ImGui::Spacing(); ImGui::PushStyleColor(ImGuiCol_Text, theme::kGreen);
    ImGui::TextUnformatted("● ACTIVE"); ImGui::PopStyleColor();
    ImGui::EndChild();
    ImGui::SameLine(0, 8);

    ImGui::BeginChild("##st2", ImVec2(cw, 70), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim); ImGui::TextUnformatted("2FA"); ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, user_.two_fa_enabled ? theme::kGreen : theme::kRed);
    ImGui::TextUnformatted(user_.two_fa_enabled ? "● ENABLED" : "● DISABLED");
    ImGui::PopStyleColor();
    ImGui::EndChild();
    ImGui::SameLine(0, 8);

    ImGui::BeginChild("##st3", ImVec2(cw, 70), true);
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim); ImGui::TextUnformatted("SESSION"); ImGui::PopStyleColor();
    ImGui::Spacing(); ImGui::PushStyleColor(ImGuiCol_Text, theme::kText);
    ImGui::TextUnformatted(sess.c_str()); ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    // ── Account card ──
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextDim);
    ImGui::TextUnformatted("ACCOUNT DETAILS");
    ImGui::PopStyleColor();
    ImGui::Spacing();
    ImGui::BeginChild("##acct", ImVec2(0, 120), true);
    ImGui::Text("Username:"); ImGui::SameLine(); ImGui::PushStyleColor(ImGuiCol_Text, theme::kText); ImGui::TextUnformatted(user_.username.c_str()); ImGui::PopStyleColor();
    ImGui::Text("Email:"); ImGui::SameLine(); ImGui::PushStyleColor(ImGuiCol_Text, theme::kText); ImGui::TextUnformatted(user_.email.empty() ? "—" : user_.email.c_str()); ImGui::PopStyleColor();
    ImGui::Text("2FA:"); ImGui::SameLine(); ImGui::PushStyleColor(ImGuiCol_Text, user_.two_fa_enabled ? theme::kGreen : theme::kTextMuted); ImGui::TextUnformatted(user_.two_fa_enabled ? "Enabled" : "Disabled"); ImGui::PopStyleColor();
    ImGui::Text("Joined:"); ImGui::SameLine(); ImGui::PushStyleColor(ImGuiCol_Text, theme::kText); ImGui::TextUnformatted(user_.created_at.empty() ? "—" : user_.created_at.c_str()); ImGui::PopStyleColor();
    ImGui::EndChild();

    ImGui::Spacing();
    ImGui::PushStyleColor(ImGuiCol_Text, theme::kTextMuted);
    ImGui::TextWrapped("Additional modules will appear here in a future release.");
    ImGui::PopStyleColor();

    ImGui::EndChild(); // main
    ImGui::End(); // window
    ImGui::PopStyleColor(); // WindowBg
}

} // namespace ui::views

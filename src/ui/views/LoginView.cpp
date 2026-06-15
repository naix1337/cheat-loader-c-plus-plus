#include "ui/views/LoginView.h"
#include "ui/components/Button.h"
#include "ui/components/InputField.h"
#include "ui/theme/Theme.h"
#include <Windows.h>
#include <shellapi.h>
#include <imgui.h>
#include <cstring>

namespace ui::views {

LoginView::LoginView(auth::AuthService& auth_service, const core::AppConfig& config,
                     MainThreadEnqueue enqueue)
    : auth_service_(auth_service), config_(config), enqueue_(std::move(enqueue)) {}

void LoginView::reset() {
    std::memset(username_, 0, sizeof(username_));
    std::memset(password_, 0, sizeof(password_));
    show_password_ = false; loading_ = false;
    error_message_.clear(); error_alpha_ = 0.0f;
}

void LoginView::submitLogin() {
    if (loading_) return;
    std::string u(username_);
    if (u.empty()) { error_message_ = "Username required"; error_alpha_ = 1.0f; return; }
    if (!std::strlen(password_)) { error_message_ = "Password required"; error_alpha_ = 1.0f; return; }
    loading_ = true; error_message_.clear();
    std::string p(password_);
    auth_service_.login(u, p, "", [this, enq = enqueue_](auth::LoginResult r) {
        enq([this, r = std::move(r)]() {
            loading_ = false;
            if (r.requires_2fa) return;
            if (!r.success) { error_message_ = r.error_message.empty() ? "Login failed" : r.error_message; error_alpha_ = 1.0f; }
        });
    });
}

void LoginView::render() {
    auto& io = ImGui::GetIO();
    ImVec2 ps(380, 440);
    float cx = (io.DisplaySize.x - ps.x) * 0.5f, cy = (io.DisplaySize.y - ps.y) * 0.5f;
    ImGui::SetNextWindowPos(ImVec2(cx, cy), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ps, ImGuiCond_Always);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, C_PANEL);
    ImGui::PushStyleColor(ImGuiCol_Border, withAlpha(C_CYAN, 0.35f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 14);

    ImGui::Begin("##login", nullptr,
        ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
        ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoScrollbar);

    auto* dl = ImGui::GetWindowDrawList();
    ImVec2 wp = ImGui::GetWindowPos();

    // ── AETHER Diamond Logo ──
    float lx = wp.x + ps.x * 0.5f, ly = wp.y + 42;
    // Outer glow ring
    dl->AddCircleFilled(ImVec2(lx, ly), 26, IM_COL32(0, 212, 255, 20), 40);
    dl->AddCircleFilled(ImVec2(lx, ly), 16, IM_COL32(0, 212, 255, 35), 40);
    // Diamond
    dl->AddQuadFilled(ImVec2(lx - 9, ly), ImVec2(lx, ly - 13), ImVec2(lx + 9, ly), ImVec2(lx, ly + 13), IM_COL32(0, 212, 255, 230));
    dl->AddQuadFilled(ImVec2(lx - 5, ly), ImVec2(lx, ly - 7), ImVec2(lx + 5, ly), ImVec2(lx, ly + 7), IM_COL32(0, 212, 255, 100));

    // ── Title ──
    ImGui::SetCursorPosY(70);
    ImGui::PushStyleColor(ImGuiCol_Text, C_CYAN);
    ImGui::SetCursorPosX((ps.x - ImGui::CalcTextSize("AETHER").x) * 0.5f);
    ImGui::TextUnformatted("AETHER");
    ImGui::PopStyleColor();

    ImGui::Spacing();
    const char* sub = "SECURE MODULE LOADER";
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::SetCursorPosX((ps.x - ImGui::CalcTextSize(sub).x) * 0.5f);
    ImGui::TextUnformatted(sub);
    ImGui::PopStyleColor();

    // ── Version badge ──
    ImGui::Spacing();
    std::string ver = "v" + config_.version;
    float vw = ImGui::CalcTextSize(ver.c_str()).x + 24;
    ImGui::SetCursorPosX((ps.x - vw) * 0.5f);
    ImGui::PushStyleColor(ImGuiCol_Button, withAlpha(C_PURPLE, 0.15f));
    ImGui::PushStyleColor(ImGuiCol_Text, C_PURPLE);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 12);
    ImGui::Button(ver.c_str(), ImVec2(vw, 22));
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);

    // ── Separator ──
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 12);
    float sy = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, sy), ImVec2(wp.x + ps.x - 30, sy), IM_COL32(0, 212, 255, 25));

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 10);

    // ── Input Fields ──
    components::inputField("USERNAME", username_, sizeof(username_), "Enter username", false, !error_message_.empty(), loading_);
    ImGui::Spacing();

    auto pw = components::inputField("PASSWORD", password_, sizeof(password_), "Enter password", !show_password_, !error_message_.empty(), loading_);
    ImGui::SameLine();
    if (components::button(show_password_ ? "HIDE" : "SHOW", false, loading_, ImVec2(52, 0)))
        show_password_ = !show_password_;

    ImGui::Spacing();
    ImGui::Spacing();

    // ── Login button ──
    if (components::button("LOGIN", loading_, loading_, ImVec2(-1, 42))) submitLogin();
    if (pw.submitted && !loading_) submitLogin();

    // ── Error ──
    if (!error_message_.empty()) {
        error_alpha_ = std::min(error_alpha_ + io.DeltaTime * 3, 1.0f);
        ImGui::Spacing();
        ImGui::PushStyleColor(ImGuiCol_Text, withAlpha(C_RED, error_alpha_));
        float ew = ImGui::CalcTextSize(error_message_.c_str()).x;
        ImGui::SetCursorPosX((ps.x - ew) * 0.5f);
        ImGui::TextUnformatted(error_message_.c_str());
        ImGui::PopStyleColor();
    }

    // ── Bottom separators ──
    ImGui::Spacing();
    float sy2 = ImGui::GetCursorScreenPos().y;
    dl->AddLine(ImVec2(wp.x + 30, sy2), ImVec2(wp.x + ps.x - 30, sy2), IM_COL32(0, 212, 255, 25));

    ImGui::Spacing();

    // ── Register link ──
    if (!config_.registration_url.empty()) {
        ImGui::PushStyleColor(ImGuiCol_Text, withAlpha(C_CYAN, 0.8f));
        ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0, 0, 0, 0));
        const char* rl = "Create account ->";
        float rw = ImGui::CalcTextSize(rl).x;
        ImGui::SetCursorPosX((ps.x - rw) * 0.5f);
        if (ImGui::Button(rl) && !loading_)
            ShellExecuteA(nullptr, "open", config_.registration_url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
        ImGui::PopStyleColor(2);
    }

    // Version bottom-right
    std::string vd = "v" + config_.version;
    float vx = ImGui::CalcTextSize(vd.c_str()).x;
    ImGui::SetCursorPos(ImVec2(ps.x - vx - 18, ps.y - 22));
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted(vd.c_str());
    ImGui::PopStyleColor();

    ImGui::End();
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);
}

} // namespace ui::views

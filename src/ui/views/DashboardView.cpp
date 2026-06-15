#include "ui/views/DashboardView.h"
#include "ui/components/Button.h"
#include "ui/theme/Theme.h"
using namespace ui::theme;
#include <imgui.h>
#include <cmath>
#include <format>
#include <vector>

namespace ui::views {

DashboardView::DashboardView(auth::AuthService& auth_service, const core::AppConfig& config,
                             MainThreadEnqueue enqueue)
    : auth_service_(auth_service), config_(config), enqueue_(std::move(enqueue)) {}

void DashboardView::setUser(const User& user) { user_ = user; }

// ── Simulated boot log definitions ──
struct LogDef { const char* tag; const char* text; int type; int at; };
// type: 0=info, 1=warn, 2=ok, 3=action
static const LogDef LOGS[] = {
    {"[sys]",  "Bootstrapping secure environment",           0, 2},
    {"[net]",  "Establishing encrypted tunnel \xe2\x86\x92 edge-07", 0, 8},
    {"[auth]", "Reading hardware fingerprint",               0, 16},
    {"[auth]", "Validating license key",                     1, 26},
    {"[auth]", "License valid \xe2\x80\x94 tier: PREMIUM",    2, 38},
    {"[cdn]",  "Fetching module manifest (rev 4471)",        0, 47},
    {"[cdn]",  "Downloading payload \xe2\x80\x94 3.24 MB",    3, 55},
    {"[core]", "Decrypting modules (AES-256)",               0, 63},
    {"[core]", "Mapping target process pid:8124",            0, 71},
    {"[core]", "Allocating memory region 0x7FF\xe2\x80\xa6", 0, 78},
    {"[core]", "Resolving imports \xc2\xb7 bypassing checks", 1, 85},
    {"[inj]",  "Injecting modules \xe2\x86\x92 hooks installed", 3, 93},
    {"[inj]",  "Integrity OK \xc2\xb7 all systems nominal",    2, 98},
};
static constexpr int LOG_COUNT = sizeof(LOGS) / sizeof(LOGS[0]);
static constexpr int DURATION_MS = 6000;

struct LogLine {
    std::string time;
    std::string tag;
    std::string text;
    ImU32 color;
};

void DashboardView::render() {
    auth::SessionManager::instance().recordActivity();

    auto* dl = ImGui::GetWindowDrawList();
    const ImVec2 vs = ImGui::GetIO().DisplaySize;
    ImGui::SetNextWindowPos(ImVec2(0, 0), ImGuiCond_Always);
    ImGui::SetNextWindowSize(vs, ImGuiCond_Always);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, C_BG);
    ImGui::Begin("##dash", nullptr, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize |
        ImGuiWindowFlags_NoMove | ImGuiWindowFlags_NoCollapse);

    ImVec2 wp = ImGui::GetWindowPos();

    // ── State machine ──
    float now = ImGui::GetTime();
    if (boot_start_ < 0) boot_start_ = now;
    float elapsed = (now - boot_start_) * 1000.0f;
    float t = fminf(1.0f, elapsed / DURATION_MS);
    // easeInOut
    float ease = t < 0.5f ? 2 * t * t : 1 - powf(-2 * t + 2, 2) / 2;
    int pct = (int)round(ease * 100);
    if (pct > 100) pct = 100;
    bool ready = pct >= 100;

    // Step segments
    int segments = ready ? 4 : (pct / 25);
    if (segments > 4) segments = 4;

    // Push log entries
    while (log_next_ < LOG_COUNT && pct >= LOGS[log_next_].at) {
        auto& l = LOGS[log_next_];
        ImU32 col;
        switch (l.type) {
            case 0: col = IM_COL32(127, 155, 176, 255); break; // info
            case 1: col = IM_COL32(255, 207, 92, 255);  break; // warn
            case 2: col = IM_COL32(62, 240, 163, 255);  break; // ok
            case 3: col = IM_COL32(0, 212, 255, 255);   break; // action
            default: col = IM_COL32(127, 155, 176, 255);
        }
        float sec = elapsed / 1000.0f;
        logs_.push_back({std::format("+{:.2f}", sec), l.tag, l.text, col});
        log_next_++;
    }

    // Auto-scroll
    if (logs_.size() > 0 && !auto_scrolled_) {
        scroll_to_bottom_ = true;
        auto_scrolled_ = true;
    }

    // ── Panel card ──
    float card_w = fminf(500, vs.x - 40);
    float card_h = fminf(560, vs.y - 40);
    float card_x = (vs.x - card_w) * 0.5f;
    float card_y = (vs.y - card_h) * 0.5f;

    ImGui::SetCursorPos(ImVec2(card_x, card_y));
    ImGui::PushStyleColor(ImGuiCol_ChildBg, C_PANEL);
    ImGui::PushStyleVar(ImGuiStyleVar_ChildRounding, 14);
    ImGui::BeginChild("##loader_card", ImVec2(card_w, card_h), true,
        ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);

    ImVec2 cp = ImGui::GetCursorScreenPos();

    // Moving scan band at top of card
    float band_y = cp.y + fmodf(now * 60, card_h);
    dl->AddRectFilled(ImVec2(cp.x, cp.y + band_y), ImVec2(cp.x + card_w, cp.y + band_y + 50),
        IM_COL32(0, 212, 255, 8));

    ImGui::SetCursorPos(ImVec2(18, 16));

    // ── HEADER: Logo + Title + Version ──
    // Diamond
    float lx = cp.x + 36, ly = cp.y + 28;
    dl->AddCircleFilled(ImVec2(lx, ly), 20, IM_COL32(0, 212, 255, 25), 40);
    dl->AddQuadFilled(ImVec2(lx - 7, ly), ImVec2(lx, ly - 10), ImVec2(lx + 7, ly), ImVec2(lx, ly + 10), IM_COL32(0, 212, 255, 230));

    ImGui::SetCursorPos(ImVec2(52, 16));
    ImGui::PushStyleColor(ImGuiCol_Text, C_CYAN);
    ImGui::TextUnformatted("AETHER");
    ImGui::PopStyleColor();
    ImGui::SameLine(0, 6);
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted("SECURE MODULE LOADER");
    ImGui::PopStyleColor();

    // Version badge right-aligned
    std::string ver = "v" + config_.version;
    float vw = ImGui::CalcTextSize(ver.c_str()).x + 20;
    ImGui::SameLine(ImGui::GetCursorPosX() + card_w - vw - 42);
    ImGui::PushStyleColor(ImGuiCol_Button, withAlpha(C_PURPLE, 0.12f));
    ImGui::PushStyleColor(ImGuiCol_Text, C_PURPLE);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10);
    ImGui::Button(ver.c_str(), ImVec2(vw, 22));
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);

    // ── Separator ──
    ImGui::SetCursorPosY(44);
    dl->AddLine(ImVec2(cp.x + 20, cp.y + 52), ImVec2(cp.x + card_w - 20, cp.y + 52), IM_COL32(0, 212, 255, 25));
    ImGui::SetCursorPosY(58);

    // ── STATUS ROW ──
    const char* badge = ready ? "READY" : "INITIALIZING";
    ImU32 badge_col = ready ? IM_COL32(62, 240, 163, 255) : IM_COL32(255, 207, 92, 255);
    ImU32 badge_bg = ready ? IM_COL32(62, 240, 163, 25) : IM_COL32(255, 207, 92, 20);

    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted("STATUS");
    ImGui::PopStyleColor();
    ImGui::SameLine(ImGui::GetCursorPosX() + card_w - 140);
    // Badge
    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0,0,0,0));
    ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0,0,0,0));
    float bw = ImGui::CalcTextSize(badge).x + 20;
    ImGui::SetCursorPosX(ImGui::GetCursorPosX() - bw - 10);
    dl->AddRectFilled(ImGui::GetCursorScreenPos(), ImVec2(ImGui::GetCursorScreenPos().x + bw, ImGui::GetCursorScreenPos().y + 22), badge_bg, 10);
    dl->AddRect(ImGui::GetCursorScreenPos(), ImVec2(ImGui::GetCursorScreenPos().x + bw, ImGui::GetCursorScreenPos().y + 22), badge_col, 10);
    float bx = ImGui::GetCursorScreenPos().x + bw * 0.5f - ImGui::CalcTextSize(badge).x * 0.5f;
    ImGui::SetCursorPosX(ImGui::GetCursorPosX());
    // Just use text for the badge
    ImGui::PushStyleColor(ImGuiCol_Text, badge_col);
    ImGui::TextUnformatted(badge);
    ImGui::PopStyleColor();
    ImGui::PopStyleColor(3);

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 4);

    // Status dot + text
    ImGui::PushStyleColor(ImGuiCol_Text, ready ? C_GREEN : C_GOLD);
    dl->AddCircleFilled(ImVec2(cp.x + 24, cp.y + 82), 4, ready ? IM_COL32(62, 240, 163, 255) : IM_COL32(255, 207, 92, 255));
    ImGui::SetCursorPosX(32);
    ImGui::TextUnformatted(ready ? "ALL SYSTEMS NOMINAL" : "INITIALIZING SECURE MODULES");
    ImGui::PopStyleColor();

    // ── STEP SEGMENTS ──
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 8);
    float seg_start_x = cp.x + 20;
    float seg_w = (card_w - 40 - 12) / 4;
    float seg_y = ImGui::GetCursorScreenPos().y;
    for (int i = 0; i < 4; i++) {
        bool active = i < segments;
        ImU32 seg_col = active ? IM_COL32(0, 212, 255, 200) : IM_COL32(0, 212, 255, 30);
        dl->AddRectFilled(ImVec2(seg_start_x + i * (seg_w + 4), seg_y),
            ImVec2(seg_start_x + (i + 1) * seg_w + i * 4, seg_y + 5), seg_col, 3);
    }
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 12);

    // ── PROGRESS BAR ──
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted("PROGRESS");
    ImGui::PopStyleColor();

    std::string pct_str = std::format("{}%", pct);
    float pct_w = ImGui::CalcTextSize(pct_str.c_str()).x;
    ImGui::SameLine(card_w - pct_w - 36);
    ImGui::PushStyleColor(ImGuiCol_Text, C_CYAN);
    ImGui::TextUnformatted(pct_str.c_str());
    ImGui::PopStyleColor();

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 4);
    float prog_y = ImGui::GetCursorScreenPos().y;
    float prog_w = card_w - 36;
    dl->AddRectFilled(ImVec2(cp.x + 18, prog_y), ImVec2(cp.x + 18 + prog_w, prog_y + 8),
        IM_COL32(0, 212, 255, 20), 4);
    float fill = prog_w * ease;
    dl->AddRectFilled(ImVec2(cp.x + 18, prog_y), ImVec2(cp.x + 18 + fill, prog_y + 8),
        IM_COL32(0, 212, 255, 220), 4);
    // Shimmer
    float shimmer_x = cp.x + 18 + fmodf(now * 80, prog_w);
    dl->AddRectFilled(ImVec2(shimmer_x, prog_y), ImVec2(shimmer_x + 30, prog_y + 8),
        IM_COL32(255, 255, 255, 40), 4);

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 16);

    // ── CONSOLE LOG ──
    float console_h = 170;
    float console_y = ImGui::GetCursorScreenPos().y;

    // Console border bg
    dl->AddRectFilled(ImVec2(cp.x + 18, console_y), ImVec2(cp.x + card_w - 18, console_y + console_h),
        IM_COL32(4, 8, 12, 230), 8);
    dl->AddRect(ImVec2(cp.x + 18, console_y), ImVec2(cp.x + card_w - 18, console_y + console_h),
        IM_COL32(0, 212, 255, 30), 8);

    // Console title bar with dots
    float dot_y = console_y + 6;
    dl->AddCircleFilled(ImVec2(cp.x + 28, dot_y + 5), 4, IM_COL32(255, 95, 86, 255));
    dl->AddCircleFilled(ImVec2(cp.x + 40, dot_y + 5), 4, IM_COL32(255, 189, 46, 255));
    dl->AddCircleFilled(ImVec2(cp.x + 52, dot_y + 5), 4, IM_COL32(39, 201, 63, 255));

    ImGui::SetCursorPos(ImVec2(66, ImGui::GetCursorPosY() - console_h + 6));
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted("console \xe2\x80\x94 loader.log");
    ImGui::PopStyleColor();

    // Console log area
    ImGui::SetCursorPos(ImVec2(22, ImGui::GetCursorPosY() + 6));
    ImGui::PushStyleColor(ImGuiCol_ChildBg, ImVec4(0,0,0,0));
    ImGui::BeginChild("##console", ImVec2(card_w - 40, console_h - 32), false,
        ImGuiWindowFlags_AlwaysVerticalScrollbar);

    for (auto& log : logs_) {
        ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
        ImGui::TextUnformatted(log.time.c_str());
        ImGui::PopStyleColor();
        ImGui::SameLine(0, 4);
        ImGui::PushStyleColor(ImGuiCol_Text, C_MUTED);
        ImGui::TextUnformatted(log.tag.c_str());
        ImGui::PopStyleColor();
        ImGui::SameLine(0, 4);
        ImGui::TextUnformatted(log.text.c_str());
    }

    // Cursor blink
    if (ready) {
        ImGui::PushStyleColor(ImGuiCol_Text, C_CYAN);
        ImGui::TextUnformatted("ready >");
        ImGui::PopStyleColor();
        ImGui::SameLine(0, 2);
        int blink = (int)(now * 2) % 2;
        if (blink) ImGui::TextUnformatted("_");
        else ImGui::Text(" ");
    }

    // Auto-scroll
    if (scroll_to_bottom_) {
        ImGui::SetScrollHereY(1.0f);
        scroll_to_bottom_ = false;
    }

    ImGui::EndChild();
    ImGui::PopStyleColor(); // ChildBg

    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 6);

    // ── LAUNCH BUTTON ──
    ImGui::PushStyleColor(ImGuiCol_Button, withAlpha(C_CYAN, 0.3f));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, withAlpha(C_CYAN, 0.5f));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive, withAlpha(C_CYAN, 0.7f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(0, 14));

    float btn_w = card_w - 36;
    ImGui::SetCursorPosX(18);
    if (!ready) {
        ImGui::BeginDisabled();
        ImGui::Button("INITIALIZING", ImVec2(btn_w, 0));
        ImGui::EndDisabled();
    } else {
        ImGui::PushStyleColor(ImGuiCol_Text, C_BG);
        if (ImGui::Button("LAUNCH", ImVec2(btn_w, 0))) {
            // Launch action
        }
        ImGui::PopStyleColor();
    }

    ImGui::PopStyleVar(2);
    ImGui::PopStyleColor(3);

    // ── FOOTER: HWID + Ping ──
    ImGui::SetCursorPosY(ImGui::GetCursorPosY() + 8);
    ImGui::PushStyleColor(ImGuiCol_Text, C_DIM);
    ImGui::TextUnformatted("HWID \xc2\xb7 a4:f7:9c:2b:81");
    std::string ping = std::format("{} ms", 8 + rand() % 20);
    float pw = ImGui::CalcTextSize(ping.c_str()).x;
    ImGui::SameLine(card_w - pw - 36);
    ImGui::TextUnformatted(ping.c_str());
    ImGui::PopStyleColor();

    // ── Account info bar at very bottom ──
    ImGui::SetCursorPosY(card_h - 30);
    dl->AddLine(ImVec2(cp.x + 20, cp.y + card_h - 36), ImVec2(cp.x + card_w - 20, cp.y + card_h - 36),
        IM_COL32(0, 212, 255, 20));
    ImGui::SetCursorPosX(18);
    ImGui::PushStyleColor(ImGuiCol_Text, C_MUTED);
    ImGui::TextUnformatted(user_.username.c_str());
    ImGui::SameLine();
    ImGui::TextUnformatted(user_.two_fa_enabled ? "2FA: ON" : "2FA: OFF");

    auto remaining = auth::SessionManager::instance().inactivityRemaining();
    std::string sess = std::format("Session: {}m {:02d}s", (int)(remaining.count() / 60), (int)(remaining.count() % 60));
    float sess_w = ImGui::CalcTextSize(sess.c_str()).x;
    ImGui::SameLine(card_w - sess_w - 36);
    ImGui::TextUnformatted(sess.c_str());
    ImGui::PopStyleColor();

    // Logout button (small, top-right corner of card)
    ImGui::SetCursorPos(ImVec2(card_w - 70, 10));
    ImGui::PushStyleColor(ImGuiCol_Button, withAlpha(C_RED, 0.15f));
    ImGui::PushStyleColor(ImGuiCol_Text, C_RED);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 6);
    if (ImGui::Button("Exit", ImVec2(56, 22))) {
        logging_out_ = true;
        auth_service_.logout([this, enq = enqueue_](bool, std::string) { enq([this]() { logging_out_ = false; }); });
    }
    ImGui::PopStyleVar();
    ImGui::PopStyleColor(2);

    ImGui::EndChild(); // loader_card
    ImGui::PopStyleVar(); // ChildRounding
    ImGui::PopStyleColor(); // ChildBg

    ImGui::End(); // window
    ImGui::PopStyleColor(); // WindowBg
}

} // namespace ui::views

#pragma once

#include <imgui.h>

namespace ui::theme {

// ── AETHER palette (Claude Design CRT aesthetic) ──
inline constexpr ImVec4 C_BG{0.024f, 0.027f, 0.031f, 1.0f};        // #06070b
inline constexpr ImVec4 C_PANEL{0.071f, 0.094f, 0.129f, 1.0f};     // #121821
inline constexpr ImVec4 C_DARK{0.039f, 0.051f, 0.071f, 1.0f};      // #0a0d12
inline constexpr ImVec4 C_INPUT{0.016f, 0.024f, 0.031f, 1.0f};     // #040608
inline constexpr ImVec4 C_CYAN{0.0f, 0.831f, 1.0f, 1.0f};          // #00d4ff
inline constexpr ImVec4 C_CYAN2{0.0f, 0.831f, 1.0f, 0.5f};
inline constexpr ImVec4 C_PURPLE{0.545f, 0.361f, 1.0f, 1.0f};      // #8b5cf6
inline constexpr ImVec4 C_GREEN{0.243f, 0.941f, 0.639f, 1.0f};     // #3ef0a3
inline constexpr ImVec4 C_GOLD{1.0f, 0.812f, 0.361f, 1.0f};        // #ffcf5c
inline constexpr ImVec4 C_RED{1.0f, 0.35f, 0.45f, 1.0f};
inline constexpr ImVec4 C_WARN{1.0f, 0.75f, 0.2f, 1.0f};
inline constexpr ImVec4 C_TEXT{0.910f, 0.910f, 0.941f, 1.0f};      // #e8e8f0
inline constexpr ImVec4 C_MUTED{0.376f, 0.376f, 0.439f, 1.0f};     // #606070
inline constexpr ImVec4 C_DIM{0.271f, 0.329f, 0.388f, 1.0f};       // #455468
inline constexpr ImVec4 C_BORDER{0.0f, 0.831f, 1.0f, 0.2f};

// Backward compat aliases
inline constexpr ImVec4 kBackground = C_BG;
inline constexpr ImVec4 kSurface = C_PANEL;
inline constexpr ImVec4 kPanel = C_DARK;
inline constexpr ImVec4 kAccent = C_CYAN;
inline constexpr ImVec4 kAccentDim = C_CYAN2;
inline constexpr ImVec4 kPurple = C_PURPLE;
inline constexpr ImVec4 kGreen = C_GREEN;
inline constexpr ImVec4 kGold = C_GOLD;
inline constexpr ImVec4 kRed = C_RED;
inline constexpr ImVec4 kWarning = C_WARN;
inline constexpr ImVec4 kText = C_TEXT;
inline constexpr ImVec4 kTextMuted = C_MUTED;
inline constexpr ImVec4 kTextDim = C_DIM;
inline constexpr ImVec4 kBorder = C_BORDER;
inline constexpr ImVec4 kError = C_RED;
inline constexpr ImVec4 kSuccess = C_GREEN;

inline ImVec4 withAlpha(ImVec4 color, float a) { color.w = a; return color; }

inline void apply() {
    ImGuiStyle& s = ImGui::GetStyle();

    // Spacing
    s.WindowPadding    = ImVec2(18, 18);
    s.FramePadding     = ImVec2(12, 9);
    s.ItemSpacing      = ImVec2(10, 10);
    s.ItemInnerSpacing = ImVec2(8, 6);
    s.WindowRounding   = 10;
    s.ChildRounding    = 8;
    s.FrameRounding    = 6;
    s.PopupRounding    = 6;
    s.ScrollbarRounding= 6;
    s.GrabRounding     = 6;
    s.TabRounding      = 8;

    s.WindowBorderSize = 1;
    s.FrameBorderSize  = 1;
    s.ChildBorderSize  = 1;

    s.ScrollbarSize  = 8;
    s.GrabMinSize    = 8;
    s.WindowTitleAlign = ImVec2(0.5f, 0.5f);

    // ── Aggressive color override for ALL indices ──
    auto& c = s.Colors;

    // Text
    c[ImGuiCol_Text]           = C_TEXT;
    c[ImGuiCol_TextDisabled]   = C_MUTED;

    // Windows
    c[ImGuiCol_WindowBg]       = C_BG;
    c[ImGuiCol_ChildBg]        = C_PANEL;
    c[ImGuiCol_PopupBg]        = C_PANEL;

    // Borders
    c[ImGuiCol_Border]         = C_BORDER;
    c[ImGuiCol_BorderShadow]   = ImVec4(0,0,0,0);

    // Frames (input fields etc.)
    c[ImGuiCol_FrameBg]        = C_INPUT;
    c[ImGuiCol_FrameBgHovered] = ImVec4(0.04f,0.06f,0.09f,1);
    c[ImGuiCol_FrameBgActive]  = ImVec4(0.06f,0.08f,0.12f,1);

    // Titles
    c[ImGuiCol_TitleBg]             = C_PANEL;
    c[ImGuiCol_TitleBgActive]       = C_PANEL;
    c[ImGuiCol_TitleBgCollapsed]    = C_PANEL;

    // Menu
    c[ImGuiCol_MenuBarBg]      = C_DARK;

    // Scrollbar
    c[ImGuiCol_ScrollbarBg]        = ImVec4(0,0,0,0);
    c[ImGuiCol_ScrollbarGrab]      = withAlpha(C_CYAN, 0.25f);
    c[ImGuiCol_ScrollbarGrabHovered] = withAlpha(C_CYAN, 0.45f);
    c[ImGuiCol_ScrollbarGrabActive]  = withAlpha(C_CYAN, 0.7f);

    // Check/Mark
    c[ImGuiCol_CheckMark]      = C_CYAN;
    c[ImGuiCol_SliderGrab]     = C_CYAN;
    c[ImGuiCol_SliderGrabActive] = withAlpha(C_CYAN, 0.8f);

    // Buttons
    c[ImGuiCol_Button]          = withAlpha(C_CYAN, 0.2f);
    c[ImGuiCol_ButtonHovered]   = withAlpha(C_CYAN, 0.4f);
    c[ImGuiCol_ButtonActive]    = withAlpha(C_CYAN, 0.65f);

    // Headers (selectable items)
    c[ImGuiCol_Header]          = withAlpha(C_CYAN, 0.2f);
    c[ImGuiCol_HeaderHovered]   = withAlpha(C_CYAN, 0.35f);
    c[ImGuiCol_HeaderActive]    = withAlpha(C_CYAN, 0.5f);

    // Separator
    c[ImGuiCol_Separator]          = withAlpha(C_CYAN, 0.12f);
    c[ImGuiCol_SeparatorHovered]   = withAlpha(C_CYAN, 0.3f);
    c[ImGuiCol_SeparatorActive]    = withAlpha(C_CYAN, 0.45f);

    // Resize grip
    c[ImGuiCol_ResizeGrip]          = withAlpha(C_CYAN, 0.15f);
    c[ImGuiCol_ResizeGripHovered]   = withAlpha(C_CYAN, 0.35f);
    c[ImGuiCol_ResizeGripActive]    = withAlpha(C_CYAN, 0.5f);

    // Tabs
    c[ImGuiCol_Tab]                = withAlpha(C_CYAN, 0.12f);
    c[ImGuiCol_TabHovered]         = withAlpha(C_CYAN, 0.35f);
    c[ImGuiCol_TabSelected]        = withAlpha(C_CYAN, 0.5f);
    c[ImGuiCol_TabSelectedOverline]= withAlpha(C_CYAN, 0.3f);
    c[ImGuiCol_TabDimmed]          = withAlpha(C_CYAN, 0.08f);
    c[ImGuiCol_TabDimmedSelected]  = withAlpha(C_CYAN, 0.25f);

    // Misc
    c[ImGuiCol_TextSelectedBg]  = withAlpha(C_CYAN, 0.25f);
    c[ImGuiCol_NavCursor]       = C_CYAN;
    c[ImGuiCol_NavWindowingHighlight] = withAlpha(C_CYAN, 0.4f);
    c[ImGuiCol_NavWindowingDimBg] = ImVec4(0,0,0,0.6f);
    c[ImGuiCol_ModalWindowDimBg] = ImVec4(0,0,0,0.65f);

    // Plot
    c[ImGuiCol_PlotLines]       = C_CYAN;
    c[ImGuiCol_PlotLinesHovered] = C_PURPLE;
    c[ImGuiCol_PlotHistogram]   = C_CYAN;
    c[ImGuiCol_PlotHistogramHovered] = C_PURPLE;

    // Tables (Dear ImGui 1.91+)
    c[ImGuiCol_TableHeaderBg]      = C_DARK;
    c[ImGuiCol_TableBorderStrong]  = C_BORDER;
    c[ImGuiCol_TableBorderLight]   = withAlpha(C_CYAN, 0.08f);
    c[ImGuiCol_TableRowBg]         = ImVec4(0,0,0,0);
    c[ImGuiCol_TableRowBgAlt]      = withAlpha(C_CYAN, 0.03f);

    // Drag & Drop
    c[ImGuiCol_DragDropTarget]  = C_CYAN;
}

} // namespace ui::theme

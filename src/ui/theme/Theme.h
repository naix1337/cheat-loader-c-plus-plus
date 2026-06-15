#pragma once

#include <imgui.h>

namespace ui::theme {

// ── AETHER palette (matches Claude Design CRT aesthetic) ──
inline constexpr ImVec4 kBackground{0.024f, 0.027f, 0.031f, 1.0f};   // #06070b
inline constexpr ImVec4 kSurface{0.071f, 0.094f, 0.129f, 0.82f};     // rgba(18,24,33,0.82)
inline constexpr ImVec4 kPanel{0.039f, 0.051f, 0.071f, 0.86f};       // rgba(10,13,18,0.86)
inline constexpr ImVec4 kAccent{0.0f, 0.831f, 1.0f, 1.0f};           // #00d4ff
inline constexpr ImVec4 kAccentDim{0.0f, 0.831f, 1.0f, 0.35f};
inline constexpr ImVec4 kAccentGlow{0.0f, 0.831f, 1.0f, 0.55f};
inline constexpr ImVec4 kPurple{0.545f, 0.361f, 1.0f, 1.0f};         // #8b5cf6
inline constexpr ImVec4 kPurpleDim{0.545f, 0.361f, 1.0f, 0.3f};
inline constexpr ImVec4 kGreen{0.243f, 0.941f, 0.639f, 1.0f};        // #3ef0a3
inline constexpr ImVec4 kGold{1.0f, 0.812f, 0.361f, 1.0f};           // #ffcf5c
inline constexpr ImVec4 kRed{1.0f, 0.35f, 0.45f, 1.0f};
inline constexpr ImVec4 kWarning{1.0f, 0.75f, 0.2f, 1.0f};

// Backward-compat aliases for existing code
inline constexpr ImVec4 kError = kRed;
inline constexpr ImVec4 kSuccess = kGreen;
inline constexpr ImVec4 kText{0.910f, 0.910f, 0.941f, 1.0f};         // #e8e8f0
inline constexpr ImVec4 kTextMuted{0.376f, 0.376f, 0.439f, 1.0f};     // #606070
inline constexpr ImVec4 kTextDim{0.271f, 0.329f, 0.388f, 1.0f};      // #455468
inline constexpr ImVec4 kBorder{0.0f, 0.831f, 1.0f, 0.18f};
inline constexpr ImVec4 kBorderFocus{0.0f, 0.831f, 1.0f, 0.45f};

inline ImVec4 withAlpha(ImVec4 color, float alpha) {
    color.w = alpha;
    return color;
}

inline void apply() {
    ImGuiStyle& style = ImGui::GetStyle();

    // AETHER rounded elegance
    style.WindowRounding = 18.0f;
    style.ChildRounding = 15.0f;
    style.FrameRounding = 10.0f;
    style.PopupRounding = 10.0f;
    style.ScrollbarRounding = 8.0f;
    style.GrabRounding = 8.0f;
    style.TabRounding = 10.0f;

    style.WindowPadding = ImVec2(20.0f, 20.0f);
    style.FramePadding = ImVec2(14.0f, 10.0f);
    style.ItemSpacing = ImVec2(12.0f, 12.0f);
    style.ItemInnerSpacing = ImVec2(10.0f, 8.0f);

    style.WindowBorderSize = 1.0f;
    style.FrameBorderSize = 1.0f;
    style.ChildBorderSize = 1.0f;
    style.WindowTitleAlign = ImVec2(0.5f, 0.5f);

    style.ScrollbarSize = 8.0f;
    style.GrabMinSize = 8.0f;

    ImVec4* colors = style.Colors;
    colors[ImGuiCol_Text] = kText;
    colors[ImGuiCol_TextDisabled] = kTextMuted;
    colors[ImGuiCol_WindowBg] = kBackground;
    colors[ImGuiCol_ChildBg] = kPanel;
    colors[ImGuiCol_PopupBg] = kSurface;
    colors[ImGuiCol_Border] = kBorder;
    colors[ImGuiCol_BorderShadow] = ImVec4(0, 0, 0, 0);
    colors[ImGuiCol_FrameBg] = ImVec4(0.024f, 0.027f, 0.031f, 0.8f);
    colors[ImGuiCol_FrameBgHovered] = ImVec4(0.04f, 0.06f, 0.09f, 0.9f);
    colors[ImGuiCol_FrameBgActive] = ImVec4(0.05f, 0.08f, 0.12f, 1.0f);
    colors[ImGuiCol_TitleBg] = kSurface;
    colors[ImGuiCol_TitleBgActive] = kSurface;
    colors[ImGuiCol_TitleBgCollapsed] = kSurface;
    colors[ImGuiCol_MenuBarBg] = kPanel;
    colors[ImGuiCol_ScrollbarBg] = ImVec4(0, 0, 0, 0);
    colors[ImGuiCol_ScrollbarGrab] = withAlpha(kAccent, 0.3f);
    colors[ImGuiCol_ScrollbarGrabHovered] = withAlpha(kAccent, 0.5f);
    colors[ImGuiCol_ScrollbarGrabActive] = withAlpha(kAccent, 0.7f);
    colors[ImGuiCol_CheckMark] = kAccent;
    colors[ImGuiCol_SliderGrab] = kAccent;
    colors[ImGuiCol_SliderGrabActive] = withAlpha(kAccent, 0.8f);
    colors[ImGuiCol_Button] = withAlpha(kAccent, 0.25f);
    colors[ImGuiCol_ButtonHovered] = withAlpha(kAccent, 0.45f);
    colors[ImGuiCol_ButtonActive] = withAlpha(kAccent, 0.7f);
    colors[ImGuiCol_Header] = withAlpha(kAccent, 0.2f);
    colors[ImGuiCol_HeaderHovered] = withAlpha(kAccent, 0.4f);
    colors[ImGuiCol_HeaderActive] = withAlpha(kAccent, 0.55f);
    colors[ImGuiCol_Separator] = withAlpha(kAccent, 0.15f);
    colors[ImGuiCol_SeparatorHovered] = withAlpha(kAccent, 0.35f);
    colors[ImGuiCol_SeparatorActive] = withAlpha(kAccent, 0.5f);
    colors[ImGuiCol_ResizeGrip] = withAlpha(kAccent, 0.15f);
    colors[ImGuiCol_ResizeGripHovered] = withAlpha(kAccent, 0.35f);
    colors[ImGuiCol_ResizeGripActive] = withAlpha(kAccent, 0.5f);
    colors[ImGuiCol_Tab] = withAlpha(kAccent, 0.15f);
    colors[ImGuiCol_TabHovered] = withAlpha(kAccent, 0.4f);
    colors[ImGuiCol_TabSelected] = withAlpha(kAccent, 0.6f);
    colors[ImGuiCol_TextSelectedBg] = withAlpha(kAccent, 0.3f);
    colors[ImGuiCol_NavCursor] = kAccent;
}

/// Draw the AETHER diamond logo at the given position with a glow
inline void drawLogo(ImDrawList* draw_list, ImVec2 center, float size) {
    const auto col = ImGui::ColorConvertFloat4ToU32(kAccent);
    const auto glow = ImGui::ColorConvertFloat4ToU32(withAlpha(kAccent, 0.3f));

    // Outer glow ring
    draw_list->AddCircleFilled(center, size * 1.6f, glow, 40);

    // Diamond shape (rotated square)
    const float half = size * 0.5f;
    draw_list->AddQuadFilled(
        ImVec2(center.x, center.y - half),
        ImVec2(center.x + half, center.y),
        ImVec2(center.x, center.y + half),
        ImVec2(center.x - half, center.y),
        col
    );

    // Inner highlight
    const auto hilight = ImGui::ColorConvertFloat4ToU32(withAlpha(kAccent, 0.6f));
    draw_list->AddQuadFilled(
        ImVec2(center.x, center.y - half * 0.55f),
        ImVec2(center.x + half * 0.55f, center.y),
        ImVec2(center.x, center.y + half * 0.55f),
        ImVec2(center.x - half * 0.55f, center.y),
        hilight
    );
}

} // namespace ui::theme

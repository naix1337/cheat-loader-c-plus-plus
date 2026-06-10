#pragma once

#include <imgui.h>

namespace ui::theme {

inline constexpr ImVec4 kBackground{0.039f, 0.039f, 0.059f, 1.0f};   // #0a0a0f
inline constexpr ImVec4 kSurface{0.067f, 0.067f, 0.094f, 1.0f};       // #111118
inline constexpr ImVec4 kAccent{0.0f, 0.831f, 1.0f, 1.0f};           // #00d4ff
inline constexpr ImVec4 kAccentDim{0.0f, 0.831f, 1.0f, 0.35f};
inline constexpr ImVec4 kText{0.910f, 0.910f, 0.941f, 1.0f};         // #e8e8f0
inline constexpr ImVec4 kTextMuted{0.376f, 0.376f, 0.439f, 1.0f};     // #606070
inline constexpr ImVec4 kError{1.0f, 0.35f, 0.45f, 1.0f};
inline constexpr ImVec4 kSuccess{0.2f, 0.9f, 0.55f, 1.0f};
inline constexpr ImVec4 kWarning{1.0f, 0.75f, 0.2f, 1.0f};

inline ImVec4 withAlpha(ImVec4 color, float alpha) {
    color.w = alpha;
    return color;
}

inline void apply() {
    ImGuiStyle& style = ImGui::GetStyle();

    style.WindowRounding = 10.0f;
    style.ChildRounding = 8.0f;
    style.FrameRounding = 6.0f;
    style.PopupRounding = 6.0f;
    style.ScrollbarRounding = 6.0f;
    style.GrabRounding = 6.0f;
    style.TabRounding = 6.0f;

    style.WindowPadding = ImVec2(16.0f, 16.0f);
    style.FramePadding = ImVec2(12.0f, 8.0f);
    style.ItemSpacing = ImVec2(10.0f, 10.0f);
    style.ItemInnerSpacing = ImVec2(8.0f, 6.0f);

    style.WindowBorderSize = 1.0f;
    style.FrameBorderSize = 1.0f;
    style.WindowTitleAlign = ImVec2(0.5f, 0.5f);

    ImVec4* colors = style.Colors;
    colors[ImGuiCol_Text] = kText;
    colors[ImGuiCol_TextDisabled] = kTextMuted;
    colors[ImGuiCol_WindowBg] = kBackground;
    colors[ImGuiCol_ChildBg] = kSurface;
    colors[ImGuiCol_PopupBg] = kSurface;
    colors[ImGuiCol_Border] = withAlpha(kAccent, 0.25f);
    colors[ImGuiCol_BorderShadow] = ImVec4(0, 0, 0, 0);
    colors[ImGuiCol_FrameBg] = ImVec4(0.05f, 0.05f, 0.08f, 1.0f);
    colors[ImGuiCol_FrameBgHovered] = ImVec4(0.08f, 0.08f, 0.12f, 1.0f);
    colors[ImGuiCol_FrameBgActive] = ImVec4(0.1f, 0.12f, 0.18f, 1.0f);
    colors[ImGuiCol_TitleBg] = kSurface;
    colors[ImGuiCol_TitleBgActive] = kSurface;
    colors[ImGuiCol_TitleBgCollapsed] = kSurface;
    colors[ImGuiCol_MenuBarBg] = kSurface;
    colors[ImGuiCol_ScrollbarBg] = kBackground;
    colors[ImGuiCol_ScrollbarGrab] = withAlpha(kAccent, 0.4f);
    colors[ImGuiCol_ScrollbarGrabHovered] = withAlpha(kAccent, 0.6f);
    colors[ImGuiCol_ScrollbarGrabActive] = kAccent;
    colors[ImGuiCol_CheckMark] = kAccent;
    colors[ImGuiCol_SliderGrab] = kAccent;
    colors[ImGuiCol_SliderGrabActive] = withAlpha(kAccent, 0.8f);
    colors[ImGuiCol_Button] = ImVec4(0.0f, 0.55f, 0.65f, 0.55f);
    colors[ImGuiCol_ButtonHovered] = ImVec4(0.0f, 0.7f, 0.82f, 0.75f);
    colors[ImGuiCol_ButtonActive] = ImVec4(0.0f, 0.83f, 1.0f, 0.9f);
    colors[ImGuiCol_Header] = withAlpha(kAccent, 0.25f);
    colors[ImGuiCol_HeaderHovered] = withAlpha(kAccent, 0.4f);
    colors[ImGuiCol_HeaderActive] = withAlpha(kAccent, 0.55f);
    colors[ImGuiCol_Separator] = withAlpha(kAccent, 0.2f);
    colors[ImGuiCol_SeparatorHovered] = withAlpha(kAccent, 0.45f);
    colors[ImGuiCol_SeparatorActive] = kAccent;
    colors[ImGuiCol_ResizeGrip] = withAlpha(kAccent, 0.2f);
    colors[ImGuiCol_ResizeGripHovered] = withAlpha(kAccent, 0.45f);
    colors[ImGuiCol_ResizeGripActive] = kAccent;
    colors[ImGuiCol_Tab] = withAlpha(kAccent, 0.2f);
    colors[ImGuiCol_TabHovered] = withAlpha(kAccent, 0.45f);
    colors[ImGuiCol_TabSelected] = withAlpha(kAccent, 0.65f);
    colors[ImGuiCol_TextSelectedBg] = withAlpha(kAccent, 0.35f);
    colors[ImGuiCol_NavCursor] = kAccent;
}

} // namespace ui::theme

#pragma once

#include "ui/theme/Theme.h"

#include <imgui.h>

#include <cmath>
#include <string>

namespace ui::components {

inline void drawSpinner(float radius, float thickness, ImVec4 color) {
    ImDrawList* draw_list = ImGui::GetWindowDrawList();
    const ImVec2 pos = ImGui::GetCursorScreenPos();
    const ImVec2 center(pos.x + radius, pos.y + radius);

    const float time = static_cast<float>(ImGui::GetTime());
    const int segments = 30;
    const float start = std::fabs(std::sin(time * 1.8f)) * 2.0f * 3.1415926f;

    draw_list->PathClear();
    for (int i = 0; i < segments; ++i) {
        const float angle =
            start + (static_cast<float>(i) / static_cast<float>(segments)) * 2.0f * 3.1415926f;
        draw_list->PathLineTo(
            ImVec2(center.x + std::cos(angle) * radius, center.y + std::sin(angle) * radius));
    }
    draw_list->PathStroke(ImGui::ColorConvertFloat4ToU32(color), thickness, ImDrawFlags_None);

    ImGui::Dummy(ImVec2(radius * 2.0f, radius * 2.0f));
}

inline bool button(const char* label, bool loading = false, bool disabled = false,
                   ImVec2 size = ImVec2(0, 0)) {
    if (loading || disabled) {
        ImGui::BeginDisabled();
    }

    ImGui::PushStyleColor(ImGuiCol_Button, theme::withAlpha(theme::kAccent, 0.35f));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, theme::withAlpha(theme::kAccent, 0.55f));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive, theme::withAlpha(theme::kAccent, 0.75f));

    const bool clicked = ImGui::Button(label, size);

    ImGui::PopStyleColor(3);

    if (loading) {
        ImGui::SameLine();
        drawSpinner(8.0f, 2.0f, theme::kAccent);
    }

    if (loading || disabled) {
        ImGui::EndDisabled();
    }

    return clicked && !loading && !disabled;
}

} // namespace ui::components

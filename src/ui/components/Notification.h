#pragma once

#include "ui/theme/Theme.h"

#include <imgui.h>

#include <algorithm>
#include <chrono>
#include <string>
#include <vector>

namespace ui::components {

enum class NotificationType { Success, Error, Warning };

struct NotificationItem {
    std::string message;
    NotificationType type;
    std::chrono::steady_clock::time_point created_at;
    float duration_seconds;
};

class NotificationStack {
public:
    void push(std::string message, NotificationType type, float duration_seconds = 4.0f);

    void render();

    void clear();

private:
    std::vector<NotificationItem> items_;
};

inline void NotificationStack::push(std::string message, NotificationType type,
                                    float duration_seconds) {
    items_.push_back(NotificationItem{std::move(message), type,
                                      std::chrono::steady_clock::now(), duration_seconds});
}

inline void NotificationStack::clear() { items_.clear(); }

inline void NotificationStack::render() {
    const auto now = std::chrono::steady_clock::now();
    items_.erase(
        std::remove_if(items_.begin(), items_.end(),
                       [&](const NotificationItem& item) {
                           const float elapsed = std::chrono::duration<float>(now - item.created_at)
                                                     .count();
                           return elapsed >= item.duration_seconds;
                       }),
        items_.end());

    if (items_.empty()) {
        return;
    }

    const ImVec2 display = ImGui::GetIO().DisplaySize;
    float y_offset = 16.0f;

    for (const NotificationItem& item : items_) {
        const float elapsed =
            std::chrono::duration<float>(now - item.created_at).count();
        const float alpha =
            elapsed > item.duration_seconds - 0.5f
                ? (item.duration_seconds - elapsed) / 0.5f
                : 1.0f;

        ImVec4 color = theme::kText;
        switch (item.type) {
        case NotificationType::Success:
            color = theme::kSuccess;
            break;
        case NotificationType::Error:
            color = theme::kError;
            break;
        case NotificationType::Warning:
            color = theme::kWarning;
            break;
        }

        color.w *= alpha;

        ImGui::SetNextWindowPos(ImVec2(display.x - 16.0f, y_offset), ImGuiCond_Always,
                                ImVec2(1.0f, 0.0f));
        ImGui::SetNextWindowBgAlpha(0.92f * alpha);

        ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.5f * alpha));
        ImGui::PushStyleColor(ImGuiCol_Text, color);

        const std::string window_id = "##toast_" + std::to_string(y_offset);
        ImGui::Begin(window_id.c_str(), nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_AlwaysAutoResize |
                         ImGuiWindowFlags_NoInputs | ImGuiWindowFlags_NoNav |
                         ImGuiWindowFlags_NoFocusOnAppearing | ImGuiWindowFlags_NoMove);
        ImGui::TextUnformatted(item.message.c_str());
        ImGui::End();

        ImGui::PopStyleColor(2);

        y_offset += 48.0f;
    }
}

} // namespace ui::components

#pragma once

#include "ui/theme/Theme.h"

#include <imgui.h>

#include <cstring>
#include <string>

// strncpy deprecation — use secure version
#pragma warning(disable : 4996)

namespace ui::components {

struct InputFieldResult {
    bool changed = false;
    bool submitted = false;
};

inline InputFieldResult inputField(const char* label, char* buffer, std::size_t buffer_size,
                                   const char* placeholder = nullptr, bool password = false,
                                   bool has_error = false, bool disabled = false) {
    InputFieldResult result{};

    ImGui::PushID(label);
    ImGui::TextUnformatted(label);
    ImGui::Spacing();

    if (has_error) {
        ImGui::PushStyleColor(ImGuiCol_Border, theme::kError);
    } else {
        ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.35f));
    }

    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);

    if (disabled) {
        ImGui::BeginDisabled();
    }

    ImGuiInputTextFlags flags = ImGuiInputTextFlags_None;
    if (password) {
        flags |= ImGuiInputTextFlags_Password;
    }

    const bool edited = ImGui::InputTextWithHint("##input", placeholder ? placeholder : "", buffer,
                                                 buffer_size, flags);
    result.changed = edited;
    result.submitted = ImGui::IsItemDeactivatedAfterEdit();

    if (disabled) {
        ImGui::EndDisabled();
    }

    ImGui::PopStyleVar();
    ImGui::PopStyleColor();
    ImGui::PopID();

    return result;
}

inline bool inputDigitsOnly(const char* label, char* buffer, std::size_t buffer_size,
                            int max_digits, bool disabled = false) {
    ImGui::PushID(label);
    ImGui::TextUnformatted(label);
    ImGui::Spacing();

    ImGui::PushStyleColor(ImGuiCol_Border, theme::withAlpha(theme::kAccent, 0.5f));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 1.0f);

    if (disabled) {
        ImGui::BeginDisabled();
    }

    const bool edited =
        ImGui::InputText("##digits", buffer, buffer_size,
                         ImGuiInputTextFlags_CharsDecimal | ImGuiInputTextFlags_AutoSelectAll);

    if (edited) {
        std::string filtered;
        filtered.reserve(std::strlen(buffer));
        for (const char* p = buffer; *p != '\0'; ++p) {
            if (*p >= '0' && *p <= '9' && static_cast<int>(filtered.size()) < max_digits) {
                filtered.push_back(*p);
            }
        }
        std::strncpy(buffer, filtered.c_str(), buffer_size - 1);
        buffer[buffer_size - 1] = '\0';
    }

    if (disabled) {
        ImGui::EndDisabled();
    }

    ImGui::PopStyleVar();
    ImGui::PopStyleColor();
    ImGui::PopID();

    return edited;
}

} // namespace ui::components

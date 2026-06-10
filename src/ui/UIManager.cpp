#include "ui/UIManager.h"

#include "ui/theme/Theme.h"

#include <imgui.h>

namespace ui {

UIManager::UIManager(auth::AuthService& auth_service, const core::AppConfig& config)
    : auth_service_(auth_service),
      config_(config),
      login_view_(auth_service, config,
                  [this](std::function<void()> task) { enqueueMainThread(std::move(task)); }),
      twofa_view_(auth_service, [this](std::function<void()> task) {
          enqueueMainThread(std::move(task));
      }),
      dashboard_view_(auth_service, [this](std::function<void()> task) {
          enqueueMainThread(std::move(task));
      }) {
    theme::apply();

    auth::SessionManager::instance().registerObserver(
        [this](auth::SessionState state) { onSessionStateChanged(state); });

    current_state_ = auth::SessionManager::instance().state();
    if (current_state_ == auth::SessionState::LoggedIn) {
        const auto user = auth::SessionManager::instance().currentUser();
        if (user.has_value()) {
            dashboard_view_.setUser(*user);
        }
    }
}

bool UIManager::loadFonts(const std::filesystem::path& app_directory) {
    ImGuiIO& io = ImGui::GetIO();

    const auto roboto = app_directory / "assets" / "fonts" / "Roboto-Regular.ttf";
    const auto jetbrains = app_directory / "assets" / "fonts" / "JetBrainsMono-Regular.ttf";

    if (std::filesystem::exists(roboto)) {
        primary_font_ = io.Fonts->AddFontFromFileTTF(roboto.string().c_str(), 17.0f);
    } else if (std::filesystem::exists(jetbrains)) {
        primary_font_ = io.Fonts->AddFontFromFileTTF(jetbrains.string().c_str(), 16.0f);
    }

    if (primary_font_ != nullptr) {
        io.FontDefault = primary_font_;
    }

    return true;
}

void UIManager::enqueueMainThread(std::function<void()> task) {
    std::lock_guard lock(queue_mutex_);
    main_thread_queue_.push_back(std::move(task));
}

void UIManager::processMainThreadQueue() {
    std::vector<std::function<void()>> tasks;
    {
        std::lock_guard lock(queue_mutex_);
        tasks.swap(main_thread_queue_);
    }

    for (auto& task : tasks) {
        if (task) {
            task();
        }
    }
}

void UIManager::onSessionStateChanged(auth::SessionState state) {
    enqueueMainThread([this, state]() {
        current_state_ = state;

        if (state == auth::SessionState::LoggedIn) {
            const auto user = auth::SessionManager::instance().currentUser();
            if (user.has_value()) {
                dashboard_view_.setUser(*user);
                notifications_.push("Login successful", components::NotificationType::Success);
            }
            login_view_.reset();
            twofa_view_.reset();
        } else if (state == auth::SessionState::Awaiting2FA) {
            twofa_view_.reset();
            notifications_.push("Enter your 2FA code", components::NotificationType::Warning);
        } else if (state == auth::SessionState::LoggedOut) {
            login_view_.reset();
            twofa_view_.reset();
        }
    });
}

void UIManager::update() {
    processMainThreadQueue();
    auth::SessionManager::instance().update();
}

void UIManager::render() {
    switch (current_state_) {
    case auth::SessionState::LoggedOut:
        login_view_.render();
        break;
    case auth::SessionState::Awaiting2FA:
        twofa_view_.render();
        break;
    case auth::SessionState::LoggedIn:
        dashboard_view_.render();
        break;
    }

    notifications_.render();
}

} // namespace ui

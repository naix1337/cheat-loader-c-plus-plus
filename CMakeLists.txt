cmake_minimum_required(VERSION 3.20)

project(cpp-auth-client
    VERSION 1.0.0
    DESCRIPTION "Windows C++20 ImGui secure authentication client"
    LANGUAGES CXX
)

# ---------------------------------------------------------------------------
# C++20
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ---------------------------------------------------------------------------
# Platform: Windows-only
# ---------------------------------------------------------------------------
if(NOT WIN32)
    message(FATAL_ERROR "cpp-auth-client is Windows-only (DirectX 11 + Win32).")
endif()

# ---------------------------------------------------------------------------
# Static MSVC runtime — single-exe deployment without extra CRT DLLs
# Requires vcpkg triplet x64-windows-static (see CMakePresets.json).
# ---------------------------------------------------------------------------
if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

# ---------------------------------------------------------------------------
# Build configurations
# ---------------------------------------------------------------------------
if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE "Release" CACHE STRING "Build type" FORCE)
    set_property(CACHE CMAKE_BUILD_TYPE PROPERTY STRINGS
        "Debug" "Release" "RelWithDebInfo" "MinSizeRel"
    )
endif()

# ---------------------------------------------------------------------------
# vcpkg dependencies
# ---------------------------------------------------------------------------
find_package(imgui CONFIG REQUIRED)
find_package(CURL CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)

# DirectX 11 ships with the Windows SDK — no vcpkg package required.
set(DX11_LIBS d3d11 dxgi d3dcompiler dwmapi shell32)

# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------
set(CLIENT_SOURCES
    src/main.cpp
    src/App.cpp
    src/core/Config.cpp
    src/core/Logger.cpp
    src/network/ApiClient.cpp
    src/network/TlsConfig.cpp
    src/auth/AuthService.cpp
    src/auth/SessionManager.cpp
    src/auth/TokenStore.cpp
    src/ui/UIManager.cpp
    src/ui/views/LoginView.cpp
    src/ui/views/TwoFAView.cpp
    src/ui/views/DashboardView.cpp
)

# WIN32 subsystem → WinMain entry point, no console window in Release
add_executable(${PROJECT_NAME} WIN32 ${CLIENT_SOURCES})

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# ---------------------------------------------------------------------------
# Link libraries
# ---------------------------------------------------------------------------
target_link_libraries(${PROJECT_NAME} PRIVATE
    imgui::imgui
    CURL::libcurl
    OpenSSL::SSL
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    spdlog::spdlog
    ${DX11_LIBS}
)

# ---------------------------------------------------------------------------
# Static linking defines (vcpkg x64-windows-static triplet)
# ---------------------------------------------------------------------------
if(VCPKG_TARGET_TRIPLET MATCHES "-static")
    target_compile_definitions(${PROJECT_NAME} PRIVATE
        CURL_STATICLIB
    )
endif()

# ---------------------------------------------------------------------------
# Compiler flags & preprocessor definitions
# ---------------------------------------------------------------------------
target_compile_definitions(${PROJECT_NAME} PRIVATE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
    UNICODE
    _UNICODE
    IMGUI_DISABLE_OBSOLETE_FUNCTIONS
    # Debug builds expose a console via AllocConsole() in main.cpp
    $<$<CONFIG:Debug>:DEBUG_BUILD>
)

if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE
        /W4
        /permissive-
        /utf-8
    )
    # Release: optimise for size/speed, no RTTI overhead beyond what we use
    target_compile_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/O2>
        $<$<CONFIG:Release>:/GL>
    )
    target_link_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/LTCG>
    )
endif()

# ---------------------------------------------------------------------------
# Post-build: copy runtime assets next to the executable
# ---------------------------------------------------------------------------
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/config"
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/assets/fonts"
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/logs"
    COMMENT "Creating runtime directories (config, assets/fonts, logs)"
)

# Copy example config if local config.json does not exist yet
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/config/config.example.json"
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/config/config.example.json"
    COMMENT "Copying config.example.json to output directory"
)

# Copy font assets when present (optional — README describes manual download)
file(GLOB FONT_FILES "${CMAKE_CURRENT_SOURCE_DIR}/assets/fonts/*.ttf")
foreach(FONT_FILE ${FONT_FILES})
    add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${FONT_FILE}"
            "$<TARGET_FILE_DIR:${PROJECT_NAME}>/assets/fonts"
        COMMENT "Copying font: ${FONT_FILE}"
    )
endforeach()

# ---------------------------------------------------------------------------
# Install target (optional packaging)
# ---------------------------------------------------------------------------
install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)
install(FILES config/config.example.json DESTINATION bin/config)
install(DIRECTORY assets/fonts/ DESTINATION bin/assets/fonts
    FILES_MATCHING PATTERN "*.ttf"
)

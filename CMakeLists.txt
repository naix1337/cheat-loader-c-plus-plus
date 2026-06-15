cmake_minimum_required(VERSION 3.20)

project(cpp-auth-client
    VERSION 1.0.0
    DESCRIPTION "Windows C++20 secure authentication client with WebView2 UI"
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
    message(FATAL_ERROR "cpp-auth-client is Windows-only (Win32 + WebView2).")
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
find_package(CURL CONFIG REQUIRED)
find_package(OpenSSL REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(spdlog CONFIG REQUIRED)
find_package(unofficial-webview2 CONFIG REQUIRED)

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
    src/ui/WebViewManager.cpp
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
    CURL::libcurl
    OpenSSL::SSL
    OpenSSL::Crypto
    nlohmann_json::nlohmann_json
    spdlog::spdlog
    unofficial::webview2::webview2
    d3d11 dxgi d3dcompiler dwmapi shell32
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
    $<$<CONFIG:Debug>:DEBUG_BUILD>
)

if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE
        /W4
        /permissive-
        /utf-8
    )
    target_compile_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/O2>
        $<$<CONFIG:Release>:/GL>
    )
    target_link_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/LTCG>
    )
endif()

# ---------------------------------------------------------------------------
# Post-build: bundle HTML assets next to executable
# ---------------------------------------------------------------------------
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/ui"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/src/ui/web"
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/ui"
    COMMENT "Copying WebView2 UI assets (HTML/CSS/JS)"
)

add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/config"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/config/config.example.json"
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/config/config.example.json"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/config/config.json"
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/config/config.json"
    COMMENT "Copying config files to output directory"
)

add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
        "$<TARGET_FILE_DIR:${PROJECT_NAME}>/logs"
    COMMENT "Creating logs directory"
)

# ---------------------------------------------------------------------------
# Install target
# ---------------------------------------------------------------------------
install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)
install(DIRECTORY src/ui/web/ DESTINATION bin/ui)
install(FILES config/config.example.json DESTINATION bin/config)

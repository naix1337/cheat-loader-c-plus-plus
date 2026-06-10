#include "App.h"

#include <Windows.h>

#include <cstdio>

#if defined(DEBUG_BUILD)

namespace {

void attachDebugConsole() {
    AllocConsole();

    FILE* stdout_file = nullptr;
    FILE* stderr_file = nullptr;
    freopen_s(&stdout_file, "CONOUT$", "w", stdout);
    freopen_s(&stderr_file, "CONOUT$", "w", stderr);
    SetConsoleTitleW(L"cpp-auth-client debug");

    HANDLE stdout_handle = GetStdHandle(STD_OUTPUT_HANDLE);
    if (stdout_handle != INVALID_HANDLE_VALUE) {
        CONSOLE_FONT_INFOEX font_info{};
        font_info.cbSize = sizeof(font_info);
        font_info.dwFontSize.Y = 16;
        font_info.FontWeight = FW_NORMAL;
        wcscpy_s(font_info.FaceName, L"Consolas");
        SetCurrentConsoleFontEx(stdout_handle, FALSE, &font_info);
    }
}

} // namespace

#endif

int APIENTRY WinMain(HINSTANCE instance, HINSTANCE /*prev_instance*/, LPSTR /*cmd_line*/,
                     int /*cmd_show*/) {
#if defined(DEBUG_BUILD)
    attachDebugConsole();
#endif

    App app(instance);
    if (!app.initialize()) {
        MessageBoxW(nullptr, L"Failed to initialize application. Check logs/client.log.",
                    L"cpp-auth-client", MB_OK | MB_ICONERROR);
        app.shutdown();
        return 1;
    }

    const int exit_code = app.run();
    app.shutdown();
    return exit_code;
}

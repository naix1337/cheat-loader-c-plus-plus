# Third-Party Dependencies

All C++ dependencies are managed via **vcpkg manifest mode** (`vcpkg.json` in the project root).
No git submodules are required.

## Setup

### Visual Studio 2026 (empfohlen)

Visual Studio ships with vcpkg. Set `VCPKG_ROOT` to the bundled instance:

```powershell
setx VCPKG_ROOT "C:\Program Files\Microsoft Visual Studio\18\Community\VC\vcpkg"
```

Restart Visual Studio, open the project folder, select the **release** or **debug** CMake preset, then build.

### Standalone vcpkg (optional)

```powershell
git clone https://github.com/microsoft/vcpkg.git C:\vcpkg
C:\vcpkg\bootstrap-vcpkg.bat
setx VCPKG_ROOT "C:\vcpkg"
cmake --preset release
```

## Packages

| Package        | Purpose                          |
|----------------|----------------------------------|
| imgui          | GUI framework (DX11 + Win32)     |
| curl[ssl]      | HTTPS client                     |
| openssl        | TLS backend for libcurl          |
| nlohmann-json  | JSON parsing                     |
| spdlog         | Structured logging               |

DirectX 11 is provided by the Windows SDK (no vcpkg package).

## Triplet

Use `x64-windows-static` for a self-contained executable without extra DLL dependencies.
Configured in `CMakePresets.json`.

$file = "C:\Users\Azubi\Documents\ntztwerktool\src\ui\WebViewManager.cpp"
$content = [System.IO.File]::ReadAllText($file)
$old = "    if (startsWith(html_str, ui_str) && std::filesystem::exists(html_path)) {
        navigate(html_path.wstring());  // BUG: should be file:/// URL
    } else {"
$new = "    if (startsWith(html_str, ui_str) && std::filesystem::exists(html_path)) {
        std::wstring file_url = L\"file:///\" + html_str;
        for (auto& c : file_url) { if (c == L'\\') c = L'/'; }
        navigate(file_url);
    } else {"
$content = $content.Replace($old, $new)
[System.IO.File]::WriteAllText($file, $content)
Write-Host "Done"
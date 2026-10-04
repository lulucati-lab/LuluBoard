param([int]$Port = 3000, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$appPath = Join-Path $projectPath 'excalidraw-app'
$dataPath = [IO.Path]::GetFullPath((Join-Path $projectPath '..\画布数据'))
$configPath = "$dataPath.settings.json"
$configuredDataPath = $dataPath
$url = "http://127.0.0.1:$Port"
$mutex = New-Object Threading.Mutex($false, "Local\ExcalidrawBoardLauncher-$Port")
$locked = $false
function Test-BoardReady {
    try {
        $result = Invoke-RestMethod -Uri "$url/api/local-boards" -TimeoutSec 2
        return ($null -ne $result.boards -and $result.dataPath -eq $configuredDataPath)
    } catch { return $false }
}
try {
    if (Test-Path -LiteralPath $configPath) {
        $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($config.version -ne 1 -or ![IO.Path]::IsPathRooted($config.dataPath)) { throw '画板保存位置配置无效。' }
        $configuredDataPath = $config.dataPath
    } else { $configuredDataPath = $dataPath }
    try { $locked = $mutex.WaitOne(45000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (!$locked) { throw '画板正在启动，请稍后再试。' }
    if (!(Test-BoardReady)) {
        $nodePath = Join-Path $projectPath 'runtime\node.exe'
        if (!(Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
        if (!(Test-Path -LiteralPath (Join-Path $appPath 'build\index.html'))) { throw '找不到画板构建文件，请先恢复项目。' }
        $logPath = Join-Path $env:LOCALAPPDATA '画板\logs'
        New-Item -ItemType Directory -Path $logPath -Force | Out-Null
        $env:BOARD_DATA_DIR = $dataPath
        $env:VITE_APP_ENABLE_ESLINT = 'false'
        $server = Start-Process -FilePath $nodePath -ArgumentList "../node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port $Port --strictPort" -WorkingDirectory $appPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "server-$Port.log") -RedirectStandardError (Join-Path $logPath "server-$Port-error.log")
        $deadline = [DateTime]::UtcNow.AddSeconds(35)
        while (!(Test-BoardReady)) {
            if ($server.HasExited) { throw "画板服务启动失败，端口 $Port 可能被占用。日志：$logPath" }
            if ([DateTime]::UtcNow -gt $deadline) { throw "画板启动超时，请稍后重试。日志：$logPath" }
            Start-Sleep -Milliseconds 300
        }
    }
    if (!$NoBrowser) { Start-Process "$url/?lng=zh-CN" }
} catch {
    if ($NoBrowser) { throw }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($_.Exception.Message, '画板', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoOutput = Join-Path $PSScriptRoot '../artifacts/demo/voice'
New-Item -ItemType Directory -Force $demoOutput | Out-Null
$demoVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$demoVoice.SelectVoice('Microsoft Zira Desktop')
$demoVoice.Rate = 1
$demoSegments = Get-Content -Raw (Join-Path $PSScriptRoot '../artifacts/demo/narration.json') | ConvertFrom-Json
try {
    foreach ($segment in $demoSegments) {
        $demoVoice.SetOutputToWaveFile((Join-Path $demoOutput ($segment.file + '.wav')))
        $demoVoice.Speak($segment.text)
        $demoVoice.SetOutputToNull()
    }
} finally {
    $demoVoice.Dispose()
}

# Optional offline draft narration. Replace with the team's voice for submission.
# Produces individual WAV files; no cloud TTS service or credentials needed.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoOutput = Join-Path $PSScriptRoot '../artifacts/demo/voice'
New-Item -ItemType Directory -Force $demoOutput | Out-Null
$demoVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$demoVoice.SelectVoice('Microsoft Zira Desktop')
$demoVoice.Rate = 0
$demoSegments = @(
    @{ file='01'; text='What if Twitch chat was not watching your spaceship, but keeping it alive? This is Last Signal. You fly. Chat keeps you alive.' },
    @{ file='02'; text='This is the working rehearsal, with simulated chat and the training pilot clearly enabled. Every command goes through the actual game engine. The shield, damage, and rescues are calculated in real time.' },
    @{ file='03'; text='Each viewer becomes a named drone around the ship. Shield absorbs asteroid damage. Boost increases our speed. Repair restores the hull. Every effective action earns contribution points.' },
    @{ file='04'; text='The first distress signal is Kepler. Fly into the amber ring to bring four survivors aboard. There are three pods, thirteen survivors, and only two minutes to reach the jump gate.' },
    @{ file='05'; text='All Hands takes a crew. Three different viewers activate three different stations within six seconds. That synchronized rescue pulse nearly doubles our tractor range. One person cannot do it alone.' },
    @{ file='06'; text='Asteroid impacts consume shields before they damage the hull. Repairs keep us alive. Engines give us time, with real acceleration from five point three to ten point five kilometers per second. Crew decisions have visible consequences.' },
    @{ file='07'; text='Every signal answered. Thirteen survivors home. And the people who made it happen get the credits. A repeatable community moment between games, during a break, or as a stream challenge.' },
    @{ file='08'; text='The game connects directly to real Twitch chat, without keys, using a read only connection. OAuth and EventSub are also implemented as an optional path. This recording uses the clearly labeled rehearsal crew. OBS mirrors the same mission.' },
    @{ file='09'; text='OpenAI Codex built the game engine, Twitch adapter, procedural Canvas artwork, React interface, and automated tests, then debugged the complete rescue. The repository includes the Codex session ID. Last Signal. No one gets home alone.' }
)
foreach ($segment in $demoSegments) {
    $demoVoice.SetOutputToWaveFile((Join-Path $demoOutput ($segment.file + '.wav')))
    $demoVoice.Speak($segment.text)
    $demoVoice.SetOutputToNull()
}
$demoVoice.Dispose()
Write-Output 'Draft narration WAV files generated.'

# Downloads prebuilt native binaries for react-native-audio-api.
#
# WHY THIS EXISTS:
# The library ships a bash script (scripts/download-prebuilt-binaries.sh) that Gradle runs
# before the C++ build. On Windows, Gradle resolves 'bash' to WSL bash, whose network stack
# often cannot reach the internet (Hyper-V bridge issues). The script exits 0 even on failure,
# so Gradle reports success but the files never land — then CMake fails on missing .a files.
# This script uses PowerShell's Invoke-WebRequest instead, which has no WSL networking issues.
#
# CALLED BY: package.json postinstall hook (runs automatically after npm install)
# TAG SOURCE: read from the library's own download script so it tracks library updates automatically.

$ErrorActionPreference = "Stop"

$EXTERNAL_DIR = "node_modules/react-native-audio-api/common/cpp/audioapi/external"
$ANDROID_DIR  = "$EXTERNAL_DIR/android"
$JNILIBS_DIR  = "node_modules/react-native-audio-api/android/src/main/jniLibs"

# Both directories present means the binaries are already downloaded — nothing to do.
if ((Test-Path $ANDROID_DIR) -and (Test-Path $JNILIBS_DIR)) {
    Write-Host "react-native-audio-api: prebuilt binaries already present, skipping download."
    exit 0
}

# Read the release tag from the library's own script so we stay in sync when the library updates.
$downloadScript = "node_modules/react-native-audio-api/scripts/download-prebuilt-binaries.sh"
if (-not (Test-Path $downloadScript)) {
    Write-Host "react-native-audio-api: download script not found, skipping."
    exit 0
}

$tagLine = Get-Content $downloadScript | Where-Object { $_ -match '^TAG=' }
$TAG = ($tagLine -replace 'TAG="(.*)"', '$1').Trim()
if (-not $TAG) {
    Write-Error "react-native-audio-api: could not read TAG from $downloadScript"
    exit 1
}

$BASE_URL = "https://github.com/software-mansion-labs/rn-audio-libs/releases/download/$TAG"
$TEMP_DIR = "rnaapi-binaries-temp"

Write-Host "react-native-audio-api: downloading prebuilt binaries (tag $TAG)..."
New-Item -ItemType Directory -Force $TEMP_DIR | Out-Null

try {
    if (-not (Test-Path $ANDROID_DIR)) {
        Write-Host "  Fetching android.zip..."
        Invoke-WebRequest -Uri "$BASE_URL/android.zip" -OutFile "$TEMP_DIR/android.zip" -UseBasicParsing
        New-Item -ItemType Directory -Force $EXTERNAL_DIR | Out-Null
        Expand-Archive -Path "$TEMP_DIR/android.zip" -DestinationPath $EXTERNAL_DIR -Force
        # Zips from macOS often contain a __MACOSX metadata folder — remove it.
        Remove-Item "$EXTERNAL_DIR/__MACOSX" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  android.zip extracted."
    }

    if (-not (Test-Path $JNILIBS_DIR)) {
        Write-Host "  Fetching jniLibs.zip..."
        Invoke-WebRequest -Uri "$BASE_URL/jniLibs.zip" -OutFile "$TEMP_DIR/jniLibs.zip" -UseBasicParsing
        $jniTarget = "node_modules/react-native-audio-api/android/src/main"
        New-Item -ItemType Directory -Force $jniTarget | Out-Null
        Expand-Archive -Path "$TEMP_DIR/jniLibs.zip" -DestinationPath $jniTarget -Force
        Write-Host "  jniLibs.zip extracted."
    }

    Write-Host "react-native-audio-api: binaries ready."
} finally {
    Remove-Item $TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
}

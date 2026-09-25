#!/bin/bash
# Manage the Android emulator used by `npm run test:android`.
#
#   scripts/android-emulator.sh create   # one-time: cmdline-tools + Google Play image + tablet AVD
#   npm run android:prep                 # one-time per AVD: Chrome first-run + command-line flag
#   scripts/android-emulator.sh start    # boot headless (add --window to see it)
#   scripts/android-emulator.sh stop
#   scripts/android-emulator.sh status
#
# Needs Android Studio (for its SDK + bundled JDK). Intel and Apple Silicon Macs.
set -uo pipefail
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$JAVA_HOME/bin:$SDK/platform-tools:$SDK/emulator:$PATH"
AVD="${AVD_NAME:-chordcrew_tablet}"
API="${ANDROID_API:-35}"
case "$(uname -m)" in arm64) ABI=arm64-v8a ;; *) ABI=x86_64 ;; esac
CMDTOOLS_ZIP=commandlinetools-mac-15641748_latest.zip
SDKM="$SDK/cmdline-tools/latest/bin/sdkmanager"
AVDM="$SDK/cmdline-tools/latest/bin/avdmanager"

booted() { [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; }

cmd_create() {
  if [ ! -x "$SDKM" ]; then
    echo "→ installing Android command-line tools"
    tmp=$(mktemp -d)
    curl -sSL -o "$tmp/$CMDTOOLS_ZIP" "https://dl.google.com/android/repository/$CMDTOOLS_ZIP" || exit 1
    (cd "$tmp" && unzip -q "$CMDTOOLS_ZIP") || exit 1
    mkdir -p "$SDK/cmdline-tools" && mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest" || exit 1
  fi
  # Google Play images are the ones that ship Chrome (google_apis images do not)
  IMG="system-images;android-$API;google_apis_playstore;$ABI"
  echo "→ installing $IMG (≈1.5 GB)"
  yes | "$SDKM" --install "$IMG" "platform-tools" "emulator" | grep -v '^\[' || exit 1
  DEV=$("$AVDM" list device 2>/dev/null | grep -o 'or "pixel_tablet"' | head -1 | sed 's/or //;s/"//g')
  [ -z "$DEV" ] && DEV="Nexus 10"
  echo "→ creating AVD $AVD ($DEV)"
  echo no | "$AVDM" create avd -n "$AVD" -k "$IMG" -d "$DEV" --force >/dev/null || exit 1
  CFG="$HOME/.android/avd/$AVD.avd/config.ini"
  sed -i '' '/^hw.ramSize=/d;/^hw.keyboard=/d;/^disk.dataPartition.size=/d' "$CFG"
  printf 'hw.ramSize=2048\nhw.keyboard=yes\ndisk.dataPartition.size=4G\n' >> "$CFG"
  # Play images burn CPU on sensors/camera/GPS emulation — none of it is needed for browser tests
  sed -i '' '/^hw\.accelerometer=/d;/^hw\.gyroscope=/d;/^hw\.sensors\./d;/^hw\.gps=/d;/^hw\.audioInput=/d;/^hw\.camera\./d' "$CFG"
  printf 'hw.accelerometer=no\nhw.gyroscope=no\nhw.sensors.proximity=no\nhw.sensors.light=no\nhw.sensors.pressure=no\nhw.sensors.humidity=no\nhw.sensors.magnetic_field=no\nhw.sensors.orientation=no\nhw.sensors.temperature=no\nhw.gps=no\nhw.audioInput=no\nhw.camera.back=none\nhw.camera.front=none\n' >> "$CFG"
  echo "✓ AVD ready — now: scripts/android-emulator.sh start && npm run android:prep"
}

cmd_start() {
  if booted; then echo "✓ emulator already running ($(adb devices | sed -n 2p | cut -f1))"; return; fi
  if ! emulator -list-avds 2>/dev/null | grep -qx "$AVD"; then
    echo "AVD $AVD not found — run: scripts/android-emulator.sh create"; exit 1
  fi
  # swiftshader_indirect is CPU-heavy but stable; `-gpu host` in headless mode made
  # Chrome die repeatedly on macOS (app died / privileged_process0 has died in logcat).
  args=(-avd "$AVD" -no-audio -no-boot-anim -no-snapshot-save -gpu "${EMU_GPU:-swiftshader_indirect}")
  [ "${1:-}" = "--window" ] || args+=(-no-window)
  echo "→ booting $AVD (${1:---headless})"
  nohup emulator "${args[@]}" > /tmp/chordcrew-emulator.log 2>&1 &
  adb wait-for-device
  for _ in $(seq 1 100); do booted && break; sleep 3; done
  if booted; then
    # Animations only cost CPU and make taps land on moving targets
    for k in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global $k 0; done
    echo "✓ booted: Android $(adb shell getprop ro.build.version.release | tr -d '\r'), Chrome $(adb shell dumpsys package com.android.chrome | grep -m1 versionName | sed 's/.*=//' | tr -d '\r')"
  else
    echo "✗ emulator did not boot — see /tmp/chordcrew-emulator.log"; exit 1
  fi
}

cmd_stop() { adb emu kill >/dev/null 2>&1 && echo "✓ emulator stopped" || echo "no emulator running"; }

cmd_status() {
  adb devices | sed 1d | grep . || { echo "no device"; return; }
  booted && echo "booted" || echo "not booted yet"
}

case "${1:-}" in
  create) cmd_create ;;
  start)  cmd_start "${2:-}" ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  *) sed -n 2,9p "$0"; exit 1 ;;
esac

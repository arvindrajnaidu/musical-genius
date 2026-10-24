#!/usr/bin/env bash
# Archive the iOS app, export an App Store IPA, and upload it to TestFlight.
# Uses an App Store Connect API key (no interactive Apple ID login needed).
#
# Everything has a default, so the usual invocation is just:
#   npm run ios:testflight
#
# Overridable via env:
#   ASC_ISSUER_ID  App Store Connect → Users and Access → Integrations →
#                  App Store Connect API → Issuer ID (a UUID)
#   ASC_KEY_ID     API key id (key file at
#                  ~/.appstoreconnect/private_keys/AuthKey_<id>.p8)
#   ASC_TEAM_ID    Apple Developer team id
#   BUILD_NUMBER   CFBundleVersion (default: timestamp, must be unique per version)
#   KEEP_ARCHIVES  How many recent Organizer archives to keep (default 3)
#
# The ids below are account identifiers, not secrets — they're useless without
# the .p8 private key, which stays outside the repo.
#
# Prereqs (one-time, in your Apple account):
#   1. An app exists in App Store Connect with bundle id com.musicalgenius.app
#   2. The API key has **Admin** access. App Manager is enough to upload a build
#      but NOT to create the iOS Distribution certificate that cloud signing
#      needs — an App Manager key fails at export with "Cloud signing permission
#      error / No signing certificate iOS Distribution found".
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEME="App"
PROJECT="ios/App/App.xcodeproj"
ARCHIVE="build/App.xcarchive"
EXPORT_DIR="build/export"
PLIST="ios/ExportOptions.plist"

TEAM_ID="${ASC_TEAM_ID:-P3F54L5BAH}"
KEY_ID="${ASC_KEY_ID:-GN653SWQKQ}"
KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
ASC_ISSUER_ID="${ASC_ISSUER_ID:-69a6de7e-a2a9-47e3-e053-5b8c7c11a4d1}"
BUILD_NUMBER="${BUILD_NUMBER:-$(date +%Y%m%d%H%M)}"
KEEP_ARCHIVES="${KEEP_ARCHIVES:-3}"

[ -f "$KEY_PATH" ] || { echo "Missing API key: $KEY_PATH"; exit 1; }

# Prune old Xcode Organizer archives so they don't pile up (each Distribute/open
# imports a fresh copy). Keep the newest $KEEP_ARCHIVES, delete the rest, then
# remove any now-empty date folders.
ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"
if [ -d "$ARCHIVES_DIR" ]; then
  echo "▸ Pruning old Organizer archives (keeping newest $KEEP_ARCHIVES)…"
  ls -dt "$ARCHIVES_DIR"/*/*.xcarchive 2>/dev/null | tail -n +$((KEEP_ARCHIVES + 1)) \
    | while IFS= read -r a; do rm -rf "$a"; done
  find "$ARCHIVES_DIR" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true
fi

AUTH=(-allowProvisioningUpdates
  -authenticationKeyPath "$KEY_PATH"
  -authenticationKeyID "$KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID")

echo "▸ Archiving (build $BUILD_NUMBER, team $TEAM_ID)…"
rm -rf "$ARCHIVE" "$EXPORT_DIR"
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release \
  -destination "generic/platform=iOS" -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$TEAM_ID" \
  "${AUTH[@]}" archive

echo "▸ Exporting IPA…"
xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$PLIST" -exportPath "$EXPORT_DIR" "${AUTH[@]}"

echo "▸ Uploading to TestFlight…"
xcrun altool --upload-app -f "$EXPORT_DIR/App.ipa" -t ios \
  --apiKey "$KEY_ID" --apiIssuer "$ASC_ISSUER_ID"

echo "✅ Uploaded build $BUILD_NUMBER. It will appear in TestFlight once Apple finishes processing."

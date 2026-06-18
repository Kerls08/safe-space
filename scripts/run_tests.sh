#!/usr/bin/env bash
set -euo pipefail

echo "Running functions tests (dry-run, USE_FIRESTORE=false)..."
pushd functions >/dev/null
export USE_FIRESTORE=false
npm ci
npm run build
npm test
popd >/dev/null

echo "Running Maven tests..."
mvn -B test

echo "All done."

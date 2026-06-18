Param()

Write-Host "Running functions tests (dry-run, USE_FIRESTORE=false)..."
Push-Location functions
$env:USE_FIRESTORE = 'false'
npm ci
npm run build
npm test
Pop-Location

Write-Host "Running Maven tests..."
mvn -B test

Write-Host "All done."

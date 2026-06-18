# Testing the Safe Space project

This project contains a Node/Functions component and a Java (Maven) backend. Your local environment must have the following installed to run the local tests:

- Node.js (v18 recommended)
- npm (comes with Node)
- Java (JDK 17 recommended)
- Maven

The repository includes a GitHub Actions workflow that runs both the Functions test runner and the Maven tests on push/PR: [.github/workflows/ci.yml](.github/workflows/ci.yml).

Local quick-start
1. Functions (dry-run mode — avoids writing to GCP Firestore):

```bash
cd functions
npm ci
export USE_FIRESTORE=false   # Windows PowerShell: $env:USE_FIRESTORE='false'
npm run build
npm test
```

2. Java tests:

```bash
cd ..
mvn -B test
```

Or use the provided helper scripts from the repo root:

Linux/macOS:
```bash
./scripts/run_tests.sh
```

Windows PowerShell:
```powershell
.
\scripts\run_tests.ps1
```

Notes
- The Functions test runner (`functions/test/run_test.js`) will attempt to use `lib/index.js` if present (the compiled TypeScript output). The CI workflow builds the TypeScript output before running the test runner.
- By default the CI workflow sets `USE_FIRESTORE=false` to avoid requiring GCP credentials; if you want to run against a real Firestore instance, set `USE_FIRESTORE=true` and ensure `GOOGLE_APPLICATION_CREDENTIALS` is configured in your environment or CI secrets.
- Email delivery is attempted via SendGrid if `SENDGRID_API_KEY` is set; otherwise the code falls back to EmailJS (if configured) or a dry-run log.

Troubleshooting
- If `node`, `npm`, or `mvn` commands are not found, install them or run tests inside CI (GitHub Actions) where these tools are provided.

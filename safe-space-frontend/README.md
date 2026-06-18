# Safe Space — Anonymous Rant Board (frontend)

This folder contains a standalone frontend for the Anonymous Rant Board. It is designed as the public student-facing interface and uses localStorage by default. Optional Firebase integration is supported for persistent storage and later backend alerting.

Quick test (local):

```bash
cd safe-space-frontend
d:/safe-space/.venv/Scripts/python.exe -m http.server 8001 --bind 127.0.0.1
# open http://127.0.0.1:8001/rant-board.html in your browser
```

Enable Firebase (optional):

1. Create a Firebase project at https://console.firebase.google.com/ and enable Firestore.
2. In the console, add a Web App and copy the config object.
3. Create `js/firebase-config.js` in this folder with the following content (replace values):

```js
window.firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app-id",
  storageBucket: "your-app-id.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

4. By default the app will attempt to load `js/firebase-config.js`; if not found it falls back to `js/firebase-config.example.js`.
5. For development you can set permissive Firestore rules; see `firestore.rules.example`.

Notes on security:
- The sample Firestore rules are intentionally permissive for quick testing. Do NOT use permissive rules in production.
- Consider requiring psychometrician authentication for reading flagged posts and using Cloud Functions to process alerts.

Next steps (recommended):
- Add a backend Cloud Function to generate `crisis_alerts` and send EmailJS/SendGrid notifications when flagged posts are created.
- Harden Firestore rules and require authenticated psychometrician users to access `crisis_alerts`.

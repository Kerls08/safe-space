Safe Space — Cloud Functions (local-friendly)

Files:
- `index.js` — scanner logic, exports `processPost(post)` and `findKeywordMatches(text)`.
- `keywords.json` — multilingual keyword lists (english, tagalog, bisaya).
- `test/run_test.js` — simple Node test runner that simulates posts.

Quick test (no external deps required):

1. From the repository root run:

```bash
node functions/test/run_test.js
```

This will use local fallbacks and create `functions/crisis_alerts_local.json` when alerts are triggered.

Optional (install deps):
```bash
cd functions
npm install
```

Optional environment variables:
- `SENDGRID_API_KEY` — if set and `@sendgrid/mail` is installed, the function will attempt to send emails via SendGrid.
- `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_USER_ID` — if provided, the function will attempt to send via EmailJS REST API as a fallback when SendGrid is not configured.
- `PSYCHOMETRICIAN_EMAIL` — override recipient email (default: psychometrician@ustp.edu.ph).
- `FROM_EMAIL` — override email sender (default: noreply@safespace.local).

Deployment:
- This is a local-friendly scaffold. To convert to a Firebase Cloud Function:
  - Add `firebase-functions` and export a `functions.firestore.document('posts/{id}').onCreate(...)` wrapper that calls `processPost` (already provided as `scanPostTrigger`).
  - Ensure `firebase-admin` is properly initialized with service account credentials or let the Cloud Functions runtime handle initialization.
  - Configure SendGrid key and email env vars via `firebase functions:config:set` or environment settings.

Deploying to Firebase
---------------------

1. Install the Firebase CLI and login:

```bash
npm install -g firebase-tools
firebase login
```

2. Update `.firebaserc` with your Firebase project id (replace `your-firebase-project-id`).

3. From the repo root, install functions deps and deploy (this will deploy hosting and functions):

```bash
cd functions
npm install
cd ..
firebase deploy --only hosting,functions
```

Notes:
- The Cloud Function exported is `scanPostTrigger` (listens to `posts/{id}` document creations and calls `processPost`).
- The function reads configuration from `process.env` and also from `firebase functions:config()` as a fallback.

Example `firebase functions:config:set` commands to configure SendGrid or EmailJS and recipient:

```bash
firebase functions:config:set sendgrid.key="YOUR_SENDGRID_KEY" \
  psych.email="psychometrician@ustp.edu.ph" \
  from.email="noreply@safespace.local"

# Or to set EmailJS values (fallback if SendGrid absent):
firebase functions:config:set emailjs.service="your_service_id" emailjs.template="your_template_id" emailjs.user="your_user_id"
```

You can also set `SENDGRID_API_KEY`, `EMAILJS_*`, `PSYCHOMETRICIAN_EMAIL`, and `FROM_EMAIL` as environment variables in your CI or runtime.

Anonymized Chat Callables
-------------------------

These callable functions let an anonymous student create a private chat and exchange messages with a professional without exposing the student's identity to other students.

Available callables (client usage via Firebase SDK `functions().httpsCallable(name)`):

- `createAnonymousChat({ pseudonym?: string })` -> { chatId, token, pseudonym }
  - Student calls this to create a private chat; store `token` in `localStorage` and `chatId` for future calls.

- `sendChatMessage({ chatId, content, token? })` -> { ok, id }
  - Student sends message by including the `token` returned at creation. Professionals call without `token` but must be authenticated and hold a professional claim/email.

- `fetchChatMessages({ chatId, token? })` -> { chatId, pseudonym, messages }
  - Student provides `token`; professional must be authenticated.

- `listPendingChats()` -> { chats }
  - Professionals only: list pending chats created by students.

- `closeChat({ chatId })` -> { ok }
  - Professionals only: close the chat.

Client example (Web, Firebase client SDK v9 modular example):

```js
import { getFunctions, httpsCallable } from 'firebase/functions';
const functions = getFunctions();

// create
const create = httpsCallable(functions, 'createAnonymousChat');
const { data } = await create({ pseudonym: 'Anon-Leaf' });
// data: { chatId, token, pseudonym }

// send (student)
const send = httpsCallable(functions, 'sendChatMessage');
await send({ chatId: data.chatId, content: 'Hello', token: data.token });

// fetch
const fetch = httpsCallable(functions, 'fetchChatMessages');
const resp = await fetch({ chatId: data.chatId, token: data.token });
console.log(resp.data.messages);
```

Security notes:
- Chat documents and messages are intentionally blocked from direct client access by `firestore.rules`. All chat operations go through the Cloud Functions callable endpoints which use the Admin SDK to read/write data.
- Professionals are identified by checking `context.auth.token` for admin/custom claim or institutional email domain; in production prefer to assign explicit custom claims (`role: 'psychometrist'`) to professional accounts for robust authorization.



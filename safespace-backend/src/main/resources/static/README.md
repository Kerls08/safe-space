# Safe Space — Anonymous Rant Board (frontend)

This folder contains the frontend for Safe Space. It connects directly to the Java Spring Boot REST API for posts, anonymous chat, crisis alerts, and admin dashboard operations.

Quick test (local):

```bash
cd safespace-frontend
# Open rant-board.html or serve using any static web server (e.g. VS Code Live Server or Vercel)
```

Backend Connection:
- The frontend connects to the backend REST API via `js/auth-guard.js` (`http://localhost:8080/api` or your deployed Render backend URL).


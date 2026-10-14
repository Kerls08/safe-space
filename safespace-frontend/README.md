# SafeSpace — Modern React Application (Vite + React 19)

SafeSpace is a privacy-first, anonymous campus mental health sanctuary engineered for university students, faculty, and clinical counselors.

This project is the complete, high-performance React SPA migration from the legacy vanilla multi-page application, achieving 100% visual, functional, and behavioral parity with zero regressions.

---

## 🏛️ System Architecture

### Multi-Tier Role-Based Access Control (RBAC)

The platform supports 5 access tiers governed by `AuthContext` and `ProtectedRoute`:

| Access Tier | Seed Account | Role Key | Primary Portal | Available Features |
| :--- | :--- | :--- | :--- | :--- |
| **Student** | `student` | `STUDENT` | `/rant-board` | Anonymous rant feed, reactions, crisis detector, breathing kit, 1-on-1 anonymous counselor chat, profile & pseudonyms. |
| **Staff Psychologist** | `psychologist` | `PROFESSIONAL` | `/pro-dashboard` | Analytics metrics, flagged posts review & moderation, live counseling chat queue, triage notes, crisis outreach. |
| **Clinic Head / Lead** | `psychometrician` | `SUPER_ADMIN` | `/pro-dashboard` | Full professional suite + campus counselor directory, registration of staff psychologists, admin transfer. |
| **System Maintenance** | `maintenance` | `MAINTENANCE` | `/system-maintenance` | Live telemetry, maintenance mode toggling, campus broadcast publisher, email gateway testing, user management, database hygiene, audit logs. |
| **Administrator** | `admin` | `ADMIN` | `/system-maintenance` | System maintenance + cross-domain administrative controls. |

*Default seed password for all test accounts: `SafeSpace2026!`*

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- SafeSpace Spring Boot Backend running on `http://localhost:8080`

### Installation
```bash
# Navigate to the frontend directory
cd safespace-frontend

# Install dependencies
npm install
```

### Running Locally
```bash
# Start Vite development server (runs on http://localhost:5173)
npm run dev
```

### Production Build
```bash
# Generate optimized production bundle in dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 🌐 Environment & Deployment Configuration

By default, the application connects to the local Spring Boot backend (`http://localhost:8080/api`) when running on `localhost`, and falls back to the live cloud backend on production.

To override the backend API endpoint (e.g. for staging or custom deployments), configure the `VITE_API_URL` environment variable:

```bash
# .env or Vercel Environment Variables
VITE_API_URL=https://your-backend-api-url.com/api
```

### Vercel Deployment
A production-ready `vercel.json` is included with SPA rewrites configured:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 📂 Project Structure

```
safespace-frontend/
├── public/                 # Static assets (favicon, SVG icons)
├── src/
│   ├── components/
│   │   └── common/         # Global layout components
│   │       ├── AppLayout.jsx            # Dynamic root shell
│   │       ├── Navbar.jsx               # Header navigation & profile dropdown
│   │       ├── ProtectedRoute.jsx       # RBAC authorization barrier
│   │       ├── SystemBanner.jsx         # Live maintenance & campus broadcast banners
│   │       ├── StudentBottomNav.jsx     # Docked student navigation
│   │       ├── ProfessionalBottomNav.jsx# Docked counselor navigation
│   │       └── MaintenanceBottomNav.jsx # Docked IT & maintenance navigation
│   ├── context/
│   │   └── AuthContext.jsx # Central authentication & session state
│   ├── pages/              # Domain feature pages
│   │   ├── Landing.jsx            # Public landing & crisis helplines
│   │   ├── Login.jsx              # Multi-role authentication & recovery
│   │   ├── Register.jsx           # Student self-registration
│   │   ├── RantBoard.jsx          # Anonymous campus feed & coping kit
│   │   ├── AnonChat.jsx           # 1-on-1 counseling support chat
│   │   ├── Profile.jsx            # User settings & security credentials
│   │   ├── ProDashboard.jsx       # Counselor analytics & moderation
│   │   ├── CrisisAlerts.jsx       # Real-time crisis alert triage
│   │   ├── ResourceManager.jsx    # Campus resources & hotlines CRUD
│   │   ├── Colleagues.jsx         # Counseling team directory & onboarding
│   │   ├── SystemMaintenance.jsx  # Platform controls, hygiene & audit
│   │   └── CredentialManager.jsx  # Account directory redirect
│   ├── services/
│   │   └── api.js          # Unified REST API client with Bearer auth
│   ├── styles/             # Modular CSS stylesheets
│   ├── App.jsx             # Client routing & legacy URL fallbacks
│   └── main.jsx            # React root entrypoint
├── vercel.json             # Vercel SPA rewrite rule
└── vite.config.js          # Vite build configuration
```

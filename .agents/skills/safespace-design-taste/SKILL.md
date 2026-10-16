---
name: safespace-design-taste
description: >-
  Elite UI/UX design taste and anti-slop engineering principles for the SafeSpace mental health
  and emotional support web system. Use whenever designing, redesigning, styling, reviewing, or
  auditing SafeSpace components, layouts, pages (Rant Board, Anonymous Chat, Crisis Alerts,
  Professional Dashboard, Landing, Profile, System Maintenance), styles, and micro-interactions.
---

# SafeSpace Design Taste: Anti-Slop UI/UX Engineering Manual

## 1. Core Philosophy: "Warm Therapeutic Modernism"

SafeSpace is not a generic B2B SaaS dashboard, an e-commerce storefront, a crypto web3 exchange, or a sterile clinical Electronic Medical Record (EMR). It is a dedicated **psychological sanctuary** for students dealing with emotional distress, seeking anonymous peer empathy, connecting in real-time with counselors, and for professionals triaging crisis alerts.

Every pixel must communicate **safety, dignity, warmth, and cognitive calm**.

### The Three Foundational Pillars
1. **Trauma-Informed Serenity:** Low sensory overload, no jarring high-stress popups, generous breathing room (macro-whitespace), and calming organic textures.
2. **Tactile Craftsmanship:** Interfaces must look like physical, warm, machined stationery and hardware—employing nested enclosures ("Double-Bezel" / Doppelrand architecture) rather than flat 1px gray borders.
3. **Gentle Kinetic Physics:** Motion must feel like a calming breath ("exhale physics"), using smooth cubic-beziers (`cubic-bezier(0.16, 1, 0.3, 1)`) without frantic bounces or sluggish delays.

---

## 2. Absolute Anti-Patterns ("Banned AI Slop")

Any generated UI or styling in SafeSpace that contains the following patterns **fails immediately**:

| Banned AI Trope | Why It Fails in SafeSpace | Required SafeSpace Alternative |
| :--- | :--- | :--- |
| **Purple/Cyan Neon Gradients** | Evokes generic crypto/AI SaaS hype; triggers visual fatigue. | **Compass Psychological Palette:** Warm cream canvas (`#FAF7F2`), midnight navy (`#161F36`), and muted powder blue (`#BACBD8`). |
| **Predictable 3-Card Symmetrical Grid** | Lazy AI template layout that feels impersonal and artificial. | **Asymmetric Editorial Layouts:** Varied column spans, contextual cards, visual tension, and staggered heights. |
| **Generic 1px Solid Gray Borders** | Look cheap, harsh, and unfinished. | **Double-Bezel Nesting:** Outer warm shell (`border: 1px solid rgba(224, 215, 198, 0.8)`) with pure white inner elevated card. |
| **Jarring Red Emergency Popups** | Induces panic in already distressed users. | **Calm Crisis Banners:** High-visibility but grounding terracotta/coral warnings with clear, accessible, non-threatening crisis hotline actions. |
| **Unanchored Fullscreen `100vh`** | Causes mobile Safari/Chrome address-bar viewport jumping. | **Mobile Dynamic Viewport:** Always use `min-height: 100vh; min-height: 100dvh;`. |
| **Centered 3-Line Title Wraps** | Hallmark of AI template text. | **Left-Anchored or Asymmetric Headlines:** With micro-eyebrow pills (`letter-spacing: 0.15em`). |
| **Linear or Jarring Instant Transitions** | Feels robotic, jerky, and unpolished. | **Organic Exhale Easing:** `transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1)`. |

---

## 3. Design System & Palette (Compass Psychological Services)

SafeSpace operates on an intentional, research-backed palette tailored for emotional grounding:

```css
:root {
  /* Core Compass Palette */
  --compass-navy: #161F36;        /* Deep Midnight Navy (Primary text, authority, grounding) */
  --compass-blue: #BACBD8;        /* Muted Powder Blue (Gentle accents, calming badges) */
  --compass-cream: #F2EDE2;       /* Soft Warm Linen (Card borders, secondary canvas) */
  --compass-white: #FFFFFF;       /* Crisp White (Inner focus containers, readability) */

  /* Surface & Derived Tones */
  --navy-dark: #0E1524;           /* Deep contrast shade */
  --navy-surface: #1E2B4A;        /* Elevated dark headers/banners */
  --navy-text-muted: #3D4D6E;     /* Secondary calming body text */
  --blue-hover: #9FB5C4;          /* Interactive hover state */
  --blue-tint: #E8EFF4;           /* Gentle highlight backgrounds */
  --cream-canvas: #FAF7F2;        /* Primary background canvas (eliminates harsh digital glare) */
  --cream-border: #E0D7C6;        /* Structural borders */

  /* Crisis & Functional States */
  --crisis-accent: #D9534F;       /* Urgent alert (used intentionally, never decorative) */
  --crisis-soft: #FDE8E8;         /* Background for urgent notification */
  --success-green: #3B7A57;       /* Sage/Forest Green (grounded success, not fluorescent) */
  --success-soft: #E8F4EC;        /* Soft green badge fill */

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* Shadows (Calibrated for warm depth, never harsh black) */
  --shadow-subtle: 0 1px 3px 0 rgba(22, 31, 54, 0.05);
  --shadow-card: 0 4px 16px -2px rgba(22, 31, 54, 0.08);
  --shadow-elevated: 0 12px 28px -4px rgba(22, 31, 54, 0.12);
  --shadow-floating: 0 20px 40px -6px rgba(22, 31, 54, 0.16);
}
```

---

## 4. Component Mastery: The SafeSpace "Double-Bezel" Architecture

### A. The Nested Content Card (Doppelrand)
Every major content card (Rant item, Chat container, Crisis card, Resource item) must feel like a tangible, high-end object:

```css
/* Outer Shell */
.safespace-shell {
  background: var(--compass-cream);
  border: 1px solid var(--cream-border);
  border-radius: 1.25rem;
  padding: 0.375rem;
  box-shadow: var(--shadow-card);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
}

.safespace-shell:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}

/* Inner Core Container */
.safespace-core {
  background: var(--compass-white);
  border-radius: calc(1.25rem - 0.375rem);
  padding: 1.25rem 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.9);
}
```

### B. Tactile "Button-in-Button" & Island Controls
Buttons must invite touch with clear affordances and a tactile press feedback:

```css
.btn-safespace-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  background: var(--compass-navy);
  color: var(--compass-white);
  padding: 0.65rem 1.25rem;
  border-radius: 9999px; /* Pill */
  font-weight: 600;
  font-size: 0.875rem;
  border: 1.5px solid var(--compass-navy);
  box-shadow: 0 4px 14px rgba(22, 31, 54, 0.18);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-safespace-primary:hover {
  background: #223152;
  transform: translateY(-1.5px);
  box-shadow: 0 8px 20px rgba(22, 31, 54, 0.22);
}

.btn-safespace-primary:active {
  transform: translateY(0) scale(0.98);
}

/* Trailing Icon Enclosure */
.btn-icon-capsule {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  transition: transform 0.2s ease;
}

.btn-safespace-primary:hover .btn-icon-capsule {
  transform: translateX(2px);
}
```

---

## 5. Domain-Specific UX Rules for SafeSpace Modules

### 1. Anonymous Rant Board (`/rant-board`)
- **Psychological Protection:** Always feature clear anonymity reassurance pills (e.g. `🛡️ 100% Anonymous & Ephemeral`).
- **Empathetic Micro-interactions:** Reaction buttons (Empathy, Hug, Validated, Relate) must feel heartwarming, not competitive like social media "likes".
- **Category Tagging:** Use soft pill tags with muted pastel backgrounds (`#E8EFF4` for Academic, `#FAF7F2` for Family, `#F3E8FF` for Venting).
- **Draft Safety:** Implement forgiving textarea states with auto-saving indicators to prevent accidental post loss.

### 2. Anonymous Peer & Counselor Chat (`/anon-chat`)
- **Asymmetric Bubble Architecture:**
  - *User messages:* Deep midnight navy (`#161F36`) with crisp white text, rounded corners (`1.25rem 1.25rem 0.25rem 1.25rem`).
  - *Peer/Counselor messages:* Soft warm cream (`#FAF7F2`) with dark text and subtle linen border, rounded corners (`1.25rem 1.25rem 1.25rem 0.25rem`).
- **Typing & Presence:** Unobtrusive, calm pulsing indicator (not frantic flashing).
- **Emergency Escape / Hotline Quick-Bar:** Pinned unobtrusively at the top or within reach: "In crisis? Call/Text 988 immediately."

### 3. Professional Hub & Crisis Alerts (`/pro-dashboard`, `/crisis-alerts`)
- **Cognitive Clarity for Counselors:** Counselors are under high stress. Use clean visual hierarchy to prioritize urgency without visual chaos.
- **Triage Badges:** Distinct severity scale:
  - `Low`: Powder blue (`#BACBD8` on `#E8EFF4`)
  - `Moderate`: Warm amber/ochre (`#D97706` on `#FEF3C7`)
  - `High`: Deep orange (`#EA580C` on `#FFEDD5`)
  - `Critical/Severe`: Controlled crimson (`#DC2626` on `#FEE2E2`)
- **Case Progression:** Smooth horizontal workflow columns or distinct card groups rather than cluttered data tables.

### 4. Navigation & Mobile Bottom Bars (`StudentBottomNav`, `MaintenanceBottomNav`)
- **Floating Island Navigation:** Detached from viewport bottom with soft shadow and rounded pill container:
  ```css
  .bottom-nav-island {
    position: fixed;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(16px);
    border: 1px solid var(--cream-border);
    border-radius: 9999px;
    padding: 0.5rem 1rem;
    box-shadow: var(--shadow-floating);
    z-index: 1000;
  }
  ```
- **Thumb Ergonomics:** Large 48px hit areas for easy mobile accessibility under stress.

---

## 6. Motion & Animation Standards

1. **Gentle Exhale Easing:**
   - Standard: `cubic-bezier(0.16, 1, 0.3, 1)` (fluid, decelerating smoothly).
   - Fast hover: `0.2s cubic-bezier(0.32, 0.72, 0, 1)`.
   - Never use `linear` or bouncy `cubic-bezier(0.68, -0.55, 0.265, 1.55)` which induces anxiety.
2. **GPU Performance Protocol:**
   - Animate exclusively via `transform` and `opacity`.
   - Never animate `height`, `width`, `margin`, or `top`.
   - Apply `backdrop-filter: blur(...)` only to sticky/fixed navigation components, never inside scrollable lists or heavy cards.

---

## 7. Pre-Flight Design Audit Checklist

Before delivering or committing any UI changes in SafeSpace, verify each item:

- [ ] **Palette Fidelity:** Only Compass Psychological Services colors used (`#161F36`, `#BACBD8`, `#F2EDE2`, `#FAF7F2`, `#FFFFFF`).
- [ ] **No Generic AI Slop:** No purple gradients, centered 3-card templates, or standard gray 1px borders.
- [ ] **Double-Bezel Architecture:** Major cards utilize nested outer shell + inner core styling.
- [ ] **Viewport Stability:** All full-height containers use `min-height: 100vh; min-height: 100dvh;`.
- [ ] **Cognitive Load:** Text is readable, section padding is spacious (`py-12` to `py-24`), headlines are left-anchored.
- [ ] **Trauma-Informed Polish:** Error states and alerts are calm, constructive, and non-punitive.
- [ ] **Mobile Ergonomics:** Touch targets are >= 44px; bottom navigation respects safe-area insets.
- [ ] **Pure Vanilla CSS:** Styles are added to semantic CSS files using CSS custom properties, preserving existing class conventions.

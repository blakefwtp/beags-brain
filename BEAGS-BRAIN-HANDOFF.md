# Beag's Brain — Complete Build Handoff

**Subtext:** "for the Moms who run the world"
**What it is:** A mobile-first dashboard/command center app for moms — calendar, groceries, to-dos, marriage health, school tracking, brain dump, and daily encouragement all in one place.

---

## CURRENT STATE

A working single-file HTML prototype exists at:

```
beags-brain.html (~4,074 lines — HTML + CSS + JS, no frameworks)
```

This prototype is functional and demonstrates the full UX vision including all 7 tabs, interactions, modals, color blocking, zoom, and the marriage dashboard. It should be used as the **definitive reference** for look, feel, layout, copy, and interaction patterns.

---

## DESIGN SYSTEM

### Typography
- **Headings / Dates:** Playfair Display (serif) — gives it the paper planner feel
- **Body / UI:** DM Sans (sans-serif) — clean, modern, warm
- Google Fonts import: `DM+Sans:wght@300;400;500;600;700` and `Playfair+Display:ital,wght@0,400;0,600;1,400`

### Color Palette (CSS custom properties)
```css
--white: #FFFFFF;
--off-white: #FAFAFA;
--cream: #F7F5F2;
--warm-gray: #E8E4DF;
--mid-gray: #B8B2A8;
--text-dark: #2D2926;
--text-medium: #6B6560;
--text-light: #9B9590;
--accent: #C8A88C;          /* warm tan — primary brand color */
--accent-hover: #B89878;
--accent-light: #F0E8DF;
--soft-pink: #F2E4DC;
--soft-green: #D4E4D0;
--soft-blue: #D4DFE8;
--soft-yellow: #F0EACD;
--soft-lavender: #E4DCE8;
--danger: #D4827A;
--success: #7AB88C;
```

### Design Language
- Clean white/cream backgrounds, lots of white space
- Rounded corners everywhere (`--radius: 16px`, `--radius-sm: 10px`, `--radius-xs: 6px`)
- Soft shadow system (`--shadow-sm`, `--shadow-md`, `--shadow-lg`)
- Warm, not sterile — should feel like a beautiful paper planner went digital
- **NO percentages anywhere.** Progress is always expressed as "3 of 5 days done" or "4 left" — never "60% complete" (feels like failing to a busy mom)

### Mobile-First Constraints
- `max-width: 430px` (iPhone Pro Max viewport)
- `user-scalable=no` on viewport meta
- `env(safe-area-inset-bottom)` for bottom nav padding
- Bottom sheet modals (slide up from bottom, with drag handle)
- Long-press context menus (like iMessage — touchstart/touchend with setTimeout)
- FAB (floating action button) for quick capture

---

## APP STRUCTURE — 7 TABS

Bottom navigation bar with 7 tabs. Each tab has its own unique icon color (not greyscale). The active tab shows a small colored dot below it.

### Tab Nav Colors
| Tab | Color | Icon |
|-----|-------|------|
| Home | `#C8A88C` (warm tan) | House |
| Calendar | `#8BB0C8` (soft blue) | Calendar |
| Grocery | `#80B878` (green) | Shopping cart |
| GSD | `#D4A05A` (amber) | Lightning bolt |
| Us | `#D4827A` (rosy) | Heart |
| Ideas | `#C0A8D0` (lavender) | Lightbulb |
| School | `#7AAFB8` (teal) | Book |

Inactive icons show at 50% opacity in their color. Active icons show at full opacity with the label in their color and a small dot underneath.

---

## TAB 1: HOME DASHBOARD (`tab-home`)

The landing screen. A daily command center.

### Sections (top to bottom):

1. **Greeting:** "Hey Mama" + date + "you've got X things today"

2. **Daily Encouragement (`daily-word`):** A rotating scripture-backed encouragement. Quippy, hilarious, slightly edgy, for boss moms. Examples:
   - "You made 47 decisions before 9 AM. The Supreme Court does like 80 a year." — James 1:5
   - "Today's prayer: Lord, give me the confidence of a toddler who just said 'no' to broccoli and meant it." — Hebrews 4:16
   - Rotates daily by day-of-year. Refresh button (↻) to see another.
   - 12 encouragements currently written. **Need more for production** (aim for 365).

3. **Mini Month Calendar (`month-hero`):** Compact month-at-a-glance with tiny colored event dots. Tapping it opens the full calendar tab. Shows color blocks from the color block system. Navigation arrows to browse months.

4. **This Week:** Upcoming events for the current week with colored dots and times.

5. **To-Do:** Checkbox list with color-coded date tags ("today", "Mar 25", "Fri"). Shows "X left" not percentages.

6. **Weekly Reminders (recurring):** Tasks that repeat weekly with "GO" buttons that launch timers. Examples: HelloFresh meal picks, meal planning, checking school folders, lunch prep.

---

## TAB 2: FULL CALENDAR (`tab-calendar`)

This is the star feature. A full-screen month-at-a-glance calendar that shows as much detail as possible.

### Key Features:

- **Full month grid** — 7 columns, fills the screen
- **Pinch-to-zoom** — NOT CSS transform scale. Dynamically changes font sizes, cell heights, padding, event text wrapping, grid width via touch gesture handling. Zoom range 1x–5x with smooth interpolation.
  - Zoom 1x: compact overview (8px event font, 60px cells, truncated text)
  - Zoom 5x: detailed view (22px event font, 280px cells, wrapped text, wide scrollable grid)
  - Also controllable via a range slider below the header
  - Double-tap: toggles between 1x and 2.5x
- **Color-coded event chips** — small colored pills per event (pink, green, blue, yellow, lavender)
- **Color blocking system** — solid background colors spanning multiple days for trips, school breaks, husband travel, etc.
  - Long-press a day → context menu → "Color Block Days" opens a bottom sheet modal
  - Modal has: 10 color swatches, date range picker, quick presets (Trip, Hub out of town, School break, Visitors, Solo parenting, Holiday), custom label input
  - Color blocks stored as: `{ id, color, label, startDate: 'YYYY-M-D', endDate: 'YYYY-M-D' }`
  - Blocks render as semi-transparent fills on calendar cells with small label text
  - Editing: long-pressing a day that already has a block pre-fills the modal. Can remove blocks.
- **Context menu on long-press** — calendar has special context menu with "Color Block Days" option, plus share to Google Cal
- **Today button** — jumps back to current month
- **Defaults to fully zoomed out** (zoom level 1) — user zooms in when they want detail

### Zoom Config Function:
```javascript
function getZoomConfig(z) {
  return {
    evFont: Math.round(8 + (z - 1) * 3.5),
    dateFont: Math.round(12 + (z - 1) * 4),
    todaySize: Math.round(20 + (z - 1) * 6),
    cellMinH: Math.round(60 + (z - 1) * 55),
    cellPad: Math.round(2 + (z - 1) * 3),
    evPad: Math.round(1 + (z - 1) * 2),
    evGap: Math.round(1 + (z - 1) * 1.5),
    wrap: z >= 1.8,
    evLineH: (1.35 + (z - 1) * 0.15).toFixed(2),
    gridWidth: Math.round(100 + (z - 1) * 45),
  };
}
```

---

## TAB 3: GROCERY LIST (`tab-grocery`)

### Features:
- **H-E-B integration concept** — shows H-E-B prices next to each item, "Sale" badges, store selector with distance
- **Order buttons:** H-E-B Curbside + Favor Delivery (bottom sheet modal for order confirmation with delivery slot picker and estimated total)
- **Categorized list:** Dairy & Eggs, Meat, Produce, Pantry & Snacks — each with checkboxes and H-E-B price matching
- **Order summary:** "16 items matched at H-E-B — ~$67.40"
- **Weekly deals banner:** highlights current sales at selected store
- **For production:** Deep-link to H-E-B Now / Favor apps, or API integration for real prices

---

## TAB 4: GSD — Get Sh*t Done (`tab-gsd`)

A focused task list with timer integration.

### Features:
- Each task has: checkbox, task name, subtitle/details, "GO" button
- GO button launches a countdown timer modal with configurable minutes
- Timer has start/pause/reset controls, visual countdown
- Completed tasks show struck through with "Done!" badge at reduced opacity
- Long-press for context menu (edit, move, pin, set reminder, delete)
- Vibe: "Pick one. Hit GO. Knock it out."

---

## TAB 5: US — Marriage Dashboard (`tab-marriage`)

The most unique feature. An emotional energy tracker that can push notifications to her husband.

### 4 Emotional Tanks:
1. **Touch & Romance** 🔥 — "Affection, intimacy, feeling desired — not just logistics partners"
2. **Quality Time** 💬 — "Real conversation, date nights, undistracted presence — not just coexisting"
3. **Help Around the House** 🏠 — "Sharing the load — dishes, bedtime, groceries, all the invisible work"
4. **Emotional Support** 💜 — "Feeling heard, validated, checked on — like he actually sees you"

### Tank Mechanics:
- Slider range 0–100 for each tank
- Level labels: "Running on E" (0-20), "Getting Low" (21-40), "Half Full" (41-60), "Good" (61-80), "Overflowing" (81-100)
- Color-coded: red/danger when empty → yellow when low → green when good → accent when overflowing
- Each slider has a different track color matching theme
- "Updated just now" timestamp below each

### Notification System:
- **Preview card** showing what the husband would see as a push notification on his phone
- Notification format: "Her [Tank] tank is running low — [contextual suggestion]"
- **Suggestion cards** — actionable nudges she can send: "Take bedtime tonight?", "Surprise her with coffee", "Plan a date night this week", etc.
- Suggestions dynamically change based on which tanks are lowest
- "Send this nudge" button with delivered confirmation animation

### Weekly Pulse:
- Shows overall relationship temperature for the week
- Displays each tank's current state

---

## TAB 6: IDEAS — Brain Dump (`tab-ideas`)

### Features:
- "Get it out of your head. Deal with it later."
- Categorized idea cards: Home Projects, Family Fun, For the Kids, Personal Goals, Gift Ideas
- Each category has a colored icon and expandable list
- Quick-add via FAB button or inline
- Long-press for context menu

---

## TAB 7: SCHOOL CURRICULUM (`tab-school`)

### Features:
- "Week 24 of 36" progress (expressed as X of Y, not percentage)
- **Child selector pills** — toggle between kids (e.g., "Liam — 3rd", "Emma — K")
- Subject cards: Math, Reading, Science, History, Electives
- Each subject shows: curriculum name, current unit/chapter, weekly assignment checklist
- Check off completed work
- Long-press for context menu

---

## GLOBAL INTERACTIONS

### FAB Quick-Add Button
- Floating action button (bottom-right, above nav bar)
- Expands to show quick-add options: Event, To-Do, Grocery Item, Idea
- Each option opens a simple bottom-sheet input modal
- Closes with tap-away or X button

### Long-Press Context Menus
- Trigger: 500ms touchstart hold
- Style: iMessage-like popup menu with icon + label rows
- Options: Edit, Move to..., Pin to Top, Set Reminder, Delete (red)
- Calendar has special context menu with "Color Block Days" option
- Tap backdrop to dismiss

### Bottom Sheet Modals
- Slide up from bottom with opacity backdrop
- Drag handle at top
- Rounded top corners
- Used for: quick-add forms, timer, order confirmation, color block picker

### Timer System
- Bottom sheet with large countdown display
- Start/pause toggle, reset option
- "Ready, Set, GO!" button text
- Shows task name at top

---

## SAMPLE DATA IN PROTOTYPE

The prototype includes realistic sample data for a mom named "Beag" (the user). Notable sample data:

### Calendar Events (March 2026):
- Mar 3: Soccer practice, Meal prep
- Mar 5: Dentist — kids, PTA meeting
- Mar 7: Date night
- Mar 10: Piano recital
- Mar 12: Field trip — zoo
- Mar 14: Birthday party — Liam
- Mar 18: Spring break starts
- Mar 20: Family beach day
- Mar 22: Grocery run, Meal prep
- Mar 24: Back to school
- Mar 26: Parent-teacher conf
- Mar 28: Soccer tournament

### Color Blocks (sample):
- "Blake in Dallas" — Mar 5–8 (soft blue #8BB0C8)
- "Spring Break" — Mar 16–20 (soft green #A8D0A0)
- "Mom solo week" — Mar 25–28 (soft rose #D4A0A0)

### Grocery Items:
- 16 items across 4 categories with realistic H-E-B prices
- Items: whole milk, eggs, cheddar, yogurt, chicken breasts, ground turkey, deli turkey, bananas, strawberries, spinach, avocados, sweet potatoes, goldfish crackers, bread, pasta, granola bars

---

## TECH DECISIONS FOR PRODUCTION BUILD

The prototype is a single HTML file. For a real app, here are the recommended paths:

### Option A: React Native / Expo (Recommended)
- Best for: actual iOS/Android app with push notifications (critical for marriage dashboard)
- Use Expo for fast iteration
- React Navigation bottom tabs
- AsyncStorage or SQLite for local data
- Push notifications via Expo Notifications (for husband nudges)
- Calendar: build custom with react-native-calendars or fully custom grid

### Option B: Next.js PWA
- Best for: web-first with installable mobile experience
- PWA for home screen install
- Web Push API for notifications
- Works on all devices without app store

### Key Technical Requirements:
1. **Push notifications** — essential for marriage dashboard (sending nudges to husband's phone)
2. **Local data persistence** — all data should survive app restarts
3. **H-E-B API integration** — for real-time prices, availability, and deep-linking to H-E-B app
4. **Calendar sync** — import from / export to Google Calendar, Apple Calendar
5. **Pinch-to-zoom** on calendar — NOT CSS transform, must dynamically resize all elements
6. **Touch-first** — all interactions designed for thumb use on phone
7. **Offline-capable** — should work without internet (sync when available)

---

## CRITICAL DESIGN RULES (NON-NEGOTIABLE)

1. **No percentages.** Ever. Use "3 of 5 done", "4 left", "Week 24 of 36". The user explicitly said percentages feel like failing.

2. **Mobile-first, phone-first.** 430px max. Everything designed for one-thumb use. Bottom nav, not top nav.

3. **Paper planner feel.** Playfair Display for dates and headings gives it warmth. Should feel like a beautiful planner, not a corporate SaaS dashboard.

4. **The calendar is the centerpiece.** Full-screen month view with maximum information density. Pinch-to-zoom to drill into detail. Color blocking for at-a-glance trip/schedule awareness.

5. **Quick capture everything.** FAB button lets you dump an event, to-do, grocery item, or idea in seconds. Get it out of your head.

6. **Daily encouragement is scripture-based, quippy, and funny.** Not cheesy Christian platitudes. Think: a hilarious best friend who also loves Jesus.

7. **Marriage dashboard is vulnerable and real.** The tank labels are honest ("Running on E", not "Needs improvement"). The suggestions are specific and actionable. The notification preview shows exactly what he'll see.

8. **Each nav icon has its own warm color** from the app palette. Not greyscale. Active state shows a dot below the icon.

9. **Warm, not cold.** Cream/white backgrounds, soft pastels, rounded corners, generous padding. This is a personal tool, not a productivity weapon.

---

## FILE REFERENCE

The complete working prototype is:

```
beags-brain.html
```

This single file contains ALL HTML structure, ALL CSS styling, and ALL JavaScript logic. It is the source of truth for every visual decision, every interaction pattern, every piece of copy, and every color choice. Open it in a browser at mobile width to see the full experience.

---

## WHAT'S DONE vs. WHAT NEEDS BUILDING

### Done (in prototype):
- All 7 tab layouts with full content
- Bottom nav with colored icons and active dot
- Mini calendar on home + full-screen calendar with zoom
- Color blocking system (add, edit, remove, presets)
- Pinch-to-zoom with dynamic resizing
- Marriage dashboard with 4 tanks, sliders, notifications, suggestions
- Grocery list with H-E-B prices and order flow
- GSD task list with timer integration
- Daily encouragement system with 12 entries
- Long-press context menus
- FAB quick-add button
- All CSS styling and animations
- Sample data throughout

### Needs Building for Production:
- Real data persistence (database / local storage)
- User authentication
- Push notification infrastructure (especially for husband nudges)
- H-E-B API integration for real prices/ordering
- Calendar sync (Google Cal, Apple Cal import/export)
- More encouragements (expand from 12 to 365)
- Onboarding flow (set up name, kids, husband's phone, preferred H-E-B store)
- Settings screen
- Data export/backup
- Recurring task engine (weekly reminders automation)
- Shared access for husband (read-only dashboard view + notification receipt)
- Image/photo attachments for ideas and events
- Search across all tabs
- Actual timer notifications (background audio/vibration when timer completes)

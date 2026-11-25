# Live bus map and the Bus supervisors tab

The owner said "go" on 25 Nov 2026 with these decisions: supervisors sign in with a one-time code from the school; each school can change its trip hours; for now the supervisor's phone keeps the page open with the screen on. The switch is `SCHOOL_APP_BUS_LIVE_ENABLED` (on for lms-test only), and each school turns the map on in its Bus supervisors tab.

## 1. School admin: new "Bus supervisors" tab
- **Supervisors:**
  - Add, edit and remove supervisors (name, phone).
  - Assign each one to one or more routes from the bus sheet.
  - The names and phones already in the bus sheet are suggested, so nothing is typed twice.
- **Sign-in:**
  - "Create sign-in code" for each supervisor. The code is shown once and can be printed.
  - "Sign out all devices" revokes access.
  - It works the same way as parent codes: no password, and the phone remembers the supervisor.
- **Controls:**
  - **Live bus map: On / Off** for the school. Off by default.
  - Per-route on/off.
  - **Trip hours:** sharing works only inside the school's windows (default 6:00–9:30 AM and 12:30–5:00 PM Cairo time).
  - Any trip stops by itself after 2 hours.
- **Stops on the map:** the admin taps the map to place each stop. This gives the parent's "your stop" pin and the arrival estimate. Stops without a pin still work, just with no estimate.
- **Live now:**
  - A map of every running trip.
  - The supervisor's name for each trip.
  - "Last update X sec ago".
  - Stop a trip remotely.
- **History:** who started and ended each trip, and when. No positions are kept.

## 2. The supervisor's phone (`/bus`)
- **Sign-in:** with the code, then the phone remembers the supervisor.
- **Trip:**
  - The supervisor taps **Start morning trip** or **Start afternoon trip** for their route.
  - The phone sends its position every 15 seconds.
  - The screen stays awake while the trip runs.
- **Notices:**
  - **"Running late: 5 / 10 / 15 / 20 min"** and **"Trip cancelled"** use the existing bus notices, so parents get the same notification as today.
  - **End trip** stops sharing.
- **Limitation:** this is a web page, so it must stay open with the screen on during the trip. iPhones stop location sharing when the page is in the background. The page warns the supervisor if updates stop. A native app could fix this later.

## 3. Parents
- **Where the map shows:** the bus card on Today and the Bus page show a live map while a trip runs. The map is OpenStreetMap: free, no key, and the library is loaded only on the Bus screens.
- **What the map shows:**
  - the bus,
  - the parent's stop,
  - "about N min away", worked out from the distance (shown only if the stop has a pin),
  - "Updated 20 sec ago".
- **When updates stop:** after 2 minutes without an update, the map greys the bus out and shows "Last seen 7:04".
- **No trip running:** the screen shows the schedule exactly as today.

## 4. Privacy (the bus position = the children's position)
- **Who sees it:** only parents of children assigned to that route and direction, and only while a trip is running.
- **How long it's kept:** positions are deleted when the trip ends. A safety timer also deletes anything older than 6 hours.
- **Who controls it:** the school switches it on, and every switch change is recorded.
- **What's never shared:** no position data goes to any outside service, and the supervisor's phone number is never shown to parents (the existing "Call supervisor" button stays as the school set it).

## Code
- Backend: `backend/src/schoolApp/busLive.ts` holds the models, the service, the supervisor token and the arrival estimate. The routes are in `schoolApp/routes.ts`: `/api/school-app/bus-live/*` for the school, `/api/bus/*` for the supervisor's phone, and `/api/parents/school/learners/:id/bus/live` for parents.
- Frontend: `frontend/bus/BusApp.tsx` is the supervisor page (`/bus`), `frontend/pages/BusAdmin.tsx` is the school admin tab, `frontend/parents/screens/BusLive.tsx` is the parent map, and `frontend/components/LiveMap.tsx` is the shared map (Leaflet with OpenStreetMap, loaded only on map screens).
- Tests: `backend/test/schoolApp/busLive.test.ts` and `e2e/tests/42-bus-live-map.spec.ts`.

## Door to door (owner "go" 25 Nov 2026)
Decisions: the parent sets the home and the school confirms it; all three parent notices are on ("about 5 minutes away", "Picked up", "Dropped off"); the supervisor sees the child's first name and the parents' note.
- **School:** the "Door to door" card in the Bus supervisors tab. Turn a route to door to door, order its children (↑ ↓), confirm or turn down a parent's point, or set a home on the map.
- **Parent:** the "Pickup point (home)" card on the Bus page. Tap the map or use the current location, add a note, then send it to the school. It shows "Waiting for the school" until the school confirms.
- **Supervisor (`/bus`):** "Next home" shows the child's first name, the note and a Directions link, with **Picked up / Dropped off** and **Not riding today**. A list of the trip's homes sits below.
- **Parent live map:** the bus and their home, with "about N min away" counted through the homes before theirs, plus "Picked up at …" or "Dropped off at home at …". In-app notices go to every parent of the child, in each parent's language.
- **Privacy:**
  - A home is seen by its own parents, the school, and the route's supervisor during a running trip.
  - Other parents never see it.
  - A home is deleted when the child is on no route.
- **Code and tests:** the code is `backend/src/schoolApp/busHomes.ts`, and the E2E scenario is `e2e/tests/43-bus-door-to-door.spec.ts`.

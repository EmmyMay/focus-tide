# Focus Tide

A small focus timer where every finished session raises a tide.

## What it should do

- A focus timer with presets of 25, 50 and 90 minutes, plus a custom length
  of 1–180 minutes. Start, pause, resume and cancel. The remaining time shows
  as mm:ss, and in the page title while running.
- A finished session is logged with its start time, length and an optional
  one-line label. A cancelled session is not logged.
- The "tide": a calm wave illustration whose water level rises with today's
  focused minutes toward a daily goal (default 120 minutes, editable). At or
  above the goal, the wave gets a soft glow.
- A week view: the last 7 days as columns showing focused minutes, with
  today highlighted.
- A streak counter: consecutive days, ending today or yesterday, that met
  the daily goal.
- Everything persists in `localStorage` and survives a refresh. A running
  timer resumes correctly after a refresh, based on wall-clock time, not
  ticks.
- Keyboard: Space starts/pauses, Escape cancels, and 1/2/3 pick the presets.
  The light/dark palette follows the system setting. Animations stop when the
  system asks for reduced motion. The layout works on phone widths.

## Constraints

- Plain HTML, CSS and ES modules only: no dependencies, no bundler, no CDN,
  no build step.
- Logic lives in DOM-free modules (timer state, session log, stats/streaks,
  storage with injectable storage) tested with Node's built-in runner:
  `node --test`.
- Serve with `python3 -m http.server 8000` and open http://localhost:8000.

Built by a team of agents in a LetAgents Git Room as a QA exercise.

## Run

```
python3 -m http.server 8000
```

Then open http://localhost:8000. The page is plain ES modules served from the
repository root, so no build step is required.

## Test

```
node --test
```

This runs every `tests/*.test.mjs` file with Node's built-in test runner.

## Module map

- `src/timer.mjs` — DOM-free timer state and wall-clock helpers.
- `src/stats.mjs` — daily totals, last-seven-days week and streaks.
- `src/sessions.mjs` — completed-session log and label normalization.
- `src/storage.mjs` — injectable persistence for the whole snapshot.
- `src/tide.mjs` — tide illustration whose level follows today's minutes.
- `src/week-view.mjs` — accessible seven-day column view.
- `src/accessibility.mjs` — keyboard controller and key-to-action helper.
- `src/app.mjs` — page shell that wires the modules together.

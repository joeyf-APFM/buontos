# UX adaptation: usability baseline (Phase 0 §0.6)

**Purpose:** record what today's Nucleus is like for non-technical users, *before* anything changes, so the final
report (Phase 4 §4.5) can compare before and after with the same tasks, the same users and the same metrics.

**Status (2026-11-17): pilot-user sessions BYPASSED by Joey** (local run, no users; the aim is that the app is usable and makes sense; question O5 closed). The tasks T1 to T5 below are executed by the **browser agent** through the UI as each persona (checklist section 3.10 in `instructions/test-checklist-browser-agent.md`). What changes versus the original plan:
- Participants, the welcome script and "time to finish" are dropped; the observer sheet is filled in by the agent: per task, **steps taken** (clicks), **dead ends**, **words a non-technical reader would not know**, **questions the screen leaves unanswered**, and pass/fail against the success criteria.
- Metrics: *T1 time-to-find* becomes *steps to find*; *T3 completion* stays; *unknown terms* becomes the agent's jargon list; *T2/T4 success* stay. They are an **expert review**, not user research: they show whether the app can be used and makes sense, not how real people would react.
- If real users become available later, the original script below is still valid.
Fill the result tables below during or right after each session. Keep this file as the raw record.

## 1. Setup

| Item | Value |
|---|---|
| App version tested | `development` @ _commit short sha, filled on the day_ |
| Environment | _dev deployment or local dev container; same one for the "after" run_ |
| Data | _list the products, contracts and glossary terms that exist, so the tasks are possible_ |
| Consumer persona | User menu → **Apply Role Override → Data Consumer** (admins and local dev). The override is stored on the server for that user, so clear it afterwards. It is an approximation: a genuine consumer account is better (request R8). Real Data Consumer = read-only on 10 features, no `settings`, no glossary |
| Producer persona | Same menu → **Data Producer** (read/write on data products and contracts) |
| Preview toggles | **Show Beta Features and Show Alpha Features both OFF** (decision D17; they were ON in the first capture, which exposed Catalog Commander to a consumer) |
| Window | 1280×800, same browser for every capture |
| Facilitator / note-taker | _names_ |
| Recording | _screen + audio only with each participant's consent; otherwise notes_ |

**Prerequisites (do not start sessions before these):**
1. Dev data is seeded: **done 2026-11-17** (`seed-data.md` section 5: 8 published products, 8 active contracts). Check the marketplace shows 8 products before each session.
2. The local Databricks token is fresh. **Real expiry: check `scripts/refresh-token.sh` output** (it prints the true expiry; on 2026-11-17 the 15:06 token had only 8 minutes left because the CLI returned a cached one, now fixed with `--force-refresh`; the current token expires 16:42). Check the red "workspace connection failed" banner is absent before each session; refresh and restart the backend if not.
3. Both preview toggles are off (D17).
4. A first manual capture exists as a reference: `instructions/10-baseline-observations.md` (12 screens, Data Consumer override, empty marketplace, toggles on). It is not the baseline: repeat it after 1 to 3.

**Before each session:** reset the test user's state (no leftover requests for the target product), confirm the
target products exist and are published, clear the browser's search box and history for the app.

## 2. Participants (O5)

3 to 5 non-technical pilot users (for example Finance). At least 3 consumers; at least 1 producer for T5.

| ID | Role / team | Uses data in their job? | Seen Nucleus before? | Session date |
|---|---|---|---|---|
| P1 | | | | |
| P2 | | | | |
| P3 | | | | |
| P4 | | | | |
| P5 | | | | |

Use the **same participants** for the "after" run where possible, and note who has now seen the app (learning effect).

## 3. Session script (30 minutes)

1. **Welcome (2 min).** "We are testing the app, not you. Think aloud. If something is unclear, that is useful
   to us. I will not help during the tasks unless you are completely stuck for 3 minutes."
2. **Tasks T1 to T5 (about 5 min each).** Read the task aloud once; give the written card; start the timer when
   the participant touches the mouse. Do not coach. If stuck for 3 minutes, note it as "failed (help given)".
3. **Wrap-up (3 min).** "What was the most confusing word or screen?" and "What would you have expected to see?"

## 4. Tasks and what counts as success

| Task | Wording for the participant | Success means |
|---|---|---|
| **T1** Find data for a stated business need | "Your manager asks how much the marketing team spends on campaigns by month. Find data that could answer it." | Reaches a plausible data product in **2 minutes or less**, without help |
| **T2** Say who owns it and whether it can be trusted | "Who owns this data, and would you trust it for a board report? How can you tell?" | Names the **owner team** and **one trust signal** (certification, quality, rating, description) |
| **T3** Request access | "Request access to this data for the monthly report." | Submits the request **with a purpose** and can say **what happens next** |
| **T4** Find the meaning of a business term | "What does 'Customer Lifetime Value' mean in this company?" | Reaches the definition |
| **T5** (producers only) Publish an existing table as a product | "You own the table `<catalog.schema.table>`. Make it available to others as a data product." | Completes a **draft product with a described contract** |

_Adjust the example wording to data that really exists in the test environment before the first session._

## 5. Observer sheet (copy one block per participant)

### Participant ___ , persona ___ , date ___

| Task | Time to finish (mm:ss) | Success (yes / yes-with-hesitation / failed / failed-help-given) | Hesitations and wrong turns (screens, clicks) | Words the user did not understand (exact words) | Quote |
|---|---|---|---|---|---|
| T1 | | | | | |
| T2 | | | | | |
| T3 | | | | | |
| T4 | | | | | |
| T5 | | | | | |

Wrap-up answers: _most confusing word or screen:_ ... _expected to see:_ ...

## 6. Metrics kept for the final comparison

| Metric | How it is computed | Baseline | After |
|---|---|---|---|
| T1 time-to-find | median seconds across consumer participants (failed = capped at 120) | | |
| T3 completion rate | participants who submitted with a purpose / participants | | |
| Unknown terms | number of **distinct** words participants did not understand (feeds vocabulary, plan `03` §1.4) | | |
| Nav items visible per role | count of sidebar entries for Consumer, Producer, Steward, Admin (read from the app, not guessed) | | |
| T2 trust-signal success | participants who named owner team and one trust signal / participants | | |
| T4 success | participants who reached the definition / participants | | |

## 7. Screenshots to capture (before any change)

Seven screens, each as **Consumer** and as **Producer** (14 images), taken against the real app at 1280×800 in the
same browser, with the top bar visible. Name them `<persona>-<screen>.png`.

| # | Screen | Route or action | Existing restyle baseline? |
|---|---|---|---|
| 1 | Home | `/` | consumer ✔, admin ✔ (mock API; main area only) |
| 2 | Marketplace | `/marketplace` | consumer ✔, admin ✔ |
| 3 | Product detail | `/data-products/<id>` | consumer ✔, admin ✔ |
| 4 | Request access | the dialog or wizard opened from a product's "Request access" / "Subscribe" button | no (dialog) |
| 5 | My requests | `/my-requests` | consumer ✔, admin ✔ |
| 6 | Glossary | `/concepts/browser` (and one term's detail) | consumer ✔, admin ✔ |
| 7 | Create product | the dialog from Products / My Products | no (dialog) |

The restyle baselines in `src/frontend/tests/e2e/__screenshots__/restyle/` are of the main area only, from a mock
API, in macOS Chrome 156, and exist for `consumer` and `admin` only. They are useful as "what the restyle looks like",
not as the "before" of the real app. Capture the 14 images fresh; keep the restyle baselines untouched.

## 8. Rules

- Never coach. Never explain the product. Write down exactly what the participant says.
- No real personal data on screen during recordings; use test data.
- Raw notes stay here; do not copy participant names into the Phase 0 report (use P1 to P5).

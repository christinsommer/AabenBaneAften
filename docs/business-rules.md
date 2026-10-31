# Business rules

This guide describes implemented behavior. Danish labels identify the corresponding UI actions. The [optimizer guide](../optimizer-service/README.md) explains scoring and search priorities.

## Calendar and registration

The home page selects an active test event, otherwise the next non-archived, non-cancelled date from today in Copenhagen. Dates come from `events`; administrators add them explicitly. An empty future calendar does not remove access to profiles or privacy administration.

Registration defaults open two days before play at 06:00 and close one day before at 12:00, interpreted in `Europe/Copenhagen`. Stored settings can override these defaults. Automatic draft events refresh their schedule until registration has started; manually customized schedules, test events, and published rounds are preserved. The event override can force open or closed; cancellation and planning in progress always close member registration.

Members request 0–3 hours and choose distinct configured start times. Zero hours means no participation. For positive requests, validation requires at least twice as many possible starts as requested hours, and enough non-overlapping one-hour starts to fulfill the request. Selecting adjacent times can include configured intermediate starts; gaps are not bridged. See `lib/signup.ts`.

Queue order is assigned per event by database triggers. Editing preferences keeps the position. Cancellation or zero hours gives it up; rejoining receives a new position. Active and waitlist status alone does not reset priority. Administrators can edit current registrations after closure/publication, but doing so does not automatically recalculate the plan. Conflicting concurrent edits are rejected.

After registration closes and before planning starts, existing active or waitlisted members with positive requested hours can still edit their wishes or select **Fjern mine ønsker**. Edits retain status and queue position; removal sets **Afbud** (`cancelled`), clears hours/times, and relinquishes the queue position. This does not allow new active registrations or active re-registration after cancellation. Late waitlist entry follows its existing deadline/first-match window.

Accepting **Algoritme foreslå kampe** creates a durable job and atomically sets the event's `planningInProgress` flag. Members see **Planlægning af kampe er i gang. Afvent venligst, til den endelige kampplan er klar.** Self-service wish edits/removal and waitlist entry are blocked, including from stale browser pages. Administrators cannot add members to the waitlist while the flag is set. Other authorized administrative corrections remain available.

The flag stays set when a calculation completes or fails, until **Offentliggør kampplan** clears it. Publication restores normal late-waitlist eligibility but does not reopen active wish editing. A new calculation sets the flag again. Rejected startup requests that never create a job do not set it.

## Ranking and age

The optimizer uses CR (`christin_ranking`), not free-text self-ranking or legacy `admin_level`. CR is an integer from 1 to 9; NULL needs administrator assessment before automatic scheduling. Strength is interpreted as `10 - CR`.

Initial CR is assigned server-side from self-ranking:

| Self-ranking | Initial CR |
| --- | ---: |
| A | 2 |
| A- | 3 |
| AB, B+ | 4 |
| B | 5 |
| B- | 6 |
| BC, C+ | 7 |
| C | 8 |
| C-, Begynder | 9 |

Matching ignores surrounding whitespace and case. For other text, the first applicable containment rule is A → 4, B → 6, C → 8; otherwise CR is NULL. Later self-ranking edits do not overwrite CR. CR review is an administrator workflow and does not itself control signup access.

Birth year is optional. The UI offers years from the current Copenhagen year minus 16 down to 1940. Age is derived from birth year; the legacy `age` column is not authoritative. Missing age does not prevent scheduling, and age scoring uses only known values.

## Courts and match constraints

- A match lasts 60 minutes. A player or court cannot have overlapping matches, including starts at 18:00 and 18:30.
- Consecutive matches for one player allow at most 30 minutes of rest: starts can be at most 90 minutes apart.
- Configured whole-hour and half-hour court lists define allowed courts and preference order. Start-time lists define the current schedule; there can be at most 32 court/time slots.
- Single matches are allowed only from 20:30. Doubles with two men and two women place one of each on each team.
- Players in a match have at most three CR points of difference, except the specific same-team spouse pair described below.
- `FactorDistanceSameTeamA` restricts partner CR distance when at least one partner has CR 1–4. Manual review can permit this specific exception and marks it; other hard constraints still apply.
- A partnership can occur only once per plan, except spouse mode 2 pairs.
- [Forbidden pairs](forbidden-player-pairs.md) cannot share a court as partners or opponents.
- Locked matches keep their court/teams but cannot override hard rules.

## Spouse choices

A member can select another member through profile search; this sets mode 1. Administrators can change the mode. A relationship registered on either member is sufficient; mode 2 takes precedence if both directions specify different modes. Rules apply when both people participate in the optimizer input. An absent partner does not prevent the attending member from playing.

| Mode | UI label | Rule |
| --- | --- | --- |
| 1 | “Spille samtidigt” | Each assigned match must pair with exactly one partner match starting no more than 30 minutes earlier or later |
| 2 | “Spille sammen med” | Both members must play in the same match on the same team |

For mode 1, 18:00/18:30 is allowed; 18:00/18:31 is not. The paired allocation still requires equal numbers of matches, so unequal requests can reduce fulfilled hours. One match cannot satisfy two of the partner's matches. This is separate from the player's own maximum-rest rule.

Mode 2 removes CR-distance restrictions and the partner CR-difference penalty only for that pair. It does not remove other players' constraints, history penalties, forbidden pairs, or mixed-team rules. Both the C# solver and TypeScript validator implement these requirements.

## Plans, publication, and manual edits

SuperAdmin configures the order and enabled state of 12 independent [optimization goals](../optimizer-service/README.md#configurable-objectives). Each calculation uses its own immutable copy. Hour coverage remains within requested hours, and all hard playing rules remain mandatory regardless of which goals are enabled or ranked first. Later stages cannot reduce earlier achieved objective values.

Calculation creates a draft; publication is explicit. The durable calculation flow retains the existing plan until a new result saves successfully. A valid time-limited solution can be saved without proof of optimality; the UI distinguishes that status.

Manual editing operates on eligible drafts with registration closed. Dragging or selecting a player and destination supports moves/swaps. Locked matches cannot be moved. Server review checks the result, calculates scores, and refuses conflicting or invalid saves. The reviewed partner-distance exception is highlighted separately from violations. The solver is not called for manual edits.

Changing schedule settings, signups, or exclusion lists does not silently rewrite existing plans. See [background jobs](optimizer-background-jobs.md) for conflicts and warnings during calculation.

## Finding a replacement

“Find en afløser” appears beside “Kampplan klar” for the published current event. Candidate selection uses the displayed imported plan when present, otherwise stored matches.

A candidate must be another open member with an active/waitlist registration, have fewer assigned hours than requested, and have no overlapping match during at least one of the requesting member's matches. The list shows matching free intervals and requested/assigned hours. A member with zero allocated hours can qualify. Ambiguous names in imported plans are not guessed.

This is a contact list, not an automatic substitution or a fully validated replacement proposal. It does not currently filter candidates by their originally selected availability, CR compatibility, spouse constraints, or forbidden pairs. Members must agree on the change; the button does not edit the plan. The older waiting-list suggestion flow has separate eligibility checks.

Email and phone are filtered independently on the server using `email_visible` and `phone_visible`, then displayed through the same contact component as the match plan. No contact icon appears if nothing can be shared. Administrators retain authorized access in member administration.

## Unfulfilled wishes and history

The unfulfilled-wishes report compares registrations against the displayed plan and includes requested, assigned, and missing hours. Duplicate names require manual review. Excel export appends the report below the matches; importing reads only the match rows.

Optimizer history uses up to three held, published rounds from 2026-09-18 onward, before the target event and today's date. Test/cancelled rounds and rounds without games are excluded; archived played rounds can count. “Last week” means the latest qualifying round. Unknown or ambiguous historical names stop conversion rather than assigning another person's history.

## Privacy lifecycle

Profile closure follows controlled pseudonymization and retains historical IDs and playing records. It is not a hard delete. Newsletter subscription is voluntary and separate from necessary service emails. See [privacy administration](../GDPR_ADMIN.md) and the [data model](../DATAMODEL.md).

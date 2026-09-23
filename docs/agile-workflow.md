# Phase 1: Agile workflow rules

Tracks [issue #1](https://github.com/Mahanyasa/Karmex-LTS/issues/1).

## Work items

- The backend derives completion from the selected stage. The last stage means complete; all other stages mean open.
- A completion toggle selects the last stage. Reopening an item in the last stage returns it to the first stage.
- Sending contradictory stage and completion values is rejected with HTTP 400.
- Items without a sprint use To do, In progress, Review, and Done. Custom stages come from the item's sprint.
- Moving to a different board without a sprint selection clears the old sprint. An explicit sprint must belong to the destination board.
- Moving completed work to the backlog, or deleting its sprint, preserves completion and uses Done. Open work returns to To do.
- Invalid types, priorities, points, labels, identifiers, and workflow stages are rejected before saving. Mongoose update validation remains enabled as a second check.
- Existing inconsistent stage/completion records are normalized when edited. There is no bulk migration in this phase.

## Sprints

- Legal progression is planned → active → completed. Repeating the current state is permitted.
- A planned sprint cannot be completed directly, and a completed sprint cannot be restarted.
- Starting a sprint while another is active returns HTTP 409 and does not reset either sprint.
- Board document saves use optimistic concurrency. Concurrent sprint changes return HTTP 409 so the client can refresh rather than overwrite another change.
- Sprint creation requires valid ordered dates, 2–8 distinct stage names (up to 60 characters each), and capacity between 0 and 10,000 points.
- Completing a sprint still retains its existing work items. Rollover and historical commitment snapshots are Phase 4.

## Shared access and save behavior

- Existing shared users can view sprint columns, backlog entries, and work-item details. Mutation controls are hidden or disabled; existing owner checks remain enforced by the API.
- Failed edits retain the editor and its draft without showing success.
- A successful save followed by a failed refresh is reported as saved with a refresh warning.
- The stage selector provides an alternative to dragging cards.

## Verification

From `backend`, run `npm test`.

From `frontend`, run `npm test -- --watchAll=false --runInBand` and `npm run build`.

Backend regression tests invoke real route handlers with mocked persistence/calendar calls. The concurrency test uses Mongoose document saves against a mocked collection to verify version predicates and conflict handling. UI tests render the real sprint component with a mocked API. These checks do not replace a deployed smoke test against MongoDB and live calendar providers.

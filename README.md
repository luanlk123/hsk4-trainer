# HSK4 Trainer V20 — Daily 30 + Day Tracker

- Day 1: 30 new words
- Day 2+: review the previous day's 30 first, then learn 30 new words
- Each Day has a fixed saved word set
- Current Day/session survives closing the browser or computer
- Progress and Day Tracker are stored in localStorage
- Progress page shows every Day, date, review count, new count, and completion
- Existing P1/P2/P3/P4, Mastered, Review, Vocabulary filters, backup/restore retained

## Run
```cmd
npm.cmd install
npm.cmd run dev
```


## Final Daily Learning System
- Day 1 assigns and permanently saves 30 new vocabulary IDs.
- Day 2+ permanently saves 30 new IDs and reviews the previous day's 30 IDs first.
- A Day cannot advance until all its review and new cards are completed.
- The exact active Day, card index, and exercise step are persisted.
- Closing the browser, terminal, or computer does not reset an unfinished Day.
- Progress shows per-Day review/new completion counts.
- Mastered words are excluded from future new-word pools but remain available for scheduled Day review.
- "Need Review" remains a persistent learning state and appears in Review Due.

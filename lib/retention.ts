// ─── Yahoo data retention window ──────────────────────────────────────────────
//
// Yahoo API Access and Use Agreement (executed 2026-08-07) section 13: Yahoo
// Fantasy Information may not be retained "longer than is reasonably necessary
// to support the Approved Use Case". The Approved Use Case on the cover page is
// a unified dashboard and weekly recap, which is a season-long product, so a
// season is the window we hold to. Nine months covers a full season from any
// connect date and expires before the next season starts, which means nothing
// Yahoo-derived is ever kept indefinitely.
//
// Deliberately NOT applied to:
//   - OAuth tokens. A token is a credential Yahoo issued us, not information
//     retrieved from the Yahoo Fantasy Database (agreement 1.e), and expiring
//     one would silently sign the user out.
//   - Sleeper and ESPN. This agreement does not cover them, and their stored
//     connections are the whole point of "capture once, phone forever".
//
// See docs/YAHOO_COMPLIANCE.md for the full clause-by-clause reading.

export const YAHOO_RETENTION_S = 270 * 24 * 3600;

# Devlog

One dated entry per session (or per meaningful chunk of a session), newest first. This does two
jobs at once and isn't trying to be two different documents: it's a quick way to remember what you
were doing and why when you come back after a gap, and it's exactly the kind of record a portfolio
reader wants to see — real decisions, real bugs, real dates, not a polished-after-the-fact summary.

## Format

Copy `_template.md`, rename it to `YYYY-MM-DD-short-slug.md`, fill it in. Keep it short — a few
bullet points per section is normal, and it's fine for a section to be empty. Low ceremony on
purpose: the entry should take a few minutes to write, not become its own chore.

## What goes in one

- **What you worked on.** One or two sentences, plain language.
- **What you decided, and why.** The "why" matters more than the "what" — a decision with no
  reasoning attached is just a fact, and you won't remember the reasoning in three weeks even if
  you remember the fact.
- **Bugs you hit and fixed.** Real ones. Include the ones that were annoying.
- **What's next.** Doesn't need to be more than a sentence — `state-of-play.md` is the canonical
  answer to this, so this can just point at it if nothing's changed.

## Don't

- Don't rewrite history. If a decision from two weeks ago turned out wrong, say so in a new entry
  — don't go back and edit the old one into having been right all along.
- Don't wait for something "worth writing up." A session where you fixed one annoying bug and
  didn't get to the real feature is still worth three lines here.

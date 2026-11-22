# Everyday activity setting (nt-7n5)

**Why.** The app counts all 16 waking hours not spent exercising as sitting (MET 1.3). The
owner is on their feet part of the day, so burn and targets were about 225 kcal/day low at
70 kg, which showed up as unexplained weight loss on a build-muscle target.

**Decided (with the owner).**
- New profile setting "Everyday activity", chosen in Settings:
  - Mostly sitting → MET 1.3 (`sedentary`, the default, so nothing changes for existing data)
  - On your feet part of the day → 1.5 (`moderate`)
  - On your feet most of the day / physical job → 1.7 (`active`)
- `computeTargets` uses that MET for the non-exercise waking hours. Everything that uses
  burn (Today, Activity breakdown, Progress analysis) follows automatically.
- Direct-calorie days are unchanged (the entered number replaces the activity estimate).
- Stored as `profiles.everyday_activity text not null default 'sedentary'` with a check on
  the three values. Additive migration, safe to apply **before** merging, so the owner applies
  it first and Settings never tries to save a column that doesn't exist.

**Approaches.** (1) This setting (chosen). (2) Raise the calorie adjustment override:
rejected, it hides the cause and leaves burn and implied burn wrong. (3) Wait for weight-trend
suggestions: rejected, about 225–450 kcal takes several 10 % steps.

**Not doing.** Per-day baseline, step-count import, changing exercise METs.

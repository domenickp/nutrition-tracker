# Per-day everyday activity override (nt-aa2)

**Why.** Settings' Everyday activity is the owner's usual level, but some days differ (a long
walk or yard work, or a day at a desk). The owner wants to change it for one day without
touching Settings.

**Decided (with the owner).**
- A selector "Everyday activity today" on **Today's Activity card** and on the **Activity
  screen**. Options: "Settings default (<current default label>)", then the three levels
  (Mostly sitting / On your feet part of the day / On your feet most of the day). On Today,
  changing it saves immediately and targets update; on the Activity screen it is part of the
  form and saves with **Save activity**, like the rest of that screen.
- Both screens edit the **same stored value**. Each shows a short note under the selector:
  "Same setting as on the <other screen> screen. Changing it in either place is enough."
- Stored as `daily_activity.everyday_activity` (nullable text, check in the three values,
  no default). Null means "use the Settings default". Choosing an override on a day without
  an activity row creates one in hours mode with zero hours. Choosing "Settings default"
  stores null.
- `computeTargets`: the baseline MET for non-exercise waking hours is
  `BASELINE_MET[activity?.everydayActivity ?? profile.everydayActivity]`. Direct-calorie
  days ignore it, so on those days the selector is shown **disabled** with a note that it
  isn't used on days with entered calories and how to switch the day to hours (nt-kig: the
  owner couldn't find it when it was hidden). Saving direct calories keeps any stored override
  (it only matters if the day goes back to hours).
- The Progress analysis and backups follow automatically (backups export the row; older
  backups lack the column, which imports as null).
- Migration: additive nullable column, applied by the owner **before** merging.

**Approaches.** Column on `daily_activity` (chosen). Rejected: a separate per-day table
(splits one day's activity across two places); a value kept only on the device (lost on
reload, invisible to Progress).

**Not doing.** Per-day overrides of anything else; changing the Settings default from Today.

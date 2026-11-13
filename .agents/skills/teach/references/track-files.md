# Track workspace files

Store track state under `.scratch/teach/<topic-slug>/`. Write `MISSION.md` when initializing a track, and create `NOTES.md`, `RESOURCES.md`, `GLOSSARY.md`, `learning-records/`, `reference/`, and `assets/` lazily on first write.

## MISSION.md

Captures why the user is learning this topic and anchors every lesson. Keep `MISSION.md` under 25 lines. If the user states a broad goal such as "learn Rust", interview until `Why` names a concrete outcome and `Success looks like` lists observable capabilities. Update `MISSION.md` in place and add a learning record when the user confirms a goal shift.

```markdown
# Mission: <Topic>

## Why
<One to three sentences stating the concrete real-world outcome.>

## Success looks like
- <Observable capability the user will gain>

## Constraints
- <Time, prior knowledge, pacing, or environment limits>

## Out of scope
- <Adjacent topics excluded to preserve focus>
```

## RESOURCES.md

Curates verified high-trust sources, including official documentation, specifications, peer-reviewed texts, and moderated practitioner communities. Annotate each entry with its scope and when to consult it, list missing coverage under `## Gaps`, remove shallow or inaccurate sources, and record when the user opts out of communities.

```markdown
# <Topic> Resources

## Knowledge

- [<Title>](<URL or repository path>)
  <Scope covered. Use for: specific concept or decision.>

## Wisdom (Communities)

- [<Community or Forum>](<URL>)
  <Moderation signal. Use for: critique or troubleshooting.>

## Gaps

- <Missing area requiring source verification>
```

## GLOSSARY.md

Defines canonical domain terms mastered by the user. Add a term only after the user applies it accurately, pick one canonical name with `_Avoid_` aliases, write one or two sentences stating what the term is, reuse existing glossary terms inside definitions, note field ambiguities under `## Flagged ambiguities` when terms collide, and update definitions in place as understanding deepens.

```markdown
# <Topic> Glossary

<One-sentence scope of this glossary.>

## Terms

**<Canonical Term>**:
<One or two sentence definition.>
_Avoid_: <Synonym 1>, <Synonym 2>
```

## learning-records/

Stores sequential decision-grade records (`0001-<slug>.md`, incrementing from the highest existing file number). Write a record only when one of these events occurs:

1. **Demonstrated mastery.** The user applies a non-trivial concept correctly, raising the floor for future lessons.
2. **Disclosed prior knowledge.** The user states existing familiarity and claimed depth.
3. **Corrected misconception.** The user replaces an incorrect mental model with an accurate one.
4. **Mission shift.** The user changes goals (link to `MISSION.md`).

Reserve learning records for these state transitions rather than lesson coverage logs or glossary definitions. When a later insight replaces an earlier record, keep the original file and add `Status: superseded by <NNNN>-<slug>.md` at the top.

```markdown
# <Short title of what was established>

<One to three sentences stating what was established and how it changes future lessons.>
```

Include optional `Status:`, `## Evidence`, or `## Implications` sections only when traceability adds value.

## NOTES.md and reference/

- **`NOTES.md`.** Record pacing preferences, preferred lesson depth, and workspace constraints. Read before planning each lesson and update when preferences change.
- **`reference/<name>.md`.** Store durable lookup tables, syntax guides, curriculum roadmaps, and algorithms without retrieval drills.

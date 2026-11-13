---
name: teach
description: Teach a skill or concept through grounded multi-session lessons organized by topic tracks.
disable-model-invocation: true
argument-hint: "Which topic would you like to learn about?"
---

# Teach

Deliver progressive, source-grounded lessons inside isolated topic tracks under `.scratch/teach/<topic-slug>/`, passing `--root <dir>` to `track.ts` when a repository designates another scratch directory.

## Track CLI

Run `.agents/skills/teach/scripts/track.ts` for track management and validation, consulting [references/track-files.md](references/track-files.md) when creating or updating `MISSION.md`, `NOTES.md`, `RESOURCES.md`, `GLOSSARY.md`, `learning-records/`, or `reference/` files:

- `bun .agents/skills/teach/scripts/track.ts status [topic]` inspects `tracks.json` and workspace files, printing `activeTrack`, `pendingLesson`, fuzzy matches, and next `NNNN` numbers; exits `0`.
- `bun .agents/skills/teach/scripts/track.ts init <topic> --title "<Title>"` creates `<topic-slug>/lessons/` and sets `activeTrack` in `tracks.json`; exits `0`.
- `bun .agents/skills/teach/scripts/track.ts use <topic-slug>` sets `activeTrack` to an existing track in `tracks.json`; exits `0` when found.
- `bun .agents/skills/teach/scripts/track.ts complete <topic-slug> [--lesson <N>]` advances `completedLessons` and `currentLesson` in `tracks.json`; exits `0`.
- `bun .agents/skills/teach/scripts/track.ts validate <lesson-path> [--sync]` checks structure, drills, Mermaid diagrams, assets, and links, optionally syncing `currentLesson`, and prints the exact `file://` URI; exits `0` when valid.

## Workflow

### 1. Resolve track and mission

Run `track.ts status "<topic>"` when a topic is named, or `track.ts status` when omitted, before researching external sources.

- **Explicit topic.** If an exact track exists and is inactive, run `track.ts use <topic-slug>`. If fuzzy matches appear without an exact match, ask whether to resume a matching track or start a new one, then end your turn.
- **Omitted topic.** If multiple tracks exist and the user is starting a fresh session rather than answering an active drill or interview, list tracks with `completedLessons` and `currentLesson` counts, ask which track to open or what new topic to start, and end your turn. If one track exists, use it. If none exist, ask what topic and outcome the user wants and end your turn.
- **New track or missing mission.** Interview the user until the real-world outcome, success criteria, constraints, and baseline prior knowledge are settled, ending your turn if any remain open. Once settled, run `track.ts init <topic-slug> --title "<Title>"`, write `MISSION.md`, and record baseline knowledge in `learning-records/0001-<slug>.md` and preferences in `NOTES.md` when disclosed.

Completion criterion: Active track is set in `tracks.json`, `MISSION.md` defines concrete success criteria, and all existing `NOTES.md`, `RESOURCES.md`, `GLOSSARY.md`, and `learning-records/*.md` files are read.

### 2. Review mastery and plan next concept

- **Evaluate replies.** When the user submits drill answers, demonstrates skill, corrects a misconception, or shifts goals, give direct feedback on their reasoning, write `learning-records/<NNNN>-<slug>.md` for non-trivial evidence or corrections, promote demonstrated canonical terms to `GLOSSARY.md`, and run `track.ts complete <topic-slug>`.
- **Build retention.** Check `NOTES.md` and `learning-records/*.md` to skip mastered material and choose the single next skill advancing `MISSION.md`, unless `NOTES.md` specifies a broader scope. When `completedLessons > 0` or `pendingLesson` is set, include brief spaced recall across prior concepts and connect related active tracks when helpful.
- **Ground facts.** Verify claims against directly read external documentation or inspected repository files, update `RESOURCES.md` with verified sources, practitioner communities, and any unverified access gaps, and cite only directly observed files or URLs in lesson headers and `Primary sources`.

Completion criterion: Observed mastery is persisted, `tracks.json` progress matches completed lessons, and the next scope is grounded in verified sources.

### 3. Author and validate deliverable

Write one self-contained Markdown lesson to `.scratch/teach/<topic-slug>/lessons/<NNNN>-<lesson-slug>.md` using the template below, or write durable lookup material to `.scratch/teach/<topic-slug>/reference/<name>.md`.

````markdown
# Lesson <NNNN>: <Title>

> **Eyebrow**: Teach Workspace · Topic: <Topic Title> · Lesson <NNNN> · ~<M> min read<br>
> **Source**: Grounded in <Verified Source or Observed Code Paths><br>
> **Workspace File**: `.scratch/teach/<topic-slug>/lessons/<NNNN>-<lesson-slug>.md`

---

## Problem statement

<Failure mode or limitation that makes this skill necessary.>

## Core concepts

<Rules, definitions, and grounded comparisons. Reserve GFM alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`) for critical constraints.>

## Interactive retrieval drill

Test your recall from memory before expanding each answer.

### Question 1

<Question testing application or cross-lesson synthesis>

* **A)** <Option A>
* **B)** <Option B>
* **C)** <Option C>

<details>
<summary>Reveal Answer & Explanation</summary>

> **Correct Answer: <A|B|C>**
>
> **Why:** <Explain why the correct answer holds and why each distractor fails.>
</details>

## Primary sources

* [<Source Title>](<URL or verified absolute file:// URI>)
````

Include two or three drill questions per lesson, match option lengths across choices, and vary the correct answer letter across questions. Add an image in `.scratch/teach/<topic-slug>/assets/<name>.<ext>` embedded by absolute path directly below `---`, or a Mermaid diagram (`flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`) directly below `---` or under `## Visual workflow: <Title>`, only when visual structure clarifies the concept. Leave Mermaid nodes unstyled for theme contrast or specify high-contrast fill and text colors such as `#14532d` or `#7f1d1d` with `#ffffff`.

Completion criterion: `bun .agents/skills/teach/scripts/track.ts validate <lesson-path> --sync` exits `0` and prints the exact `file://` URI, or the reference file is saved cleanly.

### 4. Deliver in chat

Keep full lesson prose inside the lesson file and present links directly in plain text rather than callout blocks. Include:

1. Clickable Markdown link using the exact `file://` URI printed by `track.ts validate`.
2. Core concept and takeaway in two or three sentences.
3. Prompt asking the user to complete the retrieval drill from memory before expanding answers and reply with their answers or questions.

Completion criterion: Chat response delivers the validated link, takeaway, and drill prompt while keeping lesson prose inside the lesson file.

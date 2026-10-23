---
name: teach
description: Teach a skill or concept through grounded lessons. Use when asked to teach, create lessons, explain a topic, or record user learning progress.
disable-model-invocation: true
argument-hint: "What would you like to learn about?"
---

# Teach

The user wants to learn a topic over multiple sessions. All learning state and lesson files live in `.scratch/teach/`.

## Teaching workspace

Resolve all state files, reference documents, and lessons inside `.scratch/teach/`:

- **MISSION.md.** Captures the concrete reason the user learns the topic. Ground every lesson in this file. Follow [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- **reference/*.md.** Condensed reference documents such as cheat sheets, algorithms, syntax guides, and glossaries. Use pure Markdown.
- **RESOURCES.md.** Curated list of high-trust external sources and learning communities. Follow [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- **learning-records/*.md.** Sequential records (`0001-<slug>.md`) capturing validated understanding, misconceptions corrected, and prior knowledge. Follow [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- **lessons/*.md.** Sequenced Markdown lessons (`0001-<slug>.md`). Each lesson teaches one tightly scoped skill tied to the mission.
- **assets/*.** Visual and media files generated for lessons, such as conceptual diagrams and illustrations.
- **NOTES.md.** Working notes and user preferences recorded during sessions.

## Learning model

Learning requires three inputs:

- **Knowledge.** Verified facts from high-trust sources recorded in `RESOURCES.md`. Do not rely on unverified memory.
- **Skills.** Practical application through interactive drills and structured exercises.
- **Wisdom.** Real-world calibration through communities and outside practitioners.

### Fluency versus storage strength

Distinguish between two types of retention:

- **Fluency strength.** Immediate retrieval during the lesson. Fluency creates an illusion of mastery without retention.
- **Storage strength.** Long-term durability of knowledge.

Build storage strength through deliberate difficulty:

- **Retrieval practice.** Require recall from memory before revealing answers.
- **Spacing.** Revisit concepts across subsequent sessions.
- **Interleaving.** Mix related skills during practice drills.

## Lessons

A lesson is the primary unit of instruction. Save each lesson to `.scratch/teach/lessons/0001-<slug>.md`. Increment the number for each new file.

Write lessons in pure Markdown. Do not generate HTML files, CSS stylesheets, or JavaScript widgets.

Keep each lesson short and focused on a single win within the user's zone of proximal development.

### Structure of a lesson

Structure every lesson file in this sequence:

1. **Title.** Start with the top-level heading: `# Lesson <NNNN>: <Title>`.
2. **Header metadata.** Directly below the title, include a blockquote with the lesson eyebrow, reading time, primary source citation, and workspace file path. End each line in the blockquote with `<br>` so Markdown previewers preserve line breaks:
   ```markdown
   > **Eyebrow**: Teach Workspace · Lesson 0001 · ~4 min read<br>
   > **Source**: Grounded in <Source Title or Author><br>
   > **Workspace File**: `.scratch/teach/lessons/0001-<slug>.md`
   ```
3. **Divider.** Place a horizontal rule (`---`) below the metadata block.
4. **Hero visual (optional).** Place an illustration or primary Mermaid diagram directly beneath the divider if a visual anchor clarifies the lesson. Omit this section if not needed.
5. **Problem statement.** Explain the failure mode or limitation that makes this skill necessary.
6. **Core concepts.** Explain the key rules and definitions. Use GitHub Flavored Markdown alerts (`> [!TIP]`, `> [!IMPORTANT]`, `> [!NOTE]`) inside the lesson body only for critical constraints.
7. **Visual workflows (optional).** Include Mermaid diagrams to illustrate state transitions, decision trees, or sequences when structural visualization clarifies the logic.
8. **Interactive retrieval drill.** End the lesson with a self-testing drill.
9. **Primary sources.** List verified external documentation, books, or repositories for deeper study.

Do not append generic reminder boilerplate about being a teacher or asking followup questions.

### Interactive retrieval drill

Conclude every lesson with an interactive drill:

- Title the section `## Interactive retrieval drill`.
- Include two or three multiple-choice questions testing core concepts.
- Format answer options symmetrically: `* **A)** ...`, `* **B)** ...`, `* **C)** ...`. Make options similar in length so formatting does not reveal the answer.
- Vary the correct option position across questions.
- Hide the solution behind a native disclosure block:
  ```markdown
  <details>
  <summary>🔍 Reveal Answer & Explanation</summary>

  > **Correct Answer: B**
  >
  > **Why:** Explain why the answer is correct and why the alternatives fail.
  </details>
  ```

## Lesson presentation in chat

Do not duplicate lesson content in the chat response. The Markdown file in `.scratch/teach/lessons/` is the complete deliverable.

Do not wrap file references or links in callout alerts (`> [!TIP]`, `> [!NOTE]`, `> [!IMPORTANT]`). Present file references directly in plain text.

Structure the chat response with these elements:

- **Link the lesson file.** Provide a clickable Markdown link using the full absolute filesystem path with the `file://` scheme (for example, `[0001-<slug>.md](file:///path/to/workspace/.scratch/teach/lessons/0001-<slug>.md)`). Never attach `file:///` directly to a relative path like `.scratch/...`, which produces broken links such as `file:///.scratch/...`.
- **Summarize the core win.** State the core concept and primary takeaway in two or three sentences.
- **Direct the user to the drill.** Tell the user in plain text to open the lesson file to review the material and complete the interactive retrieval drill.

## Visuals and diagrams

Images and Mermaid diagrams are distinct visual tools. A lesson can use both, either, or neither:

- **Need determines inclusion.** Create an image only when an illustration clarifies the concept. Create a Mermaid diagram only when a flowchart, sequence, or decision tree clarifies the logic. If visual aids add no value, omit them.
- **Image generation.** If an image generation tool is available in your environment and an image is needed, generate the image. Save the file to `.scratch/teach/assets/<name>.<ext>`.
- **Image embedding.** Embed images in lessons using absolute filesystem paths (for example, `![Description](/path/to/repo/.scratch/teach/assets/diagram.png)`). Absolute paths ensure markdown preview tools and webviews render gitignored assets without path resolution errors.
- **Mermaid diagrams.** Author Mermaid diagrams directly in the Markdown document when a structural or procedural visualization clarifies the lesson.

## Mermaid diagram accessibility

Mermaid diagrams must remain legible across both dark and light editor themes:

- Avoid low-contrast pastel backgrounds.
- If defining custom node styles, specify both fill and font color with high contrast. For example, use dark green fill `#14532d` with white text `#ffffff`, or dark red fill `#7f1d1d` with white text `#ffffff`.
- If custom colors are not strictly necessary, use default unstyled nodes to inherit the viewer's theme.
- Stick to supported diagram types: `flowchart TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, and `classDiagram`.

## The mission

Every lesson must advance the goal in `MISSION.md`.

If `MISSION.md` is empty or missing, interview the user before teaching. Identify the concrete real-world outcome they want to achieve.

Update `MISSION.md` and add a learning record whenever the user's focus or constraints evolve. Confirm with the user before changing the mission.

## Zone of proximal development

Tailor each lesson to challenge the user without overwhelming working memory:

- Read existing `learning-records` to identify what the user already knows.
- Skip concepts already mastered.
- Teach the single next concept needed to make progress toward the mission.

## Reference documents

Create reference documents in `.scratch/teach/reference/*.md` alongside lessons.

Reference documents contain durable lookup material that outlives individual lessons:

- Code syntax and snippets
- Algorithm flowcharts
- Domain glossaries
- Workout sequences and movement standards

Do not place interactive retrieval drills in reference documents. Keep them concise and structured for quick lookup.

## User notes

Record learning preferences, pace requirements, and environment constraints in `.scratch/teach/NOTES.md`. Check this file before planning each session.

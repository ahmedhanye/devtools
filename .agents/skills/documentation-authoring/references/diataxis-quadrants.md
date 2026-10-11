# Diátaxis quadrants reference

The Diátaxis framework divides documentation into four distinct quadrants based on reader intent across two axes: theory versus practice, and learning versus working. Consult this reference when selecting document structure, defining content boundaries, and organizing cross-quadrant links.

## Quadrant specifications

Each quadrant maintains strict boundaries regarding reader mindset, pedagogical orientation, required structure, and style rules.

### 1. Tutorial

Tutorials guide beginners through a learning experience to build a working result from scratch.

- **Reader mindset**: A newcomer seeking guided instruction.
- **Pedagogical goal**: Learning through practical action.
- **File location**: `site/content/docs/tutorials/<topic>.mdx`
- **Required structure**:
  1. Introduction stating what the user builds.
  2. Prerequisites listing required tools and base dependencies.
  3. Ordered steps with copy-pasteable commands.
  4. Expected output showing terminal or visual results after each step.
  5. Conclusion confirming successful completion.
- **Rules**:
  - Keep instructions strictly linear with a single path.
  - Focus on concrete actions. Omit system theory or architectural discussion.
  - Omit alternative tools and configuration branches.
  - Test every command in sequence starting from a clean workspace.
- **Anti-patterns**:
  - Theoretical digressions explaining how internals work.
  - Branching choices ("If using PostgreSQL instead, do this...").
  - Unverified steps or commands that leave the reader in an incomplete state.

### 2. How-to guide

How-to guides help developers solve a specific practical problem or accomplish a targeted operational task.

- **Reader mindset**: A practitioner with a concrete goal asking how to solve a problem.
- **Pedagogical goal**: Completing a specific task efficiently.
- **File location**: `site/content/docs/how-to/<topic>.mdx`
- **Required structure**:
  1. Direct statement of the task and expected outcome in the opening sentence.
  2. Concrete prerequisites (for example, a running daemon or installed CLI).
  3. Action steps ordered logically toward the outcome, using imperative verbs for headings.
  4. Validation step verifying the solution works as intended.
- **Rules**:
  - Focus strictly on a single operational task.
  - Address real-world edge cases relevant to the task.
  - Link to tutorials for introductory setup, and to explanations for background theory.
  - Use imperative verbs for step titles (for example, "Configure daemon port", "Generate Lighthouse report").
- **Anti-patterns**:
  - Teaching basic tool concepts from scratch.
  - Abstract discussions without actionable commands.
  - Omitting the validation step.

### 3. Reference

Reference documents provide authoritative, factual, and complete technical specifications.

- **Reader mindset**: A developer looking up exact parameters, flags, types, or configuration keys.
- **Pedagogical goal**: Providing factual information on demand.
- **File location**: `site/content/docs/reference/<topic>.mdx`
- **Required structure**:
  1. Name and concise definition of the subject.
  2. Syntax, signature, or schema specification.
  3. Structured tables of arguments, flags, environment variables, or schema fields.
  4. Return types, exit codes, and error conditions.
  5. Minimal usage example showing syntax.
- **Rules**:
  - Maintain a uniform, factual layout across pages.
  - List all options exhaustively, including default values, constraints, and types.
  - Focus on technical specifications and syntax. Omit tutorials and conceptual explanations.
  - Keep usage snippets minimal and focused strictly on syntax.
- **Anti-patterns**:
  - Narrative walkthroughs or step-by-step guides.
  - Incomplete flag or parameter lists.
  - Architectural rationale or opinionated design debates.

### 4. Explanation

Explanations clarify architecture, system mechanics, and technical decisions.

- **Reader mindset**: A contributor or developer seeking deeper understanding of system design.
- **Pedagogical goal**: Building architectural comprehension and contextual awareness.
- **File location**: `site/content/docs/explanation/<topic>.mdx`
- **Required structure**:
  1. Context defining the concept, subsystem, or architectural pattern.
  2. Architectural overview with system topology or data flow diagrams.
  3. Technical rationale, trade-offs, and alternative designs evaluated.
  4. Connections to related subsystems and runtime behaviors.
- **Rules**:
  - Focus on system rationale and architectural context.
  - Include diagrams for process topologies and state transitions.
  - Detail trade-offs explicitly without promotional language.
  - Link to how-to guides for operational procedures.
- **Anti-patterns**:
  - Step-by-step instructional recipes.
  - Raw API syntax lists or parameter tables.
  - Avoidance of technical trade-offs or failure modes.

## Boundary rules and quadrant transitions

Never blend quadrants within a single document. Keep tutorials linear, how-to guides task-focused, reference pages factual, and explanations conceptual.

Connect quadrants using targeted cross-links:

- **Tutorial to Reference**: Link to reference pages when introducing commands or configuration fields, without interrupting the learning flow.
- **How-to guide to Explanation**: Link to explanation pages when a step involves architectural trade-offs or internal system behaviors.
- **How-to guide to Reference**: Link to reference tables for exhaustive options or configuration schemas.
- **Reference to How-to guide**: Link to practical how-to guides from minimal syntax examples for real-world usage recipes.
- **Explanation to How-to guide**: Link to how-to guides when mentioning practical operational workflows.

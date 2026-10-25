# Documentation Platform Context

Domain terms for the Fumadocs documentation engine, Diátaxis quadrant system, and AI context distribution endpoints.

## Language

**Diátaxis Quadrants**:
The technical authoring framework partitioning documentation into four distinct reader intents: Tutorials (learning), How-To Guides (problem-solving), Reference (facts), and Explanation (understanding).
_Avoid_: Doc categories, guide sections, help articles

**Fumadocs Source Pipeline**:
The content processing pipeline linking `site/source.config.ts`, `site/.source` typed collections, and `site/src/lib/source.ts` page tree loaders.
_Avoid_: MDX compiler, doc generator, content builder

**LLM Context Endpoints**:
The dedicated plain-text HTTP routes (`/llms.txt` and `/llms-full.txt`) distributing structured documentation catalogs to language models and AI coding agents.
_Avoid_: AI docs, text dump, prompt feeds

**Search Index Route**:
The server-side endpoint (`/api/search`) indexing page titles, headings, and section bodies for instant client-side documentation searches.
_Avoid_: Doc search API, content indexer, query route

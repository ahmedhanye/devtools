import { describe, expect, it } from "bun:test";
import {
  checkCodeFences,
  checkMachinePaths,
  checkMarkdownLinks,
  checkUnslop,
  discoverAgentFiles,
  loadVendorSkillNames,
  parseFrontmatter,
  toRepoRelative,
  validateRuleFile,
  validateSkillFile,
  verifyAgentRules,
} from "./verify-agent-rules";

describe("verify-agent-rules", () => {
  describe("toRepoRelative", () => {
    it("converts absolute path to repository-relative with forward slashes", () => {
      const repoRoot = "/workspace/repo";
      const absPath = "/workspace/repo/.agents/skills/test/SKILL.md";
      expect(toRepoRelative(absPath, repoRoot)).toBe(
        ".agents/skills/test/SKILL.md",
      );
    });

    it("keeps relative paths normalized", () => {
      const repoRoot = "/workspace/repo";
      expect(toRepoRelative(".agents/rules/frontend.md", repoRoot)).toBe(
        ".agents/rules/frontend.md",
      );
    });
  });

  describe("parseFrontmatter", () => {
    it("parses valid frontmatter correctly", () => {
      const raw = `---
name: my-skill
description: "A valid skill description."
---
# Skill body`;
      const res = parseFrontmatter(raw);
      expect(res.exists).toBe(true);
      expect(res.data).toEqual({
        name: "my-skill",
        description: "A valid skill description.",
      });
      expect(res.body.trim()).toBe("# Skill body");
      expect(res.error).toBeUndefined();
    });

    it("detects missing frontmatter", () => {
      const raw = "# Just a markdown document";
      const res = parseFrontmatter(raw);
      expect(res.exists).toBe(false);
      expect(res.data).toBeNull();
    });

    it("reports error when frontmatter is not closed", () => {
      const raw = `---
name: unclosed
description: test
`;
      const res = parseFrontmatter(raw);
      expect(res.exists).toBe(true);
      expect(res.error).toContain("missing closing '---'");
    });

    it("catches syntax errors like unquoted colons", () => {
      const raw = `---
name: broken
description: Run tests: generate output
---
# Body`;
      const res = parseFrontmatter(raw);
      expect(res.exists).toBe(true);
      expect(res.error).toContain("YAML syntax error");
    });
  });

  describe("checkCodeFences", () => {
    it("passes balanced code fences", () => {
      const content = "```ts\nconst x = 1;\n```\n";
      const findings = checkCodeFences(content, "test.md");
      expect(findings).toHaveLength(0);
    });

    it("flags unclosed code fences", () => {
      const content = "```ts\nconst x = 1;\n";
      const findings = checkCodeFences(content, "test.md");
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("code-fence/unclosed");
      expect(findings[0].line).toBe(1);
    });

    it("handles quadruple backtick nested blocks", () => {
      const content = `\`\`\`\`markdown
\`\`\`ts
const nested = true;
\`\`\`
\`\`\`\``;
      const findings = checkCodeFences(content, "test.md");
      expect(findings).toHaveLength(0);
    });
  });

  describe("checkMachinePaths", () => {
    it("flags leaked machine paths", () => {
      const content = "Output path is /home/agent/workspace/file.txt";
      const findings = checkMachinePaths(content, "test.md");
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe(
        "path-portability/no-absolute-machine-path",
      );
    });

    it("allows .scratch references and illustrative /path/to/ templates", () => {
      const content =
        "Saved to /home/agent/workspace/devtools/.scratch/file.md and `file:///path/to/workspace/file.md`";
      const findings = checkMachinePaths(content, "test.md");
      expect(findings).toHaveLength(0);
    });

    it("does not flag relative paths containing home directory segments", () => {
      const content = "File path: apps/frontend/src/pages/home/index.ts";
      const findings = checkMachinePaths(content, "test.md");
      expect(findings).toHaveLength(0);
    });
  });

  describe("checkMarkdownLinks", () => {
    it("ignores links wrapped in inline code spans and illustrative examples", () => {
      const content =
        "See `[file](nonexistent.md)` and for example, [doc](/docs/sample)";
      const findings = checkMarkdownLinks(content, ".agents/rules/test.md");
      expect(findings).toHaveLength(0);
    });

    it("ignores bracketed syntax inside fenced code blocks", () => {
      const content =
        "```typescript\nconst res = handlers[type](payload);\n```";
      const findings = checkMarkdownLinks(content, ".agents/rules/test.md");
      expect(findings).toHaveLength(0);
    });

    it("handles links with title attributes", () => {
      const content = 'See [package](../../../package.json "Package Root")';
      const findings = checkMarkdownLinks(
        content,
        ".agents/skills/code-review/SKILL.md",
      );
      expect(findings).toHaveLength(0);
    });

    it("flags broken local relative links", () => {
      const content = "See [missing file](does-not-exist-at-all-12345.md)";
      const findings = checkMarkdownLinks(content, ".agents/rules/test.md");
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("markdown/broken-link");
    });

    it("flags relative links that exist at repo root but not from file directory", () => {
      // package.json exists at repo root, but from .agents/skills/test/ it is ../../../package.json
      const content = "See [package](package.json)";
      const findings = checkMarkdownLinks(
        content,
        ".agents/skills/test/SKILL.md",
      );
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("markdown/broken-link");
    });
  });

  describe("checkUnslop", () => {
    it("flags em dashes", () => {
      const content = "This is a feature—and it works.";
      const findings = checkUnslop(content, "test.md");
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("unslop/no-em-dash");
    });

    it("passes spaced hyphens", () => {
      const content = "This is a feature - and it works.";
      const findings = checkUnslop(content, "test.md");
      expect(findings).toHaveLength(0);
    });
  });

  describe("validateRuleFile", () => {
    it("validates rule frontmatter and contents", () => {
      const content = `---
trigger: "apps/**"
description: "A valid rule description."
---
# Rules
Content here.`;
      const findings = validateRuleFile(".agents/rules/test.md", content);
      expect(findings).toHaveLength(0);
    });

    it("rejects rule file without frontmatter", () => {
      const content = "# Just markdown";
      const findings = validateRuleFile(".agents/rules/test.md", content);
      expect(findings.some((f) => f.rule === "rule/frontmatter-missing")).toBe(
        true,
      );
    });

    it("rejects rule file without trigger", () => {
      const content = `---
description: "A valid description with more than ten characters."
---
# Content`;
      const findings = validateRuleFile(".agents/rules/test.md", content);
      expect(findings.some((f) => f.rule === "rule/trigger-required")).toBe(
        true,
      );
    });

    it("rejects rule file with YAML sequence array trigger", () => {
      const content = `---
trigger:
  - "apps/**"
description: "A valid description with more than ten characters."
---
# Content`;
      const findings = validateRuleFile(".agents/rules/test.md", content);
      expect(
        findings.some((f) => f.rule === "rule/trigger-must-be-string"),
      ).toBe(true);
    });

    it("rejects rule file with empty or short description", () => {
      const content = `---
trigger: "package.json"
description: "short"
---
# Content`;
      const findings = validateRuleFile(".agents/rules/test.md", content);
      expect(findings.some((f) => f.rule === "rule/description-required")).toBe(
        true,
      );
    });
  });

  describe("validateSkillFile", () => {
    it("validates local skill requiring directory name match and unslop checks", () => {
      const content = `---
name: my-skill
description: "A valid local skill description for testing."
---
# My Skill`;
      const findings = validateSkillFile(
        ".agents/skills/my-skill/SKILL.md",
        content,
        {
          isVendor: false,
          skillDirName: "my-skill",
          isMainSkillFile: true,
        },
      );
      expect(findings).toHaveLength(0);
    });

    it("flags name directory mismatch for local skills", () => {
      const content = `---
name: other-name
description: "A valid local skill description for testing."
---
# Skill`;
      const findings = validateSkillFile(
        ".agents/skills/my-skill/SKILL.md",
        content,
        {
          isVendor: false,
          skillDirName: "my-skill",
          isMainSkillFile: true,
        },
      );
      expect(
        findings.some((f) => f.rule === "skill/name-directory-mismatch"),
      ).toBe(true);
    });

    it("exempts vendor skills from unslop rules", () => {
      const content = `---
name: vendor-skill
description: "Vendor skill with an em dash—right here."
---
# Vendor Skill
An em dash in body—ignored for vendor skills.`;
      const findings = validateSkillFile(
        ".agents/skills/vendor-skill/SKILL.md",
        content,
        {
          isVendor: true,
          skillDirName: "vendor-skill",
          isMainSkillFile: true,
        },
      );
      expect(findings.some((f) => f.rule === "unslop/no-em-dash")).toBe(false);
    });

    it("still enforces fatal YAML syntax errors on vendor skills", () => {
      const content = `---
name: vendor-skill
description: Unquoted colon in: scalar value
---
# Vendor Skill`;
      const findings = validateSkillFile(
        ".agents/skills/vendor-skill/SKILL.md",
        content,
        {
          isVendor: true,
          skillDirName: "vendor-skill",
          isMainSkillFile: true,
        },
      );
      expect(findings.some((f) => f.rule === "skill/frontmatter-syntax")).toBe(
        true,
      );
    });

    it("validates non-main skill reference files with frontmatter syntax", () => {
      const content = `---
unquoted colon: in: here
---
# Ref`;
      const findings = validateSkillFile(
        ".agents/skills/my-skill/references/ref.md",
        content,
        {
          isVendor: false,
          isMainSkillFile: false,
        },
      );
      expect(findings.some((f) => f.rule === "skill/frontmatter-syntax")).toBe(
        true,
      );
    });
  });

  describe("loadVendorSkillNames", () => {
    it("loads vendor skill names from skills-lock.json", () => {
      const vendorNames = loadVendorSkillNames();
      expect(vendorNames.has("code-review")).toBe(true);
      expect(vendorNames.has("fallow")).toBe(true);
      expect(vendorNames.has("react-doctor")).toBe(true);
      expect(vendorNames.has("qa")).toBe(false);
    });
  });

  describe("discoverAgentFiles and verifyAgentRules", () => {
    it("discovers existing files and passes clean repository scan", () => {
      const files = discoverAgentFiles();
      expect(files.length).toBeGreaterThan(0);
      expect(
        files.some((f) => f.includes(".agents/rules/dependencies.md")),
      ).toBe(true);

      const result = verifyAgentRules();
      expect(result.scannedCount).toBeGreaterThan(0);
      const errors = result.findings.filter((f) => f.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("filters and validates specific target files", () => {
      const target = [".agents/rules/dependencies.md"];
      const result = verifyAgentRules(target);
      expect(result.scannedCount).toBe(1);
      expect(result.findings).toHaveLength(0);
    });
  });
});

#!/usr/bin/env bash
# Lint every workflow, composite action, and workflow script in the current repo.
# Exit 0 only when actionlint, zizmor, and shellcheck are installed and pass.
#
#   lint.sh            offline audits
#   lint.sh --online   adds zizmor's online audits (impostor commits,
#                      known-vulnerable actions, ref confusion, stale refs);
#                      needs a GH_TOKEN that can read public repositories
set -euo pipefail

missing=()
for bin in actionlint zizmor shellcheck; do
  command -v "$bin" >/dev/null 2>&1 || missing+=("$bin")
done
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "missing required tool(s) on PATH: ${missing[*]}" >&2
  echo "install actionlint, zizmor, and shellcheck before running lint.sh" >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

status=0

echo "== actionlint"
actionlint -no-color || status=1

echo "== zizmor"
zizmor_args=(--offline .)
[[ "${1:-}" == "--online" ]] && zizmor_args=(.)
zizmor "${zizmor_args[@]}" || status=1

mapfile -t scripts < <(git ls-files -co --exclude-standard ':(glob).github/**/*.sh')
if [[ ${#scripts[@]} -gt 0 ]]; then
  echo "== shellcheck"
  shellcheck "${scripts[@]}" || status=1
fi

exit "$status"

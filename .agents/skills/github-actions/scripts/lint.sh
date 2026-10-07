#!/usr/bin/env bash
# Lint every workflow, composite action, and workflow script in the current repo.
# Exit 0 only when actionlint, zizmor, and shellcheck all pass.
#
#   lint.sh            offline audits
#   lint.sh --online   adds zizmor's online audits (impostor commits, known-vulnerable
#                      actions); needs a GH_TOKEN that can read public repositories
#
# Uses native binaries when installed, otherwise the Docker images.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

run_tool() {
  local bin="$1" image="$2"
  shift 2
  if command -v "$bin" >/dev/null 2>&1; then
    "$bin" "$@"
  else
    docker run --rm -e GH_TOKEN -v "$root:/repo" -w /repo --entrypoint "$bin" "$image" "$@"
  fi
}

status=0

echo "== actionlint"
run_tool actionlint rhysd/actionlint:latest -no-color || status=1

echo "== zizmor"
zizmor_args=(--offline .)
[[ "${1:-}" == "--online" ]] && zizmor_args=(.)
run_tool zizmor ghcr.io/zizmorcore/zizmor:latest "${zizmor_args[@]}" || status=1

mapfile -t scripts < <(git ls-files -co --exclude-standard ':(glob).github/**/*.sh')
if [[ ${#scripts[@]} -gt 0 ]]; then
  echo "== shellcheck"
  run_tool shellcheck rhysd/actionlint:latest "${scripts[@]}" || status=1
fi

exit "$status"

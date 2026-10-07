#!/usr/bin/env bash
# Resolve a GitHub Action reference to a pinned `uses:` line.
#
#   pin-action.sh actions/checkout            # latest semver release
#   pin-action.sh actions/checkout v4.2.2     # specific tag
#   pin-action.sh github/codeql-action/init   # sub-path actions resolve against the repo
#
# Output: actions/checkout@<40-char commit sha> # v4.2.2
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <owner/repo[/path]> [tag]" >&2
  exit 2
fi

action="$1"
repo="$(cut -d/ -f1-2 <<<"$action")"
url="https://github.com/${repo}"

if [[ $# -eq 2 ]]; then
  tag="$2"
else
  tag="$(git ls-remote --tags --refs --sort=-v:refname "$url" 'v*' |
    awk -F/ '{print $NF}' |
    grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' |
    head -1)"
  if [[ -z "$tag" ]]; then
    echo "no vX.Y.Z release tag found in ${repo}; pass a tag explicitly" >&2
    exit 1
  fi
fi

# Annotated tags list a tag object plus a peeled `^{}` line holding the commit.
# Prefer the peeled commit; fall back to the lightweight tag's own SHA.
refs="$(git ls-remote --tags "$url" "refs/tags/${tag}" "refs/tags/${tag}^{}")"
sha="$(awk '$2 ~ /\^\{\}$/ {print $1}' <<<"$refs")"
[[ -n "$sha" ]] || sha="$(awk '{print $1}' <<<"$refs" | head -1)"

if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "tag ${tag} not found in ${repo}" >&2
  exit 1
fi

echo "${action}@${sha} # ${tag}"

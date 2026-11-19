# Installing workflow linting tools

`scripts/lint.sh` requires native `actionlint`, `zizmor`, and `shellcheck` binaries on `PATH`.

## Homebrew (macOS and Linux)

```bash
brew install actionlint zizmor shellcheck
```

## Individual installers

- **actionlint:** `go install github.com/rhysd/actionlint/cmd/actionlint@latest` (ensure `$GOPATH/bin` or `~/go/bin` is on `PATH`), or download verified binaries from [actionlint releases](https://github.com/rhysd/actionlint/releases).
- **zizmor:** `uv tool install zizmor`, `pipx install zizmor`, or `cargo install --locked zizmor`.
- **shellcheck (Debian/Ubuntu):** `sudo apt update && sudo apt install -y shellcheck`.

## Verify

```bash
command -v actionlint zizmor shellcheck && scripts/lint.sh
```

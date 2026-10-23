# Releases and distribution

Guidelines for automated semantic releases via Google Release Please and standalone binary compilation.

## Automated releases via Release Please

Releases are automated via Google Release Please, driven directly by commit types on `main`:

- `fix:` triggers a patch release (`v0.0.X`).
- `feat:` triggers a minor release (`v0.X.0`).
- `feat!:` or `BREAKING CHANGE:` triggers a major release (`vX.0.0`).
- `chore:`, `docs:`, `test:`, `refactor:`, `style:` do not trigger automated version bumps unless accompanied by breaking changes.

## Release pull request workflow

Release Please automatically maintains an open Release pull request (`chore(main): release vX.Y.Z`).

When the Release pull request merges into `main`, GitHub Actions automatically:

1. Tags the release in Git.
2. Compiles standalone native binaries across target architectures:
   - `devtools-linux-x64`
   - `devtools-linux-arm64`
   - `devtools-darwin-x64`
   - `devtools-darwin-arm64`
3. Computes SHA256 checksums (`SHA256SUMS.txt`).
4. Attaches the binaries and checksums directly to the GitHub Release.

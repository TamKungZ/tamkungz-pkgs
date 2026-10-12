# TamKungZ Packages

Source of `packages.tamkungz.me` - a static package repository (APT, RPM, Alpine APK, Void XBPS,
Arch pacman, Maven, winget) on GitHub Pages. Astro + TypeScript, Node.js 22.12+.

## How it works

```text
 upstream project                       this repo (public)
 ----------------                       -------------------------------------------------------
 build -> GitHub release  --dispatch->  publish.yml   check source allowed -> download assets
                                                      -> tools/ingest.ts  (sort by file type)
                                                      -> commit packages/ to main
                                        deploy.yml    -> tools/repo-metadata.ts (index + GPG sign)
                                                      -> astro build -> GitHub Pages
```

- `packages/` is the **only** source of truth: package files, per-package signatures, public keys.
  Committed to git, never contains generated indexes.
- APT `dists/`, RPM `repodata/`, pacman `.db/.files` and every HTML listing are **generated in CI**
  from `packages/` and published directly. Nothing generated is committed, so there is nothing to
  conflict on when several projects publish at once.
- Signing keys exist only as secrets of this repo. Upstream projects never see them.

## Layout

```text
packages/        what is published: apt/ rpm/ apk/ xbps/ arch/ maven/ winget/ + gpg.key
public/          site assets (favicons, 404.html, CNAME, resources/)
src/             Astro site: config/, lib/, layouts/, components/, pages/, integrations/
tools/           ingest.ts  repo-metadata.ts  migrate-legacy.ts  check-source.ts  lib/  test/
publish.config.ts  pipeline settings (allowed upstream repos, APT identity, size limit)
examples/        upstream-publish.yml (copy into a project), Gradle + winget samples
.github/workflows/  ci.yml  deploy.yml  publish.yml
```

## Adding a project

1. Copy `examples/upstream-publish.yml` into the project as `.github/workflows/release.yml`.
   Fill in the build step so the files end up in `dist/`.
2. Add the secret `PACKAGES_DISPATCH_TOKEN` to that project (see *Secrets*).
3. Push a tag `v1.2.3`. Done - nothing to edit in this repo.

Projects under `TamKungZ/*` are allowed by default. To narrow it, edit `ALLOWED_SOURCES` in
`publish.config.ts`.

What the site does with the files attached to a release:

| Release file | Goes to |
| --- | --- |
| `*.deb` | `apt/pool/main/<x>/<package>/` (package name read from the .deb) |
| `*.rpm` | `rpm/<arch>/` (arch read from the .rpm; `noarch` -> every existing arch) |
| `*.apk` | `apk/<arch>/` (arch read from `.PKGINFO`) |
| `*.xbps` | `xbps/<arch>/` |
| `*.pkg.tar.zst` / `.xz` | `arch/<arch>/` (`any` -> every existing arch) |
| `<file>.asc` / `.sig` | next to `<file>` |
| `maven-repo.zip` | merged into `maven/` - `maven-metadata.xml` is merged, not overwritten |
| `winget-manifests.zip` | `winget/manifests/` (`<PackageId>/<version>/*.yaml`) |
| anything else | ignored, listed in the run summary |

A file that already exists with **different** content is a conflict and stops the run: published
versions are immutable. Re-run with `overwrite: true` if you really mean it.

Manual use, no upstream workflow:

```bash
gh workflow run publish.yml -f source=TamKungZ/livedesk -f tag=v1.2.3   # from a release
npm run ingest -- path/to/folder/with/files                              # local, then commit packages/
```

## Commands

```bash
npm install
npm run dev              # live site from packages/ (no signed metadata)
npm run build            # packages/ -> dist/
npm test                 # unit tests (routing, maven-metadata merge, source allow-list)
npm run check            # TypeScript / Astro check
npm run ingest -- <dir> [--overwrite] [--dry-run]
npm run repo:metadata    # needs gpg, apt-ftparchive, createrepo_c, repo-add + the signing secrets in env
npm run migrate -- <old-repo> [--dry-run]    # re-runnable import from the old Python repo
```

## Secrets and tokens

In this repo (Settings > Secrets and variables > Actions):

| Secret | Used for |
| --- | --- |
| `GPG_PRIVATE_LINUX` | Armored private key. Signs APT `Release`/`InRelease`, RPM `repomd.xml`, pacman `.db`/`.files`. Must match `packages/gpg.key` - the build refuses to publish otherwise. |
| `GPG_PASSPHRASE` | Passphrase of that key (omit if none). |
| `UPSTREAM_READ_TOKEN` | Optional. Read-only token, only for **private** upstream repos. |

In each upstream project: `PACKAGES_DISPATCH_TOKEN` - fine-grained PAT, repository access = this
repo only, permission **Actions: read & write**, nothing else. It can start a publish run; it cannot
push code or read secrets.

GitHub setup: Settings > Pages > Build and deployment > Source = **GitHub Actions**. The custom
domain stays configured there (`public/CNAME` is still copied into the site).

## Security model (public repo + secrets)

- Secrets are reachable only from `deploy.yml` / `publish.yml`, which run on `main` or by manual
  dispatch. `ci.yml` (pull requests, forks) has no secrets and a read-only token.
- The key is used in exactly one step, imported into a throw-away keyring, passed via stdin / a
  0600 file (never argv), deleted afterwards. It is never printed.
- Workflow inputs go through environment variables, never interpolated into shell. Repo name and
  tag are validated; the repo must be on `ALLOWED_SOURCES`.
- Release archives are untrusted: symlinks/special files are rejected, names are validated, paths
  read from package metadata are sanitised, and single files over 95 MB are refused.
- Actions are pinned to commit SHAs. Update them deliberately.
- **Trust boundary:** whatever an allowed repo puts on a release will be signed with our key.
  Protect those repos (and their release permissions) accordingly.

## Not generated here

APK (`APKINDEX.tar.gz`) and XBPS (`<arch>-repodata`) indexes are signed with their own RSA keys
(`tamkungz.rsa.pub`, `tamkungz-void.pem.pub`), not the GPG key, and are copied through as they were
migrated. Ingesting a new `.apk` / `.xbps` stores the file but does **not** refresh its index - the
package will not be visible to `apk` / `xbps` until the index is regenerated and committed.

## Repository growth

Every published binary stays in git history. GitHub recommends repositories under 1 GB and Pages
sites are limited to 1 GB; `packages/` is currently ~106 MB.

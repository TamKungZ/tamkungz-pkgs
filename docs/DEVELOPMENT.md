# Development guide

How the site and the publishing pipeline of [packages.tamkungz.me](https://packages.tamkungz.me)
work. Astro + TypeScript, Node.js 22.12+. Visitors looking for what this is: see the
[README](../README.md).

## How it works

```text
 upstream project                       this repo (public)
 ----------------                       -------------------------------------------------------
 build -> GitHub release  --dispatch->  publish.yml   check source allowed -> download assets
                                                      -> tools/ingest.ts  (sort by file type)
                                                      -> commit packages/ to main
                                        deploy.yml    -> tools/repo-metadata.ts (indexes + signatures)
                                                      -> astro build -> GitHub Pages
```

- `packages/` is the **only** source of truth: package files, public keys, and the currently static
  APK index. APT, RPM, pacman, and XBPS metadata is generated in CI, never committed.
- APT `dists/`, RPM `repodata/`, pacman `.db/.files`, XBPS `*-repodata` and every HTML listing are
  **generated in CI** from `packages/` and published directly. Nothing generated is committed, so
  there is nothing to conflict on when several projects publish at once.
- Signing keys exist only as secrets of this repo. Upstream projects never see them.

## Layout

```text
packages/        what is published: apt/ rpm/ apk/ xbps/ arch/ maven/ winget/ + gpg.key
public/          site assets (favicons, 404.html, CNAME, resources/)
src/             Astro site: config/, lib/, layouts/, components/, pages/, integrations/
docs/            this guide
tools/           ingest.ts  repo-metadata.ts  migrate-legacy.ts  check-source.ts  lib/  test/
publish.config.ts  pipeline settings (allowed upstream repos, APT identity, size limit)
examples/        copyable publisher workflows for native packages, Maven, and WinGet
.github/workflows/  ci.yml  deploy.yml  publish.yml
```

## Adding a project

1. Choose one workflow example and copy it into the project as
   `.github/workflows/release.yml`:
   - Native packages (`.deb`, `.rpm`, `.apk`, `.xbps`, Arch): `examples/upstream-publish.yml`
   - Gradle Maven repository: `examples/upstream-maven-gradle.yml`
   - Apache Maven repository: `examples/upstream-maven-maven.yml`
   - WinGet installers and manifests: `examples/upstream-winget.yml`
2. Replace the clearly marked project-specific build command and check the required output
   layout below. Keep the workflow's release and dispatch steps intact.
3. Add the `PACKAGES_DISPATCH_TOKEN` secret to the upstream project (see *Secrets*).
4. Push a version tag such as `v1.2.3`. The workflow creates a GitHub Release, uploads its
   files, and asks this repository to ingest that exact release.

Projects under `TamKungZ/*` are allowed by default. To narrow it, edit `ALLOWED_SOURCES` in
`publish.config.ts`. Repositories outside that account must be explicitly allowed before their
workflow can publish.

### Accepted release assets

The build step in an upstream workflow must place release assets directly inside `dist/` (not
inside nested directories). Use the exact package-manager filenames emitted by the package
builder; do not rename package files just to make them look like another ecosystem.

| Release file | Goes to |
| --- | --- |
| `*.deb` | `apt/pool/main/<prefix>/<package>/`; package identity is read from the package metadata, with a filename fallback. |
| `*.rpm` | `rpm/<arch>/`; architecture is read from package metadata. `noarch` fans out to existing RPM architecture directories. |
| `*.apk` | `apk/<arch>/`; architecture is read from `.PKGINFO`. **The APK index is static and is not refreshed by this workflow**, so a maintainer must regenerate and sign it before new APKs become installable. |
| `*.<arch>.xbps` | `xbps/<arch>/`; deploy generates signed repository metadata and package signatures. Do not upload `.sig2` files; deploy creates them. |
| `*.pkg.tar.zst` / `*.pkg.tar.xz` | `arch/<arch>/`; `any` packages fan out to existing Arch architecture directories. |
| `<package-file>.asc` / `<package-file>.sig` | Alongside the matching package file. Include both in the same release; orphan sidecars are skipped. |
| `maven-repo.zip` (or `.tar.gz` / `.tgz`) | Merged into `maven/`; archive root must be the standard Maven repository layout (`group/path/artifact/version/file`). Existing `maven-metadata.xml` is merged, not overwritten. |
| `winget-manifests.zip` (or `.tar.gz` / `.tgz`) | Merged into `winget/manifests/`; archive root must contain `<PackageId>/<version>/*.yaml`. Installer files themselves are not copied into the package site. |
| anything else | ignored, listed in the run summary |

Each release asset must be smaller than 95 MB. For universal packages, use RPM `noarch`,
XBPS `noarch`, or pacman `any`; they are copied to architecture directories that already
exist (or `x86_64` when none exist yet). APK packages need an explicit supported architecture.

Use the actual package-manager filename convention and make the architecture inside the package
metadata agree with the filename where applicable:

| Format | Example filename | Check before release |
| --- | --- | --- |
| DEB | `myapp_1.2.3_amd64.deb` | The package's control metadata must contain the intended package name and architecture. |
| RPM | `myapp-1.2.3-1.x86_64.rpm` | RPM metadata must report the intended architecture (`x86_64`, `aarch64`, or `noarch`). |
| APK | `myapp-1.2.3-r0.apk` | `.PKGINFO` must report the intended architecture. The static index still needs manual refresh/signing. |
| XBPS | `myapp-1.2.3_1.x86_64.xbps` | Use the architecture suffix in the filename; deploy rebuilds the index and signs both index and archive. |
| pacman | `myapp-1.2.3-1-x86_64.pkg.tar.zst` | Use the package database naming convention; `any` is the architecture for architecture-independent packages. |

Maven artifacts that arrive already signed (`.asc` in the zip, from any build machine) are kept
as they are; unsigned ones are signed with the Linux key at deploy time (checksums for the `.asc`
included). A merged `maven-metadata.xml` loses its old signature and is re-signed the same way.

### Preparing a WinGet release

Build installers first, then put the installers directly in `dist/`. Update the versioned
manifests under `manifests/<PackageId>/<version>/`: each installer entry must use a stable
versioned URL (for example a GitHub Release download URL) and the exact SHA-256 of the installer.
Validate every manifest with `winget validate --manifest <file>` before tagging. The WinGet
workflow zips only the manifest tree; it uploads installer files separately with the release.
Because the site does not mirror installer binaries, keep the referenced release URLs available.

### Preparing a native-package release

The generic workflow deliberately calls `./packaging/build-release.sh "$RELEASE_TAG" dist`.
Replace that command with the project's own build pipeline; there is no one universal command
that correctly builds DEB, RPM, APK, XBPS, and pacman packages for every project's language and
dependencies. Ensure it writes only release asset files directly under `dist/`. For example,
the output set may include `.deb` and `.rpm` for the same application, but each file must be a
valid package built for its stated architecture. A multi-architecture project must build every
target before the release-creation step runs.

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
npm run repo:metadata    # needs gpg, apt-ftparchive, createrepo_c, repo-add, xbps-rindex + signing secrets
npm run migrate -- <old-repo> [--dry-run]    # re-runnable import from the old Python repo
```

## Secrets and tokens

In this repo (Settings > Secrets and variables > Actions):

| Secret | Used for |
| --- | --- |
| `GPG_PRIVATE_LINUX` | Armored private key. Signs APT `Release`/`InRelease`, RPM `repomd.xml`, pacman `.db`/`.files`, and Maven artifacts that arrive without a `.asc`. Must match `packages/gpg.key` - the build refuses to publish otherwise. |
| `GPG_PASSPHRASE` | Passphrase of that key (omit if none). |
| `XBPS_PRIVATE_KEY` | XBPS-only RSA private key in PEM format. The build normalizes it for XBPS and derives the public key published beside the repository. |
| `XBPS_PASSPHRASE` | Passphrase of the XBPS RSA key (omit if none). |
| `UPSTREAM_READ_TOKEN` | Optional. Read-only token, only for **private** upstream repos. |

In each upstream project: `PACKAGES_DISPATCH_TOKEN` - fine-grained PAT, repository access =
`TamKungZ/tamkungz-pkgs` only, permission **Actions: read & write**, nothing else. It can start
the publish workflow; it cannot push code or read secrets. Do not copy any signing secrets into
upstream projects.

GitHub setup: Settings > Pages > Build and deployment > Source = **GitHub Actions**. The custom
domain stays configured there (`public/CNAME` is still copied into the site).

## Security model (public repo + secrets)

- Secrets are reachable only from `deploy.yml` / `publish.yml`, which run on `main` or by manual
  dispatch. `ci.yml` (pull requests, forks) has no secrets and a read-only token.
- Signing secrets are used only in the metadata-build step. Private keys are stored in 0600
  temporary files, deleted afterwards, and are never printed or passed as command-line contents.
- Workflow inputs go through environment variables, never interpolated into shell. Repo name and
  tag are validated; the repo must be on `ALLOWED_SOURCES`.
- Release archives are untrusted: symlinks/special files are rejected, names are validated, paths
  read from package metadata are sanitised, and single files over 95 MB are refused.
- Actions are pinned to commit SHAs. Update them deliberately.
- **Trust boundary:** releases from allowed repositories are eligible for publication and their
  generated repository metadata is signed by this project. Protect those repositories and their
  release permissions accordingly; never grant untrusted users tag/release access.

## Not generated here

The APK index and key are currently static inputs in `packages/`; publishing a new `.apk` does not
refresh the index. Before adding APK packages, regenerate and sign `APKINDEX.tar.gz` with the
private key matching `packages/apk/tamkungz.rsa.pub`, then commit the refreshed index:

```bash
(cd packages/apk/x86_64 && apk index --output APKINDEX.tar.gz *.apk)
abuild-sign -k /secure/path/tamkungz.rsa \
  -p packages/apk/tamkungz.rsa.pub packages/apk/x86_64
```

Keep the private key outside the repository. The commands above use the current `x86_64` tree;
repeat them for each architecture directory that has packages.

XBPS repository indexes and every package archive are rebuilt/signed during deployment with the
dedicated RSA key in `XBPS_PRIVATE_KEY`. The public key is derived from that secret on each
deployment and published as `xbps/tamkungz-void.pem.pub`, so XBPS signing is independent of the
GPG key and no stale public key is checked in. The secret is normalized to XBPS's RSA PEM format
in a temporary directory and removed when the build finishes. `xbps-rindex` is built from the
pinned upstream release before any signing secrets are made available to a step.

## Repository growth

Every published binary stays in git history. GitHub recommends repositories under 1 GB and Pages
sites are limited to 1 GB; `packages/` is currently ~106 MB.

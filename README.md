# TamKungZ_ Packages

The public package repository of **TamKungZ_**, served at **<https://packages.tamkungz.me>**.

It hosts software published by TamKungZ_ so it can be installed with the tools you already use:

| Ecosystem | Tool |
| --- | --- |
| Debian / Ubuntu | `apt` |
| Fedora / RHEL | `dnf` / `yum` |
| Alpine | `apk` |
| Void Linux | `xbps` |
| Arch Linux | `pacman` |
| Java / Kotlin | Maven, Gradle |
| Windows | `winget` manifests |

This repository is the source of that website. The site itself shows the packages that are
available and exact copy-paste instructions for each ecosystem, including how to trust the signing
key. Start there: **<https://packages.tamkungz.me>**.

## Is it safe?

- Repository metadata (APT, RPM, pacman) is signed with TamKungZ_'s GPG key, published at
  <https://packages.tamkungz.me/gpg.key>. Check the fingerprint on the site before trusting it.
- Packages are added only by an automated pipeline from TamKungZ_'s own projects, not by pull
  requests. Pull requests from outside are welcome for the website code, but packages are not
  accepted this way.
- Everything is built in public by GitHub Actions; no secret is exposed in this repository.

## Ownership

Everything here is made and maintained by **TamKungZ_** (<https://github.com/TamKungZ>,
dev@tamkungz.me). Packages in this repository are TamKungZ_'s software, not a mirror of other
projects.

## License

Copyright (c) 2026 TamKungZ_. **All rights reserved.** See [LICENSE](LICENSE) for the full text.

In short: you may download and install the packages and artifacts from this repository to build,
test or run your own projects. You may **not** redistribute, mirror or rehost them, sell or
sublicense them, or use this repository to build unofficial mirrors. An individual package may
carry its own license (in its POM, documentation or project page); if so, that license applies to
that package. Without one, all rights are reserved.

## Contributing and reporting problems

- Website bug or typo: open an issue or a pull request.
- Package problem: report it in that project's own repository, or email dev@tamkungz.me.
- Security issue: email dev@tamkungz.me rather than opening a public issue.

## For developers

How the site is built, how projects publish here, and the commands to run it locally:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

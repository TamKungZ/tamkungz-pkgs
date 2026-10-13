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
  <https://packages.tamkungz.me/gpg.key>. XBPS metadata and packages are signed with the separate
  RSA key published at <https://packages.tamkungz.me/xbps/tamkungz-void.pem.pub>.
  Verify the key before trusting the repository.
- Packages are added only by an automated pipeline from TamKungZ_'s own projects, not by pull
  requests. Pull requests from outside are welcome for the website code, but packages are not
  accepted this way.
- Everything is built in public by GitHub Actions; no secret is exposed in this repository.

## Ownership

Everything here is made and maintained by **TamKungZ_** (<https://github.com/TamKungZ>,
dev@tamkungz.me). Packages in this repository are TamKungZ_'s software, not a mirror of other
projects.

## License

This repository is a hosting service, so **each package has the license of its own project**;
publishing here does not change it. See [LICENSE](LICENSE) and the
[License page](https://packages.tamkungz.me/license/).

In short:

- You may download and install packages with your package manager to use, build or test software,
  under that package's own license.
- Official distribution repositories and established community repositories may mirror packages
  when the package's license allows it.
- Please do **not** create unofficial personal mirrors, PPAs or independently hosted copies of this
  repository without permission.
- The website, repository metadata, names and branding are Copyright (c) 2026 TamKungZ_,
  all rights reserved.

## Contributing and reporting problems

- Website bug or typo: open an issue or a pull request.
- Package problem: report it in that project's own repository, or email dev@tamkungz.me.
- Security issue: email dev@tamkungz.me rather than opening a public issue.

## For developers

How the site is built, how projects publish here, and the commands to run it locally:
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

# WinGet Manifests

WinGet support is handled with YAML manifests. For public installs, submit the
filled manifests to the Microsoft community `winget-pkgs` repository. This
package site can host the actual `.exe`, `.msi`, `.msix`, or bundle installer
files used by those manifests.

This folder is not a complete WinGet source by itself. A private WinGet source
needs the source format supported by the Windows Package Manager client, such as
a REST source.

Use `repo.tamkungz.me` as the private WinGet REST source:

```powershell
winget source add --name tamkungz --arg https://repo.tamkungz.me/winget --type Microsoft.Rest
winget install --id TamKungZ.ImageMerge -e
```

Use `packages.tamkungz.me` manifests for local testing or submission. The manifest path is local,
so clone the repository first:

```powershell
git clone https://github.com/TamKungZ/tamkungz-pkgs.git
Set-Location tamkungz-pkgs
winget settings --enable LocalManifestFiles
winget install --manifest winget/manifests/TamKungZ.ImageMerge/2.0.2/
```

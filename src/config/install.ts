/** "How to install" snippets shown on the home page and the Maven pages. */

export type CodeLanguage = "bash" | "gradle" | "groovy" | "powershell" | "ini";

export interface UsageBlock {
  label: string;
  /** Shown as a badge; also used as the code's language class. */
  lang: CodeLanguage;
  code: string;
}

export function apt(baseUrl: string, pkg = "<package-name>", arch = "amd64,arm64"): UsageBlock {
  return {
    label: "Debian / Ubuntu / Zorin",
    lang: "bash",
    code: `curl -fsSL ${baseUrl}/gpg.key | \\
  sudo gpg --dearmor -o /usr/share/keyrings/tamkungz-packages.gpg

echo "deb [arch=${arch} signed-by=/usr/share/keyrings/tamkungz-packages.gpg] ${baseUrl}/apt stable main" | \\
  sudo tee /etc/apt/sources.list.d/tamkungz-packages.list

sudo apt update
sudo apt install ${pkg}`,
  };
}

export function rpm(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Fedora / RPM",
    lang: "bash",
    code: `sudo tee /etc/yum.repos.d/tamkungz-packages.repo >/dev/null <<'EOF'
[tamkungz-packages]
name=TamKungZ Packages
baseurl=${baseUrl}/rpm/$basearch/
enabled=1
gpgcheck=0
repo_gpgcheck=1
gpgkey=${baseUrl}/gpg.key
EOF

sudo dnf install ${pkg}`,
  };
}

export function alpine(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Alpine APK",
    lang: "bash",
    code: `sudo mkdir -p /etc/apk/keys
curl -fsSL ${baseUrl}/apk/tamkungz.rsa.pub | \\
  sudo tee /etc/apk/keys/tamkungz.rsa.pub >/dev/null

echo "${baseUrl}/apk/$(apk --print-arch)" | \\
  sudo tee -a /etc/apk/repositories

sudo apk update
sudo apk add ${pkg}`,
  };
}

export function xbps(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Void XBPS",
    lang: "bash",
    code: `sudo mkdir -p /etc/xbps.d
sudo tee /etc/xbps.d/tamkungz.conf >/dev/null <<'EOF'
repository=${baseUrl}/xbps/x86_64
EOF

sudo xbps-install -S
sudo xbps-install ${pkg}`,
  };
}

export function pacman(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Arch Linux",
    lang: "bash",
    code: `curl -fsSL ${baseUrl}/gpg.key | sudo pacman-key --add -
sudo pacman-key --lsign-key B64B156379154E5B6C176D0D6157503BFCD109A4

sudo tee -a /etc/pacman.conf >/dev/null <<'EOF'
[tamkungz]
Server = ${baseUrl}/arch/$arch
SigLevel = DatabaseRequired PackageOptional
EOF

sudo pacman -Sy
sudo pacman -S ${pkg}`,
  };
}

export function maven(repoUrl: string, name = "TamKungZ Packages"): UsageBlock {
  return {
    label: "Maven / Gradle",
    lang: "gradle",
    code: `repositories {
    maven {
        name = "${name}"
        url = uri("${repoUrl}")
    }
}`,
  };
}

export function winget(id = "TamKungZ.<PackageName>"): UsageBlock {
  return {
    label: "Windows Package Manager",
    lang: "powershell",
    code: `# repo.tamkungz.me: private WinGet REST source
winget source add --name tamkungz --arg https://repo.tamkungz.me/winget --type Microsoft.Rest
winget install --id ${id} -e

# packages.tamkungz.me: static manifests for local testing/submission
winget settings --enable LocalManifestFiles
winget install --manifest winget/manifests/${id}/<version>/`,
  };
}

/** Everything shown on the home page. Maven is included only when /maven exists. */
export function homeBlocks(baseUrl: string, hasMaven: boolean): UsageBlock[] {
  const blocks = [apt(baseUrl), rpm(baseUrl), alpine(baseUrl), xbps(baseUrl), pacman(baseUrl), winget()];
  if (hasMaven) blocks.push(maven(`${baseUrl}/maven/`));
  return blocks;
}

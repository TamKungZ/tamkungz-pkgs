/** "How to install" snippets shown on the home page and the Maven pages. */

export type CodeLanguage = "bash" | "gradle" | "groovy" | "powershell" | "ini" | "xml";

export interface UsageBlock {
  label: string;
  /** Shown as a badge; also used as the code's language class. */
  lang: CodeLanguage;
  code: string;
}

export function apt(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Debian / Ubuntu / Zorin",
    lang: "bash",
    code: `sudo install -d -m 0755 /usr/share/keyrings
curl -fsSL ${baseUrl}/gpg.key | \\
  sudo gpg --dearmor --yes -o /usr/share/keyrings/tamkungz-packages.gpg
sudo chmod 0644 /usr/share/keyrings/tamkungz-packages.gpg

echo "deb [signed-by=/usr/share/keyrings/tamkungz-packages.gpg] ${baseUrl}/apt stable main" | \\
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
# Signed repository metadata authenticates package checksums.
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

repository="${baseUrl}/apk/$(apk --print-arch)"
grep -qxF "$repository" /etc/apk/repositories || \\
  echo "$repository" | sudo tee -a /etc/apk/repositories >/dev/null

sudo apk update
sudo apk add ${pkg}`,
  };
}

export function pacman(baseUrl: string, pkg = "<package-name>"): UsageBlock {
  return {
    label: "Arch Linux",
    lang: "bash",
    code: `key_file="$(mktemp)"
trap 'rm -f "$key_file"' EXIT
curl -fsSL ${baseUrl}/gpg.key -o "$key_file"
sudo pacman-key --add "$key_file"
sudo pacman-key --lsign-key B64B156379154E5B6C176D0D6157503BFCD109A4

if ! grep -q '^\\[tamkungz\\]$' /etc/pacman.conf; then
  sudo tee -a /etc/pacman.conf >/dev/null <<'EOF'
[tamkungz]
Server = ${baseUrl}/arch/$arch
SigLevel = DatabaseRequired PackageOptional
EOF
fi

sudo pacman -Syu --needed ${pkg}`,
  };
}

export function maven(repoUrl: string, name = "TamKungZ Packages"): UsageBlock {
  return {
    label: "Gradle",
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
    code: `# Add the private source once
winget source add --name tamkungz --arg https://repo.tamkungz.me/winget --type Microsoft.Rest
winget install --id ${id} -e --source tamkungz`,
  };
}

/** Everything shown on the home page. Maven is included only when /maven exists. */
export function homeBlocks(baseUrl: string, hasMaven: boolean): UsageBlock[] {
  const blocks = [apt(baseUrl), rpm(baseUrl), alpine(baseUrl), pacman(baseUrl), winget()];
  if (hasMaven) blocks.push(maven(`${baseUrl}/maven/`));
  return blocks;
}

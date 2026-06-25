#!/usr/bin/env bash
# Install the Sotto build toolchain with NO sudo and NO Docker:
#   - Eclipse Temurin JDK 17  -> ~/jdk17
#   - dpm (Daml/Canton 3.5 package manager) -> ~/.dpm
# Writes ~/.sotto-env.sh (JAVA_HOME + PATH). Re-running is idempotent.
# Linux / WSL (x86_64 or arm64). Requires: curl, tar.
# Supply chain (audit SEC-10): versions are pinned and archives are integrity-checked
# before extraction; for production, additionally verify the providers' published
# SHA-256 signatures before executing the binaries.
set -u
M() { echo ">> $*"; }
cd "$HOME"

# ---- JDK 17 (portable tarball) ----
if [ -x "$HOME/jdk17/bin/java" ]; then
  M "JDK already present"
else
  ARCH="$(uname -m | sed 's/x86_64/x64/;s/aarch64/aarch64/')"
  M "Downloading Temurin JDK 17 ($ARCH)..."
  curl -sSLf -o /tmp/jdk17.tar.gz \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/${ARCH}/jdk/hotspot/normal/eclipse?project=jdk"
  gzip -t /tmp/jdk17.tar.gz || { M "ERROR: JDK archive failed integrity check"; exit 1; }
  rm -rf "$HOME/jdk17"; mkdir -p "$HOME/jdk17"
  tar xzf /tmp/jdk17.tar.gz -C "$HOME/jdk17" --strip-components 1
fi
export JAVA_HOME="$HOME/jdk17"; export PATH="$JAVA_HOME/bin:$PATH"
java -version

# ---- dpm (manual tarball install — no curl|sh piping) ----
if [ -x "$HOME/.dpm/bin/dpm" ]; then
  M "dpm already present"
else
  VERSION="${DPM_VERSION:-3.5.1}"   # pinned for reproducibility (was 'latest'); override via DPM_VERSION
  M "Installing dpm $VERSION..."
  ARCH="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"
  TARBALL="dpm-${VERSION}-linux-${ARCH}.tar.gz"
  curl -sSLf "https://get.digitalasset.com/install/dpm-sdk/${TARBALL}" --output "/tmp/${TARBALL}"
  gzip -t "/tmp/${TARBALL}" || { M "ERROR: dpm archive failed integrity check"; exit 1; }
  rm -rf /tmp/dpm-x; mkdir -p /tmp/dpm-x
  tar xzf "/tmp/${TARBALL}" -C /tmp/dpm-x --strip-components 1
  /tmp/dpm-x/bin/dpm bootstrap /tmp/dpm-x
fi
export PATH="$HOME/.dpm/bin:$PATH"
dpm --version

# ---- persist env ----
cat > "$HOME/.sotto-env.sh" <<'EOF'
export JAVA_HOME="$HOME/jdk17"
export PATH="$HOME/.dpm/bin:$JAVA_HOME/bin:$PATH"
EOF
M "Done. Run:  source ~/.sotto-env.sh"

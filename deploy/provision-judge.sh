#!/usr/bin/env bash
# =============================================================================
# Provision the Submit50 judge worker on a fresh Ubuntu 24.04 (Oracle Cloud
# free-tier ARM is the target, any Ubuntu VPS works identically).
#
# Layout it installs (matches deploy/judge.service):
#   /opt/submit50                  repo clone (judge at /opt/submit50/judge)
#   /opt/submit50/judge/.env       prod worker env (written below)
#   /opt/submit50/judge/node_modules + dist
#   /var/lib/submit50/work         scratch dir (host-visible to Docker)
#   /etc/systemd/system/judge.service
#
# Secrets are NOT in this repo — export them before running:
#   JUDGE_MONGODB_URI=mongodb+srv://...
#   JUDGE_REDIS_URL=rediss://default:...
# =============================================================================
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run as root (sudo ./provision-judge.sh)" >&2
  exit 1
fi

: "${JUDGE_MONGODB_URI:?set JUDGE_MONGODB_URI (Atlas+srv string)}"
: "${JUDGE_REDIS_URL:?set JUDGE_REDIS_URL (Upstash rediss:// string)}"

JUDGE_NAME="${JUDGE_NAME:-judge-1}"
JUDGE_CONCURRENCY="${JUDGE_CONCURRENCY:-2}"

echo "==> system packages (docker, node 22, git, make)"
apt-get update --quiet
# Detect arch so NodeSource installs the right build (ARM64 free tier).
ARCH=$(uname -m)
if [[ "$ARCH" == aarch64* ]]; then NODE_ARCH="arm64"; else NODE_ARCH="x64"; fi
apt-get install -y --no-install-recommends ca-certificates curl git gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y --no-install-recommends nodejs docker.io
systemctl enable --now docker

echo "==> judge user (docker group for socket access)"
id -u judge &>/dev/null || useradd --system --create-home --groups docker judge
usermod -aG docker judge

echo "==> clone / update repo"
mkdir -p /opt/submit50
if [[ -d /opt/submit50/.git ]]; then
  git -C /opt/submit50 pull --ff-only
else
  git clone --depth 1 https://github.com/Chinmaystar/submit50.git /opt/submit50
fi

echo "==> build sandbox image (g++ only, no secrets)"
docker build -t acm-judge-sandbox:latest /opt/submit50/judge/sandbox

echo "==> worker deps + compile"
npm ci --prefix /opt/submit50/judge
npm run --prefix /opt/submit50/judge build

echo "==> env"
mkdir -p /var/lib/submit50/work
chown judge:judge /var/lib/submit50/work
cat > /opt/submit50/judge/.env <<ENVEOF
NODE_ENV=production
MONGODB_URI=${JUDGE_MONGODB_URI}
REDIS_URL=${JUDGE_REDIS_URL}
JUDGE_MODE=docker
SANDBOX_IMAGE=acm-judge-sandbox:latest
JUDGE_NAME=${JUDGE_NAME}
JUDGE_CONCURRENCY=${JUDGE_CONCURRENCY}
JUDGE_WORK_DIR=/var/lib/submit50/work
LOG_LEVEL=info
ENVEOF
chown judge:judge /opt/submit50/judge/.env
chmod 600 /opt/submit50/judge/.env

echo "==> systemd unit"
cp /opt/submit50/deploy/judge.service /etc/systemd/system/judge.service
systemctl daemon-reload
systemctl enable --now judge.service

echo "==> status"
systemctl status judge.service --no-pager || true
journalctl -u judge.service -n 20 --no-pager || true
echo "DONE. Watch with: journalctl -u judge.service -f"
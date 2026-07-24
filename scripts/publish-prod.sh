#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

deploy_user="${CHM_DEPLOY_USER:-danvallentyne}"
deploy_host="${CHM_DEPLOY_HOST:-34.169.201.150}"
deploy_key="${CHM_DEPLOY_KEY:-$HOME/.ssh/CHM-Network}"
deploy_port="${CHM_DEPLOY_PORT:-22}"
deploy_home="${CHM_DEPLOY_HOME:-/home/$deploy_user}"
public_url="${CHM_PUBLIC_URL:-http://34.169.201.150}"
web_root="${CHM_DEPLOY_WEB_ROOT:-/var/www/chm-network}"
releases_root="${CHM_DEPLOY_RELEASES_ROOT:-/var/www/chm-network-releases}"

ssh_target="${deploy_user}@${deploy_host}"
ssh_opts=(
  -i "$deploy_key"
  -o IdentitiesOnly=yes
  -o PreferredAuthentications=publickey
  -o StrictHostKeyChecking=accept-new
  -p "$deploy_port"
)
scp_opts=(
  -i "$deploy_key"
  -o IdentitiesOnly=yes
  -o PreferredAuthentications=publickey
  -o StrictHostKeyChecking=accept-new
  -P "$deploy_port"
)

release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short HEAD)"
remote_archive="$deploy_home/chm-network-release-$release_id.tar.gz"

tmp_dir="$(mktemp -d -t chm-network-publish)"
archive_path="$tmp_dir/chm-network-release.tar.gz"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

echo "Building public bundle..."
(cd "$repo_root" && npm run build:public)

echo "Packaging release $release_id..."
COPYFILE_DISABLE=1 tar -C "$repo_root/client/dist" -czf "$archive_path" .

echo "Uploading release archive to $ssh_target..."
scp "${scp_opts[@]}" "$archive_path" "$ssh_target:$remote_archive"

echo "Installing release on production VM..."
ssh "${ssh_opts[@]}" "$ssh_target" bash -s -- \
  "$release_id" \
  "$remote_archive" \
  "$web_root" \
  "$releases_root" <<'EOF'
set -euo pipefail

release_id="$1"
remote_archive="$2"
web_root="$3"
releases_root="$4"
release_dir="$releases_root/$release_id"

sudo mkdir -p "$releases_root"
sudo rm -rf "$release_dir"
sudo mkdir -p "$release_dir"
sudo tar -xzf "$remote_archive" -C "$release_dir"
sudo chown -R www-data:www-data "$release_dir"

if [ -d "$web_root" ] && [ ! -L "$web_root" ]; then
  backup_dir="${web_root}-backup-$(date -u +%Y%m%dT%H%M%SZ)"
  sudo mv "$web_root" "$backup_dir"
fi

sudo ln -sfn "$release_dir" "$web_root"
sudo nginx -t
sudo systemctl reload nginx
rm -f "$remote_archive"
EOF

echo "Verifying production root..."
curl -fsSI --max-time 15 "$public_url" >/dev/null

echo "Verifying production bootstrap payload..."
curl -fsS --max-time 30 "$public_url/bootstrap.public.json" | node -e '
let input = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  const payload = JSON.parse(input);
  if (
    !Array.isArray(payload.nodes) ||
    !Array.isArray(payload.edges) ||
    !Array.isArray(payload.sources) ||
    !Array.isArray(payload.ryuRoutes) ||
    !Array.isArray(payload.savedViews)
  ) {
    throw new Error("bootstrap.public.json is missing expected arrays");
  }

  console.log(
    `Published ${payload.nodes.length} nodes, ` +
      `${payload.edges.length} edges, ` +
      `${payload.sources.length} sources, ` +
      `${payload.ryuRoutes.length} Ryu routes, ` +
      `${payload.savedViews.length} saved views.`,
  );
});
'

echo "Production publish complete: $release_id"

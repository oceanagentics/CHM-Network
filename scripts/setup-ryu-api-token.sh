#!/usr/bin/env bash
set -euo pipefail

project="${RYU_GCP_PROJECT:-chm-network}"
api_url="${RYU_API_URL:-https://chm.oceanagentics.org}"
secret="${RYU_API_TOKEN_SECRET:-}"
env_file="${RYU_API_ENV_FILE:-$HOME/.config/ryu/api.env}"
profile_file="${RYU_API_PROFILE_FILE:-$HOME/.zshenv}"
token_source=""
write_profile=1
verify=1

usage() {
  cat <<'USAGE'
Usage:
  scripts/setup-ryu-api-token.sh --secret SECRET_NAME [--project chm-network]
  scripts/setup-ryu-api-token.sh --prompt
  RYU_API_TOKEN=... scripts/setup-ryu-api-token.sh --from-env

Options:
  --secret NAME     Read the token from Google Secret Manager.
  --project ID      Google Cloud project for Secret Manager. Default: chm-network.
  --api-url URL     Ryu API base URL. Default: https://chm.oceanagentics.org.
  --env-file PATH   File to write. Default: ~/.config/ryu/api.env.
  --profile PATH    Shell startup file to update. Default: ~/.zshenv.
  --from-env        Read the token from the current RYU_API_TOKEN environment variable.
  --prompt          Prompt for the token without echoing input.
  --no-profile      Do not update the shell startup file.
  --no-verify       Do not verify the token against /api/records.
  -h, --help        Show this help.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

shell_quote() {
  printf "'"
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}

startup_path_for() {
  case "$1" in
    "$HOME"/*) printf '$HOME/%s' "${1#"$HOME"/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

tmp_env_file=""
verify_body=""
cleanup() {
  [ -n "$tmp_env_file" ] && rm -f "$tmp_env_file"
  [ -n "$verify_body" ] && rm -f "$verify_body"
  return 0
}
trap cleanup EXIT

while [ "$#" -gt 0 ]; do
  case "$1" in
    --secret)
      [ "$#" -ge 2 ] || fail "--secret requires a value"
      secret="$2"
      token_source="secret"
      shift 2
      ;;
    --project)
      [ "$#" -ge 2 ] || fail "--project requires a value"
      project="$2"
      shift 2
      ;;
    --api-url)
      [ "$#" -ge 2 ] || fail "--api-url requires a value"
      api_url="${2%/}"
      shift 2
      ;;
    --env-file)
      [ "$#" -ge 2 ] || fail "--env-file requires a value"
      env_file="$2"
      shift 2
      ;;
    --profile)
      [ "$#" -ge 2 ] || fail "--profile requires a value"
      profile_file="$2"
      shift 2
      ;;
    --from-env)
      token_source="env"
      shift
      ;;
    --prompt)
      token_source="prompt"
      shift
      ;;
    --no-profile)
      write_profile=0
      shift
      ;;
    --no-verify)
      verify=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

api_url="${api_url%/}"

if [ -z "$token_source" ]; then
  if [ -n "$secret" ]; then
    token_source="secret"
  elif [ -n "${RYU_API_TOKEN:-}" ]; then
    token_source="env"
  else
    token_source="prompt"
  fi
fi

case "$token_source" in
  secret)
    [ -n "$secret" ] || fail "--secret or RYU_API_TOKEN_SECRET is required"
    need_command gcloud
    token="$(gcloud secrets versions access latest --project "$project" --secret "$secret")"
    ;;
  env)
    token="${RYU_API_TOKEN:-}"
    ;;
  prompt)
    if [ ! -t 0 ]; then
      fail "stdin is not a terminal; use --secret or --from-env"
    fi
    printf "Ryu API token: " >&2
    IFS= read -r -s token
    printf "\n" >&2
    ;;
  *)
    fail "invalid token source"
    ;;
esac

[ -n "$token" ] || fail "token is empty"

config_dir="$(dirname "$env_file")"
if [ ! -d "$config_dir" ]; then
  mkdir -p "$config_dir"
  chmod 700 "$config_dir"
elif [ "$config_dir" = "$HOME/.config/ryu" ]; then
  chmod 700 "$config_dir"
fi

tmp_env_file="$(mktemp "${env_file}.tmp.XXXXXX")"
{
  printf '# Written by scripts/setup-ryu-api-token.sh. Do not commit this file.\n'
  printf 'export RYU_API_URL=%s\n' "$(shell_quote "$api_url")"
  printf 'export RYU_API_TOKEN=%s\n' "$(shell_quote "$token")"
} > "$tmp_env_file"
chmod 600 "$tmp_env_file"
mv "$tmp_env_file" "$env_file"
tmp_env_file=""

if [ "$write_profile" -eq 1 ]; then
  source_path="$(startup_path_for "$env_file")"
  source_line="[ -f \"$source_path\" ] && . \"$source_path\""
  if [ ! -e "$profile_file" ]; then
    : > "$profile_file"
    chmod 600 "$profile_file"
  fi
  if ! grep -Fqx "$source_line" "$profile_file"; then
    {
      printf '\n# Ryu API token environment\n'
      printf '%s\n' "$source_line"
    } >> "$profile_file"
  fi
fi

if [ "$verify" -eq 1 ]; then
  need_command curl
  verify_body="$(mktemp "${TMPDIR:-/tmp}/ryu-api-token-verify.XXXXXX")"
  http_status="$(
    curl -sS -o "$verify_body" -w '%{http_code}' \
      "$api_url/api/records?limit=1" \
      -H "Authorization: Bearer $token"
  )"
  if [ "$http_status" != "200" ]; then
    echo "verification failed with HTTP $http_status" >&2
    head -c 300 "$verify_body" >&2 || true
    echo >&2
    exit 1
  fi
fi

echo "Wrote $env_file"
[ "$write_profile" -eq 1 ] && echo "Ensured $profile_file sources $env_file"
[ "$verify" -eq 1 ] && echo "Verified $api_url/api/records with the configured token"
echo "Token value was not printed."

#!/usr/bin/env bash
# Общие функции для deploy-скриптов Miraflores.
set -euo pipefail

DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONO_ROOT="$(cd "$DEPLOY_ROOT/.." && pwd)"

load_deploy_env() {
  local env_file="$DEPLOY_ROOT/deploy.env"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a && source "$env_file" && set +a
  elif [[ -f "$DEPLOY_ROOT/deploy.env.example" ]]; then
    echo "warn: нет deploy/deploy.env — беру deploy.env.example" >&2
    # shellcheck disable=SC1090
    set -a && source "$DEPLOY_ROOT/deploy.env.example" && set +a
  fi

  : "${DEPLOY_HOST:?задайте DEPLOY_HOST в deploy/deploy.env}"
  DEPLOY_PATH="${DEPLOY_PATH:-/opt/miraflores}"
  DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
  DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_mira_ap}"
  FRONT_STATIC_DIR="${FRONT_STATIC_DIR:-/var/www/miraflores-front}"
  # Push в Miraflores-cosmetic с Mac — тот же ключ, что и VPS (не личный Highrates).
  FRONT_GIT_PUSH_KEY="${FRONT_GIT_PUSH_KEY:-$DEPLOY_SSH_KEY}"
}

setup_ssh() {
  local key="${DEPLOY_SSH_KEY/#\~/$HOME}"
  if [[ ! -f "$key" ]]; then
    echo "error: SSH-ключ не найден: $key" >&2
    echo "       Задайте DEPLOY_SSH_KEY в deploy/deploy.env" >&2
    exit 1
  fi
  SSH=(ssh -o RequestTTY=no -o BatchMode=yes -i "$key" -o IdentitiesOnly=yes)
  RSYNC=(rsync -az --delete -e "ssh -o RequestTTY=no -o BatchMode=yes -i '$key' -o IdentitiesOnly=yes")
  GIT_SSH_COMMAND="ssh -i '$key' -o IdentitiesOnly=yes"
  export GIT_SSH_COMMAND
}

verify_deploy_ssh() {
  log "проверка SSH → $DEPLOY_HOST"
  if ! "${SSH[@]}" -o ConnectTimeout=15 "$DEPLOY_HOST" "echo ok" >/dev/null 2>&1; then
    local key="${DEPLOY_SSH_KEY/#\~/$HOME}"
    echo "error: SSH к $DEPLOY_HOST не прошёл (Permission denied?)" >&2
    echo "" >&2
    echo "Ключ из deploy.env: $key" >&2
    echo "Он работает для GitHub, но должен быть в ~/.ssh/authorized_keys на VPS." >&2
    echo "" >&2
    echo "Один раз добавьте ключ (попросит пароль root):" >&2
    echo "  ssh-copy-id -i ${key}.pub $DEPLOY_HOST" >&2
    echo "" >&2
    echo "Или задеплойте вручную на сервере (см. deploy/README.md)." >&2
    exit 1
  fi
}

log() { printf '==> %s\n' "$*"; }

require_clean_git() {
  local dir="$1"
  if ! git -C "$dir" diff --quiet || ! git -C "$dir" diff --cached --quiet; then
    echo "error: в $dir есть незакоммиченные изменения" >&2
    git -C "$dir" status -sb
    exit 1
  fi
}

git_push_dir() {
  local dir="$1"
  local branch="${2:-$DEPLOY_BRANCH}"
  local current
  current="$(git -C "$dir" rev-parse --abbrev-ref HEAD)"
  if [[ "$current" != "$branch" ]]; then
    echo "error: в $dir ветка '$current', ожидается '$branch'" >&2
    exit 1
  fi
  log "git push ($dir) → origin/$branch"
  local key="${FRONT_GIT_PUSH_KEY:-${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519_mira_ap}}"
  key="${key/#\~/$HOME}"
  GIT_SSH_COMMAND="ssh -i '$key' -o IdentitiesOnly=yes" git -C "$dir" push -u origin "$branch"
}

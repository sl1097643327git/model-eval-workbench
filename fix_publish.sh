#!/usr/bin/env bash
set -euo pipefail
export HTTP_PROXY='http://127.0.0.1:7897'
export HTTPS_PROXY='http://127.0.0.1:7897'
export ALL_PROXY='socks5://127.0.0.1:7897'
cd /d/projects/model-eval-workbench
printf 'before node_modules=%s dist=%s\n' "$(git ls-files node_modules | wc -l)" "$(git ls-files dist | wc -l)"
git rm -r --cached node_modules dist
git add .gitignore .
git commit -m 'chore: remove tracked dependencies and build output' || true
printf 'after node_modules=%s dist=%s\n' "$(git ls-files node_modules | wc -l)" "$(git ls-files dist | wc -l)"
git push origin main
if [ -z "${VERCEL_TOKEN:-}" ]; then
  echo 'VERCEL_TOKEN is not set' >&2
  exit 1
fi
vercel --prod --yes --token "$VERCEL_TOKEN"

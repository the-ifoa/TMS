#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  TMS service control — run backend + frontend together
#
#  Usage:  ./service.sh <command> [target] [--prod]
#
#  Commands:
#    start   [backend|frontend|all]   start in background   (default: all)
#    stop    [backend|frontend|all]   stop
#    restart [backend|frontend|all]   stop then start
#    status                           show what is running + ports
#    logs    [backend|frontend|all]   tail -f the log(s)     (default: all)
#    build                            build the frontend for production
#    help
#
#  Options:
#    --prod        run in production mode:
#                    backend  = node server.js        (no nodemon)
#                    frontend = vite build + vite preview
#                  default is dev mode (nodemon + vite dev server)
#    --keep-logs   do NOT clear the logs on start/restart (they are wiped
#                  by default; the previous run is kept as <file>.prev)
#    --no-tail     do NOT follow logs/backend.log after start/restart
#                  (by default start/restart tail -F it once services are up)
#
#  PIDs live in logs/.run/ , logs in logs/ :
#    logs/backend.log        server console + HTTP lines (written by the app)
#    logs/backend.out.log    raw stdout/stderr of the backend process
#    logs/frontend.dev.log   vite dev/preview server output
#    logs/frontend.log       browser errors shipped from clients
# ─────────────────────────────────────────────────────────────────────────────
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"
LOG_DIR="$ROOT/logs"
RUN_DIR="$LOG_DIR/.run"
mkdir -p "$RUN_DIR"

BACKEND_PORT="$(grep -E '^\s*PORT=' "$BACKEND_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
BACKEND_PORT="${BACKEND_PORT:-5000}"
FRONTEND_PORT="$(grep -E 'port:\s*[0-9]+' "$FRONTEND_DIR/vite.config.js" 2>/dev/null | head -1 | grep -oE '[0-9]+')"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

MODE="dev"
KEEP_LOGS="false"
NO_TAIL="false"
ARGS=()
for a in "$@"; do
  case "$a" in
    --prod|-p)   MODE="prod" ;;
    --dev)       MODE="dev" ;;
    --keep-logs) KEEP_LOGS="true" ;;
    --no-tail)   NO_TAIL="true" ;;
    *)           ARGS+=("$a") ;;
  esac
done
CMD="${ARGS[0]:-help}"
TARGET="${ARGS[1]:-all}"

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_ylw=$'\033[33m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
info() { printf '%s\n' "$*"; }
ok()   { printf '%s%s%s\n' "$c_grn" "$*" "$c_rst"; }
warn() { printf '%s%s%s\n' "$c_ylw" "$*" "$c_rst"; }
err()  { printf '%s%s%s\n' "$c_red" "$*" "$c_rst" >&2; }

pidfile()  { echo "$RUN_DIR/$1.pid"; }
is_alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }

svc_pid() {  # echoes the tracked pid if the process is still alive
  local f; f="$(pidfile "$1")"
  [ -f "$f" ] || return 1
  local p; p="$(cat "$f" 2>/dev/null)"
  if is_alive "$p"; then echo "$p"; return 0; fi
  rm -f "$f"; return 1
}

port_pids() {  # pids listening on a tcp port, whichever tool is available
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$port/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$'
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  fi
}

start_one() {
  local name="$1" dir="$2" cmd="$3" out="$4"
  local p; if p="$(svc_pid "$name")"; then warn "$name already running (pid $p)"; return 0; fi

  local stale; stale="$(port_pids "$5" | tr '\n' ' ')"
  if [ -n "${stale// /}" ]; then
    err "$name port $5 already in use by pid(s): $stale"
    err "  run './service.sh restart $name' to replace it, or './service.sh stop $name' first"
    return 1
  fi

  info "starting $name ${c_dim}($MODE: $cmd)${c_rst}"
  (
    cd "$dir" || exit 1
    if command -v setsid >/dev/null 2>&1; then
      exec setsid bash -c "$cmd" >>"$out" 2>&1
    else
      exec bash -c "$cmd" >>"$out" 2>&1
    fi
  ) &
  local pid=$!
  echo "$pid" > "$(pidfile "$name")"
  echo "$MODE" > "$RUN_DIR/$name.mode"
  sleep 1
  if is_alive "$pid"; then ok "  $name up (pid $pid) → log: ${out#$ROOT/}"
  else err "  $name failed to start — see ${out#$ROOT/}"; return 1; fi
}

stop_one() {
  local name="$1" port="$2"
  local p; p="$(svc_pid "$name" || true)"
  if [ -n "${p:-}" ]; then
    info "stopping $name (pid $p)"
    kill -TERM "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null
    for _ in $(seq 1 20); do is_alive "$p" || break; sleep 0.25; done
    if is_alive "$p"; then warn "  force killing $name"; kill -KILL "-$p" 2>/dev/null || kill -KILL "$p" 2>/dev/null; fi
    rm -f "$(pidfile "$name")" "$RUN_DIR/$name.mode"
    ok "  $name stopped"
  else
    info "$name not tracked as running"
  fi
  # sweep anything still holding the port (orphaned nodemon/vite children)
  local leftover; leftover="$(port_pids "$port" | tr '\n' ' ')"
  if [ -n "${leftover// /}" ]; then
    warn "  port $port still held by: $leftover — killing"
    # shellcheck disable=SC2086
    kill -TERM $leftover 2>/dev/null; sleep 1
    leftover="$(port_pids "$port" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    [ -n "${leftover// /}" ] && kill -KILL $leftover 2>/dev/null
  fi
}

# Truncate a service's logs on (re)start so each run starts clean. The previous
# contents are kept once as <file>.prev . Skip with --keep-logs .
reset_logs() {
  [ "$KEEP_LOGS" = "true" ] && { info "keeping existing $1 logs (--keep-logs)"; return 0; }
  local files=()
  case "$1" in
    backend)  files=("$LOG_DIR/backend.log" "$LOG_DIR/backend.out.log") ;;
    frontend) files=("$LOG_DIR/frontend.dev.log" "$LOG_DIR/frontend.log") ;;
  esac
  for f in "${files[@]}"; do
    [ -s "$f" ] && cp -f "$f" "$f.prev" 2>/dev/null
    : > "$f"
  done
  info "cleared $1 logs ${c_dim}(previous kept as *.prev)${c_rst}"
}

backend_cmd()  { if [ "$MODE" = prod ]; then echo "npm start"; else echo "npm run dev"; fi; }
frontend_cmd() { if [ "$MODE" = prod ]; then echo "npm run build && npm run preview -- --port $FRONTEND_PORT --host"; else echo "npm run dev"; fi; }

do_start() {
  case "$1" in
    backend)  reset_logs backend;  start_one backend  "$BACKEND_DIR"  "$(backend_cmd)"  "$LOG_DIR/backend.out.log"   "$BACKEND_PORT" ;;
    frontend) reset_logs frontend; start_one frontend "$FRONTEND_DIR" "$(frontend_cmd)" "$LOG_DIR/frontend.dev.log"  "$FRONTEND_PORT" ;;
    all)      do_start backend; do_start frontend ;;
    *) err "unknown target: $1"; exit 2 ;;
  esac
}
do_stop() {
  case "$1" in
    backend)  stop_one backend  "$BACKEND_PORT" ;;
    frontend) stop_one frontend "$FRONTEND_PORT" ;;
    all)      do_stop frontend; do_stop backend ;;
    *) err "unknown target: $1"; exit 2 ;;
  esac
}

status_one() {
  local name="$1" port="$2" url="$3"
  local p mode; p="$(svc_pid "$name" || true)"; mode="$(cat "$RUN_DIR/$name.mode" 2>/dev/null || echo '-')"
  local pp; pp="$(port_pids "$port" | tr '\n' ' ')"
  if [ -n "${p:-}" ]; then
    ok   "$(printf '%-9s RUNNING  pid=%-7s mode=%-4s port=%s  %s' "$name" "$p" "$mode" "$port" "$url")"
  elif [ -n "${pp// /}" ]; then
    warn "$(printf '%-9s (untracked) port %s held by pid(s): %s' "$name" "$port" "$pp")"
  else
    info "$(printf '%-9s stopped' "$name")"
  fi
}

do_status() {
  info "TMS services  ${c_dim}root=$ROOT${c_rst}"
  status_one backend  "$BACKEND_PORT"  "http://localhost:$BACKEND_PORT/api/health"
  status_one frontend "$FRONTEND_PORT" "http://localhost:$FRONTEND_PORT"
}

do_logs() {
  local files=()
  case "$1" in
    backend)  files=("$LOG_DIR/backend.log" "$LOG_DIR/backend.out.log") ;;
    frontend) files=("$LOG_DIR/frontend.dev.log" "$LOG_DIR/frontend.log") ;;
    all)      files=("$LOG_DIR/backend.log" "$LOG_DIR/backend.out.log" "$LOG_DIR/frontend.dev.log" "$LOG_DIR/frontend.log") ;;
    *) err "unknown target: $1"; exit 2 ;;
  esac
  for f in "${files[@]}"; do [ -f "$f" ] || : > "$f"; done
  info "tailing: ${files[*]#$ROOT/}  ${c_dim}(Ctrl-C to quit)${c_rst}"
  tail -n 40 -F "${files[@]}"
}

# After start/restart, follow the app log so the fresh run is visible right away.
# Skips when --no-tail is given, stdout is not a terminal, or the target is
# frontend-only. Ctrl-C quits the tail; the services keep running.
tail_backend() {
  [ "$NO_TAIL" = "true" ] && return 0
  [ -t 1 ] || return 0
  case "$TARGET" in frontend) return 0 ;; esac
  local f="$LOG_DIR/backend.log"
  [ -f "$f" ] || : > "$f"
  echo
  info "following ${f#$ROOT/}  ${c_dim}(Ctrl-C to quit — server keeps running; --no-tail to skip)${c_rst}"
  exec tail -n 40 -F "$f"
}

case "$CMD" in
  start)   do_start "$TARGET"; echo; do_status; tail_backend ;;
  stop)    do_stop  "$TARGET" ;;
  restart) do_stop "$TARGET"; sleep 1; do_start "$TARGET"; echo; do_status; tail_backend ;;
  status)  do_status ;;
  logs)    do_logs "$TARGET" ;;
  build)   ( cd "$FRONTEND_DIR" && npm run build ) ;;
  help|-h|--help)
     sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' ;;
  *) err "unknown command: $CMD"; echo;  sed -n '2,29p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

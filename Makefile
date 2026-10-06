SHELL := /bin/sh
.DEFAULT_GOAL := help
.NOTPARALLEL:

# 이 checkout의 인스턴스 설정(Compose project·포트). 없으면 scripts/instance.mjs가 만듭니다. docs/adr/0008-worktree-local-instances.md
INSTANCE_ENV := .local/instance.env
-include $(INSTANCE_ENV)
# Compose 포트 변수는 셸 환경이 --env-file보다 우선하므로 infra/local/.env의 포트보다 인스턴스 값이 쓰입니다.
export POSTGRES_PORT VALKEY_PORT

export PM2_HOME := $(CURDIR)/.local/pm2
PM2 := pnpm exec pm2
COMPOSE = $(if $(COMPOSE_PROJECT_NAME),docker compose --project-name $(COMPOSE_PROJECT_NAME) --project-directory "$(CURDIR)/infra/local" --env-file "$(CURDIR)/infra/local/.env" -f "$(CURDIR)/infra/local/compose.yaml",$(error $(INSTANCE_ENV)에 COMPOSE_PROJECT_NAME이 없습니다. pnpm instance로 다시 만드세요))

.PHONY: help up down restart status instance-destroy infra-up infra-down infra-restart infra-status infra-logs api-up api-down api-restart web-up web-down web-restart app-up app-down app-restart

help:
	@printf '%s\n' '사용법: make <대상>' '' \
	  '  up / down / restart / status       전체 로컬 서비스(이 checkout 인스턴스)' \
	  '  infra-up / infra-down / infra-restart  로컬 PostgreSQL + Valkey' \
	  '  infra-status / infra-logs              로컬 인프라 상태와 로그' \
	  '  api-up / api-down / api-restart       NestJS 개발 서버' \
	  '  web-up / web-down / web-restart       Next.js 개발 서버' \
	  '  app-up / app-down / app-restart       Expo 개발 서버' \
	  '  instance-destroy CONFIRM=1            연결된 worktree 인스턴스의 컨테이너·볼륨·PM2 삭제(주 checkout 거부)' \
	  '' '인스턴스 포트·주소: pnpm instance, 서비스 로그: pnpm logs <api|web|app|infra> [--lines N] [--follow]'

$(INSTANCE_ENV):
	@node scripts/instance.mjs

up: infra-up api-up web-up app-up

down: app-down web-down api-down infra-down
	@$(PM2) kill >/dev/null 2>&1 || true

restart: down up

status:
	@node scripts/instance.mjs
	$(COMPOSE) ps
	@$(PM2) ls

instance-destroy:
	@if [ "$(CONFIRM)" != 1 ]; then \
	  echo 'instance-destroy: 이 인스턴스(Compose project $(COMPOSE_PROJECT_NAME))의 컨테이너·데이터 볼륨·PM2 프로세스를 지웁니다. 확인했으면 make instance-destroy CONFIRM=1로 다시 실행하세요.' >&2; \
	  exit 1; \
	fi
	@if [ "$(PORT_SLOT)" = 0 ] || [ "$(COMPOSE_PROJECT_NAME)" = crelink ] || \
	  [ "$$(git rev-parse --path-format=absolute --git-dir)" = "$$(git rev-parse --path-format=absolute --git-common-dir)" ]; then \
	  echo 'instance-destroy: 주 checkout 또는 슬롯 0 인스턴스는 지우지 않습니다(데이터 볼륨 보존). 서비스만 멈추려면 make down을 쓰세요.' >&2; \
	  exit 1; \
	fi
	@$(PM2) kill >/dev/null 2>&1 || true
	$(COMPOSE) down --volumes --remove-orphans

infra-up:
	$(COMPOSE) up -d --wait postgres valkey

infra-down:
	$(COMPOSE) down

infra-restart: infra-down infra-up

infra-status:
	$(COMPOSE) ps

infra-logs:
	$(COMPOSE) logs -f postgres valkey

# PM2 restart는 처음 시작할 때의 환경을 재사용하므로, 지우고 다시 시작해 ecosystem.config.cjs가 현재 인스턴스 값을 읽게 합니다.
api-up:
	pnpm --filter @crelink/shared build
	@$(PM2) delete crelink-api >/dev/null 2>&1 || true
	$(PM2) start ecosystem.config.cjs --only crelink-api

api-down:
	@if $(PM2) describe crelink-api >/dev/null 2>&1; then $(PM2) delete crelink-api; fi

api-restart: api-down api-up

web-up:
	pnpm --filter @crelink/shared build
	@$(PM2) delete crelink-web >/dev/null 2>&1 || true
	$(PM2) start ecosystem.config.cjs --only crelink-web

web-down:
	@if $(PM2) describe crelink-web >/dev/null 2>&1; then $(PM2) delete crelink-web; fi

web-restart: web-down web-up

app-up:
	pnpm --filter @crelink/shared build
	@$(PM2) delete crelink-app >/dev/null 2>&1 || true
	$(PM2) start ecosystem.config.cjs --only crelink-app

app-down:
	@if $(PM2) describe crelink-app >/dev/null 2>&1; then $(PM2) delete crelink-app; fi

app-restart: app-down app-up

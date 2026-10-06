# Redis와 Valkey 비교

- 확인일: 2026-09-29

Redis와 Valkey의 프로젝트 배경, 라이선스, 호환성, 기능 범위를 비교하는 기술 레퍼런스입니다. 특정 제품을 이 문서에서 선택하거나 배포 결정을 내리지 않습니다. 현재 저장소의 선택·설정은 [배포 대상 아키텍처](../architecture/deployment-target.md)와 실행 설정을 기준으로 확인합니다.

라이선스·릴리스 현황은 2026-09-29에 확인했습니다. 외부 프로젝트 정보는 바뀔 수 있으므로 도입·업그레이드 전에 공식 [출처](#출처)를 다시 확인하세요. 이 문서는 법률 자문이 아닙니다.

## 요약

- Valkey는 Redis OSS 7.2.4에서 분기한 커뮤니티 프로젝트로 Linux Foundation 산하에서 개발됩니다.
- Redis 버전에 따라 라이선스가 다릅니다. Redis 7.2 이하 버전은 BSD-3-Clause, Redis 7.4는 RSALv2/SSPLv1, Redis 8 이상은 RSALv2/SSPLv1/AGPLv3 중 하나를 선택할 수 있습니다.
- 두 서버는 기본적인 캐시·세션 사용에서 비슷한 인터페이스를 제공하지만, 호환성은 버전과 기능에 따라 달라집니다. Redis 8의 모듈·확장 기능이나 특정 명령에 의존한다면 Valkey에서 동일하게 동작한다고 가정하지 말고 직접 검증해야 합니다.
- 어느 쪽이 적합한지는 필요한 기능, 선택할 버전과 라이선스, 운영·지원 방식에 따라 결정됩니다.

## 비교

| 항목 | Redis | Valkey |
| --- | --- | --- |
| 출발점 | Redis Ltd.가 개발하는 원본 프로젝트 | Redis OSS 7.2.4에서 분기한 프로젝트 |
| 거버넌스 | Redis Ltd. 주도 | Linux Foundation 산하, 여러 기업·개인 기여자 |
| 라이선스 | 7.2 이하 BSD-3-Clause, 7.4 RSALv2/SSPLv1, 8 이상 RSALv2/SSPLv1/AGPLv3 중 선택 | BSD 3-Clause |
| 지원 버전 계열 | Redis Open Source 8.x 계열 | 확인일 기준 7.2.x, 8.0.x, 8.1.x, 9.0.x, 9.1.x 계열 |
| 명령 호환성 | 기준 프로젝트 | Redis 7.2.4 명령 API와 호환성을 제공. Redis 7.2.4 이후 추가된 동작·기능은 별도 확인 필요 |
| 확장 기능 | Redis 8에는 검색(Query Engine), JSON, TimeSeries, Bloom 등 통합 기능 포함 | 핵심 서버와 별도 모듈·생태계 기능을 제공. 필요한 기능별 호환성과 성숙도를 확인해야 함 |
| 컨테이너 이미지 | `redis` | `valkey/valkey` |
| Node.js 클라이언트 | `node-redis`, `ioredis` 등 | Redis 프로토콜 기반 클라이언트를 사용할 수 있는 범위가 넓지만, 각 라이브러리의 Valkey 지원 범위를 확인해야 함. Valkey GLIDE 등 전용 선택지도 있음 |

## 라이선스 확인

- **Valkey:** BSD 3-Clause입니다. 재배포 시 저작권·라이선스 고지 등 해당 라이선스 조건을 지켜야 합니다.
- **Redis 8 이상:** 같은 릴리스에 RSALv2, SSPLv1, AGPLv3 선택지가 있습니다. 각각의 조건이 다르므로 사용할 배포물에 적용되는 라이선스와 서비스 제공 방식을 함께 확인해야 합니다.
- **Redis 7.4:** Redis 8과 라이선스 선택지가 다릅니다. Redis OSS 공식 라이선스 자료는 7.4를 RSALv2 또는 SSPLv1로 구분합니다.
- **Redis 7.2 이하:** BSD-3-Clause입니다. 과거 버전의 라이선스를 현재 버전에 그대로 적용하지 않습니다.

특정 사용 방식이 라이선스에 부합하는지 이 비교만으로 결론 내리지 않습니다. 실제 버전의 라이선스 전문과 배포 모델을 검토하고 필요하면 법률 전문가에게 확인합니다.

## 선택 전 확인 항목

1. 실제로 사용할 명령, 데이터 구조, 검색·JSON·벡터 기능이 양쪽에서 지원되는지 확인합니다.
2. 사용하는 클라이언트 라이브러리의 제품·버전별 지원과 장애 대응 방식을 확인합니다.
3. 라이선스 전문을 검토해 자체 서비스 제공, 수정, 재배포 방식에 적용되는 조건을 확인합니다.
4. 관리형 서비스를 고려한다면 해당 서비스의 지원 버전, 가용성, 백업, 가격을 비교합니다.
5. 선택한 정확한 버전과 기능으로 통합 테스트와 성능 검증을 수행합니다.

## 출처

- [Redis 공식 라이선스 안내](https://redis.io/legal/licenses/) — 버전별 라이선스 및 Redis 8 3중 라이선스
- [Valkey 공식 라이선스 안내](https://valkey.io/topics/license/) — BSD 3-Clause 라이선스 고지
- [Valkey 공식 릴리스 목록](https://valkey.io/download/releases/) — 현재 지원 릴리스 계열
- [Valkey 9.1 발표(Linux Foundation)](https://www.linuxfoundation.org/press/valkey-enhances-efficiency-security-and-modular-performance-with-9.1-release-and-new-ecosystem-integrations)
- [Valkey 기술 설명: Redis 7.2.4 API 호환성](https://valkey.io/blog/valkey-tooling-primitives/)

# Sistema Municipal de Parqueos de Sacaba

Backend municipal de estacionamiento tarifado, construido con NestJS, TypeORM y PostgreSQL.

## Desarrollo local

1. Instala las dependencias con `npm ci`.
2. Copia `.env.template` a `.env` si aún no existe y configura `DATABASE_URL` con una base PostgreSQL local.
3. Inicia el backend con `npm run start:dev` y carga la [configuración de cobro](docs/decisions.md#configuración-y-opciones) en PostgreSQL.

Swagger está disponible en `/docs`. Consulta las [decisiones del proyecto](docs/decisions.md) y el [modelo de datos](docs/database.md).

## Verificación local

Ejecuta `npm run build`, `npm run lint` y `npm test`. Para integración, ejecuta `pg_virtualenv -t npm run test:e2e` o define `PARKING_TEST_DATABASE_URL` con una base PostgreSQL descartable y ejecuta `npm run test:e2e`.

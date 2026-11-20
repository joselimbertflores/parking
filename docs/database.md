# Modelo de base de datos

```mermaid
erDiagram
    parking_segments ||..o{ parking_sessions : "parkingSegmentId"
    parking_segments ||..o{ payments : "parkingSegmentId"
    parking_sessions o|..o{ payments : "parkingSessionId"
    users o|..o{ payments : "recordedByUserId"

    parking_sessions {
        integer id PK
        integer parkingSegmentId FK
        varchar plate
        timestamptz startsAt
        timestamptz expiresAt
    }
    payments {
        uuid id PK
        integer parkingSegmentId FK
        integer parkingSessionId FK
        integer recordedByUserId FK
        numeric amount
        integer durationMinutes
        integer intervalMinutes
        timestamptz quotedExpiresAt
        enum method
        enum status
    }
    parking_rates {
        integer id PK
        integer intervalMinutes
        numeric amount
    }
    parking_schedules {
        integer id PK
        smallint dayOfWeek
        time startTime
        time endTime
    }
    parking_holidays {
        integer id PK
        date date UK
    }
```

- PostgreSQL limita `parking_rates` a una fila con la clave primaria y la restricción `id = 1`.
- El pago enlaza una sesión solo tras confirmarse. `recordedByUserId` es obligatorio para efectivo. La sesión usa `startsAt <= ahora < expiresAt` como vigencia.
- TypeORM sincroniza el esquema en desarrollo. Si conservas datos locales, consolida la tarifa en `id = 1` y rellena `payments.intervalMinutes` con el tamaño de bloque de las compras existentes antes de sincronizar. Para producción se requieren migraciones con `synchronize: false`.

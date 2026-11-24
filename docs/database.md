# Modelo de base de datos

El diagrama muestra las relaciones y los campos principales.

```mermaid
erDiagram
    parking_segments ||..o{ parking_sessions : "parkingSegmentId"
    parking_segments ||..o{ payments : "parkingSegmentId"
    parking_sessions o|..o{ payments : "parkingSessionId"
    users o|..o{ payments : "recordedByUserId"

    parking_segments {
        integer id PK
        varchar code UK
        boolean active
    }
    parking_sessions {
        integer id PK
        integer parkingSegmentId FK
        varchar plate
        enum vehicleType
        timestamptz startsAt
        timestamptz expiresAt
    }
    payments {
        uuid id PK
        integer parkingSegmentId FK
        integer parkingSessionId FK
        integer recordedByUserId FK
        varchar plate
        enum vehicleType
        numeric amount
        integer durationMinutes
        integer intervalMinutes
        timestamptz quotedExpiresAt
        enum method
        enum status
        timestamptz createdAt
        timestamptz paidAt
    }
    users {
        integer id PK
        varchar identityUserId UK
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

- Horario, feriados y tarifa se configuran de forma global. PostgreSQL impide los solapamientos entre intervalos del mismo día y limita la tarifa a una fila (`id = 1`).
- Un QR pendiente guarda el tramo, la placa y el tipo de vehículo para determinar la sesión al confirmarse. Solo los pagos confirmados pueden vincularse a una sesión. Una sesión puede reunir varios pagos, lo que conserva el importe y la fecha de cada ampliación.
- PostgreSQL exige que el efectivo tenga estado `confirmed`. La referencia al usuario que registró el pago admite un valor nulo mientras se prueba el efectivo sin autenticación.

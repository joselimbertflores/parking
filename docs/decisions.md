# Decisiones de diseño

## Pagos y estacionamientos

- `Payment` registra la intención de pago o el cobro realizado. `ParkingSession` representa el estacionamiento habilitado y se crea únicamente después de confirmar el pago.
- Se evaluó crear `ParkingSession` desde el inicio con estado `pending` y activarla tras el pago. Se prefirió el modelo actual para evitar gestionar sesiones sin pagar y mantener su vigencia basada únicamente en fechas.
- En QR, el pago comienza como `pending`, sin sesión asociada. En efectivo, el pago confirmado y la sesión se crean en una misma transacción.
- Las ampliaciones generan nuevos pagos asociados a la sesión existente, conservando el historial de cobros.

## Estados y vigencia

- `Payment` utiliza `pending`, `confirmed` y `failed` para distinguir el resultado
  del cobro.
- `ParkingSession` no necesita estado: su vigencia se calcula mediante `startsAt`
  y `expiresAt`, evitando estados de vencimiento desactualizados.
- Las confirmaciones deben ser idempotentes para evitar sesiones o ampliaciones
  duplicadas.

## Tipo de vehículo

- El enum compartido `VehicleType` admite `car` y `motorcycle`.
- Se almacena en `Payment` para conservar la solicitud y en `ParkingSession`
  para registrar el estacionamiento habilitado. La duplicación es intencional;
  las tarifas actuales no dependen del tipo de vehículo.

## Base de datos

- Durante el desarrollo se utiliza `synchronize` de TypeORM con datos descartables
  para simplificar los cambios de esquema.
- Antes del primer despliegue productivo se prepararán las migraciones y se
  mantendrá `synchronize: false` en producción para controlar los cambios.

## Alcance

- La primera etapa incluye cobro anticipado, registro y verificación digital de
  estacionamientos; las multas se implementarán posteriormente para acotar el
  alcance inicial.
- La eliminación de boletas físicas requiere validación normativa.

# Decisiones de diseño

## Alcance

La primera versión cubre el cobro y la verificación del estacionamiento tarifado ordinario. Los estacionamientos especiales, las autorizaciones y las multas quedan fuera porque tienen procesos distintos.

La eliminación de boletas físicas requiere validación normativa.

## Configuración y opciones

- Crea y edita la única fila de `parking_rates` (`id = 1`) en PostgreSQL. `amount` es el importe en bolivianos e `intervalMinutes` son los minutos por bloque. La tarifa es la misma para todos los vehículos. El tipo de vehículo se registra para la verificación.
- Configura `parking_schedules` con intervalos semanales sin solapamientos, del lunes (1) al domingo (7). Cada fecha en `parking_holidays` suspende el cobro de toda la jornada. Se usa la hora local de Sacaba (`America/La_Paz`).
- Las opciones se ofrecen durante un intervalo de cobro. Indican los minutos a pagar, el importe y el vencimiento calculado desde ese momento. Las pausas se saltan al calcular la vigencia. Si al cierre queda una fracción de bloque, se cobra el bloque completo y la sesión vence al cierre. El tiempo termina el mismo día.

## Pagos y verificación

- Efectivo y QR comparten el cálculo de la compra. El efectivo requiere un controlador y guarda el pago y la sesión en la misma transacción. La ruta HTTP sigue deshabilitada hasta integrar SIAU.
- El QR crea un pago pendiente que guarda el importe y los minutos por bloque cotizados. Si el último bloque es parcial, `quotedExpiresAt` muestra el cierre antes de confirmar. Para simular la confirmación en desarrollo, compila y ejecuta `npm run payment:confirm -- <uuid>`. La integración bancaria está pendiente.
- Al confirmar, la sesión empieza en ese momento. El QR debe seguir cabiendo en esa fecha local. Una cotización de bloques completos debe seguir cabiendo completa. Una cotización parcial debe conservar el cierre y tener tiempo para el mismo número de bloques. Repetir una confirmación devuelve la sesión existente.
- La creación de sesiones se serializa por tramo para impedir duplicados vigentes de una placa. La verificación consulta la placa y el tramo usando las fechas guardadas. Los cambios de configuración afectan nuevas compras y la revalidación del horario de QR pendientes. Los importes registrados y las sesiones confirmadas conservan sus valores.

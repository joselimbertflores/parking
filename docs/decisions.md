# Decisiones de diseño

## Configuración y opciones

- El horario semanal admite varios intervalos sin solapamientos por día y usa la hora local de Sacaba (`America/La_Paz`). Los feriados suspenden el cobro de toda la jornada.
- Solo hay opciones y compras durante un intervalo de cobro. Las pausas se excluyen del tiempo cobrado y pueden quedar dentro de una sesión vigente. Si queda una fracción de bloque al cierre de la jornada, se cobra como bloque completo y la vigencia termina al cierre.
- Una tarifa general fija el importe en bolivianos y la duración de cada bloque para todos los vehículos. En tramos activos, las opciones generales muestran duraciones e importes desde el momento de la consulta. La disponibilidad para una placa se comprueba al cotizar el pago.

## Sesiones y pagos

- La cotización valida que la duración quepa en el horario disponible para la placa y el tramo. Al confirmar el pago, se amplía la sesión vigente desde su vencimiento para conservar el tiempo ya comprado. Si no hay una sesión vigente, se inicia una nueva en ese momento.
- El efectivo se registra confirmado. El QR empieza pendiente y conserva el importe y el tamaño de bloque cotizados. Solo se confirma en la fecha local de la cotización, tras revalidar que los bloques completos sigan cabiendo y que el último bloque parcial conserve el cierre cotizado. Desactivar un tramo bloquea las nuevas compras. Los QR pendientes aún pueden confirmarse si cumplen esas reglas.
- El pago confirmado y la creación o ampliación de la sesión se guardan en una misma transacción. El registro de efectivo y las confirmaciones QR se serializan por tramo para evitar solapamientos y usar el último vencimiento. Cada QR se aplica una sola vez, incluso ante reintentos.
- El conductor puede consultar el estado del pago y la vigencia actual de la sesión asociada mediante `GET /api/payments/:id`, con el UUID del pago y sin autenticación.

## Pendientes de integración

- La simulación QR es opcional y solo funciona en desarrollo. La reemplazará la integración con el proveedor bancario.
- El cobro en efectivo sin autenticación solo está habilitado en desarrollo y se registra sin controlador. Al integrar SIAU, cada cobro en efectivo exigirá un controlador autenticado y registrará su identidad.

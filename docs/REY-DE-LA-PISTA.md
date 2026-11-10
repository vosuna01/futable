# Rey de la pista en FutABLE

> **Retirado de la app en noviembre de 2026.** Ya no se usaba: la [partida en directo](EN-DIRECTO.md) lo sustituye. La base de datos conserva la tabla `king_sessions`, su RPC y todas las partidas que se guardaron con este modo, que siguen contando en la clasificación. Esta guía queda como referencia histórica.

Entra en **Rey de la pista → Preparar sesión**. Elige defensa y delantero de Barça y Madrid; añade las parejas que esperan en la cola. Las personas deben tener una ficha activa en la liga.

Durante la sesión, toca **Gana Barça** o **Gana Madrid**. No hay una confirmación adicional. Se guarda la victoria, la pareja ganadora sigue en su equipo y puestos, entra la primera pareja que esperaba y la perdedora pasa al final de la cola. Si la cola estaba vacía, el puesto perdedor queda libre: la sesión se pausa hasta que se añadan nuevos rivales. No se programa una revancha.

El marcador es opcional. Si lo activas, escribe los goles antes de tocar el ganador. Se admiten enteros de 0 a 99, sin empate, coherentes con el equipo ganador. Sin marcador, se guarda solo la victoria: no se inventan goles y los rankings siguen contando victorias y partidos igual que antes.

**Deshacer último resultado** anula la última partida de la sesión y restaura exactamente las parejas, posiciones y cola anteriores. La partida permanece en el historial como anulada y deja de computar. No permite deshacer una partida ya corregida o anulada por administración. Guardar otra configuración de parejas o registrar otro resultado sustituye esta opción.

En **Parejas y cola** puedes cambiar jugadores, intercambiar defensa/delantero, añadir o quitar parejas de espera, ordenarlas y colocar una pareja en un puesto libre. Cada persona solo puede estar en una pareja. **Terminar sesión** cierra la cola y conserva los resultados.

La sesión está guardada online: se recupera al volver a entrar y se comparte entre dispositivos de la liga. Para evitar que varios móviles apunten lo mismo, registra quien abrió la sesión o un administrador. Los demás ven la pista y la cola. Se necesita conexión para confirmar cambios; los reintentos reutilizan la operación y el servidor rechaza revisiones antiguas. La demostración es temporal y no modifica la liga real.

## Implementación

Aplicar `005_king_sessions.sql` después de las migraciones 001–004. Conserva los resultados anteriores, permite los dos marcadores nulos con ganador explícito y valida la coherencia de los marcadores numéricos. `save_match` sigue admitiendo los clientes anteriores.

`king_sessions` tiene lectura con RLS de miembros activos; las escrituras pasan por `king_session_command`. Una sola sesión activa por liga, permisos de responsable/administrador, revisión esperada, UUID de operación, bloqueo transaccional y auditoría. Guardar resultado y rotar cola es una sola transacción. Realtime se complementa con consulta al recuperar conexión/foco y cada 10 segundos.

La fuente de resultados sigue siendo `matches` y `match_participants`. La sesión es un coordinador de la pista y no mantiene contadores estadísticos propios. No añade display, kiosco, NFC ni hardware.

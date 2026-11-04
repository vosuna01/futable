# Pruebas y verificación

## Ejecutadas durante la entrega

- `pnpm build`: TypeScript estricto y build de producción.
- `pnpm test`: 34 pruebas en tres archivos. Fórmulas, mínimos, rachas, posiciones, completos, parejas, mejora, desempates, resultados inválidos, temporada y jugadores activos. Migraciones en PostgreSQL embebido PGlite con esquemas/roles Auth de prueba, validación SQL, RPCs, RLS, idempotencia, revisión, auditoría, revocación, cierre y conservación del historial. Las siete pruebas nuevas comprueban registro verificado, altas sin privilegios, reintentos, administradores existentes, revocación y configuración privada.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`: ocho pruebas en Chrome, con viewport/touch de iPhone 13 y escritorio. Demostración: registrar/reutilizar/revisar/confirmar, actualización de estado, historial, pestañas, provisionales, ruta no encontrada y bloqueo offline. Comprobación de viewport sin desbordamiento, nueva marca/manifest y ayuda de instalación Android/iOS antes y después de entrar.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:auth`: seis pruebas de registro en móvil y escritorio con el SDK real y respuestas HTTP interceptadas. Comprueban payload de alta, aviso de confirmación, contraseñas distintas y errores del servidor sin éxito ficticio. Es un servidor Vite separado, con URL/clave de prueba; no configura ni contacta un Supabase real.
- Capturas de escritorio y móvil revisadas; sin errores JavaScript observados.
- PWA compilada: shell, bundles, iconos y fuentes locales precargados, recarga sin conexión y entrada a la demostración sin errores JavaScript. Para repetir: `pnpm build`, `pnpm preview --port 5174` y, en otra terminal, `pnpm test:pwa` (admite `PLAYWRIGHT_CHANNEL=chrome`). Se corrigió la comparación de caché de recursos públicos para servidores con `Vary: Origin`.

PGlite ejecuta PostgreSQL real dentro de un proceso, pero serializa sus consultas. Los tests con `Promise.all` verifican múltiples solicitudes y la unicidad, **no prueban bloqueos entre conexiones PostgreSQL remotas independientes**. Tampoco reproducen Supabase Auth ni el websocket de Realtime.

## Verificación remota ejecutada

`scripts/verify-online.mjs` usa el SDK real con dos cuentas y conexiones HTTP independientes. Comprueba login, lectura, cuatro peticiones concurrentes con el mismo UUID, un solo resultado, recepción de INSERT por Realtime, permisos de corrección/anulación y recuperación de un cambio perdido mediante consulta después de retirar la suscripción. Finalmente anula la partida de prueba y deja auditoría. No elimina historia ni usa service role.

Ejecuta **solo en una liga aislada de pruebas** con cuatro jugadores activos y una temporada activa. Necesita Node y estas variables de entorno:

```text
TEST_SUPABASE_URL
TEST_SUPABASE_ANON_KEY
TEST_ADMIN_EMAIL
TEST_ADMIN_PASSWORD
TEST_PLAYER_EMAIL
TEST_PLAYER_PASSWORD
TEST_LEAGUE_ID
```

No las subas al repositorio. Ejecuta `pnpm test:online`. El script falla claramente si falta una variable o no llega el evento. Tiene escrituras y deja una partida anulada trazable. Si la conexión falla durante limpieza, revisa la partida en Administración.

## Aceptación manual antes de producción

1. Registrar y confirmar una cuenta desde la app: debe entrar como jugador y tener una sola ficha. Una cuenta sin verificar o sin membresía no puede leer ni registrar mediante REST/RPC. Probar reintento de autoalta, revocación y conservación del administrador existente.
2. Entrar con enlaces y contraseña; recuperar contraseña; cerrar y volver a abrir la PWA y verificar sesión.
3. Abrir la liga en dos móviles; registrar en A y ver resultado y clasificación en B sin recarga.
4. Desconectar B, registrar en A, reconectar B y comprobar que recupera el resultado aunque haya perdido el evento. Probar también foco y renovación de sesión.
5. Cortar red durante un guardado y reintentar sin cambiar el formulario: una única partida. No confundir el aviso de error con un guardado confirmado.
6. Corregir el mismo resultado desde dos administradores: la revisión antigua debe fallar. Anular y revisar la auditoría y recomputación.
7. Revocar una membresía mientras la sesión está abierta; comprobar denegación del servidor y borrado de la vista tras la siguiente consulta.
8. Cerrar temporada y abrir otra; comprobar archivo, clasificación independiente e histórico global.
9. Instalar build de producción en Safari iOS y Chrome Android; probar caché del shell, sesión, reconexión y actualización voluntaria.

La prueba remota de Supabase pasó el 31 de octubre de 2026 en una liga técnica aislada. Se corrigió la espera del evento de sistema que confirma la suscripción PostgreSQL. La liga de oficina quedó vacía y las cuentas técnicas bloqueadas. La validación en Safari real/iPhone, SMTP real y Vercel del usuario sigue pendiente. No hay pruebas de display porque esa funcionalidad no está implementada.

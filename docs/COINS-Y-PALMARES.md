# Coins y palmarés

Las coins son puntos gratuitos. No se compran, transfieren ni canjean por dinero o premios. Cada temporada tiene saldos independientes y su propia clasificación.

## Para jugar

- Entra con tu propia cuenta y abre **Club → Coins** para recibir 100 puntos una sola vez por temporada. Si ganas antes de reclamarlos, se crea tu saldo con la bienvenida y el premio.
- Cada integrante de la pareja ganadora recibe **5 coins**. Solo cuentan partidas creadas desde la activación; no se recalcula el historial anterior.
- Desde **En directo** o **Club**, elige Madrid o Barça, introduce entre 1 y 25 coins y confirma. Solo pueden apostar espectadores, una vez por partida. La cuenta de tablet no apuesta.
- Las coins se descuentan al apostar. Se apuesta mientras la partida está abierta y el marcador no ha alcanzado el objetivo. La revisión del estado se valida en el servidor.
- El bote completo se reparte entre los acertantes en proporción a sus apuestas. Ejemplo: apuestas 10 al Madrid, otra persona 10 al Madrid y otra 20 al Barça. Si gana Madrid, recibes 20 (tus 10 más 10 de ganancia). El retorno mostrado antes del cierre es una estimación. Sin acertantes no hay reparto; los redondeos hacia abajo no se reparten.
- Sustituir jugadores, intercambiar puestos, cambiar el objetivo de goles, desactivar coins o cerrar la sesión devuelve las apuestas pendientes y, cuando corresponde, abre un mercado nuevo.
- Corregir el ganador recalcula el reparto y los premios. Anular devuelve las apuestas y retira el premio por victoria. Si cambian los participantes del resultado, se devuelve el mercado original. Deshacer devuelve también las apuestas de la siguiente partida. Estos ajustes pueden dejar un saldo negativo si ya se han gastado los puntos; entonces no se puede apostar hasta recuperarlo.

Los movimientos y las últimas 30 apuestas se consultan en Club. Los saldos y el bote se actualizan al cambiar la partida, al recuperar el foco y cada cinco segundos. Las acciones requieren conexión; no se encolan apuestas offline.

## Temporadas y premios

En **Club → Palmarés** aparecen propuestas de podio de liga, mejor defensa, mejor delantero, mejor pareja y líder de coins. Se usan los mismos mínimos y desempates de las clasificaciones deportivas. Las temporadas cerradas usan sus resultados y reglas congelados.

Un administrador debe cerrar primero la sesión en directo y después la temporada. Selecciona esa temporada en el selector general, abre Palmarés, revisa los premios sugeridos y publica los elegidos. La publicación conserva los nombres de los ganadores aunque después cambien de apodo. Se publica una sola vez; no se crean premios ficticios para temporadas activas.

En **Club → Coins → Administrar coins** se pueden cambiar saldo inicial, premio por victoria, máximo de apuesta o desactivar coins. El saldo inicial nuevo solo afecta a saldos aún no creados. El premio aplicado a una partida queda fijado para sus correcciones.

## Operación y seguridad

Aplicar `supabase/migrations/012_coins_honours.sql` una sola vez, después de la 011, y publicar el frontend. La migración es transaccional y no modifica resultados históricos ni sustituye `live_session_command`. Envuelve las implementaciones existentes de `save_match` y `admin_command` con el mismo contrato, añade liquidación y conserva las funciones anteriores como auxiliares privadas.

Los clientes no pueden escribir tablas de coins ni llamar a auxiliares. `coins_command` exige miembro activo, cuenta propietaria de la ficha, UUID de operación, saldo y revisión de partida válidos. Las operaciones se serializan con el bloqueo de liga que ya emplea el modo en directo. El reintento del mismo UUID y payload no cobra ni paga dos veces. `coins_snapshot` solo comparte la clasificación de la liga; el libro de movimientos y las apuestas personales se devuelven únicamente a su propietario.

Pruebas: `pnpm test`, `pnpm test:e2e`, `pnpm build`. `tests/coins-database.test.ts` ejecuta las migraciones en PostgreSQL/PGlite y prueba permisos, reintentos, cierres, liquidaciones, correcciones, devoluciones y publicación de premios. El e2e recorre la interfaz de demostración; las pruebas SQL validan el backend real de la funcionalidad sin crear resultados de prueba en la liga de producción.

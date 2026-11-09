# FutABLE · Tablet de pared

Vista de la [partida en directo](EN-DIRECTO.md) para una tablet colgada junto a la máquina. Botones grandes, pensados para tocar de lejos y con prisa.

> **Decisión de equipo pendiente.** `TRASPASO-EQUIPO.md` pedía no implementar `/display` ni modo kiosco, y `001_league.sql` dice que no hay rol de display en esa versión. Esta vista se pidió expresamente (Pol, noviembre de 2026). No es una ruta nueva: va dentro de la app, en `/?tablet`, y no crea dispositivos ni endpoints. El rol `scoreboard` de la migración 008 sí es nuevo. Avisad a Marc y a Víctor antes de aplicarlo en producción.

## Abrirla

- Enlace directo: `https://<url-de-la-app>/?tablet`
- Desde la app: Partida en directo → «Abrir modo tablet de pared».
- El icono de pantalla completa la pone a toda pantalla. Si el navegador lo permite, la pantalla no se apaga mientras está abierta (Wake Lock). Para que quede fija, añadidla a la pantalla de inicio como PWA y activad el modo de pantalla fija de la tablet (Android «Fijar aplicación», iPad «Acceso guiado»).
- Para probarla sin backend: abrid `/?tablet` y pulsad «Explorar demostración».

## Qué hace

| Toque                                                               | Acción RPC                   | ¿Necesita la 008?                                                                        |
| ------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| Marcador y jugadores en pista, cola por parejas                     | lectura                      | No                                                                                       |
| «Gol Madrid / Gol Barça» y «−» del equipo                           | `goal {team, delta}`         | No                                                                                       |
| Tocar a un jugador = gol suyo; «−» a su lado = quitar su último gol | `goal {team, delta, player}` | Sí. Sin la 008 el gol cuenta para el equipo y el goleador se pierde; la tablet lo avisa. |
| «Intercambiar defensa y delantero»                                  | `assign`                     | No                                                                                       |
| ⇄ en una pareja de la cola                                          | `prefer {player, post}`      | Sí. Sin la 008 da el error «necesita la migración 008».                                  |
| «Gana …» (con confirmación), «Deshacer último resultado»            | `result`, `undo`             | No                                                                                       |
| «Empezar partida» (propone la alineación acordada) y «Apuntar»      | `start`, `join`              | No                                                                                       |

«Quitar gol» sin jugador (botón del equipo, firmware y clientes antiguos) quita **el último gol de ese equipo**, sea de quien sea.

### Alineación de la cola

Cada persona que espera puede tener un puesto acordado (`queue[].post`). Al entrar dos juntos:

1. Si el primero de la cola tiene puesto, se respeta.
2. Si no, se respeta el del segundo.
3. Si ninguno lo tiene, el primero defiende y el segundo ataca, como hasta ahora.

La tablet lee la cola de dos en dos («Entran», «2ª», …). Con un número impar, el último espera a un perdedor de la partida siguiente para completar la pareja. Los perdedores vuelven a la cola sin puesto. El ⇄ de una pareja fija el puesto del primero, así que basta un toque. «Deshacer» devuelve la cola tal como estaba antes del resultado, puestos incluidos.

## Permisos: cuenta propia para la tablet

La tablet no está fichada. Hasta ahora `goal/result/assign/start/undo` exigían estar fichado o ser admin. La 008 añade el rol de liga **`scoreboard`**:

- Lee la liga como cualquier miembro.
- Lleva la pista: `start`, `goal`, `assign`, `result`, `undo`, `prefer`, y quita gente de la cola.
- **No** es admin: no puede gestionar jugadores, temporadas, accesos ni leer la auditoría, ni corregir o anular partidas desde Administración.
- Puede apuntar partidas sueltas con `save_match`, igual que cualquier jugador autorizado.
- Solo cierra la sesión del día si la abrió ella.

**Riesgo.** La sesión queda abierta en un dispositivo en un espacio común. Quien la coja puede tocar el marcador, guardar resultados falsos en el directo o apuntar partidas sueltas, como haría un jugador. No puede tocar la administración. Si se pierde la tablet o se sospecha de un mal uso, un admin revoca el acceso (Administración → Gestionar acceso → desmarcar «Acceso activo») y se corrigen las partidas desde el historial. No uséis una cuenta admin en la tablet: daría el control total de la liga.

## Despliegue (quien tenga acceso a Supabase)

El código de la vista funciona sin la 008 (goles por equipo, intercambio, resultado, deshacer) **siempre que la cuenta sea admin o esté fichada**. La cuenta propia de la tablet, los goleadores y los puestos de la cola necesitan la 008.

1. Comprobad que la 006 y la 007 ya están aplicadas: `select proname from pg_proc where proname='live_session_command';` y revisad el historial de migraciones. La 008 sustituye `live_session_command` y `check_live`.
2. Haced una copia de seguridad.
3. Probadla primero en un proyecto de desarrollo: `pnpm test` ejecuta `tests/live-tablet-database.test.ts` y vuelve a pasar toda la batería del directo con la 008 encima.
4. Aplicad `supabase/migrations/008_live_tablet.sql` en el SQL Editor de producción. Es una sola transacción: si algo falla, no cambia nada.
5. Cread la cuenta de la tablet registrándola desde la app con un correo del equipo (no personal). Un admin copia su UUID y, en Administración → Gestionar acceso, le da el permiso «Tablet de la pared».
6. En la tablet, iniciad sesión con esa cuenta y abrid `/?tablet`. No guardéis la contraseña en ningún documento ni chat.

Comprobación rápida tras aplicar: con la tablet, empezad una partida, marcad un gol tocando a un jugador y guardad el resultado. Después:

```sql
select * from public.match_scorers order by match_id desc limit 5;
```

**Vuelta atrás.** Revertir el código no deshace la migración. Para volver al comportamiento de la 007, aplicad de nuevo el cuerpo de `007_live_queue_guards.sql` y la `check_live` de la 006. Las sesiones con `goal_log` siguen siendo válidas, porque la 007 ignora esa clave. Antes de restaurar la restricción `role in ('admin','player')`, quitad el rol `scoreboard`. La tabla `match_scorers` puede quedarse.

## Compatibilidad con el marcador físico (ESP32)

`goal {team, delta}`, `result {winner}` y `start {lineup}` aceptan exactamente lo mismo que antes, con `team` blue = Barça y red = Madrid. El firmware no cambia. Sus goles quedan sin goleador y la tablet puede atribuir los suyos en la misma partida.

## Pruebas

- `tests/live-tablet.test.ts`: goleadores, quitar goles, sesiones anteriores a la 008, alineación de la cola y rotación.
- `tests/live-tablet-database.test.ts`: rol `scoreboard`, permisos, `goal` con jugador, `prefer`, `match_scorers`, deshacer y compatibilidad con sesiones antiguas, en PostgreSQL embebido.
- `tests/live-database.test.ts`: la batería original del directo, ahora con la 008 aplicada.
- `tests/e2e/tablet.spec.ts`: partida completa en la tablet, en móvil y escritorio, sobre la demostración.

## Pendiente (fuera de este cambio)

- Mostrar los goleadores guardados (`match_scorers`) en el historial y los perfiles. `league_snapshot` todavía no los devuelve.
- Si una partida del directo se corrige luego desde Administración cambiando jugadores, sus goleadores no se ajustan solos.

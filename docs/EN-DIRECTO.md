# FutABLE · Partida en directo

Modo de sesión continua con **cola de jugadores sueltos**, pensado para una tarde en la máquina: cada uno se ficha, la cola decide quién entra y los resultados se apuntan con un toque.

Convive con [rey de la pista](REY-DE-LA-PISTA.md), que mantiene parejas fijas configuradas a mano. Son sesiones independientes: cada liga puede tener una de cada abierta y no comparten estado.

## Cómo funciona

1. **Fitxo.** El primero que se ficha abre la sesión del día. Cualquier miembro puede además apuntar a otro jugador de la liga, para quien no lleve el móvil encima. De la cola se puede salir en cualquier momento.
2. **Empezar.** Con cuatro o más fichados se abre el reparto: dos recuadros con los colores del club, Madrid a la izquierda y Barça a la derecha, con los cuatro primeros de la cola ya colocados por orden de llegada. Se tocan dos puestos para intercambiar a quienes los ocupan.
3. **Marcador en vivo.** Cada equipo tiene su tarjeta con el marcador grande, sus dos jugadores, el botón de ganar y, debajo, uno ancho para sumar gol y uno estrecho para anularlo. Las dos tarjetas van lado a lado también en el móvil. El marcador es estado compartido: todo el mundo ve el mismo, y es el que se guarda con la partida. Dejado a cero, se guarda solo la victoria.
4. **Resultado.** Un toque en «Gana Madrid» o «Gana Barça». Lo apunta cualquiera que esté fichado, juegue o espere, o un administrador. Si el marcador no cuadra con el ganador, la app no guarda.
5. **Rotación.** Los ganadores conservan equipo y posición. Los dos perdedores van al final de la cola y entran los dos primeros que estén esperando. Al guardar, un pop-up con los colores del equipo afectado confirma el resultado, deja repartir los puestos de quienes entran y ofrece cerrar la sesión del día.
6. **Cerrar.** Quien abrió la sesión, o un administrador, la cierra al acabar el día. Se vacían pista y cola; las partidas guardadas se conservan.

## Orden de la cola

La cola tiene dos grupos. **Delante, quien todavía no ha jugado ninguna partida de la sesión**, por orden de llegada; detrás, todos los demás. Así, si alguien ficha cuando ya se han jugado partidas, entra antes que quien acaba de perder, aunque llegue más tarde.

Los partidos jugados se cuentan por sesión y **se conservan aunque te desfiches y vuelvas a ficharte**, para que salir y volver a entrar no sirva para colarse.

Dentro del grupo de los que ya han jugado, los dos perdedores salen a la vez, así que hay que decidir cuál va antes:

- Pasa primero quien **llevaba más tiempo esperando antes de entrar** a la partida que acaba de perder.
- Si ambos habían esperado lo mismo — la primera ronda de la sesión, por ejemplo — **se sortea**.

Un banner en lo alto de la pantalla dice si estás jugando, si esperas y en qué puesto de la cola vas.

Ese desempate importa con un número impar de fichados. Con cinco, por ejemplo, la cola tras una partida queda con el que esperaba y los dos perdedores: **uno de los perdedores vuelve a entrar de inmediato y el otro espera una ronda**. El orden anterior es lo que reparte esa espera con justicia a lo largo de la tarde.

Con cuatro justos la cola queda vacía y repiten los mismos cuatro; la app ofrece intercambiar los puestos para que no sea siempre idéntico.

## Pronóstico BET365

Al empezar cada partida aparece una caja verde con las cuotas en formato decimal, como las de una casa de apuestas. Es una broma de oficina: **no se apuesta nada**, y así lo dice la propia caja.

El cálculo vive en `src/domain/odds.ts`. Para cada equipo toma el porcentaje ajustado de sus dos jugadores **en el puesto que ocupan** —defensa y delantero por separado— y lo mezcla con lo que esa pareja rinde junta. El peso de la sinergia crece con los partidos compartidos y se queda en la mitad como mucho, así que una pareja rodada tiñe el pronóstico pero nunca sustituye a la forma individual.

El reparto se convierte en cuota con un margen del 8 %, que es lo que hace que las dos no sumen 100 %. Ningún equipo baja del 5 % ni sube del 95 %: la casa nunca da nada por seguro. Con pocas partidas de esos cuatro, la caja avisa de que la cuota es casi una moneda al aire.

## Datos y permisos

El estado vive en `live_sessions` (migración `006_live_sessions.sql`), una fila activa por liga, con `state` en JSON:

```jsonc
{
  "round": 7,
  "court": { "blue": { "defender": {"id":"…","waited":2}, "forward": {…} }, "red": { … } },
  "goals": { "blue": 2, "red": 1 },
  "played": { "…": 3, "…": 1 },
  "queue": [ {"id":"…","since":5} ]
}
```

`since` es la ronda en que empezó la espera y `waited` la que se había servido al pisar la pista: esos dos enteros resuelven el desempate entre los perdedores. `played` lleva los partidos de cada jugador en la sesión y es lo que decide quién va en el grupo de prioridad.

Todas las escrituras pasan por la RPC `live_session_command`, con bloqueo por liga, `operation_id` idempotente, guardia de `revision` y auditoría. Las partidas se guardan con el mismo `save_match` que el resto, así que **cuentan igual para la clasificación**. Nadie escribe la tabla directamente: las políticas RLS solo permiten leerla a los miembros de la liga.

Deshacer anula la última partida y restaura la cola tal y como estaba.

## Pruebas

- `tests/live.test.ts` — rotación, desempate, cola y marcador en vivo, en funciones puras.
- `tests/odds.test.ts` — cuotas, margen y topes del pronóstico.
- `tests/live-database.test.ts` — permisos, idempotencia, guardia de revisión y rotación en PostgreSQL embebido.
- `tests/e2e/live.spec.ts` — recorrido completo en móvil y escritorio.

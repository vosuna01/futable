# Revisión de uso e interfaz · noviembre de 2026

## Recorridos revisados

| Área | Resultado de la revisión |
| --- | --- |
| Acceso y registro | Google y correo conservan su funcionamiento. Se puede mostrar/ocultar la contraseña, se recortan espacios del correo y se informa de la falta de conexión. |
| Navegación móvil | El botón central «Jugar» abre la partida en directo. El registro manual sigue disponible en Inicio. Los botones indican la sección actual. |
| Inicio y temporada | La cuenta atrás permanece en Inicio y Club. El acceso al directo muestra si estás en pista o en la cola. En otras secciones ocupa menos espacio. |
| Fichaje | Buscador por nombre o apodo en móvil y tablet, sin exigir tildes ni mayúsculas. Lista alfabética, contador de disponibles y recuperación de búsquedas vacías. |
| Directo y rey de la pista | Objetivo de goles editable desde el móvil, con opciones rápidas y valor personalizado. Se muestra la próxima pareja y la ayuda explica el desempate por partidas jugadas que ya usa el servidor. |
| Registro manual | Indicación del puesto que se está eligiendo y progreso de cuatro jugadores. Botón de revisión accesible, resumen de parejas al confirmar y desplazamiento al mensaje de validación. |
| Historial | Filtros de jugador, fecha y estado; atajos Hoy/Últimos 7 días; limpiar filtros; grupos de 12 resultados. Orden por fecha real de juego, incluso al corregir una partida antigua. Las correcciones se identifican con texto. |
| Rankings | Búsqueda sin tildes, ayuda al no encontrar resultados, resumen de clasificados/mínimos, pestañas operables con flechas y acceso al perfil desde las parejas. Se mantienen los cálculos y desempates vigentes. |
| Plantilla y perfiles | Búsqueda más tolerante, recuperación al no encontrar personas y evolución ordenada cronológicamente. Los perfiles sin partidas se identifican como tales. |
| Coins | El equipo resaltado coincide con la apuesta registrada; saldo disponible y retorno estimado visibles. Se distinguen apuestas pendientes, repartos y devoluciones. Confirmación de reglas guardadas y menos consultas repetidas o en segundo plano. |
| Palmarés | Revisado el flujo de propuestas, temporada cerrada y publicación. La publicación permanece a cargo de un administrador. |
| Administración | Selección de cuentas por nombre y precarga de identidad, rol y estado actuales. Foto e identificador corto cuando se repite un nombre. Buscador de jugadores, acciones de auditoría legibles y ayuda para cerrar la sesión del día antes de cerrar temporada. |
| Diálogos y accesibilidad | Fondo bloqueado al abrir un diálogo, devolución de foco al cerrarlo, recorrido de teclado por controles habilitados, cabecera accesible y controles táctiles más amplios. Se respeta movimiento reducido. |
| Sincronización e instalación | La conexión distingue «Sincronizado» de una consulta reciente. Revisados acceso Google, registro, falta de conexión, recuperación de la PWA y rutas bajo `/futable/`. |

Las mejoras utilizan los mismos RPC y permisos de la liga. Las pruebas de revisión usan datos de demostración y bases de datos de prueba para registrar, corregir, anular, sustituir jugadores y publicar premios; las comprobaciones visuales de producción se limitan a navegación y lectura.

## Comprobaciones

- `pnpm test`: reglas, autenticación, perfiles, rankings, sesiones, permisos, sustituciones, coins, palmarés, fechas y búsquedas.
- `pnpm test:e2e`: móvil, escritorio y tablet, incluidos los recorridos nuevos de `tests/e2e/usability.spec.ts`.
- `pnpm test:auth`: registro y acceso con Google mediante el SDK y respuestas controladas.
- `pnpm exec playwright test --config playwright.hosting.config.ts`: recursos, navegación, ámbito de instalación y recuperación sin conexión bajo `/futable/`.
- Compilación con `SITE_BASE_PATH=/futable/` antes de publicar en GitHub Pages.

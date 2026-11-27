# Temporada 2 · Liga Mediodía y Copa Afterwork

Se conserva la identidad visual ABLE y el acceso actual. La activación cierra y congela la temporada anterior, publica sus premios según las reglas originales y abre una etapa nueva con todos en 1000 MMR. No elimina partidas, perfiles, saldos antiguos ni palmarés.

## Competiciones

- **Liga Mediodía:** rey de la pista habitual, objetivo variable (normalmente 2 o 3). Clasificación principal por Elo de equipo: 1000 inicial, K 40 las primeras 10 partidas y 24 después. Para obtener puesto oficial hay que jugar en 3 días distintos de Madrid. Sin penalización por volumen.
- **Copa Afterwork:** evento independiente creado por un administrador. Objetivo fijado tras su primer resultado, final marcada explícitamente por el organizador y pareja campeona propia. Puede cerrarse sin título conservando resultados si se cancela.
- **Tenis opcional en Copa:** series al mejor de 3, 5 o 7 parciales, manteniendo los cuatro jugadores. Se guardan parciales y estado de la serie; el último resultado puede deshacerse. La Liga nueva no ofrece tenis.
- **MMR general:** Elo de Liga y Copas dentro de esta etapa. Sirve de referencia para las cuotas. El MMR de Liga solo usa partidas de Liga. Ambos se reinician en esta etapa.
- Una sola sesión activa por mesa. Cambiar el filtro del historial nunca cambia la competición de una sesión ya abierta. Cada partida conserva su competición, objetivo y sesión de origen.

## Coins, premios y tienda

Cada competición tiene su propio bolsillo de coins, sin transferencias. Los saldos históricos siguen consultables. El premio por victoria usa la configuración de la liga (actualmente 5), hasta 10 por jugador y día en Liga o por evento en Copa. En tenis solo premia ganar la serie. Las apuestas siguen siendo virtuales, para espectadores y exclusivamente en el 0–0, con la cuota fijada al apostar.

La tienda vende seis accesorios: Gafas Pro (40), Gol Estelar (60), Gorra ABLE (80), Aura ABLE (100), Base de Oro (120) y Corona del Rey (150). Permite probar, confirmar la compra y guardar el conjunto. Solo se gasta un bolsillo activo; la compra es única y el inventario se conserva entre temporadas. Uno por categoría: cabeza, cara, efecto y base. Ningún accesorio mejora el MMR.

El vestuario dispone de probador fijo, vista ampliada, poses normal/gol/victoria, filtros por categoría y colección personal. Los cuatro huecos del conjunto permiten quitar piezas y volver al conjunto guardado. Los accesorios se muestran con su propio encuadre y la compra confirma el bolsillo y saldo restante; si faltan coins se indica cuánto. La vista previa se conserva después de comprar.

Para que comprar no penalice el premio «Ludópata», su puntuación es saldo disponible más coins gastadas en accesorios. Las apuestas sí afectan a esa puntuación. El servidor comprueba precios, saldo, propiedad e identificadores de operación para evitar cobros duplicados.

La Liga entrega podio por MMR, premios de posición y pareja, Bota de Oro, Guante de Oro y Ludópata. Bota/Guante se normalizan a partidos equivalentes de 3 goles (3 × goles / suma de objetivos), con 10 partidas válidas y 3 días. Bota necesita autoría completa de goles; Guante solo cuenta exposición como defensa con marcador conocido. La Copa publica sus campeones de final y Ludópata de Copa.

## Estreno y personajes

La primera apertura autenticada tras el cierre muestra estadísticas de T1, podio oficial, referencia del MMR anterior, resultados personales y presentación del reinicio y de los jugadores. Se puede pausar, avanzar, saltar y repetir. Sonido opcional y respeto a movimiento reducido. El visto se guarda por cuenta y temporada; un fallo al guardarlo permite volver a verlo.

La versión 2 de la intro usa seis escenas a pantalla completa: balance de la liga, podio, resumen personal, reinicio del MMR, presentación del equipo y novedades. Tiene progreso y salto directo de escena; pausar conserva el tiempo transcurrido. La presentación permite elegir cualquier jugador. Se registra como versión 2 para que quienes vieron la primera intro puedan ver la nueva una vez. Las expresiones faciales se mezclan suavemente y los accesorios acompañan el movimiento del cuerpo.

Los 12 personajes existentes mantienen las piernas juntas, expresiones faciales y movimiento corporal. Las celebraciones distinguen goles totales del goleador y rachas consecutivas, y desaparecen al deshacer. Los accesorios aparecen en ficha, intro y celebraciones.

Las imágenes derivadas de las fotos **no están en el repositorio público**. Se cargan desde `character_assets`, con lectura únicamente para miembros autenticados de la liga, sin permisos de escritura del cliente. Si faltan o no hay conexión se usa el avatar existente.

## Instalación y validación

Aplicar después de 017, en orden, las migraciones `20261127131231_competitions_mmr_reset.sql` y `20261127132615_character_shop.sql`. No activan ni cierran temporadas por sí solas. La primera comprueba la huella de la RPC de directo antes de modificarla.

La activación es una llamada administrativa explícita a `competition_command` con acción `reset`, identificador de operación, recuento y huella de resultados recién revisados y premios T1 calculados con las reglas originales. Rechaza cualquier sesión o mercado de apuestas pendiente y cambios en las revisiones de partidas. Registrar el resultado en `ACTIVACION.md` únicamente después de comprobarlo en producción.

Los assets privados se cargan por separado; nunca incluir su contenido en commits o migraciones públicas. La aplicación no utiliza ninguna clave privilegiada.

Validación automatizada: `pnpm test`, `pnpm build`, pruebas Playwright de tablet y `tests/e2e/new-season.spec.ts`. Las pruebas de interfaz interceptan el backend: no crean partidas ni compras en la liga real. Las pruebas PostgreSQL recorren migraciones completas, reinicio, aislamiento MMR, series/final/deshacer, premios, compras idempotentes y RLS de imágenes.

# FutABLE · Proyecto compartido

Código común de la liga de futbolín de ABLE Human Motion.

- **Aplicación compartida:** https://vosuna01.github.io/futable/
- **URL anterior de Sites:** https://liga-cordoba-movil-victor.vosunas.chatgpt.site/
- **Repositorio de colaboración:** https://github.com/vosuna01/futable
- **Cómo contribuir:** [CONTRIBUTING.md](CONTRIBUTING.md)

Trabajamos sobre la misma app con edición libre: los colaboradores pueden guardar cambios directamente en `main`. No se exigen ramas ni pull requests. El workflow **Publicar FutABLE** publica en GitHub Pages si pasan las comprobaciones. Sites conserva su publicación independiente. Consulta [la guía de publicación](docs/GITHUB-PAGES.md).

Para solicitar acceso, envía a Víctor tu usuario o el correo asociado a GitHub. El propietario te invita desde **Settings → Collaborators → Add people**, y debes aceptar la invitación. El enlace de un repositorio privado puede mostrar un 404 hasta que tengas acceso.

---

# Liga FutABLE

**FutABLE** une futbolín y ABLE. La pantalla de acceso incluye «Instalar FutABLE en el móvil» y la cabecera mantiene un botón de ayuda accesible desde cualquier sección. Ambos abren la misma guía con pestañas Android y iPhone/iPad. El nombre instalado se declara en el manifest. La URL compartida anterior se conserva.

Aplicación móvil privada de futbolín 2 contra 2. React + TypeScript estricto + Vite + Tailwind CSS + Supabase PostgreSQL/Auth/Realtime. Preparada para desplegar en Vercel. Sin servicios de pago obligatorios.

**Alcance:** móvil, rankings, registro, perfiles, historial, administración, autenticación, sincronización y PWA. No se ha implementado el display, su ruta, sesiones de dispositivo, rotación, pantalla completa ni modo kiosco. Las URLs desconocidas muestran una página de no encontrado.

## Arranque local

Requiere Node 22.12+ (también funciona con Node 24) y pnpm 11.25.0.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Abre la dirección local que imprime Vite. La aplicación ya tiene configurado el proyecto real de FutABLE mediante ajustes públicos de cliente. Para desarrollo con escrituras usa otro proyecto con `.env.local`. El acceso **Explorar demostración** continúa disponible como opción independiente. Son datos ficticios generados en `src/demo/data.ts`, nunca se insertan en producción. Los resultados de demostración viven solo en memoria y se pierden al salir o recargar. La administración no simula persistencia.

La liga real de oficina ya está activada: consulta [el estado de activación](docs/ACTIVACION.md). Para conectar otro proyecto sigue [la configuración de Supabase](docs/SUPABASE.md), copia `.env.example` a `.env.local` y ajusta URL, clave publicable e indicadores de correo. Los usuarios autenticados reciben exclusivamente los datos de su liga.

```sh
pnpm test             # cálculos + migración y permisos en PostgreSQL embebido
pnpm exec playwright install chromium
pnpm test:e2e         # móvil y escritorio
pnpm test:auth        # formulario de registro con respuestas Auth interceptadas
pnpm build           # TypeScript + producción + precarga PWA
pnpm preview
pnpm test:online      # integración remota explícita; necesita cuentas de prueba
```

Con Chrome instalado se puede evitar descargar Chromium: `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'; pnpm test:e2e`).

## Qué incluye

- Inicio con clasificación, especialistas, último resultado y acceso rápido a registrar.
- General, defensas, delanteros, completos, parejas y premios estadísticos; ambos porcentajes y tamaño de muestra.
- Mínimos configurables, provisionales separados, desempates sin redondear; orden alternativo por victorias, actividad y porcentaje real.
- Cuatro jugadores únicos, posiciones fijas, buscador, repetir equipos, marcador a objetivo y revisión antes de confirmar.
- Guardado atómico por RPC con UUID idempotente, bloqueo contra doble pulsación y control de revisión en correcciones.
- Registro personal con nombre/apodo, correo, contraseña y confirmación; sesión persistente, contraseña o enlace de correo y recuperación. En la configuración actual no se solicita confirmación por correo: al registrarse se crea acceso de jugador y ficha propia.
- Perfiles con evolución, posiciones, mejor pareja y rachas; historial filtrable por jugador y fechas.
- Administración de jugadores/avatares, permisos sobre cuentas registradas, temporadas/reglas, corrección, anulación, exportación JSON y auditoría. Las altas personales nunca reciben permisos de administrador.
- Realtime más consulta al reconectar, recuperar foco y cada 30 s. La consulta, no el evento, es la fuente de verdad.
- Partida en directo: cola de jugadores sueltos con fichaje propio o de terceros, arranque por orden de llegada, rotación automática de perdedores y reparto de puestos al entrar. Véase [la guía](docs/EN-DIRECTO.md).
- PWA con iconos PNG, manifest, service worker y actualización voluntaria. No se precargan ni cachean respuestas de Supabase.

## Criterios estadísticos

`WR = victorias / partidos × 100` (0 si no hay partidos). `Ajustado = (victorias + prior_wins) / (partidos + prior_games) × 100`. Inicialmente 10/20 y mínimo 10 partidos reales. Los provisionales siempre van después de los clasificados, incluso al elegir otro orden.

Defensas y delanteros usan solo apariciones en su posición. Completos exige el mínimo en ambas posiciones y promedia sus dos porcentajes ajustados. Las parejas no dependen de las posiciones y exigen 10 encuentros conjuntos por defecto. Desempates: porcentaje real, partidos, victorias, nombre en español y UUID únicamente si coinciden también los nombres.

La mejora compara el WR de la primera mitad de las apariciones cronológicas del jugador con la segunda mitad, con el mínimo configurado **en cada mitad**. Muestra puntos porcentuales y tamaño de muestra; no se publica un ganador sin muestra suficiente. Las rachas son victorias consecutivas en el conjunto consultado; para posiciones se ignoran las apariciones en la otra posición.

El histórico global combina partidas válidas de todas las temporadas y usa los parámetros iniciales 10/20 y mínimo 10; la UI lo indica. Cada temporada archivada conserva sus propias reglas. Al cerrar, se congela una copia de reglas y resultados con posiciones en `final_results`; la clasificación y campeones se reconstruyen con la misma lógica de dominio. Las temporadas cerradas no admiten registro, corrección ni anulación.

## Arquitectura

La identidad visual toma los colores y tipografías de la referencia ABLE aportada por el usuario: turquesa `#1DA099`, verde `#B0CA62`, morado `#21193C`, fondo blanco y tarjetas `#F8FAFC`. Mulish se usa para interfaz y JetBrains Mono para cifras/etiquetas. `src/brand.css` reúne la adaptación a la app y `src/club.css` la composición del club. El emblema combina la A original de ABLE con barra y balón; la portada muestra una ilustración de un futbolín completo. Véase [identidad y recursos](docs/VISUAL.md) para fuentes, archivos y prompt de generación. Las variantes latinas de las fuentes, el emblema y el futbolín se sirven localmente y se precargan para uso sin conexión. Azul y rojo se conservan como colores semánticos de los equipos. No se incorpora el flujo de presentaciones del archivo de referencia. El NFC y el fichaje de presencia no están implementados.

```text
src/domain/       Tipos, validación y funciones puras de ranking
src/data/         Cliente Supabase, sesión, consultas, RPC y suscripciones
src/components/   Formularios, rankings, perfiles, historial y administración
src/demo/         Demostración optativa, separada de producción
supabase/         Migración SQL versionada y bootstrap manual
scripts/          Precarga PWA, iconos e integración remota
tests/            Vitest/PostgreSQL embebido y Playwright
```

La fuente de verdad son `matches` y `match_participants`, sin contadores mutables de ranking. `league_snapshot` devuelve un estado consistente en una sola sentencia. `save_match` valida dentro de PostgreSQL y guarda cuatro participantes, partida, operación y auditoría en la misma transacción. Bloqueos por operación evitan duplicados; bloqueos de temporada/jugador/membresía coordinan altas, cierres y revocaciones. Los índices cubren liga, temporada, fecha y jugador. Las correcciones exigen revisión esperada y motivo.

El repositorio y el dominio no dependen de una interfaz concreta: un futuro cliente de solo lectura podrá reutilizar los cálculos y una consulta autorizada, después de diseñar permisos específicos. No hay un rol de display habilitado en esta versión.

## Estado y límites de verificación

Se han ejecutado compilación de producción, 34 pruebas unitarias/de base de datos, ocho pruebas del flujo móvil y ayuda y seis del registro con Playwright en Chrome (móvil y escritorio). Véase [pruebas y límites](docs/PRUEBAS.md).

La integración real de Supabase está configurada y verificada con dos sesiones independientes: Auth, autoalta, permisos, idempotencia concurrente, corrección, anulación, Realtime y recuperación por consulta. La liga real comienza sin resultados ficticios. No se ha desplegado en una cuenta Vercel del usuario; la web pública está en Sites. No hay claves secretas de servidor en el frontend. El envío de correos sigue pendiente de SMTP y no se ofrece en el acceso actual.

La aplicación selecciona la primera membresía activa de la cuenta; esta versión está pensada para una liga de oficina. El snapshot carga el historial de esa liga completo; para volúmenes muy grandes habrá que paginar o añadir agregados SQL con el mismo contrato estadístico.

## Guías

- [Partida en directo](docs/EN-DIRECTO.md)
- [Configurar Supabase](docs/SUPABASE.md)
- [Desplegar en Vercel e instalar la PWA](docs/DESPLIEGUE.md)
- [Roles y seguridad](docs/SEGURIDAD.md)
- [Pruebas y verificación remota](docs/PRUEBAS.md)

Referencias oficiales: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Vite](https://vite.dev/guide/), [Tailwind con Vite](https://tailwindcss.com/docs/installation/using-vite).

# Publicación compartida

App del equipo: https://vosuna01.github.io/futable/. Cada push a `main` publica con GitHub Actions si pasan las comprobaciones. [Instrucciones para Pol, Marc y Víctor](docs/GITHUB-PAGES.md).


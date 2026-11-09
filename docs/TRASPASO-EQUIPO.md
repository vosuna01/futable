# FutABLE: guía compartida para Pol y Marc

Actualizado el 6 de noviembre de 2026.

## Enlaces y accesos comprobados

- App de la liga: https://liga-cordoba-movil-victor.vosunas.chatgpt.site/
- Repositorio compartido: https://github.com/vosuna01/futable
- Código actual: https://github.com/vosuna01/futable/tree/main
- Comprobaciones: https://github.com/vosuna01/futable/actions
- Guía de colaboración: ../CONTRIBUTING.md
- Configuración de Supabase: SUPABASE.md
- Estado de producción: ACTIVACION.md
- Rey de la pista: REY-DE-LA-PISTA.md
- Despliegue y PWA: DESPLIEGUE.md
- Panel de la base de datos (requiere invitación propia): https://supabase.com/dashboard/project/foogrwxbycncnifbwlpe

El repositorio es público. Gilasu02 (Marc) y poletseib-ui (Pol) tienen permiso de escritura confirmado. Pueden trabajar directamente en main, sin ramas ni pull requests obligatorias. Cada uno usa su propia cuenta de GitHub con Claude; el acceso de Víctor no se comparte.

## Empezar con Claude

Clonad el mismo repositorio y abrid la carpeta en Claude Code o vuestro editor con Claude. Una copia descargada o un fork no actualiza automáticamente este repositorio.

Requisitos: Node 24 y pnpm 11.25.0.

```sh
git clone https://github.com/vosuna01/futable.git
cd futable
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Para cambios visuales, usad «Explorar demostración». El cliente incluye conexión pública a la liga real: iniciar sesión con una cuenta real conecta con datos reales. Para probar escrituras, usad otro proyecto Supabase configurado en .env.local según docs/SUPABASE.md; no ejecutéis bootstrap sobre producción.

Texto listo para pegar en Claude:

> Trabaja en https://github.com/vosuna01/futable, sobre main. Lee CONTRIBUTING.md, docs/TRASPASO-EQUIPO.md, docs/ACTIVACION.md y las guías relevantes. Descarga primero los cambios remotos y conserva el trabajo de otros compañeros. Implementa mi petición, comprueba pnpm test y pnpm build y sube un commit a main con mi cuenta de GitHub. Para cambios de interfaz ejecuta también las pruebas de navegador correspondientes. Distingue guardar código de publicarlo: el hosting actual es Sites y el push de GitHub no despliega la URL existente. No inventes credenciales ni uses las de Víctor. Añade los cambios de base de datos como migraciones nuevas y verifica cuáles están aplicadas antes de ejecutar nada. Mantén el historial de la liga y las políticas de acceso. No implementes /display ni modo kiosco.

## Guardar mejoras en la misma app

```sh
git switch main
git pull --ff-only
# Editar y probar.
pnpm test
pnpm build
git add RUTAS_DE_LOS_ARCHIVOS_MODIFICADOS
git commit -m "Describe el cambio"
git push origin main
```

Si main avanza mientras trabajáis, integrad los cambios remotos conservando ambos trabajos y repetid las comprobaciones afectadas. No forcéis el push. Para coordinar cambios simultáneos basta avisar qué parte está tocando cada uno.

Para las pruebas de navegador:

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

La recuperación de una mejora publicada se hace con un commit que revierta el cambio y un nuevo despliegue. Revertir código no revierte por sí solo una migración de base de datos.

## Mapa para editar

- src/components/: pantallas, formularios y controles.
- src/domain/: rankings, reglas y rotación; funciones de dominio.
- src/data/: autenticación, consultas, RPC y sincronización.
- src/brand.css, src/club.css y otros CSS: interfaz e identidad.
- public/: iconos, recursos y PWA.
- supabase/migrations/: cambios SQL ordenados.
- tests/: dominio, PostgreSQL embebido y navegador.
- docs/: decisiones, funcionamiento y configuración.

React + TypeScript + Vite + Tailwind; Supabase gestiona cuentas, datos y Realtime. Las claves publicables del cliente están en src/data/backend-settings.json y no conceden administración. No hace falta pedir una clave secreta para cambiar la interfaz.

## Código y producción: estado conocido

La última publicación comprobada en Sites es la versión 14. GitHub ha avanzado desde esa publicación: Marc subió el commit e75ccf3 con el modo en directo y supabase/migrations/006_live_sessions.sql. Su mensaje indica que la migración 006 queda pendiente de aplicar. Antes de activar ese modo, comprobar el estado real de la base de datos y probar la migración y sus permisos. Esta guía no aplica SQL ni publica esos cambios.

La migración 005 y el rey de la pista con parejas estaban verificados y publicados. El código de GitHub y el código actualmente servido pueden diferir.

Actualización del 9 de noviembre de 2026: en producción están aplicadas las migraciones 005, 006 (directo), 007 (guardias de cola) y 008 (tablet de pared, commit 7e5d77f). Las tres primeras se comprobaron en solo lectura; la 008 la aplicó Pol con su acceso a Supabase. Detalles en ACTIVACION.md y TABLET-PARED.md. No se ha comprobado qué versión sirve Sites ahora mismo.

## Publicar sin depender de Víctor: acceso aún pendiente

Guardar en main pasa las comprobaciones de GitHub, pero actualmente NO publica la web.

El alojamiento actual es Sites, proyecto appgprj_6ae5b83457488191b65575cfb182a290. A fecha de esta guía solo figura Víctor como editor/propietario. Una cuenta de GitHub o Claude no concede acceso a ese proyecto. No copiéis credenciales de su sesión ni cambiéis el project_id de .openai/hosting.json.

Hay dos vías para completar la autonomía:
1. Obtener acceso de editor al mismo Site mediante las identidades compatibles del equipo y publicar con el flujo de Sites.
2. Configurar un alojamiento compartido conectado a vosuna01/futable, rama main, con despliegue automático. El proyecto ya incluye vercel.json y docs/DESPLIEGUE.md para Vercel, pero NO hay un proyecto Vercel compartido configurado ni una nueva URL de producción en esta entrega. Elegir el alojamiento y conceder acceso antes de migrar; la URL de Sites no se traslada automáticamente.

Para una publicación estática, pnpm build genera dist. La configuración pública del backend ya está en el código. Si cambiáis variables VITE_, recompilad. Configurad el nuevo dominio en Supabase Auth y verificad registro, sesión, partida y sincronización desde dos clientes antes de compartir otra URL.

## Supabase: acceso independiente de GitHub

Para ejecutar migraciones, modificar Auth o gestionar el backend, cada persona necesita invitación en Supabase a su correo. El panel no se abre por tener acceso al repositorio ni a Claude. Las invitaciones no se han enviado en esta entrega porque faltan los correos de las cuentas Supabase y el acceso de gestión correspondiente. A 9 de noviembre de 2026, Pol ya tiene acceso al proyecto con su cuenta de GitHub.

El rol Developer permite trabajar con los recursos del proyecto; cambiar ajustes requiere un rol que lo permita. Elegid el alcance necesario según los roles disponibles y los proyectos de la organización; no compartáis la cuenta del propietario. Referencia: https://supabase.com/docs/guides/platform/access-control

Para una migración: revisar el orden aplicado, probar en un proyecto de desarrollo, revisar RLS/RPC y conservar una copia de seguridad antes del cambio de producción. No volver a ejecutar bootstrap ni las migraciones anteriores a ciegas. No publicar claves service_role, contraseñas de base de datos, tokens ni datos de jugadores.

Los permisos de administrador dentro de la liga son independientes de estos accesos técnicos. Cambiar el código no requiere ser administrador de la liga.

## Alcance

App móvil/PWA de futbolín; equipos Barça y Madrid, perfiles, ranking, resultados y rey de la pista. El modo en directo está en el código y sus migraciones están aplicadas. No hay /display ni modo kiosco, con una excepción pendiente de validar por el equipo: el modo tablet de pared en /?tablet, con el rol de liga scoreboard (ver TABLET-PARED.md). Los esquemas y pruebas de hardware locales de Víctor no equivalen a una integración ESP32 desplegada.

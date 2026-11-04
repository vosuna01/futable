# Vercel y PWA móvil

## Vercel

1. Crea tu repositorio con el contenido de esta carpeta. `.env.local`, `node_modules` y `dist` están ignorados. El lockfile debe versionarse.
2. Importa el repositorio desde tu cuenta Vercel. Selecciona Vite, Node 24 (o 22.12+), Install `pnpm install --frozen-lockfile`, Build `pnpm build`, Output `dist`.
3. Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en los entornos donde vaya a funcionar. Son valores públicos de frontend; nunca añadas service role o contraseñas de base de datos con prefijo `VITE_`.
4. Despliega. Cambiar una variable `VITE_` requiere **recompilar/desplegar**, porque se incorpora al bundle. La configuración de reescritura y cabeceras está en `vercel.json`.
5. Añade el dominio real a las URLs permitidas de Supabase Auth y al Site URL. Comprueba enlaces de invitación, acceso y recuperación con la dirección definitiva. Usa una liga de pruebas separada en previews.
6. Ejecuta la verificación remota y prueba desde dos móviles antes de utilizar la liga de oficina.

Esta entrega no accede a tu cuenta Vercel ni contrata servicios. La web pública de Sites usa el mismo frontend compilado, con URL y clave publicable de Supabase y acceso real mediante cuentas; también permite explorar una demostración separada. Para actualizar esa vista se conserva su identidad en `.openai/hosting.json`; ese archivo no afecta a Vercel.

## Instalar en iPhone

En la web, pulsa «Instalar FutABLE en el móvil» en el acceso o el botón de ayuda de la cabecera. Elige iPhone / iPad para ver la guía; Android muestra los pasos de Chrome. Las instrucciones están disponibles antes de iniciar sesión.

Abre el dominio HTTPS en Safari, inicia sesión y pulsa Compartir → Añadir a pantalla de inicio → Añadir. Abre el icono. iOS puede gestionar almacenamiento y sesiones según sus políticas; si se pierde la sesión, vuelve a iniciar sesión con tu cuenta autorizada.

Si aparece «Abrir como app web», mantenlo activado. En algunas versiones Compartir se encuentra dentro del menú Más. El nombre sugerido es FutABLE. Las instalaciones anteriores pueden conservar su nombre hasta que el sistema acepte la actualización o se añada de nuevo el acceso.

## Instalar en Android

Abre el dominio en Chrome, inicia sesión y usa el menú → Instalar aplicación o Añadir a pantalla de inicio. El nombre exacto depende del navegador. No es necesario publicar en una tienda.

## Sin conexión y actualizaciones

La build genera una lista de recursos públicos y un nombre de caché basado en sus hashes. La instalación del service worker precarga el shell y los bundles. Las consultas Supabase y tokens no entran en esas cachés. El dominio HTTPS y el navegador deben permitir service workers; en desarrollo local solo se activa al servir la build de producción.

Con la aplicación abierta se conservan en memoria los últimos datos consultados. Si pierde conexión, se muestra un aviso y no se confirma ningún resultado. No hay cola de partidas pendientes que pueda confundirse con un resultado guardado. Al reconectar se consulta de nuevo el servidor. Un error de red tras un commit puede dejar el estado incierto; el formulario conserva el UUID para reintentar la misma operación sin duplicar.

Una versión nueva queda esperando y se ofrece **Actualizar aplicación**. Al aceptarlo se activa y recarga. Confirma o cierra formularios antes de actualizar. La actualización elimina las cachés antiguas de esta aplicación.

No se incluye instalación de display ni configuración de kiosco: están expresamente fuera del alcance actual.

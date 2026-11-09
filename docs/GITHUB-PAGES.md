# FutABLE · Publicación compartida

La app compartida se publica en https://vosuna01.github.io/futable/.
El código sigue en https://github.com/vosuna01/futable, rama `main`.
La URL anterior de Sites está retirada y redirige automáticamente a la app compartida: https://liga-cordoba-movil-victor.vosunas.chatgpt.site/.
Sites conserva solo la redirección; no debe publicarse allí otra copia de la aplicación.

## Cómo publicar una mejora

1. Descarga los cambios de `main` antes de editar. Conserva el trabajo de los demás.
2. Edita, prueba y sube el commit a `main` con tu cuenta. No hacen falta ramas ni pull requests.
3. Abre https://github.com/vosuna01/futable/actions y espera a que **Publicar FutABLE** termine en verde.
4. Abre la app compartida. Si la tienes instalada, pulsa **Actualizar aplicación** cuando aparezca.

Los colaboradores con escritura, incluidos Gilasu02 y poletseib-ui, publican con el mismo flujo. No necesitan la sesión, contraseñas o credenciales de Sites de Víctor.

El workflow `.github/workflows/pages.yml` ejecuta las pruebas, compila, verifica la navegación/PWA bajo `/futable/` y despliega el resultado con GitHub Actions. Si falla una comprobación, ese despliegue no sustituye la versión anterior. También se puede ejecutar desde **Actions → Publicar FutABLE → Run workflow**, eligiendo `main`.

## Cuentas y datos

Se usa el mismo proyecto Supabase y la misma liga. No hay que crear otra cuenta ni migrar partidas. Al cambiar de dominio puede ser necesario iniciar sesión otra vez. La instalación PWA pertenece al dominio: instala la nueva URL si quieres que el acceso directo reciba estas publicaciones.

Los cambios SQL siguen siendo independientes: un push no ejecuta migraciones de Supabase. Revisa `docs/ACTIVACION.md` y aplica solo las migraciones pendientes con acceso autorizado. Nunca subas claves de servidor, tokens o contraseñas.

## Rutas y verificación

El build de Pages usa `SITE_BASE_PATH=/futable/`; un build normal conserva `/` para Sites u otros alojamientos. Usa `appUrl()` para imágenes, enlaces y navegación del cliente. El manifest y el service worker se generan para ese ámbito. La caché solo contiene recursos públicos de la app, sin respuestas de Supabase.

Para verificar Pages localmente:

```powershell
$env:SITE_BASE_PATH='/futable/'
pnpm build
pnpm exec playwright test --config playwright.hosting.config.ts
```

Para verificar el alojamiento raíz, quita `SITE_BASE_PATH`, ejecuta `pnpm build` y usa las pruebas habituales.

## Recuperar una versión

Revierte el commit problemático con `git revert`, conserva los cambios de otros y sube el nuevo commit a `main`. El workflow publica la reversión después de pasar las comprobaciones. No fuerces el historial. Revertir código no revierte migraciones SQL.

# Colaborar en FutABLE

## Pedir acceso

1. Crea tu cuenta de GitHub si todavía no tienes una.
2. Envía a Víctor tu usuario o correo asociado a GitHub por el canal que uséis habitualmente.
3. Víctor decide quién colabora y envía la invitación desde los ajustes del repositorio.
4. Acepta la invitación. Ya podrás clonar o abrir el mismo repositorio con tu editor o asistente de IA.

El rol de administrador de la liga y los permisos para editar código son independientes. No compartas contraseñas ni tokens personales.

## Preparar el entorno

Necesitas Node.js 24 y pnpm 11.25.0 (el README original incluye los comandos de instalación).

```sh
git clone https://github.com/vosuna01/futable.git
cd futable
pnpm install --frozen-lockfile
pnpm dev
```

Para cambios visuales, entra en **Explorar demostración**. Las partidas y perfiles de demostración son temporales. Los ajustes públicos incluidos conectan con la liga real: para pruebas de escrituras usa tu propio proyecto de Supabase mediante `.env.local`. No repitas las migraciones ni el bootstrap sobre producción; consulta `docs/ACTIVACION.md`.

## Editar libremente

Los colaboradores pueden editar y guardar directamente en `main`. No hacen falta ramas ni pull requests. Puedes editar desde GitHub con el lápiz o conectar este repositorio a tu editor o asistente de IA.

Si trabajas en local:

```sh
git switch main
git pull --ff-only
# Edita y comprueba el resultado.
pnpm test
pnpm build
git add .
git commit -m "Describe el cambio"
git push origin main
```

Antes de empezar, descarga los últimos cambios. Si alguien publica mientras estás trabajando, integra sus cambios antes de subir los tuyos; conserva las mejoras de ambos y evita forzar la subida. Las comprobaciones automáticas siguen ejecutándose después de cada cambio en `main` y sirven como aviso. No imponen revisión previa ni publican el sitio.

## Publicación

Integrar una pull request no actualiza automáticamente la app. La persona responsable de publicar toma el código revisado de `main` y lo publica en el Site existente, conservando `.openai/hosting.json`, el proyecto y la URL actuales. La publicación requiere acceso al Site; editar el repositorio no lo concede.

Los cambios de base de datos se añaden como una nueva migración y se revisan aparte antes de aplicarlos a producción. No subas datos reales de jugadores, `.env`, contraseñas, claves de servidor o tokens. La clave publicable del cliente no es una clave de administración.

## Alcance actual

Aplicación móvil/PWA, perfiles, partidas, rankings, administración y sincronización. El display, el modo kiosco y las integraciones NFC/ESP32 siguen fuera de la versión implementada.

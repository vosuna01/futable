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

## Proponer una mejora

```sh
git switch main
git pull --ff-only
git switch -c mejora/nombre-breve
# Edita y comprueba el resultado.
pnpm test
pnpm build
git add .
git commit -m "Describe el cambio"
git push -u origin mejora/nombre-breve
```

Abre una **pull request** hacia `main`. Explica qué cambia, incluye capturas si afecta al diseño y cuenta cómo lo has comprobado. Cada compañero trabaja en su rama y todos incorporamos los cambios al mismo proyecto. Antes de integrar, revisad las comprobaciones y pedid revisión a otro compañero. Este acuerdo de revisión no equivale a una protección obligatoria de rama configurada en GitHub.

Las comprobaciones automáticas ejecutan pruebas, compilación y los recorridos principales en móvil y escritorio. No se conectan con una cuenta de jugador ni publican el sitio.

## Publicación

Integrar una pull request no actualiza automáticamente la app. La persona responsable de publicar toma el código revisado de `main` y lo publica en el Site existente, conservando `.openai/hosting.json`, el proyecto y la URL actuales. La publicación requiere acceso al Site; editar el repositorio no lo concede.

Los cambios de base de datos se añaden como una nueva migración y se revisan aparte antes de aplicarlos a producción. No subas datos reales de jugadores, `.env`, contraseñas, claves de servidor o tokens. La clave publicable del cliente no es una clave de administración.

## Alcance actual

Aplicación móvil/PWA, perfiles, partidas, rankings, administración y sincronización. El display, el modo kiosco y las integraciones NFC/ESP32 siguen fuera de la versión implementada.

# FutABLE · Acceso con Google

## Estado de esta preparación

El cliente incorpora **Entrar con Google** y conserva correo/contraseña durante la transición. El botón solo aparece si `/auth/v1/settings` confirma que Google está habilitado en el proyecto Supabase conectado. Si no lo está o no responde, el acceso existente continúa funcionando.

La preparación del frontend no activa por sí sola el proveedor. Hace falta crear el cliente OAuth de Google y configurarlo en Supabase. No debe declararse operativo hasta completar la prueba real de inicio de sesión.

## Configuración exacta

- App: **FutABLE**.
- Proyecto Supabase: `foogrwxbycncnifbwlpe`.
- Tipo de cliente Google: **Web application**.
- Origen JavaScript autorizado: `https://vosuna01.github.io` (sin `/futable/`).
- URI de redirección de Google: `https://foogrwxbycncnifbwlpe.supabase.co/auth/v1/callback`.
- URL de la app y retorno permitido en Supabase: `https://vosuna01.github.io/futable/`.
- Ámbitos: solo `openid`, `email` y `profile`. No pedir Drive, Gmail, Calendar, acceso sin conexión ni permisos adicionales.
- Audiencia externa si deben entrar compañeros con cuentas Gmail, además de las de la empresa. Revisar las políticas de la organización y el estado de publicación del consentimiento de Google.
- Guardar el Client ID y el Client Secret únicamente en **Supabase → Authentication → Sign In / Providers → Google**. Nunca en GitHub, archivos del frontend, chats o `.openai/hosting.json`.
- Mantener **Skip nonce checks** y **Allow users without an email** desactivados.

Antes de crear nuevas credenciales o habilitar el proveedor mediante control del navegador, completar la confirmación requerida por esa herramienta para el cliente y sus permisos concretos. No reutilizar clientes de otros proyectos de trabajo.

## Cuentas actuales

Elegir en Google el **mismo correo** que se usó al crear la cuenta de FutABLE. Supabase admite vinculación automática por correo; antes de retirar el método anterior hay que comprobar con una cuenta existente que el UUID, la ficha, el rol y las partidas siguen siendo los mismos. No crear ni borrar fichas para corregir una vinculación.

Si se elige otro correo, puede tratarse como cuenta nueva. Para vincular un correo distinto se necesita un flujo autenticado y verificado aparte; esta preparación no habilita vinculación manual ni cambia correos.

La liga original permite registro por correo sin verificación porque así lo pidió el propietario. La incorporación de Google no debe usarse como evidencia de que se verificaron históricamente todas esas cuentas. Revisar los casos de vinculación antes de desactivar el método anterior.

## Verificación y transición

1. Completar y publicar el consentimiento y el cliente OAuth conforme a las opciones disponibles de Google.
2. Configurar Google y la URL exacta de retorno en Supabase.
3. Recargar la app y verificar que aparece **Entrar con Google**.
4. El propietario entra con el mismo correo de su cuenta anterior y comprueba perfil, historial y permisos.
5. Repetir con una cuenta de jugador y comprobar que no recibe administración.
6. Comprobar cancelación y vuelta a la app. Mantener la contraseña como alternativa hasta validar el acceso de los compañeros.

Pruebas automatizadas: `pnpm test` y `pnpm test:auth`. Las pruebas de navegador usan un proveedor simulado; no sustituyen la comprobación real del cliente OAuth configurado.

Referencias: https://supabase.com/docs/guides/auth/social-sign-in/auth-google y https://supabase.com/docs/guides/auth/auth-identity-linking.

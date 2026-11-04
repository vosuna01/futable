# Configuración de Supabase

**La liga de oficina ya está conectada.** Consulta [ACTIVACION.md](ACTIVACION.md) antes de cambiar nada. En el proyecto actual no vuelvas a ejecutar 001/002 ni el bootstrap: el esquema y la primera temporada se aplicaron desde SQL Editor. El registro actual entra directamente sin enviar correos, por autorización del propietario. Los pasos siguientes describen cómo preparar un proyecto nuevo con verificación y correo configurado.

1. Crea un proyecto de Supabase en tu cuenta. Esta entrega no lo crea ni presupone credenciales. Conserva la contraseña de PostgreSQL fuera del frontend.
2. En un proyecto nuevo ejecuta en SQL Editor `001_league.sql`, `002_self_registration.sql`, `003_variable_goals.sql` y `004_self_profile.sql`, en ese orden, **una sola vez cada una**. En una instalación existente aplica solo las migraciones pendientes. Si usas Supabase CLI, enlaza el proyecto y aplica las migraciones con `supabase db push`. No ejecutes ambas opciones sobre la misma base.
3. En Auth → Providers → Email activa **Allow new users to sign up** y **Confirm email**. Cada visitante podrá crear una cuenta y, al verificar el correo, entrar como jugador. Ningún registro puede autoasignarse permisos de administrador.
4. En Auth → URL Configuration define el Site URL del frontend y permite exactamente sus URLs de redirección (producción y `http://127.0.0.1:5173`). Usa HTTPS en producción. Evita comodines para dominios ajenos.
5. Crea y confirma tu primera cuenta desde la app (o invítala desde Auth). Sustituye `YOUR_INVITED_EMAIL` por ese correo en `supabase/bootstrap.sql` y ejecútalo en SQL Editor. Crea atómicamente liga, primera temporada, perfil, configuración de registro y membresía admin. No crea jugadores ficticios. Hasta ejecutar el bootstrap, la primera cuenta no tendrá una liga a la que entrar. En una instalación existente con una sola liga, la migración 002 configura esa liga automáticamente; no repitas el bootstrap.
6. Copia Project URL y la clave pública `anon` o publishable compatible a `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
```

7. Reinicia Vite. Entra con tu cuenta de administrador y ajusta temporada y reglas. Cada cuenta nueva verificada obtiene automáticamente una membresía `player` y un jugador con su nombre/apodo. El alta es atómica e idempotente. Una cuenta revocada no puede reactivarse mediante esta operación.
8. Comparte la URL de tu frontend accesible con los participantes: Crear cuenta → nombre, correo y contraseña → confirmar correo → entrar. No hace falta invitarlos ni copiar sus UUID para darles acceso. Para ascender o revocar una cuenta, usa su UUID en Administración → Cuentas autorizadas. La clave service role no se necesita ni se expone en el frontend.
9. En Database → Replication / Realtime confirma que `matches`, `players`, `seasons` y `league_memberships` pertenecen a `supabase_realtime`. La migración las añade si la publicación existe. Si aún no existe, actívala desde el dashboard y añade esas tablas. Las políticas RLS filtran qué cambios puede leer cada sesión.
10. Prueba con dos móviles: un jugador registra, el segundo actualiza el historial y ranking; desconecta y vuelve a conectar el segundo y comprueba la recuperación por consulta. Para automatizar usa `pnpm test:online` en una liga aislada.

Los límites gratuitos y disponibilidad dependen de tu cuenta. No se ha contratado ningún plan. El envío de correos depende del proveedor SMTP configurado en Supabase; comprueba entrega y límites antes de invitar a toda la oficina.

El bootstrap se niega a crear una segunda liga si la cuenta ya tiene una membresía. No es una migración automática y nunca debe contener una contraseña o token real en el repositorio.

Si tu base contiene varias ligas, selecciona explícitamente el destino del registro desde SQL Editor:

```sql
insert into public.registration_settings(singleton,league_id)
values(true,'UUID_DE_TU_LIGA')
on conflict(singleton) do update set league_id=excluded.league_id;
```

La configuración no se puede consultar ni modificar desde el navegador. Para cerrar nuevas incorporaciones, elimina esa fila; las cuentas que ya son miembros conservan su acceso. La migración no elimina ni fusiona jugadores históricos: si alguien ya tenía una ficha manual, su nueva cuenta crea una ficha propia y un administrador deberá revisar esa duplicidad sin borrar el historial.

La web de Sites es pública por petición del propietario: cualquier persona puede abrir el frontend. El acceso a los datos reales y la creación de cuentas siguen dependiendo de configurar Supabase, sus permisos y el registro. El cambio de nombre conserva la audiencia pública y el mismo enlace compartido.

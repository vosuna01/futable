# Roles y seguridad

El registro está abierto: nombre/apodo, correo y contraseña. En la configuración activa (correo y contraseña, sin confirmación por correo autorizada por el propietario), `join_open_league` crea atómicamente membresía de jugador, ficha y auditoría. El rol siempre lo fija PostgreSQL como `player`; se ignoran roles o UUIDs enviados en metadatos. Los reintentos no duplican altas y una membresía revocada no se reactiva. La tabla privada `registration_settings` elige la liga de destino, sin acceso desde el navegador. Los datos siguen requiriendo una sesión y membresía activa.

| Operación | Administrador | Jugador autorizado | Anónimo / revocado |
|---|---|---|---|
| Consultar liga, jugadores, temporadas y resultados | Sí | Sí | No |
| Registrar partida en temporada activa | Sí | Sí | No |
| Corregir / anular con motivo y revisión | Sí | No | No |
| Gestionar plantilla, reglas, temporadas y permisos | Sí | No | No |
| Consultar auditoría / todas las membresías | Sí | No | No |
| Escribir directamente en las tablas de negocio | No | No | No |

No existe un rol de display, dispositivo registrado ni credencial de lectura en esta versión. La arquitectura mantiene funciones de consulta separadas de comandos, para poder añadirlos con una migración futura.

RLS está habilitado en todas las tablas. Las tablas de negocio solo exponen SELECT autorizado. Las funciones `SECURITY DEFINER` tienen `search_path=''`, nombres de esquema explícitos, ejecución revocada a PUBLIC/anon y comprueban `auth.uid()` y la membresía activa. Las operaciones de servidor no confían en el rol que envía el navegador.

Las cuatro posiciones, jugadores activos de la misma liga, temporada activa, marcador objetivo, autor e identificador idempotente se validan en PostgreSQL. No hay un endpoint con service role en el frontend. Cambiar HTML, llamar manualmente a una RPC o manipular el estado React no da permisos adicionales.

Las cuentas se revocan con `active=false` en Administración. La siguiente consulta/RPC o petición Realtime ya aplica la revocación. El cliente consulta al recuperar foco y cada 30 s; si recibe denegación, borra su snapshot visible. Ninguna aplicación puede retirar datos que alguien ya haya visto, fotografiado o conservado en la memoria de una sesión sin conexión. Cerrar sesión elimina el snapshot y la demostración. Los JWT se gestionan mediante Supabase Auth y la sesión local persistente del SDK, no mediante cachés del service worker.

Las respuestas privadas de Supabase no pasan por el service worker. Solo se cachea el código público, iconos y shell HTML sin datos de liga. El snapshot privado permanece en memoria, sin persistencia offline en disco. No se garantizan consultas privadas después de cerrar el navegador sin internet. Esto reduce exposición en dispositivos compartidos.

Las correcciones y anulaciones quedan auditadas con autor, motivo, antes/después y versión; las anulaciones no borran participantes. Las temporadas cerradas quedan bloqueadas y congelan resultados y reglas. Solo el propietario de PostgreSQL tiene capacidad de saltarse los permisos de aplicación y debe proteger su cuenta Supabase.

La exportación JSON es una descarga local iniciada por un administrador e incluye UUIDs y auditoría. Debe guardarse como información privada de la liga. Solo se muestran nombres/apodos y avatares, sin correos de otras cuentas.

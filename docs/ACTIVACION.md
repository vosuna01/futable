# FutABLE · Activación de la liga real

Activada el 31 de octubre de 2026 con Supabase PostgreSQL, Auth y Realtime.

Actualización del 5 de noviembre de 2026: migración 005 aplicada y sesión continua de rey de la pista activada. Cola compartida de parejas, victoria con un toque, marcador opcional real (goles nulos), rotación atómica y deshacer con anulación y restauración de cola. Sin revancha automática. Consulta [la guía de uso](REY-DE-LA-PISTA.md).

Verificación de esta actualización: TypeScript, 64 pruebas de dominio/PostgreSQL y 24 pruebas de navegador en móvil/escritorio. RPC online comprobada en transacción revertida: rotación, idempotencia, victoria sin marcador, deshacer, pausa sin rivales y cierre. Las 58 partidas existentes se conservaron y no quedaron sesiones ni datos de prueba nuevos.

- Proyecto: `foogrwxbycncnifbwlpe` (FutABLE, organización gratuita del propietario).
- Liga real: `e51ccd56-6708-449a-8d2a-48eb4e4c0bd4`.
- Temporada inicial: **Temporada 1**, activa, con goles variables (habitualmente 2 o 3).
- Equipos visibles: **Barça** y **Madrid**. Se conservan los identificadores internos para mantener el historial.
- Rey de la pista: al abrir una nueva partida se precargan los ganadores de la última partida válida de la temporada activa, en su mismo equipo y posición. Los puestos rivales quedan libres; pueden cambiarse todos los jugadores o empezar de cero. Las partidas anuladas y los jugadores inactivos no se arrastran.
- Migración 004 aplicada: cada cuenta puede editar su propia ficha (nombre y foto), sin cambiar su ID, rol ni partidas. Fotos JPEG optimizadas de hasta 48.000 caracteres, accesibles mediante los permisos existentes de la liga; no se usa un bucket público. La auditoría guarda si hay foto, nunca copias de la imagen.
- Perfiles verificados: 5 pruebas adicionales de permisos/identidad en PostgreSQL y pruebas de selección, conversión, guardado y retirada de foto en móvil/escritorio. RPC online comprobada en transacción revertida, sin editar cuentas reales.
- Migración 003 aplicada: el objetivo de temporada solo sugiere el marcador inicial. Se permiten marcadores enteros de 0 a 99, con ganador y sin empate. Cada victoria pesa igual en los rankings.
- Verificación adicional: 41 pruebas de dominio y PostgreSQL, 10 de navegador en móvil/escritorio y RPC online con 2–1, 3–1 y 7–1 dentro de una transacción revertida, sin dejar partidas de prueba.
- Mínimos iniciales: diez partidos; ajuste estadístico 10/20.
- El arranque de la liga real no incluye jugadores ni resultados ficticios. Cada persona crea su cuenta y su ficha se añade automáticamente como jugador.

## Acceso actual

Por autorización expresa del propietario, el registro con correo y contraseña entra directamente, sin verificar el correo mediante un mensaje. El SMTP de prueba de Supabase no permite enviar confirmaciones a todos los compañeros. No se ha añadido un servicio de pago ni un proveedor de correo adicional.

Los correos son identificadores declarados, no identidades verificadas. Los permisos se consultan en la membresía guardada en PostgreSQL, nunca en metadatos editables del usuario. Todas las altas personales reciben el rol `player`.

Los enlaces de acceso y la recuperación por correo no se ofrecen hasta configurar un servicio de correo. Si alguien pierde su acceso debe contactar con el administrador. Para activar esos flujos, configurar SMTP en Supabase y actualizar `emailDeliveryEnabled`; para exigir confirmación también hay que cambiar la configuración Auth y `emailConfirmationRequired`.

No se ha creado una contraseña personal para el propietario ni una cuenta administrativa compartida. El propietario debe crear su cuenta desde la web; después se podrá asignar administración a su UUID concreto desde Supabase. No se debe promover una cuenta basándose únicamente en un correo no verificado.

## Configuración del frontend

`src/data/backend-settings.json` contiene solo URL y **clave publicable**, diseñadas para enviarse al navegador. No contiene clave secreta, service role ni contraseña de base de datos. Las políticas RLS y las RPC comprobadas son la frontera de permisos. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` permiten conectar otro proyecto; para ese proyecto, configurar también los indicadores de correo en `.env.local`.

La configuración pública se conserva en Sites y en el código para que una edición o nueva build no vuelva al modo sin backend. El contenido de la liga continúa requiriendo cuenta y membresía, aunque la web sea pública.

## Verificación remota ejecutada

Se usaron cuentas técnicas y una liga aislada, separadas de la liga real:

- Registro con contraseña y sesión real sin confirmación de correo.
- Autoalta idempotente con creación de ficha y rol de jugador; el intento de enviar `role: admin` en metadatos no concede privilegios.
- Bloqueo del acceso anónimo, de configuración privada y de la lectura entre ligas.
- Cuatro solicitudes concurrentes con el mismo UUID: una sola partida.
- Guardado de cuatro posiciones y consulta desde una segunda sesión.
- Evento INSERT por Realtime, corrección con revisión y recuperación de un cambio perdido mediante consulta.
- Anulación trazable y cierre de la temporada técnica.

La primera comprobación detectó la diferencia entre conectar el canal y tener lista la suscripción PostgreSQL. Se añadió una consulta de recuperación al evento `system` que confirma `postgres_changes`; la segunda ejecución completa pasó.

La liga de verificación permanece cerrada y aislada por RLS. Las tres cuentas técnicas quedaron bloqueadas y sus membresías inactivas; no tienen acceso a la liga real. No se borró auditoría ni se mezclaron sus resultados con la temporada de oficina.

# Identidad visual de la liga

El emblema combina el símbolo original de ABLE Human Motion con una barra, dos empuñaduras y un balón. Es una composición para la liga de oficina, no un rediseño de la identidad corporativa. Se conserva el símbolo original mediante una imagen PNG incrustada y recortada por el viewBox del SVG; el resto de la composición es vectorial.

- `public/brand/liga-cordoba-logo.svg`: emblema utilizado en navegación, acceso y favicon.
- `public/brand/liga-cordoba-lockup.svg`: composición completa con nombre de la liga y tipografías incrustadas.
- `public/brand/able-human-motion-official.png`: referencia original descargada de la web corporativa.
- `public/visuals/foosball-table.png`: ilustración generada de un futbolín completo, con transparencia, reutilizada en acceso e inicio. No es una fotografía del futbolín real de la oficina.
- `src/club.css`: composición, portada y adaptación móvil.
- `scripts/icons.mjs`: exportación de iconos PNG desde el nuevo emblema.

Origen del logo oficial: [ABLE Human Motion](https://www.ablehumanmotion.com/en/), [archivo original](https://www.ablehumanmotion.com/wp-content/uploads/2024/04/able_logo.png). Consultado el 31 de octubre de 2026. La denominación de la aplicación sigue siendo Liga FutABLE.

Las fuentes siguen siendo Mulish y JetBrains Mono, con paleta turquesa, verde y morado. Se mantienen azul y rojo exclusivamente para identificar equipos. El emblema y la ilustración se sirven desde el mismo origen y se precargan en la PWA.

## Generación de la ilustración

Herramienta: ImageGen integrado, modo generación, fondo transparente. La imagen seleccionada se copió al proyecto sin alterar el original.

Prompt original (la imagen se generó antes del cambio de nombre a FutABLE):

> Use case: product-mockup / stylized-concept. Create a premium photorealistic 3D product cutout of a COMPLETE physical Spanish Catalan foosball table (futbolín catalán), the focal illustration for the Liga Córdoba office league web app at ABLE Human Motion. Must read unmistakably as a REAL TABLE football machine, not a soccer pitch graphic. Show the entire wooden cabinet and its four sturdy tapered legs, side panels, ball return, all external chrome rods and black ribbed handles, mechanical scoring beads, the green playing surface recessed inside the cabinet, tiny sculpted two-legged red and blue football player figures fixed on the rods. A tasteful small turquoise and lime accent strip around the dark walnut cabinet matches palette turquoise #1da099, lime #b0ca62, deep purple #21193c. Three-quarter camera angle slightly above at around 35 degrees so you can clearly see the wooden construction, legs, handles and players. Long axis of table goes from lower left to upper right. Refined walnut grain, satin metal, beautiful soft studio highlights, highly realistic miniature product photography, sophisticated office sports branding. Isolated object on a genuinely transparent alpha background with just a subtle contact shadow; no room, no pedestal, no people, no text, no lettering, no numbers, no logos, no watermark. Landscape 3:2 composition, generous transparent margin around the complete object, no cropped handles or legs. Keep the table cohesive, rectangular and mechanically plausible.

## Presencia / NFC

No se implementa fichaje, etiquetas NFC, lectura de tarjetas ni seguimiento de presencia en esta entrega. Se ha valorado como posible mejora para disponibilidad de jugadores, separada de autenticación y del ranking.
# Interfaz de club · FutABLE

La revisión premium conserva Mulish, JetBrains Mono y la paleta de ABLE. Añade superficies blancas sobre fondo suave, acentos turquesa, tarjetas con bordes sutiles y espaciado consistente. El inicio incluye saludo y estadísticas personales; en móvil, la navegación flota sobre el contenido y los formularios se presentan como una hoja inferior. Se conserva el futbolín como imagen principal.

Comprobaciones: registro, perfiles, rankings e instalación con las 14 pruebas de navegador; revisión visual en 360, 390 y 1440 px, sin desbordamientos; arranque PWA sin conexión, con fuentes locales y sin errores JavaScript. El cambio no altera los cálculos de clasificación ni los permisos.


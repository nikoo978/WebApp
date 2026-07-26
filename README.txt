WEBN13 - INTERFAZ MODERNA Y RESPONSIVE

CAMBIOS VISUALES
- Interfaz modernizada con nueva paleta, tarjetas, bordes, sombras y espaciado.
- Modo claro y oscuro mediante el botón pequeño de luna/sol en la barra superior.
- El tema elegido queda guardado en el dispositivo.
- Navegación reorganizada y completamente responsive.
- La pestaña Datos quedó separada del resto y se identifica con un engranaje.
- Barra de acciones de la planilla agrupada por fecha/turno, acciones principales, edición y exportación.
- En celulares y tablets los botones se reacomodan automáticamente.
- Texto de las celdas de la columna Servicio centrado, incluido el selector.
- Se mantiene toda la lógica y los datos de WebN12.

ACTUALIZACIÓN CON GIT
1. Copiar el contenido del ZIP sobre el repositorio actual.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN13 con interfaz moderna y modo oscuro"
   git push

No se agregaron dependencias. No hace falta ejecutar npm install.

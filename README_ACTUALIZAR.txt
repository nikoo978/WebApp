Shift Manager WebN8 - LISTO PARA ACTUALIZAR EN GIT Y VERCEL

CONTENIDO
- Todas las mejoras de WebN7.
- Catálogo de personal actualizado con la planilla de servicios diarios recibida.
- Jerarquía, legajo, situación y observaciones visibles/editables en la pestaña Personal.
- Migración automática de la base existente al catálogo WebN8 al abrir la aplicación.
- Se preservan estados, ausencias, planillas, turnos, historial y backups existentes.

PERSONAS IGNORADAS EN ESTA ACTUALIZACIÓN
Ramis Emiliano, Arnaldo Andrade, Cristina Ayala, Fernández María Sol,
Lastra César Maximiliano, Barrera Hugo, Díaz Walter, Valdez Carmen y Riveros Laura.
Sus registros existentes no se modifican.

INTERPRETACIONES DE LA PLANILLA MANUSCRITA
- Lovelli Georgina: martes y viernes 15 a 21; sábado 15 a 23.
- Segovia Federico: lunes a viernes rotativo 07-13 / 13-19;
  sábado rotativo 07-12 / 14-19.

ACTUALIZAR
1. Descomprimir este ZIP.
2. Copiar su contenido dentro de la carpeta del repositorio actual.
3. No borrar .git ni .env.local.
4. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN8 y renovar personal"
   git push

Vercel desplegará automáticamente la actualización.

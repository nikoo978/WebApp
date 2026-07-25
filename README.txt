Shift Manager WebN9 - LISTO PARA ACTUALIZAR EN GIT Y VERCEL

NOVEDADES WEBN9
- Gestión completa de Art. 214 / licencia por descanso anual.
- Fecha de inicio y fecha de fin obligatorias para Art. 214.
- Presentación calculada automáticamente para el día posterior al fin del Art. 214.
- Gestión de Carpetas Médicas con artículo o motivo libre (Art. 175, 172, 226h, 226e, etc.).
- La fecha de fin de Carpeta Médica es opcional; si queda vacía, la licencia continúa vigente.
- Alta, modificación y eliminación de licencias desde una tabla única.
- Estados visuales: Vigente, Próxima y Finalizada.
- El personal con una licencia vigente no se carga automáticamente en la planilla del día.
- Licencias vigentes visibles en la tabla de Personal y en el buscador rápido.
- Compatibilidad y migración automática de los Art. 214 ya existentes.

SE CONSERVA
- Todo el personal actualizado de WebN8.
- Planillas, turnos, vacaciones/licencias previas, historial, backups y configuración.
- Acceso por PIN, Vercel y Upstash Redis existentes.

ACTUALIZAR
1. Descomprimir este ZIP.
2. Copiar todo su contenido dentro de la carpeta del repositorio actual.
3. No borrar .git ni .env.local.
4. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN9 con licencias y carpetas medicas"
   git push

Vercel desplegará automáticamente la actualización.

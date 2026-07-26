WEBN11 - ACTUALIZACIÓN PARA GIT Y VERCEL

MEJORAS PRINCIPALES
- La planilla principal es de sesión: cada recarga abre una tabla limpia con la fecha real del día.
- La última tabla trabajada queda guardada inmediatamente como borrador recuperable mediante el botón “Recuperar última tabla”, incluso si se refresca la página o se corta la energía antes de sincronizar con la nube.
- Validación estricta antes de cargar, guardar, imprimir o exportar: fechas, horarios, marcas, servicios, nombres y duplicados.
- Se impide repetir una persona en la planilla, turnos, Canes o rotativos de 48 h.
- Backups específicos del personal: crear, restaurar, descargar y borrar; máximo 5 copias con fecha y hora.
- Cada backup de personal incluye nómina, horarios, licencias, turnos fijos, rotativos y Canes.

ACTUALIZAR
1. Copiar el contenido de esta carpeta sobre el repositorio actual.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN11 con validación y backups del personal"
   git push

Vercel realizará el despliegue automáticamente. No se agregaron dependencias.

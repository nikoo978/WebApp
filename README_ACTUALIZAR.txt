WEBN23 - ACTUALIZACIÓN PARA GIT Y VERCEL

PLANIFICACIÓN AUTOMÁTICA DESPLEGABLE
- El panel “PLANIFICACIÓN AUTOMÁTICA 07→07” permanece cerrado por defecto.
- Solo se muestra una barra compacta con el estado de cobertura.
- Al tocar o hacer clic en la barra se despliegan:
  - distribución de centinelas y Canes;
  - cobertura por horario;
  - advertencias;
  - recargos sugeridos.
- Al realizar cambios en la tabla, el panel conserva su estado:
  - si estaba cerrado, continúa cerrado;
  - si estaba abierto, continúa abierto.
- Durante el recálculo solo cambia el pequeño indicador del encabezado.
- El panel ya no se abre ni ocupa espacio adicional después de cada modificación.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN23 con planificación automática desplegable"
   git push

No se agregaron dependencias ni variables de entorno.
Los datos guardados en Upstash no se modifican.

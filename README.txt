WEBN15 - ACTUALIZACIÓN PARA GIT Y VERCEL

CAMBIOS PRINCIPALES
- La pestaña Planilla ahora se llama Tabla.
- Nueva pestaña Tablas guardadas.
- El botón Guardar conserva una copia de la tabla actual.
- Se guardan hasta 10 tablas ficticias.
- Se permiten varias copias con la misma fecha; se distinguen por la hora de guardado.
- Las tablas guardadas pueden abrirse o borrarse.
- Al refrescar, la Tabla sigue iniciando limpia con la fecha real del día.
- Recuperar Tabla conserva la recuperación rápida de la última tabla de trabajo.
- La validación funciona internamente: solo aparece una ventana cuando existen errores.
- Se eliminó el botón Validar y no se muestra mensaje de validación exitosa.
- Orden de controles solicitado:
  Cargar al personal, Guardar, Recuperar Tabla, Fila, Deshacer, Limpiar,
  Pantalla completa, Ocultar controles, JPG, Imprimir.
- El estado Nube sincronizada aparece como aviso pequeño y temporal.
- Se eliminó el encabezado visible Gestión de turnos.
- El botón sol/luna está inmediatamente a la izquierda del engranaje.
- El título del navegador muestra únicamente Gestión de turnos.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio actual.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN15 con tablas guardadas y controles reorganizados"
   git push

No se agregaron nuevas dependencias.

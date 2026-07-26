WEBN16 - ACTUALIZACIÓN PARA GIT Y VERCEL

FILA AUTOMÁTICA EN LA PESTAÑA TABLA
- Siempre queda una fila vacía al final de la tabla.
- Al completar su nombre, servicio o cualquier celda horaria, se crea
  automáticamente otra fila vacía por debajo.
- Ya no es necesario presionar +Fila para cada nueva persona.
- El botón +Fila se conserva y ahora lleva el cursor directamente a la fila
  vacía disponible.
- Al limpiar, cargar, recuperar o abrir una tabla guardada se mantiene la fila
  automática.
- La fila automática no aparece en JPG ni en impresión.
- Tampoco se cuenta como una persona o fila real en Tablas guardadas y Vista diaria.
- La validación ignora la fila vacía, pero sigue detectando una fila incompleta
  cuando contiene horarios o servicio y todavía no tiene nombre.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN16 con fila automática en Tabla"
   git push

No se agregaron dependencias nuevas.

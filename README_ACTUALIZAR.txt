WEBN14 - ACTUALIZACIÓN PARA GIT Y VERCEL

MEJORA VISUAL DE LA PESTAÑA PLANILLA
- La tabla usa celdas totalmente rectas, sin esquinas redondeadas.
- Se eliminaron los degradados de PUESTOS, Deben haber, Hay y Hora.
- Los encabezados ahora usan colores planos y definidos.
- La fila Hay mantiene la escala gradual rojo/amarillo/verde, pero cada celda
  se pinta con un único color plano, sin efecto degradado.
- Se reforzaron líneas, contraste y jerarquía visual.
- Las filas alternadas y el resaltado al pasar el cursor facilitan la lectura.
- La columna Servicio permanece completamente centrada.
- El diseño funciona en modo claro, oscuro, impresión y pantallas pequeñas.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN14 con planilla plana y sin degradados"
   git push

No se agregaron dependencias nuevas.

WEBN20 - ACTUALIZACIÓN PARA GIT Y VERCEL

DESCANSOS D MANUALES
- Los descansos D de rotativos de 48 horas, recargos entrantes y rondines
  entrantes ya no se colocan automáticamente.
- El operador decide quién debe descansar y marca manualmente las celdas.
- En pantalla táctil: mantener presionado sigue el ciclo H → D → vacío.
- En PC: Ctrl + clic sigue el mismo ciclo.
- Al colocar D, cambiar H por D o quitar D, la tabla recalcula inmediatamente
  todas las X administradas automáticamente.
- El recálculo conserva la D como un bloqueo: el optimizador no puede volver a
  asignar una X durante ese descanso.
- Para representar el descanso de 07 a 11 deben marcarse manualmente con D las
  columnas 07-09 y 09-11.
- Si se elimina una D, esas horas vuelven a quedar disponibles para el cálculo.

SE MANTIENE
- Canes: máximo de 3 tiros durante toda la guardia.
- Control de fatiga con una columna completa de descanso entre bloques.
- Descanso nocturno de los centinelas de 24 horas.
- Cobertura estable, máximo de 8 puestos y suavizado de picos.
- Reducción automática de rondines mediante /D o D/ únicamente cuando se debe
  corregir una sobrecobertura; esto no sustituye los descansos personales que
  debe indicar el operador.
- Sugerencias de recargos de 3 tiros consecutivos.
- Clima y guardias ordenados de 07 a 07.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN20 con descansos D manuales"
   git push

No se agregaron dependencias ni variables de entorno.
Los datos existentes de personal permanecen en Upstash.

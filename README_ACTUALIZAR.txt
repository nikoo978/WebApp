WEBN12 - ACTUALIZACIÓN PARA GIT Y VERCEL

MEJORA DEL TABLERO
- Por defecto, el tablero muestra únicamente personal de servicios diarios.
- Los horarios rotativos semanales siguen visibles y se identifican claramente como:
  Rotativo · Semana A
  Rotativo · Semana B
- Se agregó el interruptor "Mostrar también personal de 24 h".
- Al activarlo se incorporan:
  * turnos fijos de 24 horas;
  * rotativos de 48 horas;
  * personal de Canes.
- El filtro se aplica a las cantidades visibles y al detalle que se abre al presionar
  Lunes/Mañana, Miércoles/Noche, etc.
- Cada actualización o recarga vuelve al modo predeterminado de servicios diarios.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio actual.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN12 con filtro de personal en tablero"
   git push

No se agregaron nuevas dependencias. No hace falta ejecutar npm install.

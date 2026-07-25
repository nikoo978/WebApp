Shift Manager WebN9.1 - CORRECCIÓN DE LICENCIAS PARA TURNOS Y CANES

CORRECCIÓN
- El selector de licencias ahora incluye todo el personal activo de:
  - personal diario;
  - turnos fijos de 24 horas;
  - rotativos de 48 horas;
  - Canes de los turnos A, B, C y D.
- Art. 214 y Carpeta Médica pueden registrarse para cualquiera de esas personas.
- Cuando una persona de Turnos o Canes tiene una licencia vigente, queda excluida automáticamente de la planilla correspondiente.
- Los registros auxiliares creados para asociar la licencia no duplican a la persona al cargar la planilla diaria.
- Conserva los datos, licencias, historial, backups y configuración existentes.

ACTUALIZAR
1. Descomprimir este ZIP.
2. Copiar todo su contenido dentro de la carpeta del repositorio actual.
3. No borrar .git ni .env.local.
4. Ejecutar:

   git status
   git add .
   git commit -m "Corregir licencias de turnos y Canes en WebN9.1"
   git push

Vercel desplegará automáticamente la actualización.

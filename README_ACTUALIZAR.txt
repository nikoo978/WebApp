WEBN19 - ACTUALIZACIÓN PARA GIT Y VERCEL

LÓGICA OPERATIVA 07 A 07
- Toda la planificación y el detalle meteorológico siguen el eje de guardia 07:00 a 07:00.
- Las pestañas quedan ordenadas: Tabla, Tablas guardadas, Día, Clima, Tablero, Personal, Turnos 24 / Canes y +Licencias.

DESCANSOS D / H
- Mantener presionada una celda: H, luego D y luego vacío.
- En PC, Ctrl + click realiza el mismo ciclo.
- D y H no suman puestos ni tiros.
- D bloquea esa franja y obliga a recalcular las cruces automáticas.
- /D y D/ representan descansos parciales aplicados automáticamente al reducir sobrecobertura.
- Los rotativos de 48 h reciben D de 07 a 11.
- También reciben D de 07 a 11 los recargos o rondines entrantes detectados en la tabla anterior o en su horario semanal.

COBERTURA AUTOMÁTICA
- Los Canes tienen un máximo absoluto de 3 tiros diarios.
- Los centinelas de 24 h conservan normalmente 6 a 8 tiros.
- Entre 20 y 07 se procura un descanso nocturno continuo de al menos 4 horas.
- Solo ante déficit crítico se admite una alternativa de 3 horas, con fuerte penalización para evitarla.
- La optimización trabaja por hora, evita superar 8 puestos y penaliza picos y subidas/bajadas bruscas.
- Primero reduce al personal de 24; si no alcanza, reduce Rondines con /D o D/.
- Los recargos sugeridos siempre son bloques de 3 tiros consecutivos: 07-13, 13-19, 19-01 o 01-07.

CLIMA
- El detalle horario se presenta de 07:00 a 07:00.
- Se consultan 8 días al proveedor para poder completar las 7 guardias con la madrugada del día siguiente.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN19 con descansos y cobertura estable"
   git push

No se agregaron dependencias ni variables de entorno.
Los datos del personal permanecen guardados en Upstash.

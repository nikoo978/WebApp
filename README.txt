WEBN17 - ACTUALIZACIÓN PARA GIT Y VERCEL

NUEVA PESTAÑA CLIMA
- Pronóstico visual de 7 días para Junín, provincia de Buenos Aires.
- Estado actual, temperatura, sensación, visibilidad, viento y ráfagas.
- Amanecer y anochecer.
- Horarios estimados de neblina/niebla y visibilidad reducida.
- Horarios estimados de lluvia.
- Riesgo de tormenta eléctrica según los códigos horarios del modelo.
- Semáforo operativo: normal, atención, riesgo alto y crítico.
- Línea temporal visual de 24 horas para luz, visibilidad, lluvia y tormenta.
- Tarjetas seleccionables de los próximos siete días.
- Accesos directos a alertas, radar y pronóstico oficial del SMN.
- Actualización manual y automática cada 30 minutos mientras la pestaña está abierta.
- Caché local: si se corta Internet, muestra el último pronóstico disponible.
- No usa Upstash para el clima y no consume almacenamiento de la base de datos.
- Fuente de detalle horario: Open-Meteo Best Match, sin clave API.
- Para decisiones críticas, las alertas y el radar del SMN tienen prioridad.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN17 con panel de clima operativo"
   git push

No se agregaron dependencias nuevas ni variables de entorno.

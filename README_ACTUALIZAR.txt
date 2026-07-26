WEBN18 - ACTUALIZACIÓN PARA GIT Y VERCEL

MEJORA DE FATIGA
- La fatiga ahora se calcula en medias columnas.
- X equivale a dos medias columnas.
- X/ y /X equivalen a media columna.
- Hasta 3 tiros continuos no se considera fatiga.
- Ejemplo válido: /X X X X/ equivale exactamente a 3 tiros.
- Para cortar una secuencia se exige una columna completa de descanso.
- Un descanso parcial no corta la fatiga.
- Ejemplo con fatiga: /X X X /X X.
- Las celdas implicadas quedan resaltadas visualmente.

ASIGNACIÓN AUTOMÁTICA DEL PERSONAL DE 24 HORAS
- Al presionar Cargar al personal, WebN18 distribuye automáticamente las X
  del personal de 24 h y Canes.
- Cada agente recibe normalmente 7 tiros; el algoritmo puede usar 6 u 8
  cuando resulta necesario para mejorar la cobertura.
- Nunca asigna más de 3 X consecutivas.
- Mantiene al menos una columna completa de descanso entre bloques.
- Objetivo diurno: 5 puestos, con mínimo operativo de 4.
- Objetivo nocturno: 7 puestos, con mínimo operativo de 6 y máximo recomendado de 8.
- Considera primero la cobertura aportada por personal diario, rondines y
  demás servicios antes de distribuir al personal de 24 horas.
- Muestra un resumen visual de cobertura por cada franja.

RECARGOS SUGERIDOS
- Si aun usando el personal disponible no se alcanza el mínimo, muestra
  sugerencias por franjas:
  07 a 13
  13 a 19
  19 a 01
  01 a 07
- Indica cuántos recargos se necesitan y cuáles son los horarios débiles.
- Son sugerencias visuales; no se agregan personas ficticias automáticamente.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN18 con fatiga y cobertura automática"
   git push

No se agregaron dependencias ni variables de entorno.
Los datos existentes de personal permanecen en Upstash.

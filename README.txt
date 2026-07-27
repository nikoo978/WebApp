WEBN22 - ACTUALIZACIÓN PARA GIT Y VERCEL

CORRECCIÓN DE RENDIMIENTO
- Se eliminó la búsqueda por haz introducida en WebN21.
- El nuevo optimizador evalúa una cantidad controlada de patrones y realiza
  solamente dos refinamientos rápidos.
- Los patrones válidos quedan almacenados en caché según los descansos de cada persona.
- Al marcar H o D, la marca aparece inmediatamente y el recálculo se ejecuta
  una sola vez después de una pausa breve de 60 ms.
- Varios cambios seguidos se agrupan en un único recálculo.
- La tabla ya no debe quedar bloqueada al realizar modificaciones pequeñas.

COBERTURA ESTABLE
- La carga normal de cada centinela de 24 horas vuelve a ser exactamente 7 tiros.
- Se priorizan patrones de 7 tiros desde el inicio.
- El optimizador automático no agrega un octavo tiro aislado.
- Si con 7 tiros por centinela no se alcanza el mínimo, muestra recargos en lugar de sobrecargar al personal.
- Se penalizan con fuerza los saltos a 8 que duran una o dos horas.
- El suavizado traslada tiros a horarios más débiles manteniendo la carga del
  centinela, en lugar de quitar y agregar puestos bruscamente.
- Se mantiene el máximo absoluto de 8 puestos.
- Los Canes continúan limitados a 3 tiros.
- Los descansos D siguen siendo manuales y siempre se respetan.

RECARGOS
- Las sugerencias se muestran cuando, después de redistribuir y completar la
  carga normal de 7 tiros, no se alcanza el mínimo.
- Cada recargo sugerido cubre 3 tiros consecutivos.

ACTUALIZACIÓN
1. Copiar el contenido del ZIP sobre la carpeta del repositorio.
2. No borrar .git ni .env.local.
3. Ejecutar:

   git status
   git add .
   git commit -m "Actualizar a WebN22 con optimizador rápido y cobertura estable"
   git push

No se agregaron dependencias ni variables de entorno.
Los datos existentes del personal permanecen en Upstash.

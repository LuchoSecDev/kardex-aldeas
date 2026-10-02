import { configure } from "@testing-library/dom";

// Espera máxima de waitFor / findBy en las pruebas de pantalla. El valor por defecto (1 s) es muy justo cuando Vitest corre
// decenas de archivos en paralelo en un equipo normal: se vieron fallas al azar, en una prueba distinta cada vez, que no
// eran errores del código (la pantalla solo tardaba en dibujarse). Una prueba que de verdad falla sigue fallando; solo tarda
// más en rendirse. Los fallos reales no dependen de este tiempo: el `testTimeout` de cada prueba sigue siendo de 30 s.
configure({ asyncUtilTimeout: 5000 });

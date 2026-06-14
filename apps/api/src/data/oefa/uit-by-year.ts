/**
 * Tabla oficial de la Unidad Impositiva Tributaria (UIT) del Perú por año,
 * expresada en Soles (S/). Estos son los valores oficiales fijados por el
 * Ministerio de Economía y Finanzas (MEF) mediante Decreto Supremo para cada
 * ejercicio fiscal y son los que la OEFA utiliza para convertir las multas
 * expresadas en UIT a Soles.
 *
 * Fuente: Decretos Supremos del MEF que fijan el valor de la UIT (2019-2025).
 */
export const UIT_BY_YEAR: Record<number, number> = {
  2019: 4200,
  2020: 4300,
  2021: 4400,
  2022: 4600,
  2023: 4950,
  2024: 5150,
  2025: 5350,
};

/**
 * Convierte un monto expresado en UIT a Soles usando el valor oficial de la UIT
 * del año indicado.
 *
 * @throws {Error} si el año no tiene un valor de UIT registrado.
 */
export function uitToSoles(uit: number, year: number): number {
  const value = UIT_BY_YEAR[year];
  if (value === undefined) {
    throw new Error(
      `No se conoce el valor de la UIT para el año ${year}. Años disponibles: ${Object.keys(
        UIT_BY_YEAR,
      ).join(', ')}.`,
    );
  }
  return uit * value;
}

/**
 * Convierte un monto en Soles a su equivalente en UIT usando el valor oficial
 * de la UIT del año indicado.
 *
 * @throws {Error} si el año no tiene un valor de UIT registrado.
 */
export function solesToUit(soles: number, year: number): number {
  const value = UIT_BY_YEAR[year];
  if (value === undefined) {
    throw new Error(
      `No se conoce el valor de la UIT para el año ${year}. Años disponibles: ${Object.keys(
        UIT_BY_YEAR,
      ).join(', ')}.`,
    );
  }
  return soles / value;
}

/** @type {import('tailwindcss').Config} */
// Design tokens from docs/files/agentops-debugger-mockups.html + UX §8.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'verde-fiscal': '#0E5A47',
        'verde-tinta': '#16241F',
        'verde-suave': '#E7F0EC',
        papel: '#F7F8F6',
        superficie: '#FFFFFF',
        'azul-dato': '#1D6FA3',
        ambar: '#B45309',
        rojo: '#B42318',
        'gris-ev': '#5B6661',
        linea: '#E2E6E2',
        // neutral chart data palette (severity-free)
        'd-1': '#0E5A47',
        'd-2': '#1D6FA3',
        'd-3': '#5B8C5A',
        'd-4': '#7A6FA3',
      },
      fontFamily: {
        display: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '6px', chip: '4px', cell: '2px' },
      fontSize: {
        '2xs': '10.5px',
        xs: '12px',
        sm: '13px',
        base: '14px',
        lg: '16px',
        xl: '20px',
        '2xl': '25px',
        '3xl': '31px',
      },
      transitionTimingFunction: { 'ease-out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [],
};

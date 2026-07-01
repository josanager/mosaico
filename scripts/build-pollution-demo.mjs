import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {
  detectMediaMetadata,
  ensureWorkspaceDirs,
  mediaDir,
  mediaIndexFile,
  projectDir,
  projectFile,
} from '../server/rendering.mjs';

const execFileAsync = promisify(execFile);
const fps = 30;
const sceneDurationFrames = 900;
const sceneDurationSeconds = sceneDurationFrames / fps;
const maxNarrationSeconds = sceneDurationSeconds - 0.05;
const projectWidth = 1920;
const projectHeight = 1080;
const voiceCandidates = [
  'Eddy (Español (España))',
  'Flo (Español (España))',
  'Grandma (Español (España))',
  'Grandpa (Español (España))',
  'Eddy (Español (México))',
  'Flo (Español (México))',
];

const palette = {
  bg: '#0f1115',
  panel: '#13171d',
  panelAlt: '#1b212b',
  line: '#2b3340',
  text: '#f3f6fb',
  muted: '#a5b0be',
  green: '#29d391',
  yellow: '#f9b34e',
  orange: '#ff8c5a',
  red: '#ff6f66',
  blue: '#66a6ff',
  cyan: '#55d9ff',
  violet: '#9d7cff',
};

const scenes = [
  {
    id: 'scene-01',
    chapter: '01',
    layout: 'left',
    accent: palette.green,
    title: 'Contaminación 2026',
    body:
      'Aire, agua, plástico, CO₂ y residuos.\nUn problema ambiental que ya es sanitario y económico.',
    metricValue: '5 min',
    metricLabel: 'panorama global',
    voiceover:
      'En 2026, la contaminación ya no es un problema que ocurre lejos. Está en el aire que respiramos, en los ríos que abastecen ciudades, en los residuos que producimos a diario y hasta en la cadena alimentaria. El reto no es solo ambiental: también es económico, sanitario y urbano. En este recorrido de cinco minutos vamos a ver qué está pasando, por qué importa ahora y qué soluciones ya están ganando terreno.',
    source: 'Panorama 2026 · WHO · UNEP · IEA',
    footer: 'Aire · Agua · Plástico · CO₂ · Residuos',
  },
  {
    id: 'scene-02',
    chapter: '02',
    layout: 'right',
    accent: palette.red,
    title: 'Aire fuera de norma',
    body:
      '99% respira aire fuera de las guías.\n6,7 millones de muertes prematuras al año.',
    metricValue: '99%',
    metricLabel: 'población expuesta',
    voiceover:
      'La contaminación del aire sigue siendo una de las amenazas más duras. La Organización Mundial de la Salud sostiene que más del noventa y nueve por ciento de la población vive en zonas que superan sus guías de calidad del aire. Además, la combinación de contaminación exterior e interior se asocia con millones de muertes prematuras cada año. En 2026, hablar de aire limpio sigue siendo hablar de salud pública.',
    source: 'WHO air quality and health',
    footer: 'PM2.5 · NO₂ · salud pública',
  },
  {
    id: 'scene-03',
    chapter: '03',
    layout: 'left',
    accent: palette.orange,
    title: 'CO₂ en nuevo récord',
    body:
      '2025 cerró con emisiones energéticas récord.\nLa subida se frenó, pero no se detuvo.',
    metricValue: '38.4 Gt',
    metricLabel: 'CO₂ energético en 2025',
    voiceover:
      'El frente climático tampoco se ha resuelto. Según la Agencia Internacional de la Energía, las emisiones globales relacionadas con la energía volvieron a subir en 2025, aunque más lentamente. El problema es que el total siguió marcando récord y la concentración atmosférica de CO₂ también alcanzó máximos históricos. Avanzamos en energía limpia, sí, pero todavía no lo bastante rápido como para compensar toda la demanda y los combustibles fósiles.',
    source: 'IEA Global Energy Review 2026',
    footer: 'más renovables · todavía más emisiones',
  },
  {
    id: 'scene-04',
    chapter: '04',
    layout: 'right',
    accent: palette.yellow,
    title: 'La ola del plástico',
    body:
      'El residuo plástico puede casi triplicarse hacia 2060.\n2026 mantiene vivo el debate del tratado global.',
    metricValue: '2060',
    metricLabel: 'residuo casi triplicado sin cambio',
    voiceover:
      'En paralelo, el plástico continúa expandiendo su huella. Naciones Unidas advierte que, sin cambios profundos, los residuos plásticos podrían casi triplicarse hacia 2060. Y 2026 sigue siendo un año clave porque las negociaciones internacionales para un tratado sobre contaminación plástica todavía buscan una salida sólida. El desafío ya no es solo reciclar más: es rediseñar materiales, reducir envases y frenar la producción de descartables.',
    source: 'UNEP plastics initiative',
    footer: 'tratado global · diseño · reducción',
  },
  {
    id: 'scene-05',
    chapter: '05',
    layout: 'left',
    accent: palette.blue,
    title: 'Agua bajo presión',
    body:
      'Microplásticos, vertidos y escorrentías.\nMenos calidad de agua, más presión urbana.',
    metricValue: 'H₂O',
    metricLabel: 'calidad y abastecimiento',
    voiceover:
      'La contaminación también se mueve por el agua. Fertilizantes, descargas industriales, aguas residuales mal tratadas y microplásticos terminan en ríos, lagos y costas. El resultado es doble: ecosistemas más frágiles y riesgos más altos para el abastecimiento humano. En 2026, muchas ciudades hablan de resiliencia hídrica, pero esa resiliencia no existe si la calidad del agua cae mientras crece la presión sobre cada fuente.',
    source: 'UNEP · water quality risk',
    footer: 'ríos · costas · microplásticos',
  },
  {
    id: 'scene-06',
    chapter: '06',
    layout: 'right',
    accent: palette.cyan,
    title: 'Ciudades con capas',
    body:
      'Movilidad, industria y residuos actúan a la vez.\nEl problema es sistémico, no aislado.',
    metricValue: '3 focos',
    metricLabel: 'movilidad · industria · basura',
    voiceover:
      'En las ciudades, las fuentes se superponen. Transporte, industria, obras, combustión para calefacción, logística y gestión deficiente de residuos generan una mezcla constante de partículas, ruido, gases y basura. Por eso la contaminación urbana no se soluciona con una sola medida. Requiere rediseñar movilidad, energía, materiales y espacio público al mismo tiempo. Cuando una ciudad mejora solo un frente, otro termina ocupando ese lugar.',
    source: 'Urban pollution stack · 2026',
    footer: 'sistema urbano · fuentes combinadas',
  },
  {
    id: 'scene-07',
    chapter: '07',
    layout: 'left',
    accent: palette.violet,
    title: 'Residuos difíciles',
    body:
      'E-waste, metales y vertederos informales.\nMás consumo digital, más residuos complejos.',
    metricValue: 'e-waste',
    metricLabel: 'suelo, metales y baterías',
    voiceover:
      'Hay otra capa menos visible: la del suelo y los residuos electrónicos. Baterías, aparatos obsoletos, metales pesados y vertederos informales crean contaminación persistente y costosa de revertir. A medida que el consumo digital crece, también crece el volumen de equipos descartados. En 2026, la economía circular ya no es un eslogan elegante: es una condición práctica para evitar que innovación tecnológica y contaminación avancen juntas.',
    source: 'E-waste & circular economy',
    footer: 'baterías · chips · recuperación',
  },
  {
    id: 'scene-08',
    chapter: '08',
    layout: 'right',
    accent: palette.red,
    title: 'Salud y desigualdad',
    body:
      'La contaminación también es costo y desigualdad.\nEl impacto no se reparte de forma justa.',
    metricValue: 'impacto',
    metricLabel: 'hospitales, barrios y productividad',
    voiceover:
      'Todo esto tiene un costo directo. Más gasto sanitario, menor productividad, infraestructura degradada, cadenas logísticas vulnerables y barrios enteros con peor calidad de vida. La contaminación castiga más a quienes tienen menos margen para defenderse: comunidades expuestas, trabajadores informales y zonas con menor inversión pública. Por eso, en 2026, medir contaminación no basta. Hay que cruzarla con salud, ingreso, territorio y oportunidad.',
    source: 'Health + economy + equity',
    footer: 'riesgo ambiental · costo social',
  },
  {
    id: 'scene-09',
    chapter: '09',
    layout: 'left',
    accent: palette.green,
    title: 'Soluciones escalables',
    body:
      'Renovables, electrificación, monitoreo y reúso.\nLa clave ahora es escalar lo que ya funciona.',
    metricValue: '2026',
    metricLabel: 'menos piloto, más escala',
    voiceover:
      'La buena noticia es que las soluciones existen y ya están probadas. Más renovables, transporte público limpio, electrificación, control en tiempo real, reúso de materiales, diseño sin plásticos innecesarios y trazabilidad en residuos. Ninguna herramienta por sí sola resuelve todo, pero juntas cambian la trayectoria. El punto crítico en 2026 no es inventar desde cero, sino escalar rápido lo que ya funciona y dejar de subvencionar lo que contamina.',
    source: 'UNEP 2025 report · IEA',
    footer: 'energía limpia · circularidad · datos',
  },
  {
    id: 'scene-10',
    chapter: '10',
    layout: 'right',
    accent: palette.green,
    title: 'Punto de inflexión',
    body:
      '2026 aún puede ser punto de inflexión.\nMenos parche. Más rediseño.',
    metricValue: 'ahora',
    metricLabel: 'medir mejor, consumir distinto',
    voiceover:
      'La pregunta final no es si la contaminación existe. La pregunta es cuánto estamos dispuestos a rediseñar para reducirla. Gobiernos, empresas y ciudadanos tienen palancas distintas, pero el reloj corre para todos. 2026 puede ser otro año de parches o un punto de inflexión. Y esa diferencia empieza en algo muy concreto: medir mejor, consumir distinto y exigir sistemas que ensucien mucho menos.',
    source: 'Cierre · 2026',
    footer: 'acción pública · empresarial · ciudadana',
  },
];

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const textBlock = (text, x, y, size, color, weight = 600, lineHeight = 1.15) => {
  const lines = String(text).split('\n');
  return lines
    .map(
      (line, index) => `<text x="${x}" y="${y + index * size * lineHeight}" fill="${color}" font-size="${size}" font-family="SF Pro Display, Helvetica, Arial, sans-serif" font-weight="${weight}">${escapeXml(line)}</text>`,
    )
    .join('');
};

const cityBars = (x, y, color) => `
  <g transform="translate(${x} ${y})" opacity="0.95">
    <rect x="0" y="120" width="110" height="300" rx="10" fill="${color}" />
    <rect x="140" y="70" width="130" height="350" rx="10" fill="${color}" />
    <rect x="310" y="150" width="90" height="270" rx="10" fill="${color}" />
    <rect x="430" y="0" width="170" height="420" rx="10" fill="${color}" />
    <rect x="640" y="95" width="125" height="325" rx="10" fill="${color}" />
    <rect x="790" y="170" width="90" height="250" rx="10" fill="${color}" />
  </g>
`;

const chartLine = (x, y, stroke, fill) => `
  <g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="720" height="360" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <line x1="70" y1="290" x2="650" y2="290" stroke="${palette.line}" stroke-width="2" />
    <line x1="70" y1="220" x2="650" y2="220" stroke="${palette.line}" stroke-width="1" opacity="0.7" />
    <line x1="70" y1="150" x2="650" y2="150" stroke="${palette.line}" stroke-width="1" opacity="0.7" />
    <line x1="70" y1="80" x2="650" y2="80" stroke="${palette.line}" stroke-width="1" opacity="0.7" />
    <path d="M90 250 C170 230, 220 215, 300 205 S470 155, 620 120" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" />
    <path d="M90 250 C170 230, 220 215, 300 205 S470 155, 620 120 L620 290 L90 290 Z" fill="${fill}" opacity="0.2" />
    <circle cx="300" cy="205" r="10" fill="${stroke}" />
    <circle cx="620" cy="120" r="10" fill="${stroke}" />
    ${textBlock('2024', 110, 330, 24, palette.muted, 500)}
    ${textBlock('2025', 565, 330, 24, palette.muted, 500)}
  </g>
`;

const bottleWave = (x, y) => `
  <g transform="translate(${x} ${y})">
    <path d="M0 250 C90 180, 220 170, 320 210 S580 300, 760 230 S1030 120, 1220 220" fill="none" stroke="${palette.cyan}" stroke-width="20" opacity="0.4" />
    <g fill="${palette.yellow}">
      <rect x="120" y="80" width="78" height="220" rx="26" />
      <rect x="148" y="44" width="24" height="54" rx="10" />
      <rect x="330" y="115" width="90" height="246" rx="30" />
      <rect x="362" y="72" width="28" height="52" rx="10" />
      <rect x="560" y="54" width="84" height="260" rx="28" transform="rotate(18 602 184)" />
      <rect x="594" y="18" width="22" height="54" rx="10" transform="rotate(18 605 45)" />
      <rect x="760" y="124" width="78" height="220" rx="26" transform="rotate(-12 799 234)" />
      <rect x="790" y="89" width="18" height="48" rx="10" transform="rotate(-12 799 113)" />
    </g>
  </g>
`;

const waterDrop = (x, y) => `
  <g transform="translate(${x} ${y})">
    <path d="M260 0 C260 0, 420 190, 420 320 C420 464, 348 560, 220 560 C92 560, 20 464, 20 320 C20 188, 180 0, 260 0 Z" fill="url(#dropGradient)" />
    <circle cx="220" cy="250" r="16" fill="${palette.bg}" opacity="0.9" />
    <circle cx="148" cy="330" r="12" fill="${palette.bg}" opacity="0.75" />
    <circle cx="294" cy="362" r="14" fill="${palette.bg}" opacity="0.8" />
    <circle cx="240" cy="420" r="18" fill="${palette.bg}" opacity="0.65" />
  </g>
`;

const transportIcons = (x, y) => `
  <g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="280" height="200" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <rect x="340" y="0" width="280" height="200" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <rect x="680" y="0" width="280" height="200" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <g transform="translate(50 48)" fill="${palette.cyan}">
      <rect x="0" y="46" width="170" height="70" rx="18" />
      <rect x="26" y="18" width="116" height="52" rx="16" fill="${palette.bg}" opacity="0.32" />
      <circle cx="38" cy="132" r="18" fill="${palette.text}" />
      <circle cx="136" cy="132" r="18" fill="${palette.text}" />
    </g>
    <g transform="translate(396 40)" fill="${palette.orange}">
      <rect x="0" y="70" width="168" height="74" rx="12" />
      <rect x="36" y="20" width="42" height="60" rx="10" />
      <rect x="94" y="0" width="30" height="80" rx="10" />
      <rect x="136" y="34" width="20" height="46" rx="8" />
    </g>
    <g transform="translate(744 44)" fill="${palette.green}">
      <rect x="30" y="34" width="126" height="98" rx="16" />
      <path d="M0 88 C54 18, 160 16, 220 88" stroke="${palette.green}" stroke-width="18" fill="none" />
      <path d="M92 36 L66 74 H118 L92 132" stroke="${palette.bg}" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  </g>
`;

const chipStack = (x, y) => `
  <g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="330" height="240" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <rect x="388" y="24" width="200" height="320" rx="28" fill="${palette.panelAlt}" stroke="${palette.line}" />
    <rect x="64" y="56" width="200" height="128" rx="18" fill="${palette.violet}" opacity="0.82" />
    <rect x="448" y="74" width="78" height="180" rx="24" fill="${palette.green}" opacity="0.84" />
    <rect x="474" y="44" width="28" height="42" rx="8" fill="${palette.green}" />
    <g stroke="${palette.text}" opacity="0.65">
      <line x1="78" y1="24" x2="78" y2="-14" />
      <line x1="122" y1="24" x2="122" y2="-14" />
      <line x1="166" y1="24" x2="166" y2="-14" />
      <line x1="210" y1="24" x2="210" y2="-14" />
      <line x1="254" y1="24" x2="254" y2="-14" />
      <line x1="78" y1="216" x2="78" y2="252" />
      <line x1="122" y1="216" x2="122" y2="252" />
      <line x1="166" y1="216" x2="166" y2="252" />
      <line x1="210" y1="216" x2="210" y2="252" />
      <line x1="254" y1="216" x2="254" y2="252" />
    </g>
  </g>
`;

const healthGrid = (x, y) => `
  <g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="700" height="380" rx="24" fill="${palette.panel}" stroke="${palette.line}" />
    <rect x="44" y="54" width="190" height="120" rx="20" fill="${palette.panelAlt}" />
    <rect x="254" y="54" width="190" height="120" rx="20" fill="${palette.panelAlt}" />
    <rect x="464" y="54" width="190" height="120" rx="20" fill="${palette.panelAlt}" />
    <rect x="44" y="204" width="610" height="124" rx="20" fill="${palette.panelAlt}" />
    <path d="M96 112 C96 76, 152 76, 152 112 C152 144, 124 160, 124 160 C124 160, 96 144, 96 112 Z" fill="${palette.red}" />
    <circle cx="349" cy="108" r="42" fill="${palette.yellow}" opacity="0.88" />
    <rect x="520" y="82" width="76" height="52" rx="12" fill="${palette.green}" />
    <rect x="554" y="68" width="10" height="80" rx="5" fill="${palette.text}" opacity="0.8" />
    <rect x="520" y="102" width="110" height="14" rx="7" fill="${palette.text}" opacity="0.8" />
  </g>
`;

const solutionIcons = (x, y) => `
  <g transform="translate(${x} ${y})">
    <circle cx="120" cy="180" r="88" fill="${palette.green}" opacity="0.2" />
    <circle cx="400" cy="180" r="88" fill="${palette.cyan}" opacity="0.2" />
    <circle cx="680" cy="180" r="88" fill="${palette.yellow}" opacity="0.2" />
    <circle cx="960" cy="180" r="88" fill="${palette.violet}" opacity="0.2" />
    <g transform="translate(70 80)">
      <rect x="42" y="70" width="18" height="146" rx="9" fill="${palette.text}" />
      <path d="M50 0 L0 90 H100 Z" fill="${palette.green}" />
      <path d="M50 34 L16 94 H84 Z" fill="${palette.bg}" opacity="0.25" />
    </g>
    <g transform="translate(316 92)">
      <polygon points="80,0 160,40 160,140 80,180 0,140 0,40" fill="${palette.cyan}" opacity="0.88" />
      <g stroke="${palette.bg}" stroke-width="5" opacity="0.38">
        <line x1="26" y1="48" x2="136" y2="108" />
        <line x1="26" y1="94" x2="136" y2="34" />
        <line x1="80" y1="18" x2="80" y2="162" />
      </g>
    </g>
    <g transform="translate(606 110)">
      <rect x="0" y="54" width="154" height="72" rx="16" fill="${palette.yellow}" />
      <rect x="24" y="18" width="106" height="44" rx="14" fill="${palette.bg}" opacity="0.25" />
      <circle cx="34" cy="138" r="16" fill="${palette.text}" />
      <circle cx="120" cy="138" r="16" fill="${palette.text}" />
    </g>
    <g transform="translate(886 82)">
      <path d="M36 40 C36 16, 68 16, 68 40 V58 H88 C114 58, 126 90, 108 108 L76 140 H122 L66 214 L80 158 H36 C8 158 -6 126 12 106 L36 74 Z" fill="${palette.violet}" />
    </g>
  </g>
`;

const globeArt = (x, y) => `
  <g transform="translate(${x} ${y})">
    <circle cx="280" cy="220" r="200" fill="url(#globeGradient)" />
    <path d="M132 160 C210 110, 264 120, 362 174 C340 220, 330 268, 344 330 C286 354, 230 348, 162 318 C152 270, 124 222, 132 160 Z" fill="${palette.green}" opacity="0.74" />
    <path d="M304 108 C356 92, 406 114, 444 158 C412 194, 390 238, 394 298 C356 308, 328 306, 294 286 C292 226, 276 170, 304 108 Z" fill="${palette.yellow}" opacity="0.72" />
    <path d="M40 366 C176 284, 310 292, 446 364" fill="none" stroke="${palette.text}" stroke-width="10" stroke-linecap="round" opacity="0.55" />
    <circle cx="102" cy="360" r="14" fill="${palette.text}" />
    <circle cx="448" cy="364" r="14" fill="${palette.green}" />
  </g>
`;

const buildSceneArt = (scene) => {
  if (scene.id === 'scene-01') {
    return `
      ${cityBars(900, 300, '#202632')}
      <circle cx="1460" cy="238" r="110" fill="${palette.green}" opacity="0.18" />
      <circle cx="1630" cy="310" r="64" fill="${palette.cyan}" opacity="0.14" />
      <path d="M820 540 C1060 470, 1310 490, 1650 410" fill="none" stroke="${palette.green}" stroke-width="8" opacity="0.6" />
      <path d="M820 610 C1060 560, 1300 580, 1640 510" fill="none" stroke="${palette.yellow}" stroke-width="8" opacity="0.45" />
    `;
  }
  if (scene.id === 'scene-02') {
    return `
      ${cityBars(160, 370, '#222b37')}
      <circle cx="1320" cy="284" r="178" fill="${palette.red}" opacity="0.12" />
      <circle cx="1480" cy="254" r="138" fill="${palette.yellow}" opacity="0.1" />
      <path d="M1080 304 C1188 220, 1380 220, 1498 308" stroke="${palette.red}" stroke-width="26" fill="none" opacity="0.75" />
      <path d="M1052 386 C1184 312, 1398 314, 1554 392" stroke="${palette.orange}" stroke-width="22" fill="none" opacity="0.68" />
      <path d="M1100 470 C1226 424, 1430 434, 1530 492" stroke="${palette.yellow}" stroke-width="18" fill="none" opacity="0.58" />
    `;
  }
  if (scene.id === 'scene-03') {
    return chartLine(980, 210, palette.orange, palette.orange);
  }
  if (scene.id === 'scene-04') {
    return `
      ${bottleWave(720, 250)}
      <rect x="1280" y="140" width="290" height="370" rx="30" fill="${palette.panel}" stroke="${palette.line}" />
      ${textBlock('TRATADO', 1356, 228, 34, palette.text, 700)}
      ${textBlock('plástico', 1356, 274, 28, palette.muted, 500)}
      <path d="M1360 330 L1460 330" stroke="${scene.accent}" stroke-width="12" stroke-linecap="round" />
      <path d="M1360 382 L1504 382" stroke="${palette.text}" stroke-width="12" opacity="0.6" stroke-linecap="round" />
      <path d="M1360 434 L1480 434" stroke="${palette.text}" stroke-width="12" opacity="0.4" stroke-linecap="round" />
    `;
  }
  if (scene.id === 'scene-05') {
    return `
      ${waterDrop(1060, 190)}
      <path d="M0 760 C280 700, 520 734, 768 690 S1280 644, 1920 734 L1920 1080 L0 1080 Z" fill="${palette.blue}" opacity="0.15" />
    `;
  }
  if (scene.id === 'scene-06') {
    return transportIcons(760, 300);
  }
  if (scene.id === 'scene-07') {
    return `
      ${chipStack(980, 280)}
      <path d="M820 720 C1010 660, 1200 650, 1460 700" fill="none" stroke="${palette.violet}" stroke-width="8" opacity="0.5" />
    `;
  }
  if (scene.id === 'scene-08') {
    return healthGrid(920, 260);
  }
  if (scene.id === 'scene-09') {
    return solutionIcons(690, 300);
  }
  return globeArt(980, 220);
};

const buildSvg = (scene) => {
  const metricX = scene.layout === 'left' ? 1260 : 140;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${projectWidth}" height="${projectHeight}" viewBox="0 0 ${projectWidth} ${projectHeight}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="${projectWidth}" y2="${projectHeight}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.bg}" />
      <stop offset="1" stop-color="#171b22" />
    </linearGradient>
    <linearGradient id="dropGradient" x1="0" y1="0" x2="420" y2="560" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.cyan}" />
      <stop offset="1" stop-color="${palette.blue}" />
    </linearGradient>
    <linearGradient id="globeGradient" x1="80" y1="40" x2="470" y2="430" gradientUnits="userSpaceOnUse">
      <stop stop-color="${palette.blue}" />
      <stop offset="1" stop-color="${palette.cyan}" />
    </linearGradient>
  </defs>
  <rect width="${projectWidth}" height="${projectHeight}" fill="url(#bgGradient)" />
  <g opacity="0.4">
    <path d="M0 160 H1920" stroke="${palette.line}" />
    <path d="M0 320 H1920" stroke="${palette.line}" />
    <path d="M0 480 H1920" stroke="${palette.line}" />
    <path d="M0 640 H1920" stroke="${palette.line}" />
    <path d="M0 800 H1920" stroke="${palette.line}" />
    <path d="M240 0 V1080" stroke="${palette.line}" />
    <path d="M480 0 V1080" stroke="${palette.line}" />
    <path d="M720 0 V1080" stroke="${palette.line}" />
    <path d="M960 0 V1080" stroke="${palette.line}" />
    <path d="M1200 0 V1080" stroke="${palette.line}" />
    <path d="M1440 0 V1080" stroke="${palette.line}" />
    <path d="M1680 0 V1080" stroke="${palette.line}" />
  </g>
  <circle cx="1640" cy="120" r="220" fill="${scene.accent}" opacity="0.08" />
  <circle cx="260" cy="920" r="280" fill="${palette.cyan}" opacity="0.05" />
  ${buildSceneArt(scene)}
  <g transform="translate(${metricX} 118)">
    <rect x="0" y="0" width="500" height="170" rx="26" fill="${palette.panel}" stroke="${palette.line}" />
    ${textBlock(scene.metricValue, 34, 82, 72, scene.accent, 760, 1)}
    ${textBlock(scene.metricLabel, 36, 130, 24, palette.muted, 560, 1)}
  </g>
  ${textBlock(scene.footer, 80, 1010, 20, palette.muted, 500, 1)}
</svg>`;
};

const getAvailableVoices = async () => {
  const {stdout} = await execFileAsync('say', ['-v', '?']);
  return stdout;
};

const selectVoice = async () => {
  const available = await getAvailableVoices();
  return voiceCandidates.find((voice) => available.includes(voice)) ?? 'Albert';
};

const generateAudio = async ({voice, text, outputPath, rate}) => {
  const tempAiff = path.join(os.tmpdir(), `${path.basename(outputPath, path.extname(outputPath))}.aiff`);
  await execFileAsync('say', ['-v', voice, '-r', String(rate), '-o', tempAiff, text]);
  await execFileAsync('ffmpeg', ['-y', '-i', tempAiff, '-c:a', 'aac', '-b:a', '192k', outputPath]);
  await fs.rm(tempAiff, {force: true});
};

const baseClip = ({id, trackId, type, name, start, duration}) => ({
  id: id ?? randomUUID(),
  trackId,
  type,
  name,
  start,
  duration,
  sourceStart: 0,
  color: palette.text,
  opacity: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  scale: 1,
  fontSize: 60,
  fontWeight: 700,
  volume: 1,
  playbackRate: 1,
  fit: 'cover',
  animationIn: 'fade',
  animationOut: 'fade',
  animationInFrames: 16,
  animationOutFrames: 16,
  motionPreset: 'none',
});

const makeImageClip = (trackId, scene, start) => ({
  ...baseClip({
    trackId,
    type: 'image',
    name: scene.title,
    start,
    duration: sceneDurationFrames,
  }),
  src: `/media/pollution-2026/${scene.id}.svg`,
  x: 0,
  y: 0,
  width: projectWidth,
  height: projectHeight,
  motionPreset:
    scene.layout === 'left' ? 'drift-right' : 'drift-left',
  animationIn: 'zoom-in',
  animationOut: 'fade',
  animationInFrames: 20,
  animationOutFrames: 18,
});

const makePanelClip = (trackId, scene, start) => {
  const x = scene.layout === 'left' ? 92 : 1128;
  return {
    ...baseClip({
      trackId,
      type: 'shape',
      name: `${scene.title} panel`,
      start: start + 42,
      duration: sceneDurationFrames - 84,
    }),
    color: palette.panel,
    opacity: 0.9,
    x,
    y: 620,
    width: 700,
    height: 330,
    animationIn: 'slide-up',
    animationOut: 'fade',
    animationInFrames: 18,
    animationOutFrames: 18,
  };
};

const makeAccentClip = (trackId, scene, start) => {
  const x = scene.layout === 'left' ? 114 : 1150;
  return {
    ...baseClip({
      trackId,
      type: 'shape',
      name: `${scene.title} accent`,
      start: start + 56,
      duration: 170,
    }),
    color: scene.accent,
    opacity: 1,
    x,
    y: 652,
    width: 84,
    height: 10,
    animationIn: 'slide-right',
    animationOut: 'fade',
    animationInFrames: 12,
    animationOutFrames: 12,
  };
};

const makeTextClip = (
  trackId,
  {
    name,
    text,
    start,
    duration,
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight,
    color,
    animationIn = 'fade',
    animationOut = 'fade',
    animationInFrames = 16,
    animationOutFrames = 16,
  },
) => ({
  ...baseClip({
    trackId,
    type: 'text',
    name,
    start,
    duration,
  }),
  text,
  x,
  y,
  width,
  height,
  fontSize,
  fontWeight,
  color,
  animationIn,
  animationOut,
  animationInFrames,
  animationOutFrames,
});

const buildProject = (audioAssets) => {
  const trackIds = {
    titles: randomUUID(),
    details: randomUUID(),
    panels: randomUUID(),
    visuals: randomUUID(),
    backgrounds: randomUUID(),
    narration: randomUUID(),
  };

  const tracks = [
    {id: trackIds.titles, name: 'Titles', kind: 'visual', hidden: false, locked: false, muted: false, clips: []},
    {id: trackIds.details, name: 'Details', kind: 'visual', hidden: false, locked: false, muted: false, clips: []},
    {id: trackIds.panels, name: 'Panels', kind: 'visual', hidden: false, locked: false, muted: false, clips: []},
    {id: trackIds.visuals, name: 'Graphics', kind: 'visual', hidden: false, locked: false, muted: false, clips: []},
    {id: trackIds.backgrounds, name: 'Background', kind: 'visual', hidden: false, locked: false, muted: false, clips: []},
    {id: trackIds.narration, name: 'Narration', kind: 'audio', hidden: false, locked: false, muted: false, clips: []},
  ];

  scenes.forEach((scene, index) => {
    const start = index * sceneDurationFrames;
    const panelX = scene.layout === 'left' ? 126 : 1162;
    const audio = audioAssets.find((asset) => asset.id === `${scene.id}-audio`);
    const audioFrames = Math.max(1, Math.round((audio?.durationInSeconds ?? 1) * fps));

    tracks[4].clips.push(makeImageClip(trackIds.backgrounds, scene, start));
    tracks[2].clips.push(makePanelClip(trackIds.panels, scene, start));
    tracks[2].clips.push(makeAccentClip(trackIds.panels, scene, start));
    tracks[0].clips.push(
      makeTextClip(trackIds.titles, {
        name: `${scene.title} chapter`,
        text: scene.chapter,
        start: start + 64,
        duration: 160,
        x: panelX,
        y: 660,
        width: 88,
        height: 32,
        fontSize: 26,
        fontWeight: 760,
        color: scene.accent,
        animationIn: scene.layout === 'left' ? 'slide-right' : 'slide-left',
      }),
    );
    tracks[0].clips.push(
      makeTextClip(trackIds.titles, {
        name: `${scene.title} title`,
        text: scene.title,
        start: start + 82,
        duration: sceneDurationFrames - 150,
        x: panelX,
        y: 706,
        width: 626,
        height: 90,
        fontSize: 70,
        fontWeight: 760,
        color: palette.text,
        animationIn: 'slide-up',
      }),
    );
    tracks[1].clips.push(
      makeTextClip(trackIds.details, {
        name: `${scene.title} body`,
        text: scene.body,
        start: start + 122,
        duration: sceneDurationFrames - 190,
        x: panelX,
        y: 820,
        width: 626,
        height: 96,
        fontSize: 30,
        fontWeight: 540,
        color: '#d6dde7',
        animationIn: 'fade',
        animationInFrames: 20,
      }),
    );
    tracks[1].clips.push(
      makeTextClip(trackIds.details, {
        name: `${scene.title} source`,
        text: scene.source,
        start: start + 182,
        duration: sceneDurationFrames - 220,
        x: panelX,
        y: 954,
        width: 626,
        height: 30,
        fontSize: 18,
        fontWeight: 520,
        color: '#8592a1',
      }),
    );
    tracks[5].clips.push({
      ...baseClip({
        trackId: trackIds.narration,
        type: 'audio',
        name: `Narración ${scene.chapter}`,
        start,
        duration: Math.min(audioFrames, sceneDurationFrames),
      }),
      src: `/media/pollution-2026/${scene.id}.m4a`,
      volume: 1,
    });
  });

  return {
    id: randomUUID(),
    name: 'Contaminación 2026 · 5 min',
    width: projectWidth,
    height: projectHeight,
    fps,
    durationInFrames: scenes.length * sceneDurationFrames,
    background: palette.bg,
    tracks,
  };
};

const buildScriptMarkdown = (voice) => [
  '# Contaminación 2026',
  '',
  `- Duración objetivo: ${Math.round((scenes.length * sceneDurationFrames) / fps)} segundos`,
  `- Voz generada: ${voice}`,
  '',
  '## Guion',
  '',
  ...scenes.flatMap((scene) => [
    `### ${scene.chapter} · ${scene.title}`,
    '',
    scene.voiceover,
    '',
    `Pantalla: ${scene.body.replace(/\n/g, ' / ')}`,
    '',
    `Fuente visual: ${scene.source}`,
    '',
  ]),
].join('\n');

const main = async () => {
  await ensureWorkspaceDirs();
  await fs.mkdir(projectDir, {recursive: true});
  const demoDir = path.join(mediaDir, 'pollution-2026');
  await fs.rm(demoDir, {recursive: true, force: true});
  await fs.mkdir(demoDir, {recursive: true});

  const voice = await selectVoice();
  const mediaAssets = [];
  const storyboard = [];

  for (const [index, scene] of scenes.entries()) {
    const svgFile = path.join(demoDir, `${scene.id}.svg`);
    await fs.writeFile(svgFile, buildSvg(scene), 'utf8');
    mediaAssets.push({
      id: `${scene.id}-image`,
      name: `${scene.title}.svg`,
      src: `/media/pollution-2026/${scene.id}.svg`,
      type: 'image',
      width: projectWidth,
      height: projectHeight,
    });

    const audioFile = path.join(demoDir, `${scene.id}.m4a`);
    let durationInSeconds = 0;
    let selectedRate = 188;
    for (const rate of [188, 196, 204, 212, 220]) {
      await generateAudio({voice, text: scene.voiceover, outputPath: audioFile, rate});
      const metadata = await detectMediaMetadata(audioFile);
      durationInSeconds = Number(metadata.durationInSeconds ?? 0);
      selectedRate = rate;
      if (durationInSeconds <= maxNarrationSeconds) {
        break;
      }
    }
    if (durationInSeconds > maxNarrationSeconds) {
      throw new Error(`${scene.id} supera la duración prevista de escena (${durationInSeconds.toFixed(2)}s)`);
    }
    mediaAssets.push({
      id: `${scene.id}-audio`,
      name: `Narración ${scene.chapter}.m4a`,
      src: `/media/pollution-2026/${scene.id}.m4a`,
      type: 'audio',
      durationInSeconds,
      rate: selectedRate,
    });

    storyboard.push({
      id: scene.id,
      chapter: scene.chapter,
      title: scene.title,
      startFrame: index * sceneDurationFrames,
      durationInFrames: sceneDurationFrames,
      voiceDurationInSeconds: durationInSeconds,
      voiceRate: selectedRate,
      source: scene.source,
    });
  }

  const project = buildProject(mediaAssets);
  await fs.writeFile(projectFile, JSON.stringify(project, null, 2));
  await fs.writeFile(mediaIndexFile, JSON.stringify(mediaAssets, null, 2));
  await fs.writeFile(
    path.join(projectDir, 'pollution-2026-storyboard.json'),
    JSON.stringify(storyboard, null, 2),
  );
  await fs.writeFile(
    path.join(projectDir, 'pollution-2026-script.md'),
    buildScriptMarkdown(voice),
  );

  console.log(`Proyecto listo. Voz: ${voice}`);
  console.log(`Escenas: ${scenes.length}`);
  console.log(`Duración total: ${project.durationInFrames / fps}s`);
};

await main();

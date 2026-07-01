# Mosaico Studio

Editor visual de video local construido con Remotion.

## Ejecutarlo con un solo comando

En cualquier equipo con Node.js 20+:

```bash
npx github:josanager/mosaico mi-proyecto
```

Eso descarga y ejecuta `Mosaico Studio`, crea la carpeta `mi-proyecto` en tu ubicación actual y guarda ahí:

- proyectos
- medios
- renders

Si quieres usar la carpeta actual:

```bash
npx github:josanager/mosaico .
```

## Requisitos

- Node.js 20.14 o superior
- `ffmpeg` y `ffprobe` disponibles en el sistema

## Desarrollo local

```bash
npm install
npm run dev
```

Interfaz: `http://localhost:3002`  
API/render: `http://localhost:3001`

Para probar el modo empaquetado local:

```bash
npm run build
npm start
```

## CLI

También puedes instalarlo globalmente desde GitHub:

```bash
npm install -g git+https://github.com/josanager/mosaico.git
mosaico-studio ./mi-proyecto
```

Opciones útiles:

```bash
mosaico-studio --workspace ./mi-proyecto --port 3001 --no-open
```

## Render tuning

Para recalcular el perfil de render de la máquina actual:

```bash
npm run benchmark:render
```

El resultado se guarda en `projects/render-tuning.json` dentro del workspace activo.

## Controles

- Espacio: reproducir o pausar
- Flecha izquierda / derecha: mover un frame
- Shift + flecha izquierda / derecha: mover diez frames
- Delete: borrar clip seleccionado
- Cmd/Ctrl + Z: deshacer
- Cmd/Ctrl + Shift + Z: rehacer
- Cmd/Ctrl + S: guardar

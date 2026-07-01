import {Check, Download, LoaderCircle, X} from 'lucide-react';
import {useEffect, useState} from 'react';
import {useStudioStore} from '../store';
import type {RenderCapabilities, RenderJob, RenderSettings} from '../types';

const defaults: RenderSettings = {
  kind: 'video',
  codec: 'h264',
  imageFormat: 'png',
  videoImageFormat: 'jpeg',
  quality: 90,
  frame: 0,
  scale: 1,
  crf: 18,
  pixelFormat: 'yuv420p',
  muted: false,
  overwrite: true,
  outputName: 'mosaico-render',
  hardwareAcceleration: 'if-possible',
  videoBitrate: '10M',
  audioBitrate: null,
  audioCodec: 'aac',
  concurrency: 6,
  x264Preset: 'veryfast',
  gl: null,
  encodingMaxRate: null,
  encodingBufferSize: null,
};

const supportsHardwareCodec = (
  codec: RenderSettings['codec'],
  capabilities: RenderCapabilities | null,
) => {
  if (!capabilities) return false;
  if (codec === 'h264') return capabilities.capabilities.videotoolbox.h264;
  if (codec === 'h265') return capabilities.capabilities.videotoolbox.h265;
  if (codec === 'prores') return capabilities.capabilities.videotoolbox.prores;
  return false;
};

const glLabel = (gl: RenderSettings['gl']) => {
  if (gl === 'angle' || gl === 'angle-egl') return 'ANGLE';
  return 'Default';
};

export const RenderDialog = ({onClose}: {onClose: () => void}) => {
  const project = useStudioStore((state) => state.project);
  const currentFrame = useStudioStore((state) => state.currentFrame);
  const [settings, setSettings] = useState<RenderSettings>({
    ...defaults,
    frame: currentFrame,
    outputName: project.name,
  });
  const [job, setJob] = useState<RenderJob | null>(null);
  const [capabilities, setCapabilities] = useState<RenderCapabilities | null>(null);
  const [section, setSection] = useState<
    'general' | 'picture' | 'encoding' | 'audio' | 'advanced'
  >('general');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [capabilityResponse, defaultsResponse] = await Promise.all([
        fetch('/api/render/capabilities'),
        fetch('/api/render/defaults', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            project,
            settings: {
              ...defaults,
              frame: currentFrame,
              outputName: project.name,
            },
          }),
        }),
      ]);
      if (cancelled) return;
      if (capabilityResponse.ok) {
        setCapabilities((await capabilityResponse.json()) as RenderCapabilities);
      }
      if (defaultsResponse.ok) {
        const incoming = (await defaultsResponse.json()) as RenderSettings;
        setSettings((current) => ({
          ...current,
          ...incoming,
          frame: currentFrame,
          outputName: project.name,
        }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentFrame, project]);

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/render/${job.id}`);
      if (response.ok) setJob((await response.json()) as RenderJob);
    }, 700);
    return () => window.clearInterval(timer);
  }, [job]);

  const patch = <K extends keyof RenderSettings>(key: K, value: RenderSettings[K]) =>
    setSettings((current) => ({...current, [key]: value}));

  const patchCodec = (codec: RenderSettings['codec']) =>
    setSettings((current) => ({
      ...current,
      codec,
      hardwareAcceleration:
        current.kind === 'video' && supportsHardwareCodec(codec, capabilities)
          ? current.hardwareAcceleration === 'disable'
            ? 'if-possible'
            : current.hardwareAcceleration
          : 'disable',
    }));

  const render = async () => {
    const response = await fetch('/api/render', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({project, settings}),
    });
    setJob((await response.json()) as RenderJob);
  };

  const tunedBadge = capabilities?.tuning?.selected?.name
    ? `Tuned · ${capabilities.tuning.selected.name}`
    : 'Auto';
  const machineBadge = capabilities
    ? `${capabilities.capabilities.cpuModel} · ${capabilities.capabilities.cpuCount} cores`
    : 'Detecting machine';
  const videotoolboxBadge = capabilities?.capabilities.videotoolbox.h264
    ? 'VideoToolbox'
    : 'CPU encode';
  const supportsHardware = supportsHardwareCodec(settings.codec, capabilities);
  const usingHardware =
    settings.kind === 'video' &&
    settings.hardwareAcceleration !== 'disable' &&
    supportsHardware;

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="render-dialog" role="dialog" aria-label="Render">
        <header>
          <span>Render composition</span>
          <button className="icon-button" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <div className="render-meta-strip">
          <span>{machineBadge}</span>
          <span>{videotoolboxBadge}</span>
          <span>{tunedBadge}</span>
        </div>

        <div className="render-kind-tabs">
          {(['video', 'still', 'audio', 'sequence'] as const).map((kind) => (
            <button
              className={settings.kind === kind ? 'active' : ''}
              key={kind}
              onClick={() => patch('kind', kind)}
            >
              {kind[0].toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>

        <div className="render-content">
          <nav className="render-nav">
            {(['general', 'picture', 'encoding', 'audio', 'advanced'] as const).map(
              (item) => (
                <button
                  className={section === item ? 'active' : ''}
                  key={item}
                  onClick={() => setSection(item)}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ),
            )}
          </nav>

          <div className="render-settings">
            {section === 'general' && (
              <>
                <label className="field">
                  <span>Output name</span>
                  <input
                    value={settings.outputName}
                    onChange={(event) => patch('outputName', event.target.value)}
                  />
                </label>

                {(settings.kind === 'video' || settings.kind === 'audio') && (
                  <label className="field">
                    <span>Codec</span>
                    <select
                      value={settings.codec}
                      onChange={(event) =>
                        patchCodec(event.target.value as RenderSettings['codec'])
                      }
                    >
                      {settings.kind === 'audio' ? (
                        <>
                          <option value="mp3">MP3</option>
                          <option value="wav">WAV</option>
                        </>
                      ) : (
                        <>
                          <option value="h264">H.264</option>
                          <option value="h265">H.265</option>
                          <option value="vp8">VP8</option>
                          <option value="vp9">VP9</option>
                          <option value="prores">ProRes</option>
                          <option value="gif">GIF</option>
                        </>
                      )}
                    </select>
                  </label>
                )}

                {(settings.kind === 'still' || settings.kind === 'sequence') && (
                  <label className="field">
                    <span>Format</span>
                    <select
                      value={settings.imageFormat}
                      onChange={(event) =>
                        patch('imageFormat', event.target.value as RenderSettings['imageFormat'])
                      }
                    >
                      <option value="png">PNG</option>
                      <option value="jpeg">JPEG</option>
                      <option value="webp">WebP</option>
                    </select>
                  </label>
                )}

                {settings.kind === 'still' && (
                  <label className="field compact">
                    <span>Frame</span>
                    <input
                      type="number"
                      value={settings.frame}
                      onChange={(event) => patch('frame', Number(event.target.value))}
                    />
                  </label>
                )}

                <div className="render-summary-grid">
                  <div className="render-summary">
                    {project.width} × {project.height} · {project.fps} fps ·{' '}
                    {project.durationInFrames} frames
                  </div>
                  <div className="render-summary">
                    {usingHardware
                      ? `${settings.codec.toUpperCase()} · ${settings.videoBitrate || 'Auto bitrate'}`
                      : `${settings.codec.toUpperCase()} · CRF ${settings.crf ?? 18}`}
                  </div>
                </div>
              </>
            )}

            {section === 'picture' && (
              <>
                <label className="field">
                  <span>Scale</span>
                  <select
                    value={settings.scale}
                    onChange={(event) => patch('scale', Number(event.target.value))}
                  >
                    <option value={0.5}>50%</option>
                    <option value={1}>100%</option>
                    <option value={2}>200%</option>
                  </select>
                </label>

                {(settings.kind === 'still' || settings.kind === 'sequence') && (
                  <label className="field">
                    <span>Quality · {settings.quality}</span>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={settings.quality}
                      onChange={(event) =>
                        patch('quality', Number(event.target.value))
                      }
                    />
                  </label>
                )}

                {settings.kind === 'video' && (
                  <label className="field">
                    <span>Video frames</span>
                    <select
                      value={settings.videoImageFormat}
                      onChange={(event) =>
                        patch(
                          'videoImageFormat',
                          event.target.value as RenderSettings['videoImageFormat'],
                        )
                      }
                    >
                      <option value="jpeg">JPEG fast</option>
                      <option value="png">PNG alpha</option>
                    </select>
                  </label>
                )}

                {settings.kind === 'video' && (
                  <label className="field">
                    <span>Pixel format</span>
                    <select
                      value={settings.pixelFormat}
                      onChange={(event) => patch('pixelFormat', event.target.value)}
                    >
                      <option value="yuv420p">yuv420p</option>
                      <option value="yuv422p">yuv422p</option>
                      <option value="yuv444p">yuv444p</option>
                      <option value="yuva420p">yuva420p</option>
                    </select>
                  </label>
                )}
              </>
            )}

            {section === 'encoding' && (
              <>
                {settings.kind === 'video' ? (
                  <>
                    <label className="field">
                      <span>Hardware</span>
                      <select
                        value={settings.hardwareAcceleration}
                        onChange={(event) =>
                          patch(
                            'hardwareAcceleration',
                            event.target.value as RenderSettings['hardwareAcceleration'],
                          )
                        }
                      >
                        <option value="if-possible">Auto</option>
                        <option value="required" disabled={!supportsHardware}>
                          Required
                        </option>
                        <option value="disable">CPU only</option>
                      </select>
                    </label>

                    {usingHardware ? (
                      <label className="field">
                        <span>Video bitrate</span>
                        <input
                          value={settings.videoBitrate ?? ''}
                          onChange={(event) => patch('videoBitrate', event.target.value)}
                          placeholder="10M"
                        />
                      </label>
                    ) : (
                      <>
                        <label className="field">
                          <span>CRF · {settings.crf ?? 18}</span>
                          <input
                            type="range"
                            min="0"
                            max="51"
                            value={settings.crf ?? 18}
                            onChange={(event) =>
                              patch('crf', Number(event.target.value))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>x264 preset</span>
                          <select
                            value={settings.x264Preset ?? 'veryfast'}
                            onChange={(event) =>
                              patch(
                                'x264Preset',
                                event.target.value as RenderSettings['x264Preset'],
                              )
                            }
                          >
                            <option value="ultrafast">ultrafast</option>
                            <option value="superfast">superfast</option>
                            <option value="veryfast">veryfast</option>
                            <option value="faster">faster</option>
                            <option value="fast">fast</option>
                            <option value="medium">medium</option>
                            <option value="slow">slow</option>
                          </select>
                        </label>
                      </>
                    )}

                    <label className="field">
                      <span>Workers</span>
                      <input
                        type="number"
                        min="1"
                        max={capabilities?.capabilities.cpuCount ?? 32}
                        value={settings.concurrency ?? 1}
                        onChange={(event) =>
                          patch('concurrency', Number(event.target.value))
                        }
                      />
                    </label>

                    <div className="render-summary">
                      {usingHardware
                        ? 'VideoToolbox acceleration enabled when available.'
                        : 'CPU x264 path enabled. Use this for absolute compatibility or manual CRF control.'}
                    </div>
                  </>
                ) : (
                  <div className="render-summary">
                    Encoding controls apply mainly to video exports.
                  </div>
                )}
              </>
            )}

            {section === 'audio' && (
              <>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={settings.muted}
                    onChange={(event) => patch('muted', event.target.checked)}
                  />
                  <span>Render without audio</span>
                </label>

                {settings.kind === 'video' && (
                  <label className="field">
                    <span>Audio codec</span>
                    <select
                      value={settings.audioCodec}
                      onChange={(event) =>
                        patch(
                          'audioCodec',
                          event.target.value as RenderSettings['audioCodec'],
                        )
                      }
                    >
                      <option value="aac">AAC</option>
                      <option value="mp3">MP3</option>
                      <option value="pcm-16">PCM 16-bit</option>
                    </select>
                  </label>
                )}
              </>
            )}

            {section === 'advanced' && (
              <>
                {settings.kind === 'video' && (
                  <>
                    <label className="field">
                      <span>GPU renderer</span>
                      <select
                        value={settings.gl ?? 'auto'}
                        onChange={(event) =>
                          patch(
                            'gl',
                            event.target.value === 'auto'
                              ? null
                              : (event.target.value as RenderSettings['gl']),
                          )
                        }
                      >
                        <option value="auto">Auto</option>
                        <option value="angle">ANGLE</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>Max rate</span>
                      <input
                        value={settings.encodingMaxRate ?? ''}
                        onChange={(event) =>
                          patch('encodingMaxRate', event.target.value || null)
                        }
                        placeholder="Optional"
                      />
                    </label>

                    <label className="field">
                      <span>Buffer</span>
                      <input
                        value={settings.encodingBufferSize ?? ''}
                        onChange={(event) =>
                          patch('encodingBufferSize', event.target.value || null)
                        }
                        placeholder="Optional"
                      />
                    </label>
                  </>
                )}

                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={settings.overwrite}
                    onChange={(event) => patch('overwrite', event.target.checked)}
                  />
                  <span>Overwrite matching output</span>
                </label>

                <div className="render-summary-grid">
                  <div className="render-summary">
                    {glLabel(settings.gl)} · {settings.concurrency ?? 1} workers
                  </div>
                  <div className="render-summary">
                    {capabilities?.tuning?.selected?.detail ?? 'No machine benchmark saved yet.'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {job && (
          <div className={`render-progress ${job.status}`}>
            <span>
              {job.status === 'done' ? (
                <Check size={14} />
              ) : (
                <LoaderCircle size={14} className={job.status !== 'error' ? 'spin' : ''} />
              )}
            </span>
            <div>
              <div className="progress-track">
                <div style={{width: `${job.progress * 100}%`}} />
              </div>
              <small>{job.detail ?? job.message}</small>
              <small>{job.message}</small>
            </div>
          </div>
        )}

        <footer>
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          {job?.status === 'done' && job.url ? (
            <a className="primary-button" href={job.url} download>
              <Download size={14} /> Download
            </a>
          ) : (
            <button
              className="primary-button"
              disabled={!!job && !['done', 'error'].includes(job.status)}
              onClick={() => void render()}
            >
              Render
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

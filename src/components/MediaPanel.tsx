import {
  Box,
  Clapperboard,
  FileVideo,
  Image as ImageIcon,
  Monitor,
  Music2,
  Plus,
  Search,
  Smartphone,
  Type,
  Upload,
  Volume2,
  VolumeX,
  ChevronLeft,
  Folder,
  FolderPlus,
  FolderMinus,
  FolderOpen,
  ChevronDown,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import React, {useEffect, useRef, useState, memo} from 'react';
import {useStudioStore} from '../store';
import type {Clip, ClipType, MediaAsset} from '../types';

const defaultClip = (
  type: ClipType,
  trackId: string,
  name: string,
  start: number,
): Clip => ({
  id: crypto.randomUUID(),
  trackId,
  type,
  name,
  start,
  duration: type === 'text' || type === 'shape' || type === 'image' ? 150 : 90,
  sourceStart: 0,
  text: type === 'text' ? 'Edit this title' : undefined,
  color: type === 'shape' ? '#7056e8' : '#ffffff',
  opacity: 1,
  x: type === 'text' ? 220 : 560,
  y: type === 'text' ? 430 : 290,
  width: type === 'text' ? 1480 : 800,
  height: type === 'text' ? 220 : 500,
  rotation: 0,
  scale: 1,
  fontSize: 112,
  fontWeight: 700,
  volume: 1,
  playbackRate: 1,
  fit: 'cover',
  animationIn: 'fade',
  animationOut: 'fade',
  animationInFrames: 12,
  animationOutFrames: 12,
  motionPreset: type === 'image' || type === 'video' ? 'slow-zoom-in' : 'none',
});

export const MediaPanel = memo(({
  previewMuted,
  onTogglePreviewMute,
  onCreateComposition,
  onCollapse,
}: {
  previewMuted: boolean;
  onTogglePreviewMute: () => void;
  onCreateComposition: (preset?: 'landscape' | 'portrait') => void;
  onCollapse?: () => void;
}) => {
  const [tab, setTab] = useState<'media' | 'compositions' | 'ai'>('media');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // AI states
  const [selectedAssetIdForAI, setSelectedAssetIdForAI] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading_model' | 'processing' | 'success' | 'error'>('idle');
  const [aiProgressMsg, setAiProgressMsg] = useState('');
  const [aiProgressVal, setAiProgressVal] = useState(0);
  const [hoveredAiHelpId, setHoveredAiHelpId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const aiHelpTimerRef = useRef<number | null>(null);
  const {
    project,
    assets,
    folders,
    addAsset,
    addClip,
    addFolder,
    deleteFolder,
    moveAssetToFolder,
    updateClip,
    selectedClipId,
  } = useStudioStore();

  const selectedImageClip = project.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === selectedClipId && c.type === 'image');

  const selectedAssetForAI = assets.find((a) => a.id === selectedAssetIdForAI);

  useEffect(() => {
    return () => {
      if (aiHelpTimerRef.current !== null) {
        window.clearTimeout(aiHelpTimerRef.current);
      }
    };
  }, []);

  const toAbsoluteAssetUrl = (sourceUrl: string) => {
    if (/^https?:\/\//i.test(sourceUrl)) return sourceUrl;
    if (typeof window === 'undefined') return sourceUrl;
    return new URL(sourceUrl, window.location.origin).toString();
  };

  const handleRemoveBackground = async (
    sourceAsset: Pick<MediaAsset, 'name' | 'src' | 'folderId'> | {name: string; src: string},
    targetType: 'clip' | 'asset',
    targetId: string,
  ) => {
    setAiStatus('loading_model');
    setAiProgressMsg('Descargando modelo de IA (sólo la primera vez)...');
    setAiProgressVal(0);
    
    try {
      // Dynamic import of the library
      const { removeBackground } = await import('@imgly/background-removal');
      
      setAiStatus('processing');
      setAiProgressMsg('Analizando imagen y quitando fondo...');
      
      const noBgBlob = await removeBackground(toAbsoluteAssetUrl(sourceAsset.src), {
        progress: (key, current, total) => {
          const percent = Math.round((current / total) * 100);
          if (key === 'fetch') {
            setAiProgressMsg(`Descargando modelo: ${percent}%`);
          } else if (key === 'processing') {
            setAiProgressMsg(`Procesando imagen: ${percent}%`);
          } else {
            setAiProgressMsg(`Preparando IA: ${percent}%`);
          }
          setAiProgressVal(percent);
        }
      });

      setAiProgressMsg('Guardando imagen procesada...');
      setAiProgressVal(90);

      const baseName = sourceAsset.name.replace(/\.[^/.]+$/, "");
      const newFileName = `${baseName}-nobg.png`;

      const formData = new FormData();
      formData.append('file', noBgBlob, newFileName);

      const res = await fetch('/api/media', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Error al subir la imagen procesada al servidor');
      const uploadedAsset = await res.json();
      const newAsset = targetType === 'asset' && 'folderId' in sourceAsset
        ? {...uploadedAsset, folderId: sourceAsset.folderId ?? null}
        : uploadedAsset;
      
      // Add to library
      addAsset(newAsset);
      if (targetType === 'asset') {
        setSelectedAssetIdForAI(newAsset.id);
      }
      
      // If target was a clip, swap its source
      if (targetType === 'clip') {
        updateClip(targetId, {
          src: newAsset.src,
          name: newFileName
        });
      }

      setAiStatus('success');
      setAiProgressMsg('¡Fondo eliminado con éxito!');
      setAiProgressVal(100);
      setTimeout(() => {
        setAiStatus('idle');
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setAiStatus('error');
          setAiProgressMsg(`Error: ${err.message || 'Error desconocido'}`);
      setAiProgressVal(0);
      setTimeout(() => {
        setAiStatus('idle');
      }, 5000);
    }
  };

  const trackFor = (type: ClipType) => {
    const kind = type === 'audio' ? 'audio' : 'visual';
    return project.tracks.find((track) => track.kind === kind && !track.locked);
  };

  const addGenerated = (type: 'text' | 'shape') => {
    const track = trackFor(type);
    if (!track) return;
    const currentFrame = useStudioStore.getState().currentFrame;
    addClip(track.id, defaultClip(type, track.id, type === 'text' ? 'Title' : 'Rectangle', currentFrame));
  };

  const placeAsset = (asset: MediaAsset) => {
    const track = trackFor(asset.type);
    if (!track) return;
    const currentFrame = useStudioStore.getState().currentFrame;
    const clip = defaultClip(asset.type, track.id, asset.name, currentFrame);
    clip.src = asset.src;
    clip.duration =
      asset.type === 'image'
        ? 150
        : Math.max(1, Math.round((asset.durationInSeconds || 3) * project.fps));
    if (asset.width && asset.height) {
      clip.width = Math.min(asset.width, project.width);
      clip.height = Math.min(asset.height, project.height);
      clip.x = (project.width - clip.width) / 2;
      clip.y = (project.height - clip.height) / 2;
    }
    addClip(track.id, clip);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      for (const file of Array.from(files)) body.append('files', file);

      const response = await fetch('/api/media', {method: 'POST', body});
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || `Upload failed with status ${response.status}`,
        );
      }

      const uploadedAssets = Array.isArray(payload?.assets)
        ? (payload.assets as MediaAsset[])
        : payload
          ? [payload as MediaAsset]
          : [];

      for (const asset of uploadedAssets) {
        addAsset(asset);
        placeAsset(asset);
      }
    } catch (error) {
      console.error(error);
      setUploadError(
        error instanceof Error ? error.message : 'No se pudo importar el archivo.',
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openFilePicker = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const scheduleAiHelp = (assetId: string) => {
    if (aiHelpTimerRef.current !== null) {
      window.clearTimeout(aiHelpTimerRef.current);
    }
    aiHelpTimerRef.current = window.setTimeout(() => {
      setHoveredAiHelpId(assetId);
    }, 1000);
  };

  const clearAiHelp = () => {
    if (aiHelpTimerRef.current !== null) {
      window.clearTimeout(aiHelpTimerRef.current);
      aiHelpTimerRef.current = null;
    }
    setHoveredAiHelpId(null);
  };

  const filtered = assets.filter((asset) =>
    asset.name.toLowerCase().includes(query.toLowerCase()),
  );

  const renderAssetItem = (asset: MediaAsset) => {
    const Icon =
      asset.type === 'audio'
        ? Music2
        : asset.type === 'image'
          ? ImageIcon
          : FileVideo;
    return (
      <div
        className="asset-item"
        key={asset.id}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('application/mosaico-asset', JSON.stringify(asset));
        }}
        onDoubleClick={() => placeAsset(asset)}
        title="Drag and drop, double-click or use '+' to add"
      >
        <span className={`asset-icon ${asset.type}`}>
          <Icon size={16} />
        </span>
        <span className="asset-name">{asset.name}</span>
        
        <div className="asset-move-container" title="Move to folder">
          <Folder size={13} className="move-icon" />
          <select
            value={asset.folderId || ''}
            onChange={(e) => moveAssetToFolder(asset.id, e.target.value || null)}
            className="folder-select"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <option value="">(Raíz)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <button 
          className="asset-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            placeAsset(asset);
          }}
          title="Add to timeline"
        >
          <Plus size={13} />
        </button>
        {asset.type === 'image' && (
          <div
            className="asset-ai-wrap"
            onMouseEnter={() => scheduleAiHelp(asset.id)}
            onMouseLeave={clearAiHelp}
          >
            <button
              className="asset-ai-btn"
              onClick={(e) => {
                e.stopPropagation();
                clearAiHelp();
                setSelectedAssetIdForAI(asset.id);
                void handleRemoveBackground(asset, 'asset', asset.id);
              }}
              title="Quitar fondo"
            >
              <Sparkles size={13} />
            </button>
            {hoveredAiHelpId === asset.id && (
              <div className="asset-ai-tooltip">
                Quita el fondo de esta imagen con IA local y guarda una copia nueva.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="left-panel">
      <div className="panel-tabs">
        <button
          className={tab === 'compositions' ? 'active' : ''}
          onClick={() => setTab('compositions')}
          title="Composiciones"
        >
          <Clapperboard size={14} />
        </button>
        <button
          className={tab === 'media' ? 'active' : ''}
          onClick={() => setTab('media')}
          title="Medios"
        >
          <FileVideo size={14} />
        </button>
        <button
          className={tab === 'ai' ? 'active' : ''}
          onClick={() => setTab('ai')}
          title="AI Tools"
        >
          <Sparkles size={14} />
        </button>
        {onCollapse && (
          <button className="collapse-tab-btn" title="Colapsar panel" onClick={onCollapse}>
            <ChevronLeft size={13} />
          </button>
        )}
      </div>
      <div className="left-panel-body">
        {tab === 'compositions' ? (
          <div className="composition-list">
            <div className="composition-actions">
              <button
                title="New landscape composition"
                onClick={() => onCreateComposition('landscape')}
              >
                <Plus size={14} />
                <Monitor size={13} />
              </button>
              <button
                title="New portrait composition"
                onClick={() => onCreateComposition('portrait')}
              >
                <Smartphone size={13} />
              </button>
              <button
                title={previewMuted ? 'Enable preview audio' : 'Mute preview audio'}
                onClick={onTogglePreviewMute}
              >
                {previewMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
            </div>
            <div className="tree-label">COMPOSITIONS</div>
            <div className="composition-stack">
              <button className="composition-item active">
                <Clapperboard size={14} />
                <span>{project.name}</span>
                <span className="dim">{project.width}×{project.height}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="media-browser">
            <div className="asset-actions">
              <button title={uploading ? "Importando..." : "Importar medios"} onClick={openFilePicker}>
                <Upload size={15} />
              </button>
              <button
                title="Add text"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/mosaico-asset', JSON.stringify({type: 'text', name: 'Text'}));
                }}
                onClick={() => addGenerated('text')}
              >
                <Type size={15} />
              </button>
              <button
                title="Add shape"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/mosaico-asset', JSON.stringify({type: 'shape', name: 'Shape'}));
                }}
                onClick={() => addGenerated('shape')}
              >
                <Box size={15} />
              </button>
              <button
                title="New folder"
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
              >
                <FolderPlus size={15} />
              </button>
            </div>
            {showNewFolderInput && (
              <div className="new-folder-input-row">
                <input
                  autoFocus
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newFolderName.trim()) {
                      addFolder(newFolderName.trim());
                      setNewFolderName('');
                      setShowNewFolderInput(false);
                    } else if (event.key === 'Escape') {
                      setShowNewFolderInput(false);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (newFolderName.trim()) {
                      addFolder(newFolderName.trim());
                      setNewFolderName('');
                      setShowNewFolderInput(false);
                    }
                  }}
                >
                  <Check size={12} />
                </button>
                <button onClick={() => setShowNewFolderInput(false)}>
                  <X size={12} />
                </button>
              </div>
            )}
            <input
              ref={inputRef}
              hidden
              multiple
              type="file"
              accept="video/*,audio/*,image/*"
              onChange={(event) => void upload(event.target.files)}
            />
            <label className="search-box">
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter media"
              />
            </label>
            {uploadError && <div className="folder-empty">{uploadError}</div>}
            <div
              className="asset-list"
              title={uploading ? 'Importando medios...' : 'Haz click para importar medios'}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target === event.currentTarget || target.closest('.empty-state')) {
                  openFilePicker();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                try {
                  const dataStr = event.dataTransfer.getData('application/mosaico-asset');
                  if (dataStr) {
                    const asset = JSON.parse(dataStr);
                    if (asset && asset.id) {
                      moveAssetToFolder(asset.id, null);
                    }
                  }
                } catch (err) {
                  console.error(err);
                }
              }}
            >
              {/* Folders */}
              {folders.map((folder) => {
                const folderAssets = filtered.filter((a) => a.folderId === folder.id);
                const isExpanded = expandedFolders[folder.id] !== false;
                const isDragOver = dragOverFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    className={`folder-group ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setDragOverFolderId(null);
                      try {
                        const dataStr = event.dataTransfer.getData('application/mosaico-asset');
                        if (dataStr) {
                          const asset = JSON.parse(dataStr);
                          if (asset && asset.id) {
                            moveAssetToFolder(asset.id, folder.id);
                          }
                        }
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                  >
                    <div
                      className="folder-header"
                      onClick={() =>
                        setExpandedFolders((prev) => ({
                          ...prev,
                          [folder.id]: isExpanded ? false : true,
                        }))
                      }
                    >
                      <div className="folder-toggle">
                        <ChevronDown
                          size={14}
                          className={isExpanded ? 'rotate-180' : 'rotate-270'}
                        />
                        {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                        <span className="folder-name">{folder.name}</span>
                        <span className="folder-count">({folderAssets.length})</span>
                      </div>
                      <button
                        className="folder-delete-btn"
                        title="Delete folder (assets will move to root)"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteFolder(folder.id);
                        }}
                      >
                        <FolderMinus size={14} />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="folder-contents">
                        {folderAssets.map((asset) => renderAssetItem(asset))}
                        {folderAssets.length === 0 && (
                          <div className="folder-empty">Drop assets here</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned / Root Assets */}
              {folders.length > 0 && filtered.some((a) => !a.folderId) && (
                <div className="section-label" style={{padding: '8px 4px 4px'}}>
                  SIN CARPETA
                </div>
              )}
              {filtered
                .filter((a) => !a.folderId)
                .map((asset) => renderAssetItem(asset))}

              {/* Empty state */}
              {!filtered.length && (
                <div className="empty-state">
                  <Upload size={19} />
                  <span>Drop or import media</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ai' && (
          <div className="ai-browser">
            <div className="tree-label">AI TOOLS</div>
            <div className="ai-content">
              <div className="ai-tool-card">
                <h3>Eliminador de Fondo</h3>
                <p className="tool-desc">Quita el fondo de cualquier imagen con un solo clic usando IA local.</p>
                
                {/* Selected Clip from Timeline */}
                <div className="ai-source-section">
                  {selectedImageClip ? (
                    <div className="selected-source-item">
                      <span className="source-badge">Clip Seleccionado</span>
                      <span className="source-name">{selectedImageClip.name}</span>
                      <button 
                        className="ai-action-btn"
                        disabled={aiStatus !== 'idle'}
                        onClick={() => handleRemoveBackground({
                          name: selectedImageClip.name,
                          src: selectedImageClip.src || '',
                        }, 'clip', selectedImageClip.id)}
                      >
                        {aiStatus !== 'idle' ? 'Procesando...' : 'Quitar Fondo al Clip'}
                      </button>
                    </div>
                  ) : (
                    <div className="selected-source-item empty">
                      <span>Selecciona un clip de imagen en la línea de tiempo.</span>
                    </div>
                  )}
                </div>

                {/* Library Selector */}
                <div className="ai-library-section">
                  <div className="section-label">SELECCIONAR DESDE BIBLIOTECA</div>
                  <div className="ai-image-grid">
                    {assets.filter((a) => a.type === 'image').map((asset) => {
                      const isSelected = selectedAssetIdForAI === asset.id;
                      return (
                        <div 
                          key={asset.id} 
                          className={`ai-image-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedAssetIdForAI(asset.id)}
                        >
                          <img src={asset.src} alt={asset.name} />
                          <span className="ai-image-name">{asset.name}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {selectedAssetForAI && (
                    <div className="ai-selected-asset-actions">
                      <button
                        className="ai-action-btn"
                        disabled={aiStatus !== 'idle'}
                        onClick={() => handleRemoveBackground(selectedAssetForAI, 'asset', selectedAssetForAI.id)}
                      >
                        {aiStatus !== 'idle' ? 'Procesando...' : `Quitar Fondo a "${selectedAssetForAI.name}"`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Progress / Status Panel */}
                {aiStatus !== 'idle' && (
                  <div className="ai-progress-overlay">
                    <div className="ai-progress-card">
                      <div>
                        <span className="ai-spinner"></span>
                        <span className="ai-progress-msg" style={{marginLeft: '8px'}}>{aiProgressMsg}</span>
                      </div>
                      {aiProgressVal > 0 && (
                        <div className="ai-progress-bar-bg">
                          <div className="ai-progress-bar-fill" style={{width: `${aiProgressVal}%`}}></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});

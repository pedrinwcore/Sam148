import React, { useState, useEffect } from 'react';
import { ChevronLeft, Video, Settings, Play, Trash2, RefreshCw, AlertCircle, CheckCircle, Zap, Clock, HardDrive, Monitor, Download, Eye, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import IFrameVideoPlayer from '../../components/IFrameVideoPlayer';

interface VideoConversion {
  id: number;
  nome: string;
  url: string;
  duracao?: number;
  tamanho?: number;
  bitrate_video?: number;
  formato_original?: string;
  codec_video?: string;
  largura?: number;
  altura?: number;
  is_mp4: boolean;
  current_bitrate: number;
  user_bitrate_limit: number;
  available_qualities: Array<{
    quality: string;
    bitrate: number;
    resolution: string;
    canConvert: boolean;
    description: string;
    customizable: boolean;
  }>;
  can_use_current: boolean;
  needs_conversion: boolean;
  compatibility_status: string;
  compatibility_message: string;
  codec_compatible: boolean;
  format_compatible: boolean;
  has_converted_version: boolean;
}

interface Folder {
  id: number;
  nome: string;
  video_count_db?: number;
}

interface QualityPreset {
  quality: string;
  label: string;
  bitrate: number;
  resolution: string;
  available: boolean;
  description: string;
}

interface ConversionSettings {
  quality: string;
  custom_bitrate: number;
  custom_resolution: string;
  use_custom: boolean;
}

interface ConversionStatus {
  status: 'nao_iniciada' | 'em_andamento' | 'concluida' | 'erro';
  progress: number;
  quality?: string;
  bitrate?: number;
  file_size?: number;
  codec?: string;
  format?: string;
}

const ConversaoVideos: React.FC = () => {
  const { getToken, user } = useAuth();
  const [videos, setVideos] = useState<VideoConversion[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState<Record<number, boolean>>({});
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoConversion | null>(null);
  const [conversionSettings, setConversionSettings] = useState<ConversionSettings>({
    quality: 'alta',
    custom_bitrate: 2500,
    custom_resolution: '1920x1080',
    use_custom: false
  });
  const [qualityPresets, setQualityPresets] = useState<QualityPreset[]>([]);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<VideoConversion | null>(null);
  const [conversionStatuses, setConversionStatuses] = useState<Record<number, ConversionStatus>>({});

  useEffect(() => {
    loadFolders();
    loadQualityPresets();
  }, []);

  useEffect(() => {
    if (selectedFolder) {
      loadVideos();
    }
  }, [selectedFolder]);

  const loadFolders = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/folders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setFolders(data);
      if (data.length > 0 && !selectedFolder) {
        setSelectedFolder(data[0].id.toString());
      }
    } catch (error) {
      toast.error('Erro ao carregar pastas');
    }
  };

  const loadQualityPresets = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/conversion/qualities', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setQualityPresets(data.qualities);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar qualidades:', error);
    }
  };

  const loadVideos = async () => {
    if (!selectedFolder) return;

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/conversion/videos?folder_id=${selectedFolder}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setVideos(data.videos);
          
          // Carregar status de conversão para cada vídeo
          data.videos.forEach((video: VideoConversion) => {
            loadConversionStatus(video.id);
          });
        }
      }
    } catch (error) {
      toast.error('Erro ao carregar vídeos');
    } finally {
      setLoading(false);
    }
  };

  const loadConversionStatus = async (videoId: number) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/conversion/status/${videoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConversionStatuses(prev => ({
            ...prev,
            [videoId]: data.conversion_status
          }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar status de conversão:', error);
    }
  };

  const openConversionModal = (video: VideoConversion) => {
    setSelectedVideo(video);
    const userBitrateLimit = user?.bitrate || 2500;
    
    // Configurar qualidade recomendada baseada no vídeo atual
    let recommendedQuality = 'alta';
    if (video.current_bitrate > userBitrateLimit) {
      recommendedQuality = 'custom';
    } else if (video.current_bitrate <= 800) {
      recommendedQuality = 'baixa';
    } else if (video.current_bitrate <= 1500) {
      recommendedQuality = 'media';
    }

    setConversionSettings({
      quality: recommendedQuality,
      custom_bitrate: Math.min(video.current_bitrate || userBitrateLimit, userBitrateLimit),
      custom_resolution: `${video.largura || 1920}x${video.altura || 1080}`,
      use_custom: recommendedQuality === 'custom'
    });
    setShowConversionModal(true);
  };

  const startConversion = async () => {
    if (!selectedVideo) return;

    const videoId = selectedVideo.id;
    setConverting(prev => ({ ...prev, [videoId]: true }));
    setShowConversionModal(false);

    try {
      const token = await getToken();
      const response = await fetch('/api/conversion/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          video_id: videoId,
          quality: conversionSettings.quality,
          custom_bitrate: conversionSettings.use_custom ? conversionSettings.custom_bitrate : undefined,
          custom_resolution: conversionSettings.use_custom ? conversionSettings.custom_resolution : undefined,
          use_custom: conversionSettings.use_custom
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        
        // Atualizar status de conversão
        setConversionStatuses(prev => ({
          ...prev,
          [videoId]: {
            status: 'concluida',
            progress: 100,
            quality: result.quality_label,
            bitrate: result.target_bitrate,
            file_size: result.file_size
          }
        }));
        
        // Recarregar lista de vídeos
        setTimeout(() => {
          loadVideos();
        }, 2000);
      } else {
        toast.error(result.error || 'Erro na conversão');
        setConversionStatuses(prev => ({
          ...prev,
          [videoId]: {
            status: 'erro',
            progress: 0
          }
        }));
      }
    } catch (error) {
      console.error('Erro ao iniciar conversão:', error);
      toast.error('Erro ao iniciar conversão');
      setConversionStatuses(prev => ({
        ...prev,
        [videoId]: {
          status: 'erro',
          progress: 0
        }
      }));
    } finally {
      setConverting(prev => ({ ...prev, [videoId]: false }));
    }
  };

  const openVideoPlayer = (video: VideoConversion) => {
    setCurrentVideo(video);
    setShowPlayerModal(true);
  };

  const closeVideoPlayer = () => {
    setShowPlayerModal(false);
    setCurrentVideo(null);
  };

  const buildExternalPlayerUrl = (videoPath: string) => {
    if (!videoPath) return '';

    const cleanPath = videoPath.replace(/^\/+/, '').replace(/^(content\/|streaming\/)?/, '');
    const pathParts = cleanPath.split('/');
    
    if (pathParts.length >= 3) {
      const userLogin = pathParts[0];
      const folderName = pathParts[1];
      const fileName = pathParts[2];
      const finalFileName = fileName.endsWith('.mp4') ? fileName : fileName.replace(/\.[^/.]+$/, '.mp4');
      const domain = 'stmv1.udicast.com';
      return `https://${domain}:1443/play.php?login=${userLogin}&video=${folderName}/${finalFileName}`;
    }
    
    return '';
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getCompatibilityIcon = (video: VideoConversion) => {
    const status = conversionStatuses[video.id];
    
    if (converting[video.id]) {
      return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
    }
    
    if (status?.status === 'concluida') {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    if (video.compatibility_status === 'compatible' || video.can_use_current) {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    
    if (video.needs_conversion) {
      return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
    
    return <AlertCircle className="h-5 w-5 text-yellow-600" />;
  };

  const getCompatibilityText = (video: VideoConversion) => {
    const status = conversionStatuses[video.id];
    
    if (converting[video.id]) {
      return 'Convertendo...';
    }
    
    if (status?.status === 'concluida') {
      return 'Otimizado';
    }
    
    if (status?.status === 'erro') {
      return 'Erro na Conversão';
    }
    
    return video.compatibility_message || 'Verificando...';
  };

  const getCompatibilityColor = (video: VideoConversion) => {
    const status = conversionStatuses[video.id];
    
    if (converting[video.id]) {
      return 'text-blue-600';
    }
    
    if (status?.status === 'concluida') {
      return 'text-green-600';
    }
    
    if (status?.status === 'erro') {
      return 'text-red-600';
    }
    
    if (video.compatibility_status === 'compatible' || video.can_use_current) {
      return 'text-green-600';
    }
    
    if (video.needs_conversion) {
      return 'text-red-600';
    }
    
    return 'text-yellow-600';
  };

  const getQualityRecommendation = (video: VideoConversion) => {
    const userLimit = user?.bitrate || 2500;
    const currentBitrate = video.current_bitrate || 0;
    
    if (currentBitrate <= 800) return 'baixa';
    if (currentBitrate <= 1500) return 'media';
    if (currentBitrate <= 2500) return 'alta';
    if (currentBitrate > userLimit) return 'custom';
    return 'alta';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link to="/dashboard" className="flex items-center text-primary-600 hover:text-primary-800">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span>Voltar ao Dashboard</span>
        </Link>
      </div>

      <div className="flex items-center space-x-3">
        <Settings className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Conversão de Vídeos</h1>
      </div>

      {/* Informações sobre conversão */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start">
          <Video className="h-6 w-6 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-semibold mb-3">🎬 Otimização de Vídeos para Streaming</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-blue-800 mb-2">Por que converter?</h4>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• <strong>Compatibilidade:</strong> Garante reprodução em todos os dispositivos</li>
                  <li>• <strong>Performance:</strong> Reduz buffering e melhora qualidade</li>
                  <li>• <strong>Economia:</strong> Otimiza uso de banda e armazenamento</li>
                  <li>• <strong>Streaming:</strong> Formato ideal para transmissão ao vivo</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-blue-800 mb-2">Seu plano permite:</h4>
                <ul className="text-blue-700 text-sm space-y-1">
                  <li>• <strong>Bitrate máximo:</strong> {user?.bitrate || 2500} kbps</li>
                  <li>• <strong>Resolução:</strong> Até 1920x1080 (Full HD)</li>
                  <li>• <strong>Formato:</strong> MP4 com codec H.264</li>
                  <li>• <strong>Qualidades disponíveis:</strong> Baixa, Média, Alta e Personalizada</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seleção de Pasta */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Selecionar Pasta</h2>
          <button
            onClick={loadVideos}
            disabled={loading}
            className="text-primary-600 hover:text-primary-800 flex items-center"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedFolder === folder.id.toString()
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedFolder(folder.id.toString())}
            >
              <div className="flex items-center space-x-3">
                <Video className="h-6 w-6 text-blue-600" />
                <div>
                  <h3 className="font-medium text-gray-900">{folder.nome}</h3>
                  <p className="text-sm text-gray-500">
                    {folder.video_count_db || 0} vídeos
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista de Vídeos para Conversão */}
      {selectedFolder && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">
            Vídeos para Conversão - {folders.find(f => f.id.toString() === selectedFolder)?.nome}
          </h2>

          {videos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Video className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg mb-2">Nenhum vídeo encontrado</p>
              <p className="text-sm">Envie vídeos para esta pasta primeiro</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <div key={video.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  {/* Header do Card */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getCompatibilityIcon(video)}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate" title={video.nome}>
                          {video.nome}
                        </h3>
                        <p className={`text-sm font-medium ${getCompatibilityColor(video)}`}>
                          {getCompatibilityText(video)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Informações do Vídeo */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Formato:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        video.is_mp4 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {video.formato_original?.toUpperCase() || 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Bitrate:</span>
                      <span className={`font-medium ${
                        video.current_bitrate > (user?.bitrate || 2500) ? 'text-red-600' : 'text-gray-900'
                      }`}>
                        {video.current_bitrate || 0} kbps
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Resolução:</span>
                      <span className="text-gray-900">
                        {video.largura || 1920}x{video.altura || 1080}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Tamanho:</span>
                      <span className="text-gray-900">
                        {video.tamanho ? formatFileSize(video.tamanho) : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Duração:</span>
                      <span className="text-gray-900">
                        {video.duracao ? formatDuration(video.duracao) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Progresso de Conversão */}
                  {converting[video.id] && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-blue-700 font-medium">Convertendo...</span>
                        <span className="text-blue-600">
                          {conversionStatuses[video.id]?.progress || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${conversionStatuses[video.id]?.progress || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openVideoPlayer(video)}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 flex items-center justify-center text-sm"
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Reproduzir
                    </button>

                    {video.needs_conversion && !converting[video.id] && conversionStatuses[video.id]?.status !== 'concluida' && (
                      <button
                        onClick={() => openConversionModal(video)}
                        className="flex-1 bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 flex items-center justify-center text-sm"
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Converter
                      </button>
                    )}

                    {(!video.needs_conversion || conversionStatuses[video.id]?.status === 'concluida') && (
                      <button
                        onClick={() => {
                          const url = buildExternalPlayerUrl(video.url);
                          if (url) window.open(url, '_blank');
                        }}
                        className="flex-1 bg-purple-600 text-white px-3 py-2 rounded-md hover:bg-purple-700 flex items-center justify-center text-sm"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Abrir
                      </button>
                    )}
                  </div>

                  {/* Qualidade Recomendada */}
                  {video.needs_conversion && (
                    <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-yellow-800 text-xs">
                        <strong>Recomendado:</strong> Qualidade {getQualityRecommendation(video)} 
                        ({qualityPresets.find(q => q.quality === getQualityRecommendation(video))?.bitrate || 2500} kbps)
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Configuração de Conversão */}
      {showConversionModal && selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900">
                  Converter: {selectedVideo.nome}
                </h3>
                <button
                  onClick={() => setShowConversionModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Informações do Vídeo Atual */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-800 mb-3">Vídeo Atual</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Formato:</span>
                    <span className="ml-2 font-medium">{selectedVideo.formato_original?.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Bitrate:</span>
                    <span className="ml-2 font-medium">{selectedVideo.current_bitrate} kbps</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Resolução:</span>
                    <span className="ml-2 font-medium">{selectedVideo.largura}x{selectedVideo.altura}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tamanho:</span>
                    <span className="ml-2 font-medium">{formatFileSize(selectedVideo.tamanho || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Seleção de Qualidade */}
              <div>
                <h4 className="font-medium text-gray-800 mb-3">Qualidade de Conversão</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {qualityPresets.filter(q => q.available).map((preset) => (
                    <div
                      key={preset.quality}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        conversionSettings.quality === preset.quality
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setConversionSettings(prev => ({
                        ...prev,
                        quality: preset.quality,
                        use_custom: preset.quality === 'custom'
                      }))}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-gray-900">{preset.label}</h5>
                        <span className="text-sm text-gray-600">{preset.bitrate} kbps</span>
                      </div>
                      <p className="text-sm text-gray-600">{preset.description}</p>
                      <p className="text-xs text-gray-500 mt-1">{preset.resolution}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Configurações Personalizadas */}
              {conversionSettings.use_custom && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-3">Configurações Personalizadas</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bitrate (kbps)
                      </label>
                      <input
                        type="number"
                        min="500"
                        max={user?.bitrate || 2500}
                        value={conversionSettings.custom_bitrate}
                        onChange={(e) => setConversionSettings(prev => ({
                          ...prev,
                          custom_bitrate: parseInt(e.target.value)
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Máximo: {user?.bitrate || 2500} kbps
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Resolução
                      </label>
                      <select
                        value={conversionSettings.custom_resolution}
                        onChange={(e) => setConversionSettings(prev => ({
                          ...prev,
                          custom_resolution: e.target.value
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                      >
                        <option value="854x480">854x480 (480p)</option>
                        <option value="1280x720">1280x720 (720p)</option>
                        <option value="1920x1080">1920x1080 (1080p)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview da Conversão */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-3">Preview da Conversão</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-green-700">Formato final:</span>
                    <span className="ml-2 font-medium">MP4 (H.264)</span>
                  </div>
                  <div>
                    <span className="text-green-700">Bitrate final:</span>
                    <span className="ml-2 font-medium">
                      {conversionSettings.use_custom 
                        ? conversionSettings.custom_bitrate 
                        : qualityPresets.find(q => q.quality === conversionSettings.quality)?.bitrate || 2500
                      } kbps
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700">Resolução final:</span>
                    <span className="ml-2 font-medium">
                      {conversionSettings.use_custom 
                        ? conversionSettings.custom_resolution 
                        : qualityPresets.find(q => q.quality === conversionSettings.quality)?.resolution || '1920x1080'
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-green-700">Compatibilidade:</span>
                    <span className="ml-2 font-medium text-green-600">100%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowConversionModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={startConversion}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
              >
                <Settings className="h-4 w-4 mr-2" />
                Iniciar Conversão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Player */}
      {showPlayerModal && currentVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-lg relative max-w-4xl w-full h-[70vh]">
            <button
              onClick={closeVideoPlayer}
              className="absolute top-4 right-4 z-20 text-white bg-red-600 hover:bg-red-700 rounded-full p-2 transition-colors duration-200 shadow-lg"
              title="Fechar player"
            >
              ×
            </button>

            <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
              <h3 className="font-medium">{currentVideo.nome}</h3>
              <p className="text-xs opacity-80">
                {currentVideo.formato_original?.toUpperCase()} • {currentVideo.current_bitrate} kbps
              </p>
            </div>

            <div className="w-full h-full">
              <IFrameVideoPlayer
                src={buildExternalPlayerUrl(currentVideo.url)}
                title={currentVideo.nome}
                autoplay={true}
                controls={true}
                className="w-full h-full"
                onError={(error) => {
                  console.error('Erro no player:', error);
                  toast.error('Erro ao carregar vídeo');
                }}
                onReady={() => {
                  console.log('Player pronto');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Informações sobre o processo */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <CheckCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">🔄 Como funciona a conversão</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• <strong>Análise Automática:</strong> O sistema verifica compatibilidade de cada vídeo</li>
              <li>• <strong>Conversão Inteligente:</strong> Apenas vídeos que precisam são convertidos</li>
              <li>• <strong>Qualidade Otimizada:</strong> Escolha a qualidade ideal para seu plano</li>
              <li>• <strong>Formato Universal:</strong> Converte para MP4 com codec H.264</li>
              <li>• <strong>Economia de Espaço:</strong> Reduz tamanho mantendo qualidade</li>
              <li>• <strong>Streaming Ready:</strong> Vídeos ficam prontos para transmissão</li>
              <li>• <strong>Compatibilidade Total:</strong> Funciona em todos os dispositivos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversaoVideos;
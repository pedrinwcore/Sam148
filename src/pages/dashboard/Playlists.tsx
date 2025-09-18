import React, { useState, useEffect } from 'react';
import { ChevronLeft, Play, Trash2, Edit2, Save, X, Plus, List, Radio, Square, Activity, Users, Clock, Zap, Eye, ExternalLink, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import IFrameVideoPlayer from '../../components/IFrameVideoPlayer';

interface Video {
  id: number;
  nome: string;
  url: string;
  duracao?: number;
  tamanho?: number;
  bitrate_video?: number;
  formato_original?: string;
  is_mp4?: boolean;
  compativel?: string;
}

interface Playlist {
  id: number;
  nome: string;
  data_criacao: string;
  total_videos: number;
  duracao_total: number;
}

interface PlaylistVideo {
  videos: Video;
}

interface TransmissionStatus {
  is_live: boolean;
  stream_type?: 'playlist' | 'obs';
  transmission?: {
    id: number;
    titulo: string;
    codigo_playlist: number;
    stats: {
      viewers: number;
      bitrate: number;
      uptime: string;
      isActive: boolean;
    };
    platforms: any[];
  };
}

function SortableVideoItem({ video, onRemove }: { video: Video; onRemove: (id: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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

  const getCompatibilityIcon = () => {
    if (video.compativel === 'otimizado') {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    } else if (video.compativel === 'nao') {
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
    return <AlertCircle className="h-4 w-4 text-yellow-600" />;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg ${
        isDragging ? 'shadow-lg' : 'shadow-sm'
      }`}
    >
      <div className="flex items-center space-x-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <List className="h-5 w-5" />
        </div>
        
        <div className="flex items-center space-x-2">
          {getCompatibilityIcon()}
          <Play className="h-4 w-4 text-blue-600" />
        </div>
        
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 truncate">{video.nome}</h4>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span>{formatDuration(video.duracao || 0)}</span>
            {video.bitrate_video && <span>{video.bitrate_video} kbps</span>}
            {video.formato_original && (
              <span className={`px-2 py-1 rounded-full text-xs ${
                video.is_mp4 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {video.formato_original.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() => onRemove(video.id)}
        className="text-red-600 hover:text-red-800 p-1"
        title="Remover da playlist"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

const Playlists: React.FC = () => {
  const { getToken, user } = useAuth();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistVideos, setPlaylistVideos] = useState<Video[]>([]);
  const [availableVideos, setAvailableVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
  const [showEditPlaylistModal, setShowEditPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editPlaylistName, setEditPlaylistName] = useState('');
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [transmissionStatus, setTransmissionStatus] = useState<TransmissionStatus | null>(null);
  const [startingTransmission, setStartingTransmission] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const userLogin = user?.usuario || (user?.email ? user.email.split('@')[0] : `user_${user?.id || 'usuario'}`);

  useEffect(() => {
    loadPlaylists();
    loadFolders();
    checkTransmissionStatus();
    
    // Verificar status de transmissão a cada 30 segundos
    const interval = setInterval(checkTransmissionStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedPlaylist) {
      loadPlaylistVideos();
    }
  }, [selectedPlaylist]);

  useEffect(() => {
    if (selectedFolder) {
      loadAvailableVideos();
    }
  }, [selectedFolder]);

  const checkTransmissionStatus = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTransmissionStatus(data);
        
        // Se há transmissão ativa de playlist, configurar player
        if (data.is_live && data.stream_type === 'playlist' && data.transmission) {
          const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'http://samhost.wcore.com.br:3001'
            : 'http://localhost:3001';
          
          setPlayerUrl(`${baseUrl}/api/player-port/iframe?login=${userLogin}&playlist=${data.transmission.codigo_playlist}&player=1&contador=true&compartilhamento=true`);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status de transmissão:', error);
    }
  };

  const loadPlaylists = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/playlists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setPlaylists(data);
      
      if (data.length > 0 && !selectedPlaylist) {
        setSelectedPlaylist(data[0]);
      }
    } catch (error) {
      toast.error('Erro ao carregar playlists');
    }
  };

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

  const loadPlaylistVideos = async () => {
    if (!selectedPlaylist) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/playlists/${selectedPlaylist.id}/videos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: PlaylistVideo[] = await response.json();
      setPlaylistVideos(data.map(item => item.videos));
    } catch (error) {
      console.error('Erro ao carregar vídeos da playlist:', error);
      setPlaylistVideos([]);
    }
  };

  const loadAvailableVideos = async () => {
    if (!selectedFolder) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/videos?folder_id=${selectedFolder}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      
      // Filtrar apenas vídeos compatíveis (MP4 e dentro do limite de bitrate)
      const compatibleVideos = Array.isArray(data) ? data.filter((video: Video) => {
        // Verificar se é MP4
        const isMP4 = video.is_mp4 === true || video.formato_original?.toLowerCase() === 'mp4';
        
        // Verificar se bitrate está dentro do limite do usuário
        const userBitrateLimit = user?.bitrate || 2500;
        const videoBitrate = video.bitrate_video || 0;
        const bitrateOk = videoBitrate === 0 || videoBitrate <= userBitrateLimit;
        
        // Verificar status de compatibilidade
        const isCompatible = video.compativel === 'sim' || video.compativel === 'otimizado';
        
        return isMP4 && bitrateOk && isCompatible;
      }) : [];
      
      setAvailableVideos(compatibleVideos);
    } catch (error) {
      console.error('Erro ao carregar vídeos disponíveis:', error);
      setAvailableVideos([]);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) {
      toast.error('Nome da playlist é obrigatório');
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch('/api/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nome: newPlaylistName.trim() })
      });

      if (response.ok) {
        const newPlaylist = await response.json();
        toast.success('Playlist criada com sucesso!');
        setShowNewPlaylistModal(false);
        setNewPlaylistName('');
        loadPlaylists();
        setSelectedPlaylist(newPlaylist);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao criar playlist');
      }
    } catch (error) {
      console.error('Erro ao criar playlist:', error);
      toast.error('Erro ao criar playlist');
    }
  };

  const updatePlaylist = async () => {
    if (!editingPlaylist || !editPlaylistName.trim()) {
      toast.error('Nome da playlist é obrigatório');
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch(`/api/playlists/${editingPlaylist.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          nome: editPlaylistName.trim(),
          videos: playlistVideos.map((video, index) => ({ id: video.id, ordem: index }))
        })
      });

      if (response.ok) {
        toast.success('Playlist atualizada com sucesso!');
        setShowEditPlaylistModal(false);
        setEditingPlaylist(null);
        setEditPlaylistName('');
        loadPlaylists();
        
        // Atualizar playlist selecionada
        if (selectedPlaylist?.id === editingPlaylist.id) {
          setSelectedPlaylist(prev => prev ? { ...prev, nome: editPlaylistName.trim() } : null);
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao atualizar playlist');
      }
    } catch (error) {
      console.error('Erro ao atualizar playlist:', error);
      toast.error('Erro ao atualizar playlist');
    }
  };

  const deletePlaylist = async (playlist: Playlist) => {
    if (!confirm(`Deseja realmente excluir a playlist "${playlist.nome}"?`)) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/playlists/${playlist.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Playlist excluída com sucesso!');
        loadPlaylists();
        
        if (selectedPlaylist?.id === playlist.id) {
          setSelectedPlaylist(null);
          setPlaylistVideos([]);
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao excluir playlist');
      }
    } catch (error) {
      console.error('Erro ao excluir playlist:', error);
      toast.error('Erro ao excluir playlist');
    }
  };

  const addVideoToPlaylist = (video: Video) => {
    if (playlistVideos.find(v => v.id === video.id)) {
      toast.warning('Vídeo já está na playlist');
      return;
    }

    setPlaylistVideos(prev => [...prev, video]);
  };

  const removeVideoFromPlaylist = (videoId: number) => {
    setPlaylistVideos(prev => prev.filter(v => v.id !== videoId));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPlaylistVideos(prev => {
        const oldIndex = prev.findIndex(video => video.id === active.id);
        const newIndex = prev.findIndex(video => video.id === over.id);

        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const savePlaylist = async () => {
    if (!selectedPlaylist) {
      toast.error('Selecione uma playlist');
      return;
    }

    if (playlistVideos.length === 0) {
      toast.error('Adicione pelo menos um vídeo à playlist');
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/playlists/${selectedPlaylist.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          videos: playlistVideos.map((video, index) => ({ id: video.id, ordem: index }))
        })
      });

      if (response.ok) {
        toast.success('Playlist salva com sucesso!');
        loadPlaylists();
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || 'Erro ao salvar playlist');
      }
    } catch (error) {
      console.error('Erro ao salvar playlist:', error);
      toast.error('Erro ao salvar playlist');
    } finally {
      setLoading(false);
    }
  };

  // NOVA FUNCIONALIDADE: Iniciar transmissão da playlist
  const startPlaylistTransmission = async () => {
    if (!selectedPlaylist) {
      toast.error('Selecione uma playlist');
      return;
    }

    if (playlistVideos.length === 0) {
      toast.error('A playlist deve ter pelo menos um vídeo');
      return;
    }

    // Verificar se já há transmissão ativa
    if (transmissionStatus?.is_live) {
      if (!confirm('Já existe uma transmissão ativa. Deseja finalizar e iniciar esta playlist?')) {
        return;
      }
      
      // Finalizar transmissão atual primeiro
      try {
        const token = await getToken();
        await fetch('/api/streaming/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            transmission_id: transmissionStatus.transmission?.id,
            stream_type: transmissionStatus.stream_type || 'playlist'
          })
        });
        
        // Aguardar um pouco antes de iniciar nova transmissão
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Erro ao finalizar transmissão atual:', error);
        toast.error('Erro ao finalizar transmissão atual');
        return;
      }
    }

    setStartingTransmission(true);
    try {
      const token = await getToken();
      
      // Primeiro salvar a playlist atual
      await savePlaylist();
      
      // Aguardar salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Iniciar transmissão da playlist
      const response = await fetch('/api/streaming/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          titulo: `Transmissão: ${selectedPlaylist.nome}`,
          descricao: `Playlist ${selectedPlaylist.nome} com ${playlistVideos.length} vídeos`,
          playlist_id: selectedPlaylist.id,
          platform_ids: [], // Sem plataformas externas por padrão
          enable_recording: false,
          use_smil: true,
          loop_playlist: true // Repetir playlist automaticamente
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Transmissão da playlist "${selectedPlaylist.nome}" iniciada com sucesso!`);
        
        // Configurar URL do player
        const baseUrl = process.env.NODE_ENV === 'production' 
          ? 'http://samhost.wcore.com.br:3001'
          : 'http://localhost:3001';
        
        setPlayerUrl(`${baseUrl}/api/player-port/iframe?login=${userLogin}&playlist=${selectedPlaylist.id}&player=1&contador=true&compartilhamento=true`);
        setShowPlayerModal(true);
        
        // Atualizar status
        checkTransmissionStatus();
        
        // Mostrar informações da transmissão
        if (result.player_urls) {
          console.log('🎬 URLs do player:', result.player_urls);
        }
      } else {
        toast.error(result.error || 'Erro ao iniciar transmissão da playlist');
      }
    } catch (error) {
      console.error('Erro ao iniciar transmissão:', error);
      toast.error('Erro ao iniciar transmissão da playlist');
    } finally {
      setStartingTransmission(false);
    }
  };

  const stopPlaylistTransmission = async () => {
    if (!transmissionStatus?.transmission?.id) {
      toast.error('Nenhuma transmissão ativa encontrada');
      return;
    }

    if (!confirm('Deseja finalizar a transmissão da playlist?')) return;

    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          transmission_id: transmissionStatus.transmission.id,
          stream_type: 'playlist'
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Transmissão finalizada com sucesso!');
        setShowPlayerModal(false);
        setPlayerUrl('');
        checkTransmissionStatus();
      } else {
        toast.error(result.error || 'Erro ao finalizar transmissão');
      }
    } catch (error) {
      console.error('Erro ao finalizar transmissão:', error);
      toast.error('Erro ao finalizar transmissão');
    }
  };

  const shufflePlaylist = () => {
    setPlaylistVideos(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
    toast.success('Playlist embaralhada!');
  };

  const getTotalDuration = () => {
    return playlistVideos.reduce((total, video) => total + (video.duracao || 0), 0);
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const openVideoInNewTab = (video: Video) => {
    if (!video.url) {
      toast.error('URL do vídeo não disponível');
      return;
    }

    // Construir URL do player externo usando domínio do Wowza
    const cleanPath = video.url.replace(/^\/+/, '').replace(/^(content\/|streaming\/)?/, '');
    const pathParts = cleanPath.split('/');
    
    if (pathParts.length >= 3) {
      const userLogin = pathParts[0];
      const folderName = pathParts[1];
      const fileName = pathParts[2];
      const finalFileName = fileName.endsWith('.mp4') ? fileName : fileName.replace(/\.[^/.]+$/, '.mp4');
      
      // SEMPRE usar domínio do Wowza
      const domain = 'stmv1.udicast.com';
      const externalUrl = `https://${domain}:1443/play.php?login=${userLogin}&video=${folderName}/${finalFileName}`;
      
      window.open(externalUrl, '_blank');
    } else {
      toast.error('Não foi possível construir URL do vídeo');
    }
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
        <List className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Playlists</h1>
      </div>

      {/* Status da Transmissão Ativa */}
      {transmissionStatus?.is_live && transmissionStatus.stream_type === 'playlist' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
              <h2 className="text-lg font-semibold text-green-800">PLAYLIST EM TRANSMISSÃO</h2>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowPlayerModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
              >
                <Eye className="h-4 w-4 mr-2" />
                Visualizar
              </button>
              <button
                onClick={stopPlaylistTransmission}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center"
              >
                <Square className="h-4 w-4 mr-2" />
                Finalizar
              </button>
            </div>
          </div>

          {transmissionStatus.transmission && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-md">
                <div className="flex items-center">
                  <Users className="h-5 w-5 text-blue-600 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Espectadores</p>
                    <p className="text-xl font-bold">{transmissionStatus.transmission.stats.viewers || 0}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-md">
                <div className="flex items-center">
                  <Zap className="h-5 w-5 text-green-600 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Bitrate</p>
                    <p className="text-xl font-bold">{transmissionStatus.transmission.stats.bitrate || 0} kbps</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-md">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-purple-600 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Tempo Ativo</p>
                    <p className="text-xl font-bold">{transmissionStatus.transmission.stats.uptime || '00:00:00'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-md">
                <div className="flex items-center">
                  <Activity className="h-5 w-5 text-orange-600 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className="text-xl font-bold text-green-600">AO VIVO</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 p-3 bg-green-100 rounded-md">
            <p className="text-green-800 text-sm">
              <strong>📺 URL de Transmissão:</strong> https://stmv1.udicast.com:1935/{userLogin}/{userLogin}/playlist.m3u8
            </p>
          </div>
        </div>
      )}

      {/* Lista de Playlists */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Playlists</h2>
          <button
            onClick={() => setShowNewPlaylistModal(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova Playlist
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedPlaylist?.id === playlist.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedPlaylist(playlist)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <List className="h-5 w-5 text-blue-600" />
                  <h3 className="font-medium text-gray-900 truncate">{playlist.nome}</h3>
                </div>
                
                <div className="flex items-center space-x-1">
                  {/* Indicador se playlist está em transmissão */}
                  {transmissionStatus?.is_live && 
                   transmissionStatus.stream_type === 'playlist' && 
                   transmissionStatus.transmission?.codigo_playlist === playlist.id && (
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Em transmissão"></div>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingPlaylist(playlist);
                      setEditPlaylistName(playlist.nome);
                      setShowEditPlaylistModal(true);
                    }}
                    className="text-blue-600 hover:text-blue-800 p-1"
                    title="Editar playlist"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(playlist);
                    }}
                    className="text-red-600 hover:text-red-800 p-1"
                    title="Excluir playlist"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Vídeos:</span>
                  <span>{playlist.total_videos || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duração:</span>
                  <span>{formatDuration(playlist.duracao_total || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Criada em:</span>
                  <span>{new Date(playlist.data_criacao).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Botão de transmitir playlist */}
              {selectedPlaylist?.id === playlist.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  {transmissionStatus?.is_live && 
                   transmissionStatus.stream_type === 'playlist' && 
                   transmissionStatus.transmission?.codigo_playlist === playlist.id ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPlayerModal(true);
                      }}
                      className="w-full bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 flex items-center justify-center text-sm"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Visualizar Transmissão
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startPlaylistTransmission();
                      }}
                      disabled={startingTransmission || playlist.total_videos === 0}
                      className="w-full bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center text-sm"
                    >
                      <Radio className="h-4 w-4 mr-2" />
                      {startingTransmission ? 'Iniciando...' : 'Transmitir Playlist'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Editor de Playlist */}
      {selectedPlaylist && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Vídeos Disponíveis */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Vídeos Disponíveis</h3>
              <div className="flex items-center space-x-2">
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Selecione uma pasta</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.nome}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadAvailableVideos}
                  className="text-primary-600 hover:text-primary-800"
                  title="Atualizar lista"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {availableVideos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {selectedFolder ? 'Nenhum vídeo compatível encontrado nesta pasta' : 'Selecione uma pasta'}
                </p>
              ) : (
                availableVideos.map((video) => (
                  <div
                    key={video.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <Play className="h-4 w-4 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 truncate">{video.nome}</h4>
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <span>{formatDuration(video.duracao || 0)}</span>
                          {video.bitrate_video && <span>{video.bitrate_video} kbps</span>}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => openVideoInNewTab(video)}
                        className="text-green-600 hover:text-green-800 p-1"
                        title="Visualizar vídeo"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => addVideoToPlaylist(video)}
                        className="text-primary-600 hover:text-primary-800 p-1"
                        title="Adicionar à playlist"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Playlist Atual */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Playlist: {selectedPlaylist.nome}
              </h3>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{playlistVideos.length} vídeos</span>
                <span>•</span>
                <span>{formatDuration(getTotalDuration())}</span>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={playlistVideos.map(video => video.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {playlistVideos.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <List className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>Playlist vazia</p>
                      <p className="text-sm">Adicione vídeos da lista ao lado</p>
                    </div>
                  ) : (
                    playlistVideos.map((video) => (
                      <SortableVideoItem
                        key={video.id}
                        video={video}
                        onRemove={removeVideoFromPlaylist}
                      />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {/* Controles da Playlist */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={savePlaylist}
                disabled={loading || playlistVideos.length === 0}
                className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Salvando...' : 'Salvar Playlist'}
              </button>

              <button
                onClick={shufflePlaylist}
                disabled={playlistVideos.length < 2}
                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Embaralhar
              </button>

              {/* NOVO: Botão para iniciar transmissão da playlist */}
              {transmissionStatus?.is_live && 
               transmissionStatus.stream_type === 'playlist' && 
               transmissionStatus.transmission?.codigo_playlist === selectedPlaylist.id ? (
                <button
                  onClick={stopPlaylistTransmission}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Finalizar Transmissão
                </button>
              ) : (
                <button
                  onClick={startPlaylistTransmission}
                  disabled={startingTransmission || playlistVideos.length === 0 || transmissionStatus?.is_live}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center"
                >
                  <Radio className="h-4 w-4 mr-2" />
                  {startingTransmission ? 'Iniciando...' : 'Transmitir Playlist'}
                </button>
              )}

              <button
                onClick={() => navigate(`/dashboard/agendamentos?playlist=${selectedPlaylist.id}`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center"
              >
                <Clock className="h-4 w-4 mr-2" />
                Agendar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Playlist */}
      {showNewPlaylistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Nova Playlist</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da playlist:
              </label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Digite o nome da playlist"
                onKeyPress={(e) => e.key === 'Enter' && createPlaylist()}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNewPlaylistModal(false);
                  setNewPlaylistName('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={createPlaylist}
                disabled={!newPlaylistName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                Criar Playlist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Playlist */}
      {showEditPlaylistModal && editingPlaylist && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Editar Playlist</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome da playlist:
              </label>
              <input
                type="text"
                value={editPlaylistName}
                onChange={(e) => setEditPlaylistName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Digite o novo nome da playlist"
                onKeyPress={(e) => e.key === 'Enter' && updatePlaylist()}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEditPlaylistModal(false);
                  setEditingPlaylist(null);
                  setEditPlaylistName('');
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={updatePlaylist}
                disabled={!editPlaylistName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Player */}
      {showPlayerModal && playerUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-lg relative max-w-6xl w-full h-[80vh]">
            {/* Controles do Modal */}
            <div className="absolute top-4 right-4 z-20 flex items-center space-x-2">
              <button
                onClick={() => window.open(playerUrl, '_blank')}
                className="text-white bg-blue-600 hover:bg-blue-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title="Abrir em nova aba"
              >
                <ExternalLink size={20} />
              </button>
              
              <button
                onClick={() => setShowPlayerModal(false)}
                className="text-white bg-red-600 hover:bg-red-700 rounded-full p-3 transition-colors duration-200 shadow-lg"
                title="Fechar player"
              >
                <X size={20} />
              </button>
            </div>

            {/* Título da Transmissão */}
            <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-60 text-white px-4 py-2 rounded-lg">
              <h3 className="font-medium">📺 Transmissão: {selectedPlaylist.nome}</h3>
              <p className="text-xs opacity-80">
                {playlistVideos.length} vídeos • {formatDuration(getTotalDuration())} • 
                URL: http://stmv1.udicast.com:1935/samhost/smil:playlists_agendamentos.smil/playlist.m3u8
              </p>
            </div>

            {/* Player */}
            <div className="w-full h-full p-4 pt-16">
              <IFrameVideoPlayer
                src={playerUrl}
                title={`Transmissão: ${selectedPlaylist.nome}`}
                isLive={true}
                autoplay={true}
                controls={true}
                className="w-full h-full"
                onError={(error) => {
                  console.error('Erro no player de playlist:', error);
                  toast.error('Erro ao carregar transmissão da playlist');
                }}
                onReady={() => {
                  console.log('Player de playlist pronto');
                }}
                streamStats={transmissionStatus?.transmission ? {
                  viewers: transmissionStatus.transmission.stats.viewers,
                  bitrate: transmissionStatus.transmission.stats.bitrate,
                  uptime: transmissionStatus.transmission.stats.uptime,
                  quality: '1080p',
                  isRecording: false
                } : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {/* Como utilizar Playlists */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">📺 Como criar e usar Playlists</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• <strong>Criar Playlist:</strong> Clique em "Nova Playlist" e dê um nome</li>
              <li>• <strong>Adicionar Vídeos:</strong> Selecione uma pasta e clique no "+" ao lado dos vídeos</li>
              <li>• <strong>Organizar:</strong> Arraste os vídeos para mudar a ordem de reprodução</li>
              <li>• <strong>Vídeos Compatíveis:</strong> Apenas vídeos MP4 otimizados aparecem na lista</li>
              <li>• <strong>Salvar:</strong> Sempre salve a playlist antes de transmitir</li>
              <li>• <strong>Transmitir:</strong> Use "Transmitir Playlist" para ir ao vivo</li>
              <li>• <strong>Agendar:</strong> Programe transmissões futuras com o botão "Agendar"</li>
              <li>• <strong>Monitorar:</strong> Acompanhe espectadores e estatísticas em tempo real</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Aviso sobre vídeos compatíveis */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-yellow-900 font-medium mb-2">⚠️ Vídeos Compatíveis</h3>
            <p className="text-yellow-800 text-sm">
              Apenas vídeos <strong>MP4 otimizados</strong> e com <strong>bitrate dentro do seu plano</strong> podem ser adicionados às playlists. 
              Se um vídeo não aparece na lista, verifique se ele foi convertido corretamente na seção "Conversão de Vídeos".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Playlists;
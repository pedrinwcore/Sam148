import React, { useState, useEffect } from 'react';
import { ChevronLeft, Radio, Play, Square, Settings, AlertCircle, CheckCircle, Activity, Users, Zap, Clock, RefreshCw, Trash2, Calendar, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';
import IFrameVideoPlayer from '../../components/IFrameVideoPlayer';

interface Platform {
  id: string;
  nome: string;
  rtmp_base_url: string;
  requer_stream_key: boolean;
  supports_https?: boolean;
  special_config?: string;
}

interface Live {
  id: number;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  servidor_stm: string;
  servidor_live: string;
  status: string;
  data_inicio_formatted: string;
  data_fim_formatted: string;
  duracao: string;
  status_text: string;
  platform_name: string;
}

interface SourceUrls {
  http_m3u8: string;
  rtmp: string;
  recommended: string;
}

interface TransmissionForm {
  tipo: string;
  servidor_rtmp: string;
  servidor_rtmp_chave: string;
  servidor_stm: string;
  data_inicio: string;
  data_fim: string;
  inicio_imediato: boolean;
}

const IniciarTransmissao: React.FC = () => {
  const { getToken, user } = useAuth();
  
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [lives, setLives] = useState<Live[]>([]);
  const [sourceUrls, setSourceUrls] = useState<SourceUrls | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [currentPlayerUrl, setCurrentPlayerUrl] = useState('');

  const [formData, setFormData] = useState<TransmissionForm>({
    tipo: 'youtube',
    servidor_rtmp: 'rtmp://a.rtmp.youtube.com/live2/',
    servidor_rtmp_chave: '',
    servidor_stm: '',
    data_inicio: '',
    data_fim: '',
    inicio_imediato: true
  });

  const userLogin = user?.usuario || (user?.email ? user.email.split('@')[0] : `user_${user?.id || 'usuario'}`);

  useEffect(() => {
    loadInitialData();
    
    // Atualizar lista de lives a cada 30 segundos
    const interval = setInterval(loadLives, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Atualizar servidor STM quando sourceUrls carregarem
    if (sourceUrls && !formData.servidor_stm) {
      setFormData(prev => ({
        ...prev,
        servidor_stm: sourceUrls.http_m3u8
      }));
    }
  }, [sourceUrls]);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        loadPlatforms(),
        loadSourceUrls(),
        loadLives()
      ]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const loadPlatforms = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/platforms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setPlatforms(data.platforms);
      }
    } catch (error) {
      console.error('Erro ao carregar plataformas:', error);
    }
  };

  const loadSourceUrls = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/source-urls', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setSourceUrls(data.source_urls);
      }
    } catch (error) {
      console.error('Erro ao carregar URLs de fonte:', error);
    }
  };

  const loadLives = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/lives', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setLives(data.lives);
        
        // Se há transmissão ativa, configurar player
        const activeLive = data.lives.find((live: Live) => live.status === '1');
        if (activeLive && sourceUrls) {
          const baseUrl = process.env.NODE_ENV === 'production' 
            ? 'http://samhost.wcore.com.br:3001'
            : 'http://localhost:3001';
          
          setCurrentPlayerUrl(`${baseUrl}/api/player-port/iframe?login=${userLogin}&stream=${userLogin}_live&player=1&contador=true`);
          setShowPlayer(true);
        } else {
          setShowPlayer(false);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar transmissões:', error);
    }
  };

  const handlePlatformChange = (tipo: string) => {
    const platform = platforms.find(p => p.id === tipo);
    if (platform) {
      setFormData(prev => ({
        ...prev,
        tipo,
        servidor_rtmp: platform.rtmp_base_url
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.servidor_rtmp || !formData.servidor_rtmp_chave || !formData.data_fim) {
      toast.error('Servidor RTMP, chave e data fim são obrigatórios');
      return;
    }

    // Validar data fim (máximo 24 horas)
    if (formData.data_fim) {
      const dataFim = new Date(formData.data_fim);
      const agora = new Date();
      const diffHoras = (dataFim.getTime() - agora.getTime()) / (1000 * 60 * 60);
      
      if (diffHoras > 24) {
        toast.error('Tempo máximo de transmissão é 24 horas');
        return;
      }
    }

    setLoading(true);
    try {
      const token = await getToken();
      
      // Converter datas para formato brasileiro (dd/mm/yyyy HH:mm)
      const dataInicioFormatted = formData.data_inicio ? 
        new Date(formData.data_inicio).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).replace(',', '') : '';
      
      const dataFimFormatted = new Date(formData.data_fim).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric', 
        hour: '2-digit',
        minute: '2-digit'
      }).replace(',', '');

      const response = await fetch('/api/streaming/start-live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          data_inicio: dataInicioFormatted,
          data_fim: dataFimFormatted,
          inicio_imediato: formData.inicio_imediato ? 'sim' : 'nao'
        })
      });

      const result = await response.json();

      if (result.success) {
        if (formData.inicio_imediato) {
          toast.success('Live iniciada com sucesso!');
        } else {
          toast.success('Live agendada com sucesso!');
        }
        
        // Reset form
        setFormData(prev => ({
          ...prev,
          servidor_rtmp_chave: '',
          data_inicio: '',
          data_fim: ''
        }));
        
        // Recarregar lista
        loadLives();
      } else {
        toast.error(result.error || 'Erro ao iniciar transmissão');
        
        if (result.debug_info) {
          console.error('Debug info:', result.debug_info);
        }
      }
    } catch (error) {
      console.error('Erro ao iniciar transmissão:', error);
      toast.error('Erro ao iniciar transmissão');
    } finally {
      setLoading(false);
    }
  };

  const handleStopLive = async (liveId: number) => {
    if (!confirm('Deseja finalizar esta transmissão?')) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/streaming/stop-live/${liveId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        loadLives();
      } else {
        toast.error(result.error || 'Erro ao finalizar transmissão');
      }
    } catch (error) {
      console.error('Erro ao finalizar transmissão:', error);
      toast.error('Erro ao finalizar transmissão');
    }
  };

  const handleRemoveLive = async (liveId: number) => {
    if (!confirm('Deseja remover esta transmissão?')) return;

    try {
      const token = await getToken();
      const response = await fetch(`/api/streaming/remove-live/${liveId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        loadLives();
      } else {
        toast.error(result.error || 'Erro ao remover transmissão');
      }
    } catch (error) {
      console.error('Erro ao remover transmissão:', error);
      toast.error('Erro ao remover transmissão');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case '1': return <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />;
      case '2': return <div className="w-2 h-2 bg-yellow-500 rounded-full" />;
      case '3': return <div className="w-2 h-2 bg-red-600 rounded-full" />;
      default: return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case '1': return 'text-green-600';
      case '2': return 'text-yellow-600';
      case '3': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('pt-BR');
    } catch {
      return dateString;
    }
  };

  const activeLive = lives.find(live => live.status === '1');

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Link to="/dashboard" className="flex items-center text-primary-600 hover:text-primary-800">
          <ChevronLeft className="h-5 w-5 mr-1" />
          <span>Voltar ao Dashboard</span>
        </Link>
      </div>

      <div className="flex items-center space-x-3">
        <Radio className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Gerenciamento de Lives</h1>
      </div>

      {/* Aviso importante */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 text-yellow-600 mr-3 mt-0.5" />
          <div>
            <p className="text-yellow-800 text-sm">
              <strong>Importante:</strong> Não é necessário deixar esta página aberta. 
              Verifique o sinal no canal escolhido e inicie a transmissão no canal.
              Tempo máximo de transmissão é 24 horas.
            </p>
          </div>
        </div>
      </div>

      {/* Player da transmissão ativa */}
      {showPlayer && activeLive && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse mr-3"></div>
              <h2 className="text-lg font-semibold text-green-800">TRANSMISSÃO ATIVA</h2>
            </div>
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <Users className="h-4 w-4" />
                <span>{Math.floor(Math.random() * 50) + 10} espectadores</span>
              </div>
              <div className="flex items-center space-x-1">
                <Zap className="h-4 w-4" />
                <span>2500 kbps</span>
              </div>
              <div className="flex items-center space-x-1">
                <Clock className="h-4 w-4" />
                <span>{activeLive.duracao}</span>
              </div>
            </div>
          </div>
          
          <p className="text-green-800 mb-4">
            <strong>Plataforma:</strong> {activeLive.platform_name} • 
            <strong>Iniciado:</strong> {activeLive.data_inicio_formatted}
          </p>
          
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <IFrameVideoPlayer
              src={currentPlayerUrl}
              title={`Transmissão ${activeLive.platform_name}`}
              isLive={true}
              autoplay={false}
              controls={true}
              className="w-full h-full"
              onError={(error) => {
                console.error('Erro no player de transmissão:', error);
              }}
              onReady={() => {
                console.log('Player de transmissão pronto');
              }}
            />
          </div>
        </div>
      )}

      {/* Lista de Transmissões */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Lives</h2>
          <button
            onClick={loadLives}
            className="text-primary-600 hover:text-primary-800 flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Atualizar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Live</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Início</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Fim</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Duração</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Status</th>
                <th className="text-center py-3 px-4 font-medium text-gray-700 border-b border-gray-200">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lives.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    Nenhuma transmissão encontrada
                  </td>
                </tr>
              ) : (
                lives.map((live) => (
                  <tr key={live.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 border-b border-gray-200">
                      <div className="flex items-center space-x-2">
                        {getStatusIcon(live.status)}
                        <span className="font-medium">{live.platform_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-b border-gray-200">
                      {live.data_inicio_formatted}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-b border-gray-200">
                      {live.data_fim_formatted}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 border-b border-gray-200">
                      {live.duracao}
                    </td>
                    <td className="py-3 px-4 border-b border-gray-200">
                      <span className={`text-sm font-medium ${getStatusColor(live.status)}`}>
                        {live.status_text}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center border-b border-gray-200">
                      <div className="flex justify-center space-x-2">
                        {live.status === '1' && (
                          <button
                            onClick={() => handleStopLive(live.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Finalizar transmissão"
                          >
                            <Square className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveLive(live.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remover transmissão"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulário de Nova Transmissão */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-6">Cadastrar Live</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 mb-2">
                Plataforma *
              </label>
              <select
                id="tipo"
                value={formData.tipo}
                onChange={(e) => handlePlatformChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                disabled={loading}
              >
                {platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="servidor_stm" className="block text-sm font-medium text-gray-700 mb-2">
                Source (Fonte) *
              </label>
              <select
                id="servidor_stm"
                value={formData.servidor_stm}
                onChange={(e) => setFormData(prev => ({ ...prev, servidor_stm: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                disabled={loading}
              >
                {sourceUrls && (
                  <>
                    <option value={sourceUrls.http_m3u8}>HTTP/M3U8</option>
                    <option value={sourceUrls.rtmp}>RTMP</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="servidor_rtmp" className="block text-sm font-medium text-gray-700 mb-2">
                Servidor RTMP *
              </label>
              <input
                id="servidor_rtmp"
                type="text"
                value={formData.servidor_rtmp}
                onChange={(e) => setFormData(prev => ({ ...prev, servidor_rtmp: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="rtmp://servidor.com/live/"
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="servidor_rtmp_chave" className="block text-sm font-medium text-gray-700 mb-2">
                Chave/Stream Key *
              </label>
              <input
                id="servidor_rtmp_chave"
                type="text"
                value={formData.servidor_rtmp_chave}
                onChange={(e) => setFormData(prev => ({ ...prev, servidor_rtmp_chave: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                placeholder="Cole aqui a stream key da plataforma"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="data_inicio" className="block text-sm font-medium text-gray-700 mb-2">
                Data de Início
              </label>
              <input
                id="data_inicio"
                type="datetime-local"
                value={formData.data_inicio}
                onChange={(e) => setFormData(prev => ({ ...prev, data_inicio: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                disabled={loading || formData.inicio_imediato}
              />
            </div>

            <div>
              <label htmlFor="data_fim" className="block text-sm font-medium text-gray-700 mb-2">
                Data de Fim *
              </label>
              <input
                id="data_fim"
                type="datetime-local"
                value={formData.data_fim}
                onChange={(e) => setFormData(prev => ({ ...prev, data_fim: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="inicio_imediato"
              type="checkbox"
              checked={formData.inicio_imediato}
              onChange={(e) => setFormData(prev => ({ ...prev, inicio_imediato: e.target.checked }))}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              disabled={loading}
            />
            <label htmlFor="inicio_imediato" className="ml-3 text-sm text-gray-700">
              Iniciar Agora (marque esta opção para iniciar a live agora mesmo, não é necessário informar uma data de início, somente a data de fim)
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !formData.servidor_rtmp || !formData.servidor_rtmp_chave || !formData.data_fim}
              className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-lg font-medium"
            >
              <Play className="h-6 w-6 mr-3" />
              {loading ? 'Processando...' : 'Cadastrar Live'}
            </button>
          </div>
        </form>
      </div>

      {/* Como utilizar Lives */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <div className="flex items-start">
          <CheckCircle className="h-5 w-5 text-blue-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-blue-900 font-medium mb-2">📡 Como fazer transmissões ao vivo</h3>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• <strong>Escolher Plataforma:</strong> Selecione YouTube, Facebook, Twitch ou outra</li>
              <li>• <strong>Obter Stream Key:</strong> Copie a chave de transmissão da plataforma escolhida</li>
              <li>• <strong>Configurar Horário:</strong> Defina quando a transmissão deve terminar</li>
              <li>• <strong>Início Imediato:</strong> Marque para começar agora mesmo</li>
              <li>• <strong>Monitorar:</strong> Acompanhe o status na lista de transmissões</li>
              <li>• <strong>Finalizar:</strong> Use o botão "Finalizar" quando quiser parar</li>
              <li>• <strong>Múltiplas Plataformas:</strong> Pode transmitir para várias ao mesmo tempo</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IniciarTransmissao;
import React, { useState } from 'react';
import { ChevronLeft, Copy, Server, Eye, EyeOff, Radio, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../../context/AuthContext';

const DadosConexao: React.FC = () => {
  const { user } = useAuth();
  const [showFtpPassword, setShowFtpPassword] = useState(false);

  const userLogin = user?.usuario || (user?.email ? user.email.split('@')[0] : `user_${user?.id || 'usuario'}`);

  // Dados de conexão FTP
  const ftpData = {
    servidor: 'stmv1.udicast.com',
    usuario: userLogin,
    senha: 'Adr1an@2024!',
    porta: '21'
  };

  // Dados de streaming Wowza / FMS
  const fmsData = {
    servidor: 'stmv1.udicast.com',
    porta: '1935',
    aplicacao: 'samhost',
    rtmpUrl: `rtmp://stmv1.udicast.com:1935/samhost/${userLogin}_live`,
    usuario: userLogin,
    streamKey: `${userLogin}_live`,
    hlsUrl: `http://stmv1.udicast.com:80/samhost/${userLogin}_live/playlist.m3u8`,
    hlsSecureUrl: `https://stmv1.udicast.com:443/samhost/${userLogin}_live/playlist.m3u8`,
    dashUrl: `http://stmv1.udicast.com:80/samhost/${userLogin}_live/manifest.mpd`,
    rtspUrl: `rtsp://stmv1.udicast.com:554/samhost/${userLogin}_live`,

    // URLs SMIL (Playlists)
    smilHlsUrl: `http://stmv1.udicast.com:1935/samhost/smil:playlists_agendamentos.smil/playlist.m3u8`,
    smilHlsHttpUrl: `http://stmv1.udicast.com/samhost/smil:playlists_agendamentos.smil/playlist.m3u8`,
    smilRtmpUrl: `rtmp://stmv1.udicast.com:1935/samhost/smil:playlists_agendamentos.smil`,
    smilRtspUrl: `rtsp://stmv1.udicast.com:554/samhost/smil:playlists_agendamentos.smil`,
    smilDashUrl: `http://stmv1.udicast.com:1935/samhost/smil:playlists_agendamentos.smil/manifest.mpd`
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência!`);
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
        <Server className="h-8 w-8 text-primary-600" />
        <h1 className="text-3xl font-bold text-gray-900">Dados de Conexão</h1>
      </div>

      {/* Dados de Conexão FTP */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Server className="h-6 w-6 text-purple-600" />
          <h2 className="text-xl font-semibold text-gray-800">Dados de Conexão FTP</h2>
        </div>

        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <td className="w-40 h-8 px-3 py-2 text-left font-medium text-gray-700 bg-gray-100">Servidor/Server/Host</td>
                <td className="px-3 py-2 text-left">
                  <div className="flex items-center">
                    <span className="text-gray-900 font-mono text-sm">{ftpData.servidor}</span>
                    <button
                      className="ml-2 text-primary-600 hover:text-primary-800"
                      onClick={() => copyToClipboard(ftpData.servidor, 'Servidor FTP')}
                      title="Copiar/Copy"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr className="border-b border-gray-200">
                <td className="w-40 h-8 px-3 py-2 text-left font-medium text-gray-700 bg-gray-100">Usuário</td>
                <td className="px-3 py-2 text-left">
                  <div className="flex items-center">
                    <span className="text-gray-900 font-mono text-sm">{ftpData.usuario}</span>
                    <button
                      className="ml-2 text-primary-600 hover:text-primary-800"
                      onClick={() => copyToClipboard(ftpData.usuario, 'Usuário FTP')}
                      title="Copiar/Copy"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr className="border-b border-gray-200">
                <td className="w-40 h-8 px-3 py-2 text-left font-medium text-gray-700 bg-gray-100">Senha</td>
                <td className="px-3 py-2 text-left">
                  <div className="flex items-center">
                    <div className="relative">
                      <span className="text-gray-900 font-mono text-sm mr-2">{showFtpPassword ? ftpData.senha : '••••••••••••'}</span>
                      <button
                        onClick={() => setShowFtpPassword(!showFtpPassword)}
                        className="text-gray-400 hover:text-gray-600 mr-2"
                        title={showFtpPassword ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showFtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      className="text-primary-600 hover:text-primary-800"
                      onClick={() => copyToClipboard(ftpData.senha, 'Senha FTP')}
                      title="Copiar/Copy"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>

              <tr>
                <td className="w-40 h-8 px-3 py-2 text-left font-medium text-gray-700 bg-gray-100">Porta FTP</td>
                <td className="px-3 py-2 text-left">
                  <span className="text-gray-900 font-mono text-sm">{ftpData.porta}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Informações de Ajuda */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-start">
          <CheckCircle className="h-5 w-5 text-green-600 mr-3 mt-0.5" />
          <div>
            <h3 className="text-green-900 font-medium mb-2">💡 Como usar os dados de conexão</h3>
            <ul className="text-green-800 text-sm space-y-1">
              <li>• <strong>Dados FTP:</strong> Use para conectar softwares como FileZilla ou WinSCP</li>
              <li>• <strong>Upload de vídeos:</strong> Envie seus arquivos diretamente para o servidor</li>
              <li>• <strong>Organização:</strong> Crie pastas para organizar seu conteúdo</li>
              <li>• <strong>Formatos aceitos:</strong> MP4, AVI, MOV, WMV, FLV, WebM, MKV</li>
              <li>• <strong>Tamanho máximo:</strong> Limitado pelo espaço do seu plano</li>
              <li>• <strong>Conversão automática:</strong> Vídeos são otimizados automaticamente</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DadosConexao;

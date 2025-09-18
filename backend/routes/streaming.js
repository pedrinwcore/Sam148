const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const SSHManager = require('../config/SSHManager');
const { spawn } = require('child_process');

const router = express.Router();

// Mapa de processos ativos de transmissão
const activeTransmissions = new Map();

// Plataformas disponíveis com URLs RTMP corretas
const platforms = [
  {
    id: 'youtube',
    nome: 'YouTube',
    rtmp_base_url: 'rtmp://a.rtmp.youtube.com/live2/',
    requer_stream_key: true,
    supports_https: false
  },
  {
    id: 'facebook',
    nome: 'Facebook',
    rtmp_base_url: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    requer_stream_key: true,
    supports_https: true
  },
  {
    id: 'twitch',
    nome: 'Twitch',
    rtmp_base_url: 'rtmp://live-dfw.twitch.tv/app/',
    requer_stream_key: true,
    supports_https: false
  },
  {
    id: 'periscope',
    nome: 'Periscope',
    rtmp_base_url: 'rtmp://ca.pscp.tv:80/x/',
    requer_stream_key: true,
    supports_https: false
  },
  {
    id: 'vimeo',
    nome: 'Vimeo',
    rtmp_base_url: 'rtmp://rtmp.cloud.vimeo.com/live/',
    requer_stream_key: true,
    supports_https: false
  },
  {
    id: 'steam',
    nome: 'Steam Valve',
    rtmp_base_url: 'rtmp://ingest-any-ord1.broadcast.steamcontent.com/app/',
    requer_stream_key: true,
    supports_https: false
  },
  {
    id: 'tiktok',
    nome: 'TikTok',
    rtmp_base_url: 'rtmp://live.tiktok.com/live/',
    requer_stream_key: true,
    supports_https: false,
    special_config: 'vertical_crop'
  },
  {
    id: 'kwai',
    nome: 'Kwai',
    rtmp_base_url: 'rtmp://live.kwai.com/live/',
    requer_stream_key: true,
    supports_https: false,
    special_config: 'vertical_crop'
  },
  {
    id: 'custom',
    nome: 'RTMP Próprio/Custom',
    rtmp_base_url: 'rtmp://...',
    requer_stream_key: true,
    supports_https: false
  }
];

// GET /api/streaming/platforms - Lista plataformas disponíveis
router.get('/platforms', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      platforms: platforms
    });
  } catch (error) {
    console.error('Erro ao buscar plataformas:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/streaming/lives - Lista transmissões do usuário
router.get('/lives', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.execute(
      `SELECT 
        codigo as id,
        data_inicio,
        data_fim,
        tipo,
        servidor_stm,
        servidor_live,
        status,
        DATE_FORMAT(data_inicio, '%d/%m/%Y %H:%i:%s') as data_inicio_formatted,
        DATE_FORMAT(data_fim, '%d/%m/%Y %H:%i:%s') as data_fim_formatted
       FROM lives 
       WHERE codigo_stm = ?
       ORDER BY data_inicio DESC`,
      [userId]
    );

    // Calcular duração e status para cada transmissão
    const lives = rows.map(live => {
      const now = new Date();
      const dataInicio = new Date(live.data_inicio);
      const dataFim = new Date(live.data_fim);
      
      let duracao = '0s';
      let statusText = 'Finalizado';
      
      if (live.status === '1') {
        // Transmitindo - calcular duração desde o início
        const diffMs = now.getTime() - dataInicio.getTime();
        duracao = formatDuration(Math.floor(diffMs / 1000));
        statusText = 'Transmitindo';
      } else if (live.status === '2') {
        duracao = '0s';
        statusText = 'Agendado';
      } else if (live.status === '3') {
        duracao = '0s';
        statusText = 'Erro';
      } else {
        // Finalizado - calcular duração total
        const diffMs = dataFim.getTime() - dataInicio.getTime();
        duracao = formatDuration(Math.floor(diffMs / 1000));
        statusText = 'Finalizado';
      }

      return {
        ...live,
        duracao,
        status_text: statusText,
        platform_name: platforms.find(p => p.id === live.tipo)?.nome || live.tipo
      };
    });

    res.json({
      success: true,
      lives: lives
    });
  } catch (error) {
    console.error('Erro ao buscar transmissões:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/streaming/start-live - Iniciar transmissão seguindo padrão PHP
router.post('/start-live', authMiddleware, async (req, res) => {
  try {
    const {
      tipo,
      servidor_rtmp,
      servidor_rtmp_chave,
      servidor_stm,
      data_inicio,
      data_fim,
      inicio_imediato
    } = req.body;

    const userId = req.user.id;
    const userLogin = req.user.usuario || (req.user.email ? req.user.email.split('@')[0] : `user_${userId}`);

    // Validações
    if (!servidor_rtmp || !servidor_rtmp_chave || !data_fim) {
      return res.status(400).json({
        success: false,
        error: 'Servidor RTMP, chave e data fim são obrigatórios'
      });
    }

    // Construir URL completa do servidor live
    const servidor_live = servidor_rtmp.endsWith('/') ? 
      `${servidor_rtmp}${servidor_rtmp_chave}` : 
      `${servidor_rtmp}/${servidor_rtmp_chave}`;

    // Converter datas do formato brasileiro para MySQL
    const dataInicioMySQL = data_inicio ? 
      data_inicio.replace(/(\d{2})\/(\d{2})\/(\d{4})\s(.*)/, '$3-$2-$1 $4') + ':00' : 
      new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const dataFimMySQL = data_fim.replace(/(\d{2})\/(\d{2})\/(\d{4})\s(.*)/, '$3-$2-$1 $4') + ':00';

    // Buscar dados do servidor
    const [serverRows] = await db.execute(
      'SELECT servidor_id FROM folders WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const serverId = serverRows.length > 0 ? serverRows[0].servidor_id : 1;

    // Inserir transmissão na tabela lives
    const [result] = await db.execute(
      `INSERT INTO lives (
        codigo_stm, data_inicio, data_fim, tipo, servidor_stm, servidor_live, status
      ) VALUES (?, ?, ?, ?, ?, ?, '2')`,
      [userId, dataInicioMySQL, dataFimMySQL, tipo, servidor_stm, servidor_live]
    );

    const codigoLive = result.insertId;

    // Se início imediato, iniciar transmissão agora
    if (inicio_imediato === 'sim') {
      try {
        console.log(`🚀 Iniciando transmissão imediata para ${userLogin} - Live ID: ${codigoLive}`);
        
        // Construir comando FFmpeg baseado no tipo de plataforma
        let ffmpegCommand;
        
        if (tipo === 'facebook') {
          // Facebook usa configuração especial
          ffmpegCommand = `/usr/local/bin/ffmpeg -re -i "${servidor_stm}" -c:v copy -c:a copy -bsf:a aac_adtstoasc -preset ultrafast -strict experimental -threads 1 -f flv "${servidor_live}"`;
        } else if (tipo === 'tiktok' || tipo === 'kwai') {
          // TikTok/Kwai usa crop vertical 9:16
          ffmpegCommand = `/usr/local/bin/ffmpeg -re -i "${servidor_stm}" -vf 'crop=ih*(9/16):ih' -crf 21 -r 24 -g 48 -b:v 3000000 -b:a 128k -ar 44100 -acodec aac -vcodec libx264 -preset ultrafast -bufsize '(6.000*3000000)/8' -maxrate 3500000 -threads 1 -f flv "${servidor_live}"`;
        } else {
          // Outras plataformas usam configuração padrão
          ffmpegCommand = `/usr/local/bin/ffmpeg -re -i "${servidor_stm}" -c:v copy -c:a copy -bsf:a aac_adtstoasc -preset ultrafast -strict experimental -threads 1 -f flv "${servidor_live}"`;
        }

        // Executar comando via SSH usando screen session
        const screenCommand = `screen -dmS ${userLogin}_${codigoLive} bash -c "${ffmpegCommand}; exec sh"`;
        
        console.log(`📋 Comando screen: ${screenCommand}`);
        
        await SSHManager.executeCommand(serverId, `echo OK; ${screenCommand}`);
        
        // Aguardar 5 segundos para processo inicializar
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Verificar se processo está rodando
        const checkCommand = `/bin/ps aux | /bin/grep ffmpeg | /bin/grep rtmp | /bin/grep ${userLogin} | /bin/grep ${tipo} | /usr/bin/wc -l`;
        const checkResult = await SSHManager.executeCommand(serverId, checkCommand);
        
        const processCount = parseInt(checkResult.stdout.trim()) || 0;
        
        if (processCount > 0) {
          // Transmissão iniciada com sucesso
          await db.execute(
            'UPDATE lives SET status = "1", data_inicio = NOW() WHERE codigo = ?',
            [codigoLive]
          );

          console.log(`✅ Transmissão iniciada com sucesso - Live ID: ${codigoLive}, Processos: ${processCount}`);

          res.json({
            success: true,
            message: 'Live iniciada com sucesso',
            live_id: codigoLive,
            status: 'transmitindo',
            processo_count: processCount,
            comando_executado: ffmpegCommand,
            screen_session: `${userLogin}_${codigoLive}`
          });
        } else {
          // Erro ao iniciar transmissão
          await db.execute(
            'UPDATE lives SET status = "3" WHERE codigo = ?',
            [codigoLive]
          );

          console.error(`❌ Erro ao iniciar transmissão - Live ID: ${codigoLive}, Processos encontrados: ${processCount}`);

          res.status(500).json({
            success: false,
            error: 'Erro ao iniciar live, tente novamente',
            debug_info: {
              live_id: codigoLive,
              processo_count: processCount,
              comando_executado: ffmpegCommand,
              check_command: checkCommand,
              check_result: checkResult.stdout
            }
          });
        }
      } catch (sshError) {
        console.error('Erro SSH ao iniciar transmissão:', sshError);
        
        // Marcar como erro no banco
        await db.execute(
          'UPDATE lives SET status = "3" WHERE codigo = ?',
          [codigoLive]
        );

        res.status(500).json({
          success: false,
          error: 'Erro ao conectar com servidor para iniciar transmissão',
          details: sshError.message
        });
      }
    } else {
      // Transmissão agendada
      res.json({
        success: true,
        message: 'Live agendada com sucesso',
        live_id: codigoLive,
        status: 'agendado'
      });
    }

  } catch (error) {
    console.error('Erro ao criar transmissão:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// POST /api/streaming/stop-live/:id - Finalizar transmissão
router.post('/stop-live/:id', authMiddleware, async (req, res) => {
  try {
    const liveId = req.params.id;
    const userId = req.user.id;
    const userLogin = req.user.usuario || (req.user.email ? req.user.email.split('@')[0] : `user_${userId}`);

    // Buscar dados da transmissão
    const [liveRows] = await db.execute(
      'SELECT * FROM lives WHERE codigo = ? AND codigo_stm = ?',
      [liveId, userId]
    );

    if (liveRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transmissão não encontrada'
      });
    }

    const live = liveRows[0];

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT servidor_id FROM folders WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const serverId = serverRows.length > 0 ? serverRows[0].servidor_id : 1;

    try {
      // Finalizar screen session via SSH
      const killCommand = `screen -ls | grep -o '[0-9]*\\.${userLogin}_${liveId}\\>' | xargs -I{} screen -X -S {} quit`;
      
      console.log(`🛑 Finalizando transmissão: ${killCommand}`);
      
      await SSHManager.executeCommand(serverId, `echo OK; ${killCommand}`);
      
      // Atualizar status no banco
      await db.execute(
        'UPDATE lives SET status = "0", data_fim = NOW() WHERE codigo = ?',
        [liveId]
      );

      // Remover do mapa de transmissões ativas
      activeTransmissions.delete(`${userId}_${liveId}`);

      console.log(`✅ Transmissão finalizada - Live ID: ${liveId}`);

      res.json({
        success: true,
        message: `Live finalizada com sucesso. Agora você deve finalizar a transmissão na sua conta do ${live.tipo}`,
        live_id: liveId,
        platform: live.tipo
      });

    } catch (sshError) {
      console.error('Erro SSH ao finalizar transmissão:', sshError);
      res.status(500).json({
        success: false,
        error: 'Erro ao finalizar transmissão no servidor',
        details: sshError.message
      });
    }

  } catch (error) {
    console.error('Erro ao finalizar transmissão:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// DELETE /api/streaming/remove-live/:id - Remover transmissão
router.delete('/remove-live/:id', authMiddleware, async (req, res) => {
  try {
    const liveId = req.params.id;
    const userId = req.user.id;
    const userLogin = req.user.usuario || (req.user.email ? req.user.email.split('@')[0] : `user_${userId}`);

    // Buscar dados da transmissão
    const [liveRows] = await db.execute(
      'SELECT * FROM lives WHERE codigo = ? AND codigo_stm = ?',
      [liveId, userId]
    );

    if (liveRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Transmissão não encontrada'
      });
    }

    const live = liveRows[0];

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT servidor_id FROM folders WHERE user_id = ? LIMIT 1',
      [userId]
    );
    const serverId = serverRows.length > 0 ? serverRows[0].servidor_id : 1;

    try {
      // Finalizar screen session se estiver ativa
      const killCommand = `screen -ls | grep -o '[0-9]*\\.${userLogin}_${liveId}\\>' | xargs -I{} screen -X -S {} quit`;
      
      console.log(`🗑️ Removendo transmissão: ${killCommand}`);
      
      await SSHManager.executeCommand(serverId, `echo OK; ${killCommand}`);
      
      // Remover do banco
      await db.execute(
        'DELETE FROM lives WHERE codigo = ?',
        [liveId]
      );

      // Remover do mapa de transmissões ativas
      activeTransmissions.delete(`${userId}_${liveId}`);

      console.log(`✅ Transmissão removida - Live ID: ${liveId}`);

      res.json({
        success: true,
        message: 'Live removida com sucesso',
        live_id: liveId
      });

    } catch (sshError) {
      console.error('Erro SSH ao remover transmissão:', sshError);
      res.status(500).json({
        success: false,
        error: 'Erro ao remover transmissão no servidor',
        details: sshError.message
      });
    }

  } catch (error) {
    console.error('Erro ao remover transmissão:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/streaming/status - Status geral das transmissões
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verificar transmissões ativas
    const [activeRows] = await db.execute(
      'SELECT * FROM lives WHERE codigo_stm = ? AND status = "1" ORDER BY data_inicio DESC LIMIT 1',
      [userId]
    );

    if (activeRows.length > 0) {
      const activeLive = activeRows[0];
      const now = new Date();
      const dataInicio = new Date(activeLive.data_inicio);
      const diffMs = now.getTime() - dataInicio.getTime();
      const uptime = formatDuration(Math.floor(diffMs / 1000));

      res.json({
        success: true,
        is_live: true,
        stream_type: 'live',
        transmission: {
          id: activeLive.codigo,
          tipo: activeLive.tipo,
          servidor_stm: activeLive.servidor_stm,
          servidor_live: activeLive.servidor_live,
          data_inicio: activeLive.data_inicio,
          data_fim: activeLive.data_fim,
          stats: {
            viewers: Math.floor(Math.random() * 50) + 10, // Simular espectadores
            bitrate: 2500,
            uptime: uptime,
            isActive: true
          }
        }
      });
    } else {
      res.json({
        success: true,
        is_live: false,
        stream_type: null,
        transmission: null
      });
    }

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// GET /api/streaming/source-urls - URLs de fonte para transmissão
router.get('/source-urls', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userLogin = req.user.usuario || (req.user.email ? req.user.email.split('@')[0] : `user_${userId}`);

    // SEMPRE usar domínio do Wowza
    const wowzaHost = 'stmv1.udicast.com';
    
    const sourceUrls = {
      http_m3u8: `https://${wowzaHost}/${userLogin}/${userLogin}/playlist.m3u8`,
      rtmp: `rtmp://${wowzaHost}:1935/${userLogin}/${userLogin}`,
      recommended: 'http_m3u8'
    };

    res.json({
      success: true,
      source_urls: sourceUrls,
      user_login: userLogin,
      wowza_host: wowzaHost
    });

  } catch (error) {
    console.error('Erro ao obter URLs de fonte:', error);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// Função auxiliar para formatar duração
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
}

// Cleanup ao fechar aplicação
process.on('SIGINT', async () => {
  console.log('\n🛑 Finalizando todas as transmissões ativas...');
  
  for (const [key, transmissionData] of activeTransmissions) {
    try {
      const [userId, liveId] = key.split('_');
      
      // Finalizar screen session
      const [userRows] = await db.execute(
        'SELECT usuario, email FROM streamings WHERE codigo_cliente = ? LIMIT 1',
        [userId]
      );
      
      if (userRows.length > 0) {
        const userLogin = userRows[0].usuario || userRows[0].email.split('@')[0];
        
        const [serverRows] = await db.execute(
          'SELECT servidor_id FROM folders WHERE user_id = ? LIMIT 1',
          [userId]
        );
        const serverId = serverRows.length > 0 ? serverRows[0].servidor_id : 1;
        
        const killCommand = `screen -ls | grep -o '[0-9]*\\.${userLogin}_${liveId}\\>' | xargs -I{} screen -X -S {} quit`;
        await SSHManager.executeCommand(serverId, `echo OK; ${killCommand}`);
        
        // Atualizar status no banco
        await db.execute(
          'UPDATE lives SET status = "0", data_fim = NOW() WHERE codigo = ?',
          [liveId]
        );
      }
    } catch (error) {
      console.error(`Erro ao finalizar transmissão ${key}:`, error);
    }
  }
  
  activeTransmissions.clear();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Finalizando todas as transmissões ativas...');
  
  for (const [key, transmissionData] of activeTransmissions) {
    try {
      const [userId, liveId] = key.split('_');
      
      const [userRows] = await db.execute(
        'SELECT usuario, email FROM streamings WHERE codigo_cliente = ? LIMIT 1',
        [userId]
      );
      
      if (userRows.length > 0) {
        const userLogin = userRows[0].usuario || userRows[0].email.split('@')[0];
        
        const [serverRows] = await db.execute(
          'SELECT servidor_id FROM folders WHERE user_id = ? LIMIT 1',
          [userId]
        );
        const serverId = serverRows.length > 0 ? serverRows[0].servidor_id : 1;
        
        const killCommand = `screen -ls | grep -o '[0-9]*\\.${userLogin}_${liveId}\\>' | xargs -I{} screen -X -S {} quit`;
        await SSHManager.executeCommand(serverId, `echo OK; ${killCommand}`);
        
        await db.execute(
          'UPDATE lives SET status = "0", data_fim = NOW() WHERE codigo = ?',
          [liveId]
        );
      }
    } catch (error) {
      console.error(`Erro ao finalizar transmissão ${key}:`, error);
    }
  }
  
  activeTransmissions.clear();
  process.exit(0);
});

module.exports = router;
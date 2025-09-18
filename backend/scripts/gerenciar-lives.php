<?php
require_once("admin/inc/protecao-final.php");
require_once("admin/inc/classe.ssh.php");


function gerenciar_live_wowza($servidor,$senha,$login,$live,$acao) {

$url = "http://".$servidor.":6980/v2/servers/_defaultServer_/vhosts/_defaultVHost_/applications/".$login."/pushpublish/mapentries/".$live."/actions/".$acao."";

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_USERPWD, "admin:".code_decode($senha,"D").""); 
curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_DIGEST); 
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, 1);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE); 
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, FALSE); 
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "PUT");
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 20);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER,array('Content-Type:application/json','Accept:application/json'));
$resultado = curl_exec($ch);
curl_close($ch);

if(preg_match('/successfully/i',$resultado)) {
return "ok";
} else {
return "erro";
}

}

$dados_config = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM configuracoes"));
$dados_stm = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM streamings where login = '".$_SESSION["login_logado"]."'"));
$dados_servidor = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM servidores where codigo = '".$dados_stm["codigo_servidor"]."'"));

if($dados_servidor["nome_principal"]) {
$servidor = strtolower($dados_servidor["nome_principal"]).".".$dados_config["dominio_padrao"];
} else {
$servidor = strtolower($dados_servidor["nome"]).".".$dados_config["dominio_padrao"];
}

$source_rtmp = "rtmp://".$servidor.":1935/".$dados_stm["login"]."/".$dados_stm["login"]."";

if($_POST) {

// Verifica se todos os campos foram preenchidos
if(empty($_POST["live_servidor"]) || empty($_POST["live_chave"])) {
// Cria o sessão do status das ações executadas e redireciona.
$_SESSION["status_acao"] = status_acao("Você deixou campos em branco.","erro");

header("Location: /gerenciar-lives");
exit();
}

$live_servidor = strtok(str_replace("rtmp://", "", str_replace("rtmps://", "", $_POST["live_servidor"])), "/");
$live_app = substr(str_replace("rtmp://", "", str_replace("rtmps://", "", $_POST["live_servidor"])), strpos(str_replace("rtmp://", "", str_replace("rtmps://", "", $_POST["live_servidor"])), "/") + 1);

$data_inicio = preg_replace('#(\d{2})/(\d{2})/(\d{4})\s(.*)#', '$3-$2-$1 $4', $_POST["data_inicio"]);
$data_fim = preg_replace('#(\d{2})/(\d{2})/(\d{4})\s(.*)#', '$3-$2-$1 $4', $_POST["data_fim"]);

mysqli_query($conexao,"INSERT INTO lives (codigo_stm,data_inicio,data_fim,tipo,live_servidor,live_app,live_chave,status) VALUES ('".$dados_stm["codigo"]."','".$data_inicio.":00','".$data_fim.":00','".$_POST["tipo"]."','".$live_servidor."','".$live_app."','".$_POST["live_chave"]."','2')");
$codigo_live = mysqli_insert_id($conexao);

//Inicia ou atenda

if($_POST["inicio_imediato"] == "sim" || empty($_POST["data_inicio"])) {

// Conexao SSH
$ssh = new SSH();
$ssh->conectar($dados_servidor["ip"],$dados_servidor["porta_ssh"]);
$ssh->autenticar("root",code_decode($dados_servidor["senha"],"D"));

if($_POST["tipo"] == "facebook") {

$ssh->executar('echo OK;screen -dmS '.$dados_stm["login"].'_'.$codigo_live.' bash -c "/usr/local/bin/ffmpeg -re -i '.$source_rtmp.' -c:v copy -c:a copy -bsf:a aac_adtstoasc -preset ultrafast -strict experimental -threads 1 -f flv \'rtmps://live-api-s.facebook.com:443/rtmp/'.$_POST["live_chave"].'\'; exec sh"');

sleep(5);

$resultado = $ssh->executar("/bin/ps aux | /bin/grep ffmpeg | /bin/grep rtmp | /bin/grep ".$dados_stm["login"]." | /bin/grep facebook | /usr/bin/wc -l");

} elseif($_POST["tipo"] == "tiktok" || $_POST["tipo"] == "kwai") {

$servidor_live_tiktok_kwai = $_POST["live_servidor"].'/'.$_POST["live_chave"];

$ssh->executar('echo OK;screen -dmS '.$dados_stm["login"].'_'.$codigo_live.' bash -c "/usr/local/bin/ffmpeg -re -i '.$source_rtmp.' -vf \'crop=ih*(9/16):ih\' -crf 21 -r 24 -g 48 -b:v 3000000 -b:a 128k -ar 44100 -acodec aac -vcodec libx264 -preset ultrafast -bufsize \'(6.000*3000000)/8\' -maxrate 3500000 -threads 1 -f flv \''.$servidor_live_tiktok_kwai.'\'; exec sh"');

sleep(5);

$resultado = $ssh->executar("/bin/ps aux | /bin/grep ffmpeg | /bin/grep rtmp | /bin/grep ".$dados_stm["login"]." | /bin/grep 'tiktok\|kwai' | /usr/bin/wc -l");

} else {

$live = $_POST["tipo"]."_".$codigo_live;

$live_target = ''.$dados_stm["login"].'={"entryName":"'.$live.'", "profile":"rtmp", "application":"'.str_replace("/","",$live_app).'", "host":"'.str_replace("/","",$live_servidor).'", "streamName":"'.$_POST["live_chave"].'"}';

$ssh->executar("echo '".$live_target."' >> /usr/local/WowzaStreamingEngine/conf/".$dados_stm["login"]."/PushPublishMap.txt;echo OK");

$resultado = gerenciar_live_wowza($dados_servidor["ip"],$dados_servidor["senha"],$dados_stm["login"],$live,"restart");

}

if($resultado == "ok" || $resultado > 0) {

mysqli_query($conexao,"Update lives set status = '1', data_inicio = NOW() where codigo = '".$codigo_live."'");

// Cria o sessão do status das ações executadas e redireciona.
$_SESSION["status_acao"] = status_acao("Live iniciada com sucesso.","ok");

} else {

mysqli_query($conexao,"Update lives set status = '0' where codigo = '".$codigo_live."'");

// Cria o sessão do status das ações executadas e redireciona.
$_SESSION["status_acao"] = status_acao("Erro ao iniciar live, verifique se os dados informados.","erro");

}

} else {

// Cria o sessão do status das ações executadas e redireciona.
$_SESSION["status_acao"] = status_acao("Live agendada com sucesso.","ok");

}

header("Location: /gerenciar-lives");
exit();
}

// Funções de ações(finalizar/remover)
// Função para remover a acao
if(query_string('1') == "finalizar") {

	$codigo = code_decode(query_string('2'),"D");
	
	$dados_live = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM lives where codigo = '".$codigo."'"));

	if($dados_live["tipo"] == "facebook" || $dados_live["tipo"] == "tiktok" || $dados_live["tipo"] == "kwai") {
	// Conexao SSH
    $ssh = new SSH();
    $ssh->conectar($dados_servidor["ip"],$dados_servidor["porta_ssh"]);
    $ssh->autenticar("root",code_decode($dados_servidor["senha"],"D"));
    
    $ssh->executar("echo OK;screen -ls | grep -o '[0-9]*\.".$dados_stm["login"]."_".$dados_live["codigo"]."\>' | xargs -I{} screen -X -S {} quit");
    
	} else {

		$live = $dados_live["tipo"]."_".$dados_live["codigo"];
		$resultado = gerenciar_live_wowza($dados_servidor["ip"],$dados_servidor["senha"],$dados_stm["login"],$live,"disable");

	}

	mysqli_query($conexao,"Update lives set status = '0', data_fim = NOW() where codigo = '".$dados_live["codigo"]."'");

	echo "<span class='texto_status_sucesso'>Live finalizada com sucesso.<br />Agora você deve finalizar a tranmissão na sua conta do ".ucfirst($dados_live["tipo"])."</span><br /><br /><a href='javascript:window.location.reload()' class='texto_status_atualizar'>[Atualizar]</a>";

	
	exit();
}

// Função para reiniciar a acao
if(query_string('1') == "reiniciar") {

	$codigo = code_decode(query_string('2'),"D");
	
	$dados_live = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM lives where codigo = '".$codigo."'"));

	$live = $dados_live["tipo"]."_".$dados_live["codigo"];
	
	$resultado = gerenciar_live_wowza($dados_servidor["ip"],$dados_servidor["senha"],$dados_stm["login"],$live,"restart");

	if($resultado == "ok") {
	
	mysqli_query($conexao,"Update lives set status = '1', data_inicio = NOW() where codigo = '".$dados_live["codigo"]."'");

	echo "<span class='texto_status_sucesso'>Live reiniciada com sucesso.</span><br /><br /><a href='javascript:window.location.reload()' class='texto_status_atualizar'>[Atualizar]</a>";
	
	} else {
	
	mysqli_query($conexao,"Update lives set status = '0' where codigo = '".$dados_live["codigo"]."'");
	
	echo "<span class='texto_status_erro'>Erro ao tentar reiniciar a live.<br />Remove e cadastre uma nova.</span><br /><br /><a href='javascript:window.location.reload()' class='texto_status_atualizar'>[Atualizar]</a>";

	}
	
	exit();
}

// Função para remover a acao
if(query_string('1') == "remover") {

	$codigo = code_decode(query_string('2'),"D");
	
	$dados_live = mysqli_fetch_array(mysqli_query($conexao,"SELECT * FROM lives where codigo = '".$codigo."'"));

	mysqli_query($conexao,"Delete From lives where codigo = '".$dados_live["codigo"]."'");

	// Conexao SSH
	$ssh = new SSH();
	$ssh->conectar($dados_servidor["ip"],$dados_servidor["porta_ssh"]);
	$ssh->autenticar("root",code_decode($dados_servidor["senha"],"D"));

	if($dados_live["tipo"] == "facebook" || $dados_live["tipo"] == "tiktok" || $dados_live["tipo"] == "kwai") {

    $ssh->executar("echo OK;screen -ls | grep -o '[0-9]*\.".$dados_stm["login"]."_".$dados_live["codigo"]."\>' | xargs -I{} screen -X -S {} quit");
    
	} else {

	  $live = $dados_live["tipo"]."_".$dados_live["codigo"];
		$resultado = gerenciar_live_wowza($dados_servidor["ip"],$dados_servidor["senha"],$dados_stm["login"],$live,"disable");
		$ssh->executar("echo OK;sed -i '/".$live."/d' /usr/local/WowzaStreamingEngine/conf/".$dados_stm["login"]."/PushPublishMap.txt");

	}
	
	echo "<span class='texto_status_sucesso'>Live removida com sucesso.</span><br /><br /><a href='javascript:window.location.reload()' class='texto_status_atualizar'>[Atualizar]</a>";
	
	exit();
}

if($dados_stm["idioma_painel"] == "en") {
$lang_calendar = "en";
} elseif($dados_stm["idioma_painel"] == "es") {
$lang_calendar = "es";
} else {
$lang_calendar = "pt";
}
?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<title>Streaming</title>
<meta http-equiv="cache-control" content="no-cache">
<link rel="shortcut icon" href="/img/favicon.ico" type="image/x-icon" />
<link href="/inc/estilo-streaming.css" rel="stylesheet" type="text/css" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.3/flatpickr.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.3/themes/material_red.css">
<script type="text/javascript" src="/inc/ajax-streaming.js"></script>
<script type="text/javascript" src="inc/javascript.js"></script>
<script type="text/javascript" src="inc/javascript-abas.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flatpickr/4.6.3/flatpickr.min.js"></script>
<script src="https://npmcdn.com/flatpickr@4.6.6/dist/l10n/<?php echo $lang_calendar; ?>.js"></script>
<script type="text/javascript">
   window.onload = function() {
	fechar_log_sistema();
	$("#data_inicio").flatpickr({
		enableTime: true,
		time_24hr: true,
		dateFormat: "d/m/Y H:i",
		locale: "<?php echo $lang_calendar; ?>",
	});
	$("#data_fim").flatpickr({
		enableTime: true,
		time_24hr: true,
		dateFormat: "d/m/Y H:i",
		locale: "<?php echo $lang_calendar; ?>",
	});
   };
function executar_acao_gerenciar_lives( codigo, acao ) {
	
  document.getElementById('log-sistema-conteudo').innerHTML = "<img src='/img/ajax-loader.gif' />";
  document.getElementById('log-sistema-fundo').style.display = "block";
  document.getElementById('log-sistema').style.display = "block";
  
  var http = new Ajax();
  http.open("GET", "/gerenciar-lives/"+acao+"/"+codigo , true);
  http.onreadystatechange = function() {
	
  if(http.readyState == 4) {
  
	resultado = http.responseText;
	
	document.getElementById("log-sistema-conteudo").innerHTML = resultado;	
	
  }
  
  }
  http.send(null);
  delete http;
}
function tipo_live(tipo) {

if(tipo == "youtube") {
document.getElementById("live_servidor").value = "rtmp://a.rtmp.youtube.com/live2";
} else if(tipo == "twitch") {
document.getElementById("live_servidor").value = "rtmp://live-dfw.twitch.tv/app";
} else if(tipo == "periscope") {
document.getElementById("live_servidor").value = "rtmp://ca.pscp.tv:80/x";
} else if(tipo == "vimeo") {
document.getElementById("live_servidor").value = "rtmp://rtmp.cloud.vimeo.com/live";
} else if(tipo == "steam") {
document.getElementById("live_servidor").value = "rtmp://ingest-any-ord1.broadcast.steamcontent.com/app";
} else if(tipo == "facebook") {
document.getElementById("live_servidor").value = "rtmps://live-api-s.facebook.com:443/rtmp";	
} else {
document.getElementById("live_servidor").value = "rtmp://...";	
}

}
function valida_inicio() {

if(document.getElementById('inicio_imediato').checked) {
document.getElementById('tabela_data_inicio').style.display = "none";
} else {
document.getElementById('tabela_data_inicio').style.display = "table-row";
}

}
</script>
</head>

<body>
<div id="sub-conteudo">
<?php
if($_SESSION['status_acao']) {

$status_acao = stripslashes($_SESSION['status_acao']);

echo '<table width="700" border="0" align="center" cellpadding="0" cellspacing="0" style="margin-bottom:5px">'.$status_acao.'</table>';

unset($_SESSION['status_acao']);
}
?>
<form method="post" action="/gerenciar-lives" style="padding:0px; margin:0px">
<div id="quadro">
<div id="quadro-topo"><strong>Gerenciamento de Lives</strong></div>
<div class="texto_medio" id="quadro-conteudo">
 <table width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
  <tr>
    <td height="25">
    <div class="tab-pane" id="tabPane1">
   	  <div class="tab-page" id="tabPage1">
       	<h2 class="tab">Lives</h2>
        <table width="890" border="0" align="center" cellpadding="0" cellspacing="0" style="background-color:#FFFF66; border:#DFDF00 1px solid">
  	  		<tr>
        		<td width="30" height="30" align="center" scope="col"><img src="/admin/img/icones/dica.png" width="16" height="16" /></td>
        		<td align="left" class="texto_pequeno_erro" scope="col">Não é necessario deixar esta página aberta. Verifique o sinal no canal escolhido e inicie a transmissão no canal.</td>
     		</tr>
    	</table>
        <table width="890" border="0" align="center" cellpadding="0" cellspacing="0" style="border-left:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;; border-bottom:#D5D5D5 1px solid;" id="tab" class="sortable">
    <tr style="background:url(/admin/img/img-fundo-titulo-tabela.png) repeat-x; cursor:pointer">
      <td width="170" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;">&nbsp;Live</td>
      <td width="160" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;">&nbsp;Inicio</td>
      <td width="160" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;">&nbsp;Fim</td>
      <td width="120" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;">&nbsp;Duração</td>
      <td width="150" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid; border-right:#D5D5D5 1px solid;">&nbsp;Status</td>
      <td width="130" height="23" align="left" class="texto_padrao_destaque" style="border-bottom:#D5D5D5 1px solid;">&nbsp;Ações</td>
    </tr>
<?php
$total_lives = mysqli_num_rows(mysqli_query($conexao,"SELECT * FROM lives where codigo_stm = '".$dados_stm["codigo"]."'"));

if($total_lives > 0) {

$sql = mysqli_query($conexao,"SELECT *, DATE_FORMAT(data_inicio,'%d/%m/%Y %H:%i:%s') AS data_inicio, DATE_FORMAT(data_fim,'%d/%m/%Y %H:%i:%s') AS data_fim FROM lives where codigo_stm = '".$dados_stm["codigo"]."' ORDER by data_inicio DESC");
while ($dados_live = mysqli_fetch_array($sql)) {

$duracao_segundos1 = strtotime(date("d/m/Y H:i:s")) - strtotime($dados_live["data_inicio"]);
$duracao_segundos2 = strtotime($dados_live["data_fim"]) - strtotime($dados_live["data_inicio"]);

if($dados_live["status"] == "1") {
$duracao = tempo_conectado($duracao_segundos1);
} elseif($dados_live["status"] == "2") {
$duracao = "0s";
} elseif($dados_live["status"] == "3") {
$duracao = "0s";
} else {
$duracao = tempo_conectado($duracao_segundos2);
}

if($dados_live["status"] == "1") {
$status = "Transmitindo/Live";
} elseif($dados_live["status"] == "2") {
$status = "Agendado/Scheduled";
} elseif($dados_live["status"] == "3") {
$status = "Erro";
} else {
$status = "Finalizado/Finished";
}

$live_code = code_decode($dados_live["codigo"],"E");

echo "<tr>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>&nbsp;".ucfirst($dados_live["tipo"])."</td>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>&nbsp;".$dados_live["data_inicio"]."</td>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>&nbsp;".$dados_live["data_fim"]."</td>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>&nbsp;".$duracao."</td>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>&nbsp;".$status."</td>
<td height='25' align='left' scope='col' class='texto_padrao_pequeno'>";

echo "<select style='width:100%' id='".$live_code."' onchange='executar_acao_gerenciar_lives(this.id,this.value);'>
  <option value='' selected='selected'>Opções</option>";
if($dados_live["status"] == "1") {
echo "<option value='finalizar'>Finalizar</option>";
}
if($dados_live["tipo"] != "facebook" && $dados_live["tipo"] != "tiktok" && $dados_live["tipo"] != "kwai") {
echo "<option value='reiniciar'>Reiniciar</option>";
}
echo "<option value='remover'>Remover</option>
</select>
</td>
</tr>";

}

} else {

echo "<tr>
    <td height='23' colspan='6' align='center' class='texto_padrao'>".$lang['lang_info_sem_registros']."</td>
  </tr>";

}
?>
  </table>
        </div>
      <div class="tab-page" id="tabPage3">
       	<h2 class="tab">Cadastrar Live</h2>
        <table width="890" border="0" align="center" cellpadding="0" cellspacing="0" style="background-color:#FFFF66; border:#DFDF00 1px solid">
  	  		<tr>
        		<td width="30" height="30" align="center" scope="col"><img src="/admin/img/icones/dica.png" width="16" height="16" /></td>
        		<td align="left" class="texto_pequeno_erro" scope="col">O servidor e chave devem ser obtidos na conta da rede social escolhida. Tempo m&aacute;ximo de transmiss&atilde;o &eacute; 24 horas.</td>
     		</tr>
    	</table>
        <table width="890" border="0" align="center" cellpadding="0" cellspacing="0" style="background-color:#F4F4F7; border-bottom:#CCCCCC 1px solid; border-left:#CCCCCC 1px solid; border-right:#CCCCCC 1px solid;">
          <tr>
            <td width="150" height="30" align="left" class="texto_padrao_destaque" style="padding-left:5px;">Live</td>
            <td width="540" align="left">
            <select name="tipo" class="input" id="tipo" style="width:255px;" onchange="tipo_live(this.value);">
          		<option value="youtube" selected="selected">YouTube</option>
                <option value="facebook">FaceBook</option>
                <option value="twitch">Twitch</option>
                <option value="periscope">Periscope</option>
                <option value="vimeo">Vimeo</option>
                <option value="steam">Steam Valve</option>
                <option value="tiktok">TikTok</option>
                <option value="kwai">Kwai</option>
                <option value="custom">RTMP Próprio/Custom</option>
         	</select>            </td>
          </tr>
          <tr>
            <td width="150" height="30" align="left" class="texto_padrao_destaque" style="padding-left:5px;">Servidor RTMP</td>
            <td width="540" align="left"><input name="live_servidor" type="text" class="input" id="live_servidor" style="width:250px;" value="rtmp://a.rtmp.youtube.com/live2" /></td>
          </tr>
          <tr>
            <td height="30" align="left" style="padding-left:5px;" class="texto_padrao_destaque">Chave/key</td>
            <td align="left"><input name="live_chave" type="text" class="input" id="live_chave" style="width:250px;" /></td>
          </tr>
      <tr>
        <td height="30" align="left" style="padding-left:5px;" class="texto_padrao_destaque">Iniciar Imediatamente</td>
        <td align="left"><input name="inicio_imediato" id="inicio_imediato" type="checkbox" value="sim" checked="checked" onchange="valida_inicio();" />&nbsp;<?php echo $lang['lang_label_sim']; ?></td>
      </tr>
      <tr style="display:none" id="tabela_data_inicio">
        <td height="30" align="left" style="padding-left:5px;" class="texto_padrao_destaque"><?php echo $lang['lang_info_gerenciador_agendamentos_data_inicio']; ?></td>
        <td align="left" class="texto_padrao_vermelho_destaque"><input name="data_inicio" type="text" id="data_inicio" onkeypress="return txtBoxFormat(this, '99/99/9999 99:99', event);" placeholder="__/__/____ __:__" value="" style="width:110px;" />&nbsp;</td>
      </tr>
      <tr>
        <td height="30" align="left" style="padding-left:5px;" class="texto_padrao_destaque"><?php echo $lang['lang_info_gerenciador_agendamentos_relay_data_termino']; ?></td>
        <td align="left" class="texto_padrao_pequeno"><input name="data_fim" type="text" id="data_fim" onkeypress="return txtBoxFormat(this, '99/99/9999 99:99', event);" placeholder="__/__/____ __:__" value="" style="width:110px;" /></td>
      </tr>
          <tr>
            <td height="50" align="left" style="padding-left:5px;" class="texto_padrao_destaque">&nbsp;</td>
            <td align="left"><input type="submit" class="botao" value="Cadastrar" onclick="abrir_log_sistema();" /></td>
          </tr>
        </table>
      </div>
      </div></td>
  </tr>
</table>
    </div>
      </div>
</form>
</div>
<br />
<br />
<br />
<!-- Início div log do sistema -->
<div id="log-sistema-fundo"></div>
<div id="log-sistema">
<div id="log-sistema-botao"><img src="img/icones/img-icone-fechar.png" onclick="document.getElementById('log-sistema-fundo').style.display = 'none';document.getElementById('log-sistema').style.display = 'none';" style="cursor:pointer" title="<?php echo $lang['lang_titulo_fechar']; ?>" /></div>
<div id="log-sistema-conteudo"></div>
</div>
<!-- Fim div log do sistema -->
</body>
</html>
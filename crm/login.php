<?php
require dirname(__DIR__) . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
session_start();
if (!empty($_SESSION['cms_authorized'])) { header('Location: /crm/', true, 302); exit; }
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
?><!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Вход · Personal Workspace</title><script>(function(){try{var t=localStorage.getItem('pelenev.crm.theme');if(t!=='light'&&t!=='dark')t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script><link rel="stylesheet" href="/crm/crm.css?v=25"></head>
<body class="crm-login"><main class="login-card"><div class="crm-brand"><span class="crm-brand__mark">P</span><span><strong>Workspace</strong><small>PELENEV.DESIGN</small></span></div><p class="eyebrow">Private workspace</p><h1>С возвращением</h1><p class="login-muted">Войди, чтобы открыть личную CRM.</p><form id="login-form"><label>Пароль<input name="password" type="password" autocomplete="current-password" required autofocus placeholder="Введи пароль"></label><button class="primary-btn" type="submit">Войти <span>↗</span></button><p class="login-error" id="login-error" role="alert"></p></form></main><script>
const form=document.getElementById('login-form');const error=document.getElementById('login-error');form.addEventListener('submit',async(e)=>{e.preventDefault();error.textContent='';const button=form.querySelector('button');button.disabled=true;try{const r=await fetch('/api.php?action=login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:new FormData(form).get('password')})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось войти');location.href='/crm/';}catch(err){error.textContent=err.message;button.disabled=false;}});
</script></body></html>

<?php
/* Private personal workspace. Keep this route out of search indexes. */
require dirname(__DIR__) . '/db.php';
session_name('pelenew_admin');
session_set_cookie_params(['path' => '/', 'httponly' => true, 'secure' => isHttps(), 'samesite' => 'Lax']);
session_start();
if (empty($_SESSION['cms_authorized'])) { header('Location: /crm/login.php', true, 302); exit; }
header('X-Robots-Tag: noindex, nofollow, noarchive', true);
header('Cache-Control: no-store, private', true);
?><!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="googlebot" content="noindex, nofollow, noarchive">
  <meta name="theme-color" content="#050505">
  <title>Workspace — PELENEV.DESIGN</title>
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <script>/* тема до первой отрисовки — иначе моргает */(function(){try{var t=localStorage.getItem('pelenev.crm.theme');if(t!=='light'&&t!=='dark')t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
  <link rel="stylesheet" href="/crm/crm.css?v=25">
</head>
<body class="crm-app">
<div class="shell">

  <aside class="sidebar" id="sidebar" aria-label="Режимы">
    <div class="brand"><span class="brand__mark">P</span><span class="brand__text"><strong>Workspace</strong><small>pelenev.design</small></span></div>

    <nav class="modes" aria-label="Основные режимы">
      <button class="mode is-active" data-view="work" aria-label="Режим: работа, клиенты и задачи">
        <span class="mode__icon" aria-hidden="true">◇</span>
        <span class="mode__text"><b>Работа</b><small>Клиенты и задачи</small></span>
      </button>
      <button class="mode" data-view="calendar" aria-label="Режим: календарь">
        <span class="mode__icon" aria-hidden="true">▦</span>
        <span class="mode__text"><b>Календарь</b><small>Задачи по датам</small></span>
      </button>
      <button class="mode" data-view="vietnam" aria-label="Режим: Вьетнам, копилка">
        <span class="mode__icon" aria-hidden="true">◒</span>
        <span class="mode__text"><b>Вьетнам</b><small>Копилка на поездку</small></span>
      </button>
    </nav>

    <div class="sidebar__foot">
      <div class="profile" id="profile">
        <button class="profile__btn" id="profile-btn" aria-haspopup="true" aria-expanded="false">
          <span class="avatar avatar--orange">ДП</span>
          <span class="profile__text"><b>Дмитрий Пеленев</b><small>Личный аккаунт</small></span>
          <span class="profile__dots" aria-hidden="true">···</span>
        </button>
        <div class="profile__menu" id="profile-menu" hidden>
          <button data-action="export">Скачать резервную копию</button>
          <button data-action="import">Восстановить из файла</button>
          <a href="/crm/logout.php">Выйти</a>
        </div>
      </div>
      <input type="file" id="backup-file" accept="application/json" hidden>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <button class="icon-btn burger" id="burger" aria-label="Открыть меню">☰</button>
      <div class="crumbs"><span>Workspace</span><i aria-hidden="true">/</i><strong id="crumb">Работа</strong></div>
      <div class="topbar__actions">
        <span class="sync" id="sync-state" title="Состояние хранилища"></span>
        <button class="icon-btn theme-btn" id="theme-toggle" aria-label="Переключить тему"><span id="theme-icon" aria-hidden="true">☾</span></button>
        <button class="primary-btn" id="quick-add">+ <span>Добавить</span></button>
      </div>
    </header>

    <div class="content">

      <!-- ── РЕЖИМ 1 · Работа ───────────────────────────────────────── -->
      <section class="view is-visible" data-screen="work">
        <div class="page-head">
          <div>
            <p class="eyebrow">Режим 1</p>
            <h1>Клиенты и задачи</h1>
            <p class="muted" id="work-subtitle">—</p>
          </div>
        </div>

        <div class="metrics" id="work-metrics"></div>

        <div class="tabs" role="tablist">
          <button class="tab is-active" role="tab" data-tab="tasks" aria-selected="true">Задачи <em id="tab-count-tasks">0</em></button>
          <button class="tab" role="tab" data-tab="clients" aria-selected="false">Клиенты <em id="tab-count-clients">0</em></button>
        </div>

        <!-- Задачи -->
        <div class="tabpanel is-visible" data-tabpanel="tasks">
          <div class="toolbar">
            <label class="search"><span aria-hidden="true">⌕</span><input id="task-search" type="search" placeholder="Поиск по задачам и клиентам"></label>
            <div class="chips" id="status-filter" role="group" aria-label="Фильтр по статусу"></div>
            <button class="primary-btn" data-action="new-task">+ Задача</button>
          </div>
          <div id="task-groups"></div>
        </div>

        <!-- Клиенты -->
        <div class="tabpanel" data-tabpanel="clients">
          <div class="toolbar">
            <label class="search"><span aria-hidden="true">⌕</span><input id="client-search" type="search" placeholder="Поиск по клиентам"></label>
            <button class="primary-btn" data-action="new-client">+ Клиент</button>
          </div>
          <div class="client-grid" id="client-grid"></div>
        </div>
      </section>

      <!-- ── РЕЖИМ 2 · Календарь ────────────────────────────────────── -->
      <section class="view" data-screen="calendar">
        <div class="page-head">
          <div>
            <p class="eyebrow">Режим 2</p>
            <h1>Календарь</h1>
            <p class="muted">Все задачи разложены по датам — видно, где густо, а где пусто.</p>
          </div>
        </div>

        <div class="cal-layout">
          <article class="panel cal-panel">
            <div class="cal-toolbar">
              <div class="cal-nav">
                <button class="icon-btn" id="cal-prev" aria-label="Предыдущий месяц">‹</button>
                <button class="icon-btn" id="cal-next" aria-label="Следующий месяц">›</button>
                <button class="ghost-btn" id="cal-today">Сегодня</button>
              </div>
              <strong id="cal-title">—</strong>
              <span class="cal-legend"><i class="dot dot--urgent"></i>срочно<i class="dot dot--normal"></i>обычные<i class="dot dot--done"></i>готово</span>
            </div>
            <div class="cal-week-head" id="cal-week-head"></div>
            <div class="cal-grid" id="cal-grid"></div>
          </article>

          <aside class="panel cal-day">
            <div class="panel-head">
              <div><span class="panel-kicker">Выбранный день</span><h2 id="cal-day-title">—</h2></div>
              <button class="ghost-btn" id="cal-day-add">+ Задача</button>
            </div>
            <div id="cal-day-list"></div>
            <div class="cal-undated">
              <div class="panel-head panel-head--tight"><div><span class="panel-kicker">Без даты</span><h2 id="cal-undated-count">0</h2></div></div>
              <div id="cal-undated-list"></div>
            </div>
          </aside>
        </div>
      </section>

      <!-- ── РЕЖИМ 3 · Вьетнам ──────────────────────────────────────── -->
      <section class="view" data-screen="vietnam">
        <div class="vn-hero">
          <video class="vn-hero__media" poster="/assets/hero-poster.svg" muted loop playsinline autoplay preload="metadata">
            <source src="/assets/video/vietnam.mp4" type="video/mp4">
          </video>
          <div class="vn-hero__shade"></div>
          <div class="vn-hero__copy">
            <p class="eyebrow">Режим 3 · личная цель</p>
            <h1 id="vn-title">Вьетнам</h1>
            <p id="vn-tagline">Место для следующей главы. Коплю спокойно, двигаюсь системно.</p>
            <div class="vn-actions">
              <button class="primary-btn" data-action="new-deposit">+ Отложить</button>
              <button class="ghost-btn ghost-btn--ondark" data-action="new-expense">+ Расход</button>
              <button class="ghost-btn ghost-btn--ondark" data-action="edit-goal">Настроить цель</button>
            </div>
          </div>
          <div class="vn-hero__ring">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="ring-track" cx="60" cy="60" r="52"></circle>
              <circle class="ring-value" id="vn-ring" cx="60" cy="60" r="52"></circle>
            </svg>
            <div class="vn-hero__ring-copy"><b id="vn-percent">0%</b><small>готово</small></div>
          </div>
        </div>

        <div class="metrics" id="vn-metrics"></div>

        <div class="vn-grid">
          <article class="panel">
            <div class="panel-head">
              <div><span class="panel-kicker">Динамика</span><h2>Как растёт копилка</h2></div>
              <span class="period-label" id="vn-chart-range">—</span>
            </div>
            <div class="vn-chart" id="vn-chart"></div>
          </article>

          <article class="panel panel--accent">
            <div class="panel-head">
              <div><span class="panel-kicker">Ритм</span><h2>Привычка</h2></div>
            </div>
            <div class="habit" id="vn-habit"></div>
          </article>
        </div>

        <article class="panel">
          <div class="panel-head">
            <div><span class="panel-kicker">История</span><h2>Пополнения и расходы</h2></div>
            <button class="ghost-btn" data-action="new-deposit">+ Отложить</button>
          </div>
          <div id="vn-entries"></div>
        </article>
      </section>

    </div>
  </main>
</div>

<button class="agent-fab" id="agent-fab" aria-label="Открыть ассистента" aria-expanded="false">
  <span class="agent-fab__icon" aria-hidden="true">✦</span>
  <span class="agent-fab__label">Ассистент</span>
</button>

<section class="agent" id="agent" hidden aria-label="AI-ассистент">
  <header class="agent__head">
    <div>
      <span class="panel-kicker">Ассистент</span>
      <h2>Напиши, что записать</h2>
    </div>
    <button class="modal__close" id="agent-close" aria-label="Свернуть">×</button>
  </header>
  <div class="agent__log" id="agent-log" aria-live="polite"></div>
  <form class="agent__form" id="agent-form">
    <textarea id="agent-input" rows="1" placeholder="Что записать или изменить?" autocomplete="off"></textarea>
    <button class="primary-btn agent__send" type="submit" id="agent-send" aria-label="Отправить">↑</button>
  </form>
</section>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

<div class="modal" id="modal" hidden>
  <div class="modal__backdrop" data-modal-close></div>
  <section class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal__head">
      <div><p class="eyebrow" id="modal-kicker">Workspace</p><h2 id="modal-title">Добавить</h2></div>
      <button class="modal__close" data-modal-close aria-label="Закрыть">×</button>
    </div>
    <form id="modal-form" novalidate>
      <div id="modal-fields"></div>
      <div class="modal__actions">
        <button type="button" class="danger-btn" id="modal-delete" hidden>Удалить</button>
        <span class="modal__spacer"></span>
        <button type="button" class="ghost-btn" data-modal-close>Отмена</button>
        <button type="submit" class="primary-btn">Сохранить</button>
      </div>
    </form>
  </section>
</div>

<div class="sheet" id="add-sheet" hidden>
  <div class="modal__backdrop" data-sheet-close></div>
  <div class="sheet__body" role="menu" aria-label="Что добавить">
    <button data-action="new-task" role="menuitem"><b>Задача</b><small>с клиентом, сроком и стоимостью</small></button>
    <button data-action="new-client" role="menuitem"><b>Клиент</b><small>контакт и заметка</small></button>
    <button data-action="new-deposit" role="menuitem"><b>Отложить во Вьетнам</b><small>пополнение копилки</small></button>
    <button data-action="new-expense" role="menuitem"><b>Расход по Вьетнаму</b><small>потратил из копилки</small></button>
  </div>
</div>

<script src="/crm/crm.js?v=25"></script>
</body>
</html>

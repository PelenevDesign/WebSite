<?php require __DIR__ . '/db.php'; try { $content = allContent(); } catch (Throwable $e) { $content = []; } ob_start(); include __DIR__ . '/work.html'; $html = ob_get_clean(); $html = applySeo($html, $content, 'work'); $html = applyIntegrations($html, $content); /* JSON_HEX_TAG обязателен: в контенте есть код счётчиков с «</script>», а без
   экранирования «<» он закрывает этот инлайн-скрипт, и остаток JSON вываливается
   в страницу текстом (лишняя высота под футером) — плюс это дыра для инъекции. */
$boot = '<script>window.CMS_SERVER_CONTENT=' . json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . ';</script>'; echo str_replace('<script src="cms-schema.js?v=6"></script>', $boot . '<script src="cms-schema.js?v=6"></script>', $html);
